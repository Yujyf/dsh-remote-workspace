/**
 * FileSystem router for remote workspaces. Isolates the shipped sandboxed
 * local backend and delegates WSL-bound sessions to a helper-backed filesystem.
 * @module @Yujyf/dsh-remote-workspace
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { FileSystem } from '@deepseek-ai/dsh-fs'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsVersion,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { WslFileSystem } from './wsl-fs.ts'

export type Config = LocalConfig

/** Router config: the local backend's knobs verbatim, applied to the isolated sandboxed backend. */
export const Config: z<Config> = z.object({
  cwd: z.string().default(process.cwd()),
  diffBasisMaxBytes: z.number().default(10 * 1024 * 1024),
})

/**
 * `ctx.fs` implementation that routes by the current remote-workspace binding.
 * Unbound sessions use the isolated local sandboxed backend unchanged. The
 * owner is read with `ctx.get('remoteWorkspace')` (optional-service access):
 * the router composes beside it, and agentless host calls have no binding.
 */
export class RemoteWorkspaceFileSystem extends FileSystem {
  static inject = ['remoteWorkspace', 'sandboxPolicy']
  static Config = Config

  private local: FileSystem | undefined
  private readonly wsl = new Map<string, WslFileSystem>()
  private readonly localConfig: Config
  private readonly defaultMode: SandboxMode

  /** @param ctx - Host context. */
  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.localConfig = config
    this.defaultMode = ctx.sandboxPolicy.defaultMode
  }

  override get sandboxMode(): SandboxMode {
    return this.backend().sandboxMode ?? this.defaultMode
  }

  /**
   * Isolate the shipped sandboxed local backend on a private `fs` realm. The
   * backend instance is captured through `ctx.inject()`: the isolated realm's
   * `fs` is a different implementation from this router, and reading it back
   * through this context's property proxy would resolve the router's own service.
   */
  protected async [Service.init](): Promise<void> {
    const localCtx = this.ctx.isolate('fs')
    let captured: FileSystem | undefined
    localCtx.inject(['fs'], (fsCtx) => { captured = fsCtx.fs })
    await localCtx.plugin(SandboxedFileSystem, this.localConfig)
    if (captured === undefined || captured === this) {
      throw new Error('remote-workspace filesystem: the isolated local backend did not start')
    }
    this.local = captured
  }

  override resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    return this.backend().resolve(path, opts)
  }

  override processPath(target: FsTarget): string {
    return this.backend().processPath(target)
  }

  override processPathFromHostPath(hostPath: string): string | undefined {
    return this.backend().processPathFromHostPath(hostPath)
  }

  override fileUrl(target: FsTarget): string {
    return this.backend().fileUrl(target)
  }

  override contains(parent: FsTarget, child: FsTarget): boolean {
    return this.backend().contains(parent, child)
  }

  override stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> {
    return this.backend().stat(target, signal)
  }

  override lstat(path: string, opts?: { cwd?: string }, signal?: AbortSignal): Promise<FsPathInfo | undefined> {
    return this.backend().lstat(path, opts, signal)
  }

  override readText(target: FsTarget, signal?: AbortSignal): Promise<string> {
    return this.backend().readText(target, signal)
  }

  override streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return this.backend().streamText(target, signal)
  }

  override readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return this.backend().readBytes(target, signal, maxBytes)
  }

  override readByteRange(
    target: FsTarget,
    range: { offset: number; length: number },
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    return this.backend().readByteRange(target, range, signal)
  }

  override listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]> {
    return this.backend().listDir(target, signal)
  }

  override writeText(
    target: FsTarget,
    content: string,
    expected?: FsWriteIntent,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsWriteOutcome> {
    return this.backend().writeText(target, content, expected, signal, sandboxPolicy)
  }

  override editText(
    target: FsTarget,
    edit: FsEditRequest,
    expected?: { version: FsVersion },
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<FsEditOutcome> {
    return this.backend().editText(target, edit, expected, signal, sandboxPolicy)
  }

  private backend(): FileSystem | WslFileSystem {
    const remoteWorkspace = this.ctx.get('remoteWorkspace')
    const binding = remoteWorkspace?.currentBinding()
    if (binding?.target.type === 'wsl' && binding.bridge !== undefined) {
      const key = `${binding.target.id}:${binding.cwd}`
      const existing = this.wsl.get(key)
      if (existing !== undefined) return existing
      const created = new WslFileSystem(binding.bridge, binding.cwd, this.defaultMode)
      this.wsl.set(key, created)
      return created
    }
    if (this.local === undefined) throw new Error('remote-workspace filesystem is not started yet')
    return this.local
  }
}

export default RemoteWorkspaceFileSystem
