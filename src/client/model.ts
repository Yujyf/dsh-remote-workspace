/**
 * React-free Client remote-workspace state: the discovered target catalog, the
 * durable workspace rows, and the commands that mutate them. Remote calls
 * answer `RemoteResult`, so this model owns unwrapping: a failure throws
 * {@link RemoteWorkspaceCommandError} carrying the Host business code, while a
 * snapshot load records the failure in state instead of rejecting.
 * @module @Yujyf/dsh-remote-workspace/client/model
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteWorkspaceNamespace } from './namespace.ts'
import type {
  RemoteDirectoryListing,
  RemoteWorkspace,
  RemoteWorkspaceId,
  TargetHealth,
  WorkspaceTarget,
  WorkspaceTargetId,
} from '../wire-types.ts'

/** Lifecycle of the cached catalog. */
export type RemoteWorkspacePhase = 'idle' | 'loading' | 'ready' | 'error'

/** Identity-stable Client view of the remote-workspace catalog. */
export interface RemoteWorkspaceSnapshot {
  readonly phase: RemoteWorkspacePhase
  /** Discovered targets, Local first then one entry per WSL distribution. */
  readonly targets: readonly WorkspaceTarget[]
  /** Durable workspace registrations in registry order. */
  readonly workspaces: readonly RemoteWorkspace[]
  /** Host failure text from the last load, or null. */
  readonly error: string | null
}

/** Bare observable source over {@link RemoteWorkspaceSnapshot}. */
export interface RemoteWorkspaceSource {
  /**
   * Read the identity-stable current snapshot.
   * @returns the cached snapshot.
   */
  getSnapshot(): RemoteWorkspaceSnapshot
  /**
   * Subscribe to snapshot changes.
   * @param listener - invalidation callback.
   * @returns unsubscribe function.
   */
  subscribe(listener: () => void): () => void
}

/** One failed remote-workspace command, with the Host business code preserved. */
export class RemoteWorkspaceCommandError extends Error {
  override readonly name = 'RemoteWorkspaceCommandError'

  /**
   * @param operation - the verb that failed.
   * @param rpcError - Host business or folded carrier failure.
   */
  constructor(readonly operation: string, readonly rpcError: RemoteFailure) {
    super(`remote workspace ${operation} failed: ${rpcError.code}: ${rpcError.message}`)
  }
}

const EMPTY: RemoteWorkspaceSnapshot = { phase: 'idle', targets: [], workspaces: [], error: null }

/**
 * Owns the Client-side catalog cache and every catalog command. Loads coalesce:
 * concurrent callers share one in-flight refresh, and a command invalidates the
 * cache so the next read reloads.
 */
export class ClientRemoteWorkspaceModel implements RemoteWorkspaceSource {
  private readonly listeners = new Set<() => void>()
  private snapshot: RemoteWorkspaceSnapshot = EMPTY
  private cache: RemoteWorkspaceSnapshot = EMPTY
  private inflight: Promise<void> | undefined

  /** @param remote - the generated remote-workspace Remote namespace. */
  constructor(private readonly remote: RemoteWorkspaceNamespace) {}

  /**
   * Read the current snapshot.
   * @returns the identity-stable snapshot.
   */
  getSnapshot(): RemoteWorkspaceSnapshot {
    return this.cache
  }

