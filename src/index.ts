/**
 * Remote workspace owner (`ctx.remoteWorkspace`): URI identity, target
 * discovery, durable registry, session binding, and WSL helper lifecycle.
 * @module @Yujyf/dsh-remote-workspace
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { DomainGlobal, KvTable } from '@deepseek-ai/dsh-storage-domain'
import { LOCAL_CAPABILITIES, WSL_CAPABILITIES } from './capabilities.ts'
import { WorkspaceError } from './errors.ts'
import {
  defaultRemoteWorkspaceTitle,
  parseWorkspaceUri,
  workspaceUriFromNative,
  workspaceUriFromWslUnc,
} from './uri.ts'
import { localPathMapper, wslPathMapper, type PathMapper } from './path-mapper.ts'
import { hostPathOfWorkspace, uncPathsEqual } from './path-mapper.ts'
import { listWslDistributions, terminateWslDistribution, WslBridge } from './wsl-bridge.ts'
import { remoteWorkspaceDomainSpec } from './spec.ts'
import { RemoteWorkspaceId, WorkspaceTargetId } from './types.ts'
import type { RemoteWorkspaceDomainState, RemoteWorkspaceRecord } from './spec.ts'
import type {
  RemoteDirectoryEntry,
  RemoteDirectoryListing,
  RemoteWorkspace,
  TargetHealth,
  WorkspaceTarget,
  WorkspaceTargetStatus,
  WorkspaceTargetType,
  WorkspaceUri,
} from './types.ts'

/**
 * The `ctx.workspaceRegistry` capability this owner writes. Declared locally
 * because the published workspace package ships no type declarations.
 */
interface HostWorkspaceRegistry {
  /**
   * Create or reuse the workspace for a directory that must already resolve.
   * @param path - host directory.
   * @param title - display title used only when creating.
   * @returns the workspace entity.
   */
  create(path: string, title: string): Promise<{ readonly id: string; readonly path: string; readonly title: string }>
  /**
   * Remove one workspace from the registry.
   * @param id - workspace id.
   * @returns resolution after deletion.
   */
  delete(id: string): Promise<void>
  /** Every registered workspace, in display order. */
  list(): readonly {
    readonly id: string
    readonly title: string
    readonly path: string
    readonly sessionIds: readonly SessionId[]
  }[]
}

/** One DSH workspace row, as the selector shows it for context. */
export interface HostWorkspaceRow {
  readonly id: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly SessionId[]
}

/** Target types this owner can build identity for; a reserved type has no provider yet. */
const KNOWN_TARGET_TYPES = new Set<WorkspaceTargetType>(['local', 'wsl'])

/** Runtime-context entry naming the execution world of a bound session. */
const EXECUTION_WORLD_CONTEXT = 'remote-workspace:execution-world'

/** Display name of the world the harness process itself runs in. */
function hostWorldName(): string {
  if (process.platform === 'win32') return 'Windows'
  if (process.platform === 'darwin') return 'macOS'
  return 'Linux'
}

export { WorkspaceError } from './errors.ts'
export type { WorkspaceErrorCode } from './errors.ts'
export {
  defaultRemoteWorkspaceTitle,
  formatWorkspaceUri,
  normalizePosixPath,
  normalizeWindowsPath,
  parseWorkspaceUri,
  uriPathToWindowsPath,
  windowsPathToUriPath,
  workspaceUriEquals,
  workspaceUriFromNative,
  workspaceUriFromWslUnc,
} from './uri.ts'
export {
  hostPathOfWorkspace,
  localPathMapper,
  uncPathsEqual,
  windowsPathToWslMount,
  wslPathMapper,
  wslPathToUnc,
  wslPathToWindowsMount,
} from './path-mapper.ts'
export type { PathMapper } from './path-mapper.ts'
export { LOCAL_CAPABILITIES, WSL_CAPABILITIES } from './capabilities.ts'
export { decodeWslListOutput, parseWslList } from './wsl-list.ts'
export { worldCwd, sameHostPath } from './world-cwd.ts'
export type { WorldCwdFacts } from './world-cwd.ts'
export { listWslDistributions, terminateWslDistribution, wslExecutable, WslBridge } from './wsl-bridge.ts'
export type { WslHelperClient } from './wsl-bridge.ts'
export { remoteWorkspaceDomainSpec, remoteWorkspaceRecord, remoteWorkspaceDomainState } from './spec.ts'
export type { RemoteWorkspaceDomainState, RemoteWorkspaceRecord } from './spec.ts'
export {
  RemoteWorkspaceId,
  WorkspaceTargetId,
} from './types.ts'
export type {
  RemoteDirectoryEntry,
  RemoteDirectoryListing,
  RemoteWorkspace,
  TargetHealth,
  WorkspaceCapabilities,
  WorkspaceTarget,
  WorkspaceTargetStatus,
  WorkspaceTargetType,
  WorkspaceUri,
  WslDistribution,
} from './types.ts'

