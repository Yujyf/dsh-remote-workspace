/**
 * Persistent WSL helper process: one bash per distribution, TSV protocol on
 * stdin/stdout. Lifecycle is owned by the remote-workspace service.
 * @module @Yujyf/dsh-remote-workspace
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { join } from 'node:path'
import { WorkspaceError } from './errors.ts'
import { WSL_HELPER_SCRIPT } from './wsl-helper.ts'
import { decodeWslListOutput, parseWslList } from './wsl-list.ts'
import type { WslDistribution } from './types.ts'

/** One helper response. */
export interface WslHelperResult {
  readonly ok: boolean
  readonly code?: string
  readonly payload: Buffer
}

/**
 * Absolute `wsl.exe` path on Windows, or the bare name when SystemRoot is unset.
 * @returns the executable path used to talk to WSL.
 */
export function wslExecutable(): string {
  const systemRoot = process.env.SystemRoot
  if (systemRoot !== undefined && systemRoot.length > 0) return join(systemRoot, 'System32', 'wsl.exe')
  return 'wsl.exe'
}

/**
 * List installed WSL distributions. Missing `wsl.exe` yields an empty list.
 * @param timeoutMs - Kill the listing process after this budget.
 * @returns parsed distributions.
 */
/**
 * Terminate one WSL distribution (`wsl.exe --terminate`). Missing wsl.exe is ignored.
 * @param distro - Distribution name.
 * @returns resolution after the process exits.
 */
export async function terminateWslDistribution(distro: string): Promise<void> {
  const child = spawn(wslExecutable(), ['--terminate', distro], {
    stdio: 'ignore',
    windowsHide: true,
  })
  await new Promise<void>((resolve) => {
    child.once('close', () => { resolve() })
    child.once('error', () => { resolve() })
  })
}

/**
 * List installed WSL distributions. Missing `wsl.exe` yields an empty list.
 * @param timeoutMs - Kill the listing process after this budget.
 * @returns parsed distributions.
 */
export async function listWslDistributions(timeoutMs: number): Promise<WslDistribution[]> {
  const child = spawn(wslExecutable(), ['--list', '--verbose'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
  const result = await new Promise<{ code: number | null }>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill()
      reject(new WorkspaceError('wsl.exe --list timed out', 'TIMEOUT', { operation: 'list' }))
    }, timeoutMs)
    child.once('error', () => {
      clearTimeout(timer)
      resolve({ code: null })
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ code })
    })
  })
  if (result.code === null && stdout.length === 0) return []
  return parseWslList(decodeWslListOutput(Buffer.concat(stdout)))
}

/**
 * Helper operations the WSL filesystem backend needs. {@link WslBridge}
 * implements this; tests supply in-memory doubles.
 */
export interface WslHelperClient {
  /**
   * Run one helper operation and return UTF-8 text.
   * @param op - Protocol verb.
   * @param path - Target path inside the distribution.
   * @param arg - Optional payload.
   * @returns helper payload when ok.
   */
  request(op: string, path: string, arg?: string): Promise<string>
  /**
   * Run one helper operation and return raw bytes.
   * @param op - Protocol verb.
   * @param path - Target path inside the distribution.
   * @param arg - Optional payload.
   * @returns helper payload bytes when ok.
   */
  requestBytes(op: string, path: string, arg?: string): Promise<Buffer>
}

/**
 * Persistent helper for one distribution. Dispose kills the bash process.
 */
export class WslBridge implements WslHelperClient {
  private child: ChildProcessWithoutNullStreams | undefined
  private buffer = ''
  private seq = 0
  private readonly pending = new Map<string, {
    readonly resolve: (result: WslHelperResult) => void
    readonly reject: (error: Error) => void
  }>()
  private ready: Promise<void> | undefined
  /**
   * Resolved by {@link onData} when the helper prints `READY`. The readiness
   * line is consumed by the same line loop that decodes responses, so polling
   * the buffer for it races that consumption: a cold distribution start, where
   * `READY` arrives after the first poll, would otherwise never be observed.
   */
  private readySignal: PromiseWithResolvers<void> | undefined
  private disposed = false