  /**
   * Subscribe to snapshot invalidation.
   * @param listener - invalidation callback.
   * @returns unsubscribe function.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Reload targets and workspaces, coalescing concurrent callers.
   * @returns resolution after the snapshot is published.
   */
  refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => { this.inflight = undefined })
    return this.inflight
  }

  /**
   * Create or reuse a workspace for a canonical URI.
   * @param uri - workspace URI.
   * @param title - display title used only when creating.
   * @returns the existing or newly durable workspace.
   */
  async createWorkspace(uri: string, title?: string): Promise<RemoteWorkspace> {
    const result = await this.remote.createWorkspace(title === undefined ? { uri } : { uri, title })
    if (!result.ok) throw new RemoteWorkspaceCommandError('createWorkspace', result.error)
    await this.refresh()
    return result.value.workspace
  }

  /**
   * Connect a workspace, starting a stopped distribution when configured.
   * @param workspaceId - workspace to connect.
   * @returns resolution after the helper is ready.
   */
  async connectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void> {
    const result = await this.remote.connectWorkspace({ workspaceId })
    if (!result.ok) throw new RemoteWorkspaceCommandError('connectWorkspace', result.error)
  }

  /**
   * Release the helpers a workspace holds.
   * @param workspaceId - workspace to disconnect.
   * @returns resolution after helpers stop.
   */
  async disconnectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void> {
    const result = await this.remote.disconnectWorkspace({ workspaceId })
    if (!result.ok) throw new RemoteWorkspaceCommandError('disconnectWorkspace', result.error)
  }

  /**
   * Delete one workspace registration. Sessions and files are retained.
   * @param workspaceId - workspace to remove.
   * @returns resolution after deletion.
   */
  async removeWorkspace(workspaceId: RemoteWorkspaceId): Promise<void> {
    const result = await this.remote.removeWorkspace({ workspaceId })
    if (!result.ok) throw new RemoteWorkspaceCommandError('removeWorkspace', result.error)
    await this.refresh()
  }

  /**
   * Bind a Session to a remote workspace so its later tool calls route there.
   * @param sessionId - session to bind.
   * @param workspaceId - target workspace.
   * @returns resolution after durability.
   */
  async bindSession(sessionId: SessionId, workspaceId: RemoteWorkspaceId): Promise<void> {
    const result = await this.remote.bindSession({ sessionId, workspaceId })
    if (!result.ok) throw new RemoteWorkspaceCommandError('bindSession', result.error)
    await this.refresh()
  }

  /**
   * List one directory level on a target.
   * @param targetId - target to browse.
   * @param path - directory path; omitted lists the target's default root.
   * @returns the listing.
   */
  async listDirectory(targetId: WorkspaceTargetId, path?: string): Promise<RemoteDirectoryListing> {
    const result = await this.remote.listDirectory(path === undefined ? { targetId } : { targetId, path })
    if (!result.ok) throw new RemoteWorkspaceCommandError('listDirectory', result.error)
    return result.value
  }

  /**
   * Create one child directory on a target.
   * @param targetId - target to mutate.
   * @param parent - existing parent directory.
   * @param name - single path segment.
   * @returns the created directory path.
   */
  async createDirectory(targetId: WorkspaceTargetId, parent: string, name: string): Promise<string> {
    const result = await this.remote.createDirectory({ targetId, parent, name })
    if (!result.ok) throw new RemoteWorkspaceCommandError('createDirectory', result.error)
    return result.value.path
  }

  /**
   * Build the canonical workspace URI for a native path on a target.
   * @param targetId - target the path lives in.
   * @param path - absolute path in that target's native spelling.
   * @returns the canonical URI and its default display title.
   */
  async resolveUri(targetId: WorkspaceTargetId, path: string): Promise<{ uri: string; title: string }> {
    const result = await this.remote.resolveUri({ targetId, path })
    if (!result.ok) throw new RemoteWorkspaceCommandError('resolveUri', result.error)
    return result.value
  }

  /**
   * Probe one target's reachability.
   * @param targetId - target to probe.
   * @returns live status and optional detail.
   */
  async healthCheck(targetId: WorkspaceTargetId): Promise<TargetHealth> {
    const result = await this.remote.healthCheck({ targetId })
    if (!result.ok) throw new RemoteWorkspaceCommandError('healthCheck', result.error)
    return result.value
  }

  private async load(): Promise<void> {
    this.publish({ ...this.snapshot, phase: 'loading', error: null })
    const [targets, workspaces] = await Promise.all([
      this.remote.listTargets(),
      this.remote.listWorkspaces(),
    ])
    if (!targets.ok) {
      this.publish({ ...this.snapshot, phase: 'error', error: failureText(targets.error) })
      return
    }
    if (!workspaces.ok) {
      this.publish({ ...this.snapshot, phase: 'error', error: failureText(workspaces.error) })
      return
    }
    this.publish({
      phase: 'ready',
      targets: targets.value.targets,
      workspaces: workspaces.value.workspaces,
      error: null,
    })
  }

  private publish(next: RemoteWorkspaceSnapshot): void {
    this.snapshot = next
    this.cache = next
    for (const listener of [...this.listeners]) listener()
  }
}

function failureText(failure: RemoteFailure): string {
  return failure.message
}