/** Plugin configuration. */
export interface Config {
  /** Start a stopped WSL distribution when a workspace on it connects. */
  autoStart?: boolean
  /** Shut down the WSL distribution when its last workspace disconnects. Default false. */
  shutdownOnDisconnect?: boolean
  /** Per-helper and listing command budget in milliseconds. */
  commandTimeoutMs?: number
}

interface ResolvedConfig {
  autoStart: boolean
  shutdownOnDisconnect: boolean
  commandTimeoutMs: number
}

interface SchemaResolvedConfig extends Config {
  autoStart: boolean
  shutdownOnDisconnect: boolean
  commandTimeoutMs: number
}

/** Bound execution world for one session or connected workspace. */
export interface ExecutionBinding {
  readonly workspace: RemoteWorkspace
  readonly target: WorkspaceTarget
  readonly cwd: string
  readonly pathMapper: PathMapper
  /**
   * Host directory of the bound session at resolution time. The routers use it
   * to recognize the session's own directory and land it on {@link cwd}; any
   * other host path keeps its drive mapping.
   */
  readonly sourceCwd?: string
  readonly bridge?: WslBridge
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteWorkspace: RemoteWorkspaceRuntime
  }
}

/**
 * Host-local target for the current process platform.
 * @returns a ready local target.
 */
export function localHostTarget(): WorkspaceTarget {
  const authority = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux'
  const displayName = authority === 'windows' ? 'Windows' : authority === 'macos' ? 'macOS' : 'Linux'
  return {
    id: WorkspaceTargetId(`local:${authority}`),
    type: 'local',
    displayName,
    identity: `local://${authority}`,
    status: 'ready',
    capabilities: LOCAL_CAPABILITIES,
  }
}

/**
 * Owner of remote-workspace identity, registry, and WSL helpers. Filesystem and
 * subprocess routers ask it which execution world the current agent is bound to.
 */
export class RemoteWorkspaceRuntime extends Service {
  static inject = ['storageDomain']

  static Config: z<Config> = z.object({
    autoStart: z.boolean().default(true),
    shutdownOnDisconnect: z.boolean().default(false),
    commandTimeoutMs: z.number().default(30_000),
  })

  private readonly config: ResolvedConfig
  private table?: KvTable<RemoteWorkspaceId, RemoteWorkspaceRecord>
  private global?: DomainGlobal<RemoteWorkspaceDomainState>
  private state?: RemoteWorkspaceDomainState
  private readonly bridges = new Map<string, WslBridge>()
  private operationTail: Promise<void> = Promise.resolve()