  /**
   * @param distro - Distribution name as reported by `wsl.exe --list`.
   * @param timeoutMs - Per-request budget.
   * @param autoStart - Start a stopped distribution on first use.
   */
  constructor(
    readonly distro: string,
    private readonly timeoutMs: number,
    private readonly autoStart: boolean,
  ) {}

  /**
   * Ensure the helper is running. Starts a stopped distro when autoStart is set.
   * @returns resolution once READY has been read.
   */
  async connect(): Promise<void> {
    if (this.disposed) throw new WorkspaceError(`WSL ${this.distro} helper is disposed`, 'TARGET_OFFLINE', {
      distribution: this.distro,
    })
    this.ready ??= this.start()
    await this.ready
  }

  /**
   * Run one helper operation.
   * @param op - Protocol verb.
   * @param path - Target path inside the distribution.
   * @param arg - Optional payload (already decoded); WRITE supplies base64 file bytes.
   * @returns helper payload when ok.
   */
  async request(op: string, path: string, arg: string = ''): Promise<string> {
    return (await this.requestBytes(op, path, arg)).toString('utf8')
  }

  /**
   * Run one helper operation and return the raw payload bytes.
   * @param op - Protocol verb.
   * @param path - Target path inside the distribution.
   * @param arg - Optional payload bytes encoded as UTF-8 then base64 on the wire.
   * @returns helper payload bytes when ok.
   */
  async requestBytes(op: string, path: string, arg: string = ''): Promise<Buffer> {
    await this.connect()
    const id = String(++this.seq)
    const line = `${id}\t${op}\t${Buffer.from(path).toString('base64')}\t${Buffer.from(arg).toString('base64')}\n`
    const result = await new Promise<WslHelperResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new WorkspaceError(`WSL ${this.distro} ${op} timed out`, 'TIMEOUT', {
          distribution: this.distro,
          operation: op,
        }))
      }, this.timeoutMs)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      try {
        this.child?.stdin.write(line)
      } catch (error: unknown) {
        this.pending.delete(id)
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(`stdin write failed: ${String(error)}`))
      }
    })
    if (!result.ok) {
      const code = result.code === 'NOT_FOUND'
        ? 'PATH_NOT_FOUND'
        : result.code === 'PERMISSION_DENIED'
          ? 'PERMISSION_DENIED'
          : result.code === 'UNSUPPORTED'
            ? 'UNSUPPORTED'
            : 'FILESYSTEM_FAILED'
      throw new WorkspaceError(
        `WSL ${this.distro} ${op} failed: ${result.payload.toString('utf8') || result.code || 'error'}`,
        code,
        { distribution: this.distro, operation: op },
      )
    }
    return result.payload
  }

  /**
   * Probe the distribution with a trivial command.
   * @returns `ok` when the helper answers.
   */
  async ping(): Promise<string> {
    return await this.request('PING', '/')
  }

  /**
   * Kill the helper. Does not shut down the distribution.
   * @returns resolution after the child exits or is already gone.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    const child = this.child
    this.child = undefined
    this.ready = undefined
    const offline = new WorkspaceError(`WSL ${this.distro} helper closed`, 'TARGET_OFFLINE', {
      distribution: this.distro,
    })
    this.readySignal?.reject(offline)
    this.readySignal = undefined
    for (const [, waiter] of this.pending) waiter.reject(offline)
    this.pending.clear()
    if (child === undefined) return
    await new Promise<void>((resolve) => {
      child.once('close', () => { resolve() })
      child.kill()
    })
  }

  private async start(): Promise<void> {
    if (this.autoStart) await this.ensureStarted()
    const signal = Promise.withResolvers<void>()
    this.readySignal = signal
    const child = spawn(wslExecutable(), [
      '--distribution',
      this.distro,
      '--exec',
      '/bin/bash',
      '--noprofile',
      '--norc',
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { this.onData(chunk) })
    child.on('error', (error) => {
      this.failAll(error)
      signal.reject(error)
    })
    child.on('close', () => {
      const offline = new WorkspaceError(`WSL ${this.distro} helper exited`, 'TARGET_OFFLINE', {
        distribution: this.distro,
      })
      this.failAll(offline)
      signal.reject(offline)
      this.child = undefined
      this.ready = undefined
      this.readySignal = undefined
    })
    child.stdin.write(WSL_HELPER_SCRIPT)
    await this.waitReady(signal)
  }

  private async ensureStarted(): Promise<void> {
    const child = spawn(wslExecutable(), [
      '--distribution',
      this.distro,
      '--exec',
      '/bin/true',
    ], {
      // `wsl.exe` writes its failure text to stdout, not stderr, so both
      // streams are collected to keep the diagnostic and the not-found
      // classification reachable.
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const output: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => { output.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { output.push(chunk) })
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(new WorkspaceError(
          `WSL distribution "${this.distro}" failed to start`,
          'TARGET_START_FAILED',
          { distribution: this.distro },
        ))
      }, this.timeoutMs)
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(new WorkspaceError(
          `WSL distribution "${this.distro}" is unavailable`,
          'TARGET_NOT_FOUND',
          { distribution: this.distro },
          { cause: error },
        ))
      })
      child.on('close', (exitCode) => {
        clearTimeout(timer)
        resolve(exitCode)
      })
    })
    if (code !== 0) {
      // The failure text mixes the console code page with UTF-16 LE, so NULs
      // interleave the ASCII parts; strip them before searching for the
      // HRESULT symbol name the classification keys on.
      const detail = decodeWslListOutput(Buffer.concat(output)).replaceAll('\0', '').trim()
      // `wsl.exe` localizes its stderr, so the HRESULT symbol name it always
      // prints alongside the message is the portable "no such distribution"
      // signal; the English phrasings stay as a fallback for builds that omit it.
      const missing = /WSL_E_DISTRO_NOT_FOUND/i.test(detail)
        || /there is no (distribution|distro) with the supplied name/i.test(detail)
        || /does not exist/i.test(detail)
      throw new WorkspaceError(
        missing
          ? `WSL distribution "${this.distro}" is unavailable.`
          : `WSL distribution "${this.distro}" failed to start.`,
        missing ? 'TARGET_NOT_FOUND' : 'TARGET_START_FAILED',
        { distribution: this.distro, ...(detail.length === 0 ? {} : { detail }) },
      )
    }
  }

  /**
   * Await the helper's readiness line, bounded by the configured command budget.
   * @param signal - Resolvers the line loop settles on `READY`, the child
   *   `close`/`error` rejects, and this deadline rejects.
   * @returns resolution once the helper answered.
   */
  private async waitReady(signal: PromiseWithResolvers<void>): Promise<void> {
    const timer = setTimeout(() => {
      signal.reject(new WorkspaceError(
        `WSL distribution "${this.distro}" helper did not become ready`,
        'TIMEOUT',
        { distribution: this.distro },
      ))
    }, this.timeoutMs)
    try {
      await signal.promise
    } finally {
      clearTimeout(timer)
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    while (true) {
      const newline = this.buffer.indexOf('\n')
      if (newline === -1) break
      const line = this.buffer.slice(0, newline).replace(/\r$/, '')
      this.buffer = this.buffer.slice(newline + 1)
      if (line === 'READY') {
        this.readySignal?.resolve()
        continue
      }
      if (line.length === 0) continue
      const parts = line.split('\t')
      const id = parts[0]
      if (id === undefined) continue
      const waiter = this.pending.get(id)
      if (waiter === undefined) continue
      this.pending.delete(id)
      if (parts[1] === 'OK') {
        waiter.resolve({
          ok: true,
          payload: Buffer.from(parts[2] ?? '', 'base64'),
        })
        continue
      }
      waiter.resolve({
        ok: false,
        code: parts[2] ?? 'ERROR',
        payload: Buffer.from(parts[3] ?? '', 'base64'),
      })
    }
  }

  private failAll(error: Error): void {
    for (const [, waiter] of this.pending) waiter.reject(error)
    this.pending.clear()
  }
}