  /** @param ctx - Host context. */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'remoteWorkspace')
    const resolved = config as SchemaResolvedConfig
    this.config = {
      autoStart: resolved.autoStart,
      shutdownOnDisconnect: resolved.shutdownOnDisconnect,
      commandTimeoutMs: resolved.commandTimeoutMs,
    }
    ctx.effect(() => async () => {
      const pending = [...this.bridges.values()].map(bridge => bridge.dispose())
      this.bridges.clear()
      await Promise.all(pending)
    }, 'remote-workspace.bridges')
  }

  /** Open the domain, then announce the bound world to the model. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(remoteWorkspaceDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'remote-workspace.domainClose')
    this.table = domain.table('workspaces')
    this.global = domain.global
    this.state = domain.global.get()
    this.ctx.inject(['systemPrompt'], (scope) => {
      scope.systemPrompt.context({
        name: EXECUTION_WORLD_CONTEXT,
        order: scope.systemPrompt.getContextOrder('SANDBOX_POLICY') + 1,
        text: promptContext => this.executionWorldContext(promptContext.agent?.session.id),
      })
    })
  }

  /**
   * Model-facing description of the world this session's tools run in. Empty
   * for an unbound session: the host world is DSH's default and needs no note.
   * @param sessionId - Session the request belongs to.
   * @returns the runtime-context text, or an empty string.
   */
  private executionWorldContext(sessionId: SessionId | undefined): string {
    if (sessionId === undefined) return ''
    const binding = this.bindingForSession(sessionId)
    if (binding === undefined || binding.target.type !== 'wsl') return ''
    const distro = binding.target.metadata?.distribution ?? binding.target.displayName
    return [
      `Execution world: WSL distribution "${distro}" (remote workspace "${binding.workspace.title}").`,
      `Shell commands, file reads, file writes, and file searches for this session run inside that distribution, not on the ${hostWorldName()} host.`,
      `The working directory is ${binding.cwd}; use POSIX paths, and use the bash tool because PowerShell does not exist in this world.`,
      'Host files stay reachable through the Linux mount (`C:\\Users\\me` is `/mnt/c/Users/me`).',
    ].join(' ')
  }

  /**
   * Discover the remote execution worlds a session can be bound to. The
   * host-local world is never listed: a session that is not bound already runs
   * there, so it is not a remote workspace. WSL distributions appear on Windows
   * when `wsl.exe` is installed.
   * @returns the live remote target catalog.
   */
  async listTargets(): Promise<WorkspaceTarget[]> {
    if (process.platform !== 'win32') return []
    const targets: WorkspaceTarget[] = []
    try {
      const distributions = await listWslDistributions(this.config.commandTimeoutMs)
      for (const distribution of distributions) {
        targets.push(this.targetFromDistribution(distribution.name, distribution.state === 'running' ? 'ready' : distribution.state === 'stopped' ? 'stopped' : 'unknown'))
      }
    } catch (error: unknown) {
      if (error instanceof WorkspaceError && error.code === 'TIMEOUT') {
        targets.push({
          id: WorkspaceTargetId('wsl:unavailable'),
          type: 'wsl',
          displayName: 'WSL',
          identity: 'wsl://',
          status: 'unavailable',
          capabilities: WSL_CAPABILITIES,
          metadata: { detail: error.message },
        })
        return targets
      }
    }
    return targets
  }

  /**
   * Durable workspaces in registry order.
   * @returns a fresh array of workspace records.
   */
  listWorkspaces(): RemoteWorkspace[] {
    return this.requireState().workspaceIds.map((id) => {
      const record = this.requireTable().get(id)
      if (record === undefined) {
        throw new Error(`remote workspace order references missing workspace '${id}'`)
      }
      return this.toWorkspace(id, record)
    })
  }

  /**
   * Look up one workspace by id.
   * @param id - Workspace id.
   * @returns the workspace, or `undefined` when unknown.
   */
  getWorkspace(id: RemoteWorkspaceId): RemoteWorkspace | undefined {
    const record = this.requireTable().get(id)
    return record === undefined ? undefined : this.toWorkspace(id, record)
  }

  /**
   * Create or reuse a workspace for a canonical URI. Same target + same
   * canonical path returns the existing record.
   * @param uri - Workspace URI.
   * @param title - Display title used only when creating.
   * @returns the existing or newly durable workspace.
   */
  createWorkspace(uri: string, title?: string): Promise<RemoteWorkspace> {
    return this.enqueue(async () => {
      const parsed = parseWorkspaceUri(uri)
      const table = this.requireTable()
      for (const [id, record] of table.entries()) {
        if (record.uri !== parsed.href) continue
        return this.toWorkspace(id, await this.ensureHostWorkspace(id, record))
      }
      const targetId = this.targetIdOf(parsed)
      const id = RemoteWorkspaceId(randomUUID())
      const now = Date.now()
      // Register the DSH workspace first: a failure there (a stopped
      // distribution cannot resolve its own UNC share) must not leave a
      // half-created registration behind.
      const hostWorkspaceId = await this.registerHostWorkspace(parsed, title)
      const record: RemoteWorkspaceRecord = {
        targetId,
        uri: parsed.href,
        cwd: parsed.path,
        title: title ?? defaultRemoteWorkspaceTitle(parsed),
        createdAt: now,
        lastUsedAt: now,
        sessionIds: [],
        ...(hostWorkspaceId === undefined ? {} : { hostWorkspaceId }),
      }
      await table.put(id, record)
      const state = this.requireState()
      await this.setState({
        workspaceIds: [id, ...state.workspaceIds],
        sessionBindings: state.sessionBindings,
      })
      return this.toWorkspace(id, record)
    })
  }

  /**
   * Delete one workspace registration and the DSH workspace it created.
   * Sessions and target files are retained.
   * @param id - Workspace to remove.
   * @returns true when a record was deleted.
   */
  removeWorkspace(id: RemoteWorkspaceId): Promise<boolean> {
    return this.enqueue(async () => {
      const table = this.requireTable()
      const record = table.get(id)
      if (record === undefined) return false
      const state = this.requireState()
      const sessionBindings = { ...state.sessionBindings }
      for (const [sessionId, workspaceId] of Object.entries(sessionBindings)) {
        if (workspaceId === id) Reflect.deleteProperty(sessionBindings, sessionId)
      }
      await table.delete(id)
      await this.setState({
        workspaceIds: state.workspaceIds.filter(workspaceId => workspaceId !== id),
        sessionBindings,
      })
      if (record.hostWorkspaceId !== undefined) await this.deleteHostWorkspace(record.hostWorkspaceId)
      return true
    })
  }

  /**
   * DSH's own workspaces, minus the entries this owner created. The selector
   * shows those under their remote world instead, so listing them twice would
   * double every WSL workspace.
   * @returns host workspace rows in registry order.
   */
  listHostWorkspaces(): HostWorkspaceRow[] {
    const registry = this.hostRegistry()
    if (registry === undefined) return []
    const owned = this.ownedHostWorkspaceIds()
    return registry.list()
      .filter(workspace => !owned.has(workspace.id))
      .map(workspace => ({
        id: workspace.id,
        title: workspace.title,
        path: workspace.path,
        sessionIds: [...workspace.sessionIds],
      }))
  }

  /**
   * Bind a session to a remote workspace. The session's `header.cwd` should be
   * the target-native path; this table is the execution-world authority.
   * @param sessionId - Session to bind.
   * @param workspaceId - Remote workspace.
   * @returns resolution after durability.
   */
  bindSession(sessionId: SessionId, workspaceId: RemoteWorkspaceId): Promise<void> {
    return this.enqueue(async () => {
      const table = this.requireTable()
      const record = table.get(workspaceId)
      if (record === undefined) {
        throw new WorkspaceError(`remote workspace '${workspaceId}' was not found`, 'PATH_NOT_FOUND', {
          workspaceId,
        })
      }
      const sessionIds = record.sessionIds.includes(sessionId)
        ? record.sessionIds
        : [sessionId, ...record.sessionIds]
      await table.update(workspaceId, current => ({
        ...current,
        sessionIds,
        lastUsedAt: Date.now(),
      }))
      const state = this.requireState()
      await this.setState({
        workspaceIds: state.workspaceIds,
        sessionBindings: { ...state.sessionBindings, [sessionId]: workspaceId },
      })
    })
  }

  /**
   * Resolve the workspace bound to a session.
   * @param sessionId - Session id.
   * @returns the workspace, or `undefined` when the session is local-unbound.
   */
  workspaceForSession(sessionId: SessionId): RemoteWorkspace | undefined {
    const workspaceId = this.requireState().sessionBindings[sessionId]
    if (workspaceId === undefined) return undefined
    return this.getWorkspace(workspaceId)
  }

  /**
   * Execution world for the current initiating agent, if it is bound to a
   * remote workspace. Unbound sessions use the local host.
   * @returns the binding, or `undefined` for local/default execution.
   */
  currentBinding(): ExecutionBinding | undefined {
    const agent = this.ctx.get('agents')?.currentInitiator()
    if (agent === undefined) return undefined
    return this.bindingForSession(agent.session.id)
  }

  /**
   * Execution world for one session.
   * @param sessionId - Session id.
   * @returns the binding, or `undefined` when the session is not remote-bound.
   */
  bindingForSession(sessionId: SessionId): ExecutionBinding | undefined {
    const sourceCwd = this.sessionDirectory(sessionId)
    const bound = this.workspaceForSession(sessionId)
    if (bound !== undefined) return this.bindingForWorkspace(bound, sourceCwd)
    // A session whose directory is a WSL share runs in that distribution even
    // without a binding record: DSH created it in one of the workspaces this
    // owner registered, and the directory already names the world.
    if (sourceCwd === undefined) return undefined
    const derived = this.workspaceForHostPath(sourceCwd)
    return derived === undefined ? undefined : this.bindingForWorkspace(derived, sourceCwd)
  }

  /**
   * Execution world for one workspace record.
   * @param workspace - registered remote workspace.
   * @param sourceCwd - directory DSH recorded for the session, when known.
   * @returns the binding, or `undefined` for an unsupported target type.
   */
  private bindingForWorkspace(workspace: RemoteWorkspace, sourceCwd: string | undefined): ExecutionBinding | undefined {
    const parsed = parseWorkspaceUri(workspace.uri)
    const carried = sourceCwd === undefined ? {} : { sourceCwd }
    if (parsed.type === 'local') {
      return {
        workspace,
        target: localHostTarget(),
        cwd: workspace.cwd,
        pathMapper: localPathMapper(),
        ...carried,
      }
    }
    if (parsed.type !== 'wsl') return undefined
    return {
      workspace,
      target: this.targetFromDistribution(parsed.authority, 'unknown'),
      cwd: workspace.cwd,
      pathMapper: wslPathMapper(),
      bridge: this.bridgeFor(parsed.authority),
      ...carried,
    }
  }

  /**
   * The registration whose DSH workspace views one host directory, or a derived
   * record when the directory is a WSL share no registration owns (a workspace
   * the user added through DSH's own surface by naming the share path).
   * @param hostPath - directory DSH recorded for a session.
   * @returns a workspace record, or `undefined` for a host-local directory.
   */
  private workspaceForHostPath(hostPath: string): RemoteWorkspace | undefined {
    for (const [id, record] of this.requireTable().entries()) {
      const view = hostPathOfWorkspace(parseWorkspaceUri(record.uri))
      if (view !== undefined && uncPathsEqual(view, hostPath)) return this.toWorkspace(id, record)
    }
    const derived = workspaceUriFromWslUnc(hostPath)
    if (derived === undefined) return undefined
    return {
      id: RemoteWorkspaceId(derived.href),
      targetId: this.targetIdOf(derived),
      uri: derived.href,
      cwd: derived.path,
      title: defaultRemoteWorkspaceTitle(derived),
      createdAt: 0,
      lastUsedAt: 0,
      sessionIds: [],
    }
  }

  /**
   * Put one remote workspace into DSH's own workspace registry when it is not
   * there yet. That entry is what makes the workspace visible in DSH's list and
   * to every other plugin; a registration stored before this package wrote one
   * is repaired here, on the next create or connect.
   * @param id - registration id.
   * @param record - its stored record.
   * @returns the record, with the created workspace id when one was added.
   */
  private async ensureHostWorkspace(id: RemoteWorkspaceId, record: RemoteWorkspaceRecord): Promise<RemoteWorkspaceRecord> {
    if (record.hostWorkspaceId !== undefined) return record
    const parsed = parseWorkspaceUri(record.uri)
    const hostWorkspaceId = await this.registerHostWorkspace(parsed, record.title)
    if (hostWorkspaceId === undefined) return record
    const updated: RemoteWorkspaceRecord = { ...record, hostWorkspaceId }
    await this.requireTable().put(id, updated)
    return updated
  }

  /** The workspace registry, when the deployment mounts one. */
  private hostRegistry(): HostWorkspaceRegistry | undefined {
    return this.ctx.get('workspaceRegistry') as HostWorkspaceRegistry | undefined
  }

  /** Host workspace ids this owner created, from the live registry records. */
  private ownedHostWorkspaceIds(): Set<string> {
    const ids = new Set<string>()
    for (const [, record] of this.requireTable().entries()) {
      if (record.hostWorkspaceId !== undefined) ids.add(record.hostWorkspaceId)
    }
    return ids
  }

  /**
   * Put one remote workspace into DSH's own workspace registry, under the
   * distribution's UNC view of its directory. That entry is what makes the
   * workspace visible in DSH's workspace list and to every other plugin; the
   * UNC path resolves only while the distribution runs, so connect first.
   * @param parsed - parsed WSL workspace URI.
   * @param title - caller title, when one was given.
   * @returns the created workspace id, or `undefined` when nothing was created.
   */
  private async registerHostWorkspace(parsed: WorkspaceUri, title: string | undefined): Promise<string | undefined> {
    const registry = this.hostRegistry()
    const hostPath = hostPathOfWorkspace(parsed)
    if (registry === undefined || hostPath === undefined) return undefined
    if (parsed.type === 'wsl') await this.bridgeFor(parsed.authority).connect()
    const name = title ?? defaultRemoteWorkspaceTitle(parsed)
    const workspace = await registry.create(hostPath, `${name} · WSL ${parsed.authority}`)
    return workspace.id
  }

  /**
   * Remove the DSH workspace this owner created, when it still exists.
   * @param hostWorkspaceId - workspace id recorded at creation.
   */
  private async deleteHostWorkspace(hostWorkspaceId: string): Promise<void> {
    const registry = this.hostRegistry()
    if (registry === undefined) return
    try {
      await registry.delete(hostWorkspaceId)
    } catch (error: unknown) {
      // The user may have removed the workspace through DSH's own surface
      // first; removing a registration must not fail on that.
      if (!(error instanceof Error)) throw error
    }
  }

  /**
   * Working directory DSH recorded for one session. The header is immutable, so
   * this is the directory the session keeps for its whole life; the routers
   * substitute the bound workspace for it.
   * @param sessionId - Session id.
   * @returns the recorded host directory, or `undefined` for an unknown session.
   */
  sessionDirectory(sessionId: SessionId): string | undefined {
    return this.ctx.get('sessions')?.get(sessionId)?.header.cwd
  }

  /**
   * Release one session's binding so its tools run on the host again.
   * @param sessionId - Session to unbind.
   * @returns true when a binding was removed.
   */
  unbindSession(sessionId: SessionId): Promise<boolean> {
    return this.enqueue(async () => {
      const state = this.requireState()
      if (state.sessionBindings[sessionId] === undefined) return false
      const sessionBindings = { ...state.sessionBindings }
      Reflect.deleteProperty(sessionBindings, sessionId)
      const table = this.requireTable()
      const workspaceId = state.sessionBindings[sessionId]
      if (workspaceId !== undefined) {
        const record = table.get(workspaceId)
        if (record !== undefined) {
          await table.update(workspaceId, current => ({
            ...current,
            sessionIds: current.sessionIds.filter(id => id !== sessionId),
            lastUsedAt: Date.now(),
          }))
        }
      }
      await this.setState({ workspaceIds: state.workspaceIds, sessionBindings })
      return true
    })
  }

  /**
   * Connect a workspace: start a stopped WSL distro when configured, and
   * create the helper.
   * @param workspaceId - Workspace to connect.
   * @returns the live binding.
   */
  async connectWorkspace(workspaceId: RemoteWorkspaceId): Promise<ExecutionBinding> {
    let workspace = this.getWorkspace(workspaceId)
    if (workspace === undefined) {
      throw new WorkspaceError(`remote workspace '${workspaceId}' was not found`, 'PATH_NOT_FOUND', {
        workspaceId,
      })
    }
    const parsed = parseWorkspaceUri(workspace.uri)
    if (parsed.type === 'wsl') {
      const bridge = this.bridgeFor(parsed.authority)
      await bridge.connect()
      await bridge.request('REALPATH', parsed.path)
      // The distribution is running now, which is the only moment its UNC share
      // resolves — the moment to repair a registration that has no DSH entry.
      const record = this.requireTable().get(workspaceId)
      if (record !== undefined) workspace = this.toWorkspace(workspaceId, await this.ensureHostWorkspace(workspaceId, record))
    }
    if (parsed.type !== 'local' && parsed.type !== 'wsl') {
      throw new WorkspaceError(`cannot connect to unsupported target type '${parsed.type}'`, 'UNSUPPORTED', {
        uri: workspace.uri,
      })
    }
    const isLocal = parsed.type === 'local'
    return {
      workspace,
      target: isLocal ? localHostTarget() : this.targetFromDistribution(parsed.authority, 'ready'),
      cwd: workspace.cwd,
      pathMapper: isLocal ? localPathMapper() : wslPathMapper(),
      ...(isLocal ? {} : { bridge: this.bridgeFor(parsed.authority) }),
    }
  }

  /**
   * Release helpers for a workspace. Does not shut down the distribution unless
   * `shutdownOnDisconnect` is enabled.
   * @param workspaceId - Workspace to disconnect.
   * @returns resolution after helpers stop.
   */
  async disconnectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void> {
    const workspace = this.getWorkspace(workspaceId)
    if (workspace === undefined) return
    const parsed = parseWorkspaceUri(workspace.uri)
    if (parsed.type !== 'wsl') return
    const stillUsed = this.listWorkspaces().some(candidate => (
      candidate.id !== workspaceId && parseWorkspaceUri(candidate.uri).authority === parsed.authority
    ))
    if (stillUsed) return
    const bridge = this.bridges.get(parsed.authority)
    if (bridge !== undefined) {
      await bridge.dispose()
      this.bridges.delete(parsed.authority)
    }
    if (this.config.shutdownOnDisconnect) await terminateWslDistribution(parsed.authority)
  }

  /**
   * Health-check one target.
   * @param targetId - Target id.
   * @returns live status.
   */
  async healthCheck(targetId: WorkspaceTargetId): Promise<TargetHealth> {
    if (targetId.startsWith('local:')) {
      return { targetId, status: 'ready' }
    }
    if (!targetId.startsWith('wsl:')) {
      return { targetId, status: 'unavailable', detail: 'unsupported target type' }
    }
    const distro = targetId.slice('wsl:'.length)
    try {
      await this.bridgeFor(distro).ping()
      return { targetId, status: 'ready' }
    } catch (error: unknown) {
      const typed = error instanceof WorkspaceError ? error : undefined
      return {
        targetId,
        status: typed?.code === 'TARGET_NOT_FOUND' ? 'unavailable' : 'error',
        detail: typed?.message ?? String(error),
      }
    }
  }

  /**
   * List one directory on a target for the workspace path picker.
   * @param targetId - Target to browse.
   * @param path - Directory path in the target; omitted lists the default root.
   * @returns the path and its children.
   */
  async listDirectory(targetId: WorkspaceTargetId, path?: string): Promise<RemoteDirectoryListing> {
    if (targetId.startsWith('local:')) {
      const directory = path === undefined || path.length === 0 ? homedir() : path
      const entries = await readdir(directory, { withFileTypes: true })
      return {
        path: directory,
        entries: entries.map(entry => ({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        })),
      }
    }
    if (!targetId.startsWith('wsl:')) {
      throw new WorkspaceError(`cannot list directory on unsupported target '${targetId}'`, 'UNSUPPORTED', { targetId })
    }
    const distro = targetId.slice('wsl:'.length)
    const directory = path === undefined || path.length === 0 ? '/' : path
    const payload = await this.bridgeFor(distro).request('LIST', directory)
    const entries: RemoteDirectoryEntry[] = []
    for (const line of payload.split('\n')) {
      if (line.length === 0) continue
      const [name, kind] = line.split('\t')
      if (name === undefined) continue
      entries.push({ name, type: kind === 'd' ? 'directory' : kind === 'f' ? 'file' : 'other' })
    }
    return { path: directory, entries }
  }

  /**
   * Create one child directory on a target.
   * @param targetId - Target to mutate.
   * @param parent - Existing parent directory.
   * @param name - Single path segment.
   * @returns the created directory path.
   */
  async createDirectory(targetId: WorkspaceTargetId, parent: string, name: string): Promise<string> {
    if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
      throw new WorkspaceError('directory name must be a single non-blank path segment', 'UNSUPPORTED', { name })
    }
    if (targetId.startsWith('local:')) {
      const created = join(parent, name)
      await mkdir(created)
      return created
    }
    if (!targetId.startsWith('wsl:')) {
      throw new WorkspaceError(`cannot create directory on unsupported target '${targetId}'`, 'UNSUPPORTED', { targetId })
    }
    const distro = targetId.slice('wsl:'.length)
    const created = parent === '/' ? `/${name}` : `${parent.replace(/\/$/, '')}/${name}`
    await this.bridgeFor(distro).request('MKDIR', created)
    return created
  }

  /**
   * Return the helper for a distribution, creating it if needed.
   * @param distro - Distribution name.
   * @returns the shared bridge.
   */
  bridgeFor(distro: string): WslBridge {
    const existing = this.bridges.get(distro)
    if (existing !== undefined) return existing
    const bridge = new WslBridge(distro, this.config.commandTimeoutMs, this.config.autoStart)
    this.bridges.set(distro, bridge)
    return bridge
  }

  /**
   * Parse a URI string.
   * @param uri - Workspace URI.
   * @returns the canonical record.
   */
  resolveUri(uri: string): WorkspaceUri {
    return parseWorkspaceUri(uri)
  }

  /**
   * Build a URI from a target and native path.
   * @param type - Target type.
   * @param authority - Target authority.
   * @param path - Native path.
   * @returns the canonical URI.
   */
  uriFromNative(type: WorkspaceUri['type'], authority: string, path: string): WorkspaceUri {
    return workspaceUriFromNative(type, authority, path)
  }

  /**
   * Build the canonical workspace URI and default title for one native path on
   * a target. Consumers that pick a directory must not spell a URI scheme
   * themselves: this is the single place a target's native path becomes
   * identity, so a new target type needs no caller change.
   * @param targetId - target the path lives in.
   * @param path - absolute path in that target's native spelling.
   * @returns the canonical URI string and its default display title.
   * @throws `UNSUPPORTED` when the target id names no known target type or an empty authority.
   */
  uriForTargetPath(targetId: WorkspaceTargetId, path: string): { uri: string; title: string } {
    const separator = targetId.indexOf(':')
    const type = targetId.slice(0, separator)
    const authority = targetId.slice(separator + 1)
    if (separator <= 0 || authority.length === 0 || !KNOWN_TARGET_TYPES.has(type as WorkspaceTargetType)) {
      throw new WorkspaceError(`cannot resolve a workspace URI for target '${targetId}'`, 'UNSUPPORTED', { targetId })
    }
    const uri = workspaceUriFromNative(type as WorkspaceTargetType, authority, path)
    return { uri: uri.href, title: defaultRemoteWorkspaceTitle(uri) }
  }

  private targetFromDistribution(name: string, status: WorkspaceTargetStatus): WorkspaceTarget {
    return {
      id: WorkspaceTargetId(`wsl:${name}`),
      type: 'wsl',
      displayName: name,
      identity: `wsl://${encodeURIComponent(name)}`,
      status,
      capabilities: WSL_CAPABILITIES,
      metadata: { distribution: name },
    }
  }

  private targetIdOf(uri: WorkspaceUri): WorkspaceTargetId {
    if (uri.type === 'local') return WorkspaceTargetId(`local:${uri.authority}`)
    if (uri.type === 'wsl') return WorkspaceTargetId(`wsl:${uri.authority}`)
    return WorkspaceTargetId(`${uri.type}:${uri.authority}`)
  }

  private toWorkspace(id: RemoteWorkspaceId, record: RemoteWorkspaceRecord): RemoteWorkspace {
    return {
      id,
      targetId: record.targetId,
      uri: record.uri,
      cwd: record.cwd,
      title: record.title,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      sessionIds: record.sessionIds,
    }
  }

  private requireTable(): KvTable<RemoteWorkspaceId, RemoteWorkspaceRecord> {
    if (this.table === undefined) throw new Error('remote workspace registry is not started yet')
    return this.table
  }

  private requireState(): RemoteWorkspaceDomainState {
    if (this.state === undefined) throw new Error('remote workspace registry is not started yet')
    return this.state
  }

  private async setState(state: RemoteWorkspaceDomainState): Promise<void> {
    await (this.global as DomainGlobal<RemoteWorkspaceDomainState>).set(state)
    this.state = state
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}

export default RemoteWorkspaceRuntime
