/**
 * Host remote-workspace Remote owner: target discovery, workspace CRUD, path
 * browsing, and session binding.
 * @module @Yujyf/dsh-remote-workspace
 */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WorkspaceError } from './errors.ts'
import { WorkspaceTargetId } from './types.ts'
import type { RemoteWorkspaceId } from './types.ts'
// The owner owns the listing/health declarations; the generator requires the
// reference site to name that package rather than this package's re-export.
import type { RemoteDirectoryListing, TargetHealth } from './wire-types.ts'
import type {
  RemoteWorkspaceBindRequest,
  RemoteWorkspaceCreateDirectoryRequest,
  RemoteWorkspaceCreateRequest,
  RemoteWorkspaceCreateValue,
  RemoteWorkspaceHealthRequest,
  RemoteWorkspaceIdRequest,
  RemoteWorkspaceListDirectoryRequest,
  RemoteWorkspaceListValue,
  RemoteWorkspaceResolveUriRequest,
  RemoteWorkspaceResolveUriValue,
  RemoteWorkspaceTargetsValue,
} from './wire-types.ts'

export type * from './wire-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host remote-workspace business API and Remote namespace owner. */
    remoteWorkspaceController: RemoteWorkspaceController
  }
}

/** Host service backing the generated `ctx.remote.remoteWorkspace` namespace. */
export class RemoteWorkspaceController extends TypertRemoteService {
  static inject = ['typert', 'remoteWorkspace']

  /** @param ctx - Host context containing the remote-workspace owner. */
  constructor(ctx: Context) {
    super(ctx, 'remoteWorkspaceController', { namespace: 'remoteWorkspace' })
  }

  /**
   * List discovered execution targets.
   * @returns the live target catalog.
   */
  @Remote('listTargets')
  async listTargets(): Promise<RemoteWorkspaceTargetsValue> {
    return { targets: await this.ctx.remoteWorkspace.listTargets() }
  }

  /**
   * List durable remote workspaces.
   * @returns registered workspaces in display order.
   */
  @Remote('listWorkspaces')
  listWorkspaces(): RemoteWorkspaceListValue {
    return { workspaces: this.ctx.remoteWorkspace.listWorkspaces() }
  }

  /**
   * Create or reuse a remote workspace for a canonical URI.
   * @param request - URI and optional title.
   * @returns the workspace record.
   */
  @Remote('createWorkspace')
  async createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceCreateValue> {
    try {
      const workspace = await this.ctx.remoteWorkspace.createWorkspace(request.uri, request.title)
      return { workspace }
    } catch (error: unknown) {
      throw mapError(error)
    }
  }

  /**
   * Remove a remote workspace registration.
   * @param request - Workspace identity.
   * @returns resolution after deletion.
   */
  @Remote('removeWorkspace')
  async removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<void> {
    await this.ctx.remoteWorkspace.removeWorkspace(request.workspaceId)
  }

  /**
   * Connect a workspace, starting a stopped WSL distribution when configured.
   * @param request - Workspace identity.
   * @returns resolution after the helper is ready.
   */
  @Remote('connectWorkspace')
  async connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<void> {
    try {
      await this.ctx.remoteWorkspace.connectWorkspace(request.workspaceId)
    } catch (error: unknown) {
      throw mapError(error, request.workspaceId)
    }
  }

  /**
   * Disconnect a workspace without shutting down its target by default.
   * @param request - Workspace identity.
   * @returns resolution after helpers stop.
   */
  @Remote('disconnectWorkspace')
  async disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<void> {
    await this.ctx.remoteWorkspace.disconnectWorkspace(request.workspaceId)
  }

  /**
   * Probe one target.
   * @param request - Target identity.
   * @returns live status.
   */
  @Remote('healthCheck')
  async healthCheck(request: RemoteWorkspaceHealthRequest): Promise<TargetHealth> {
    return await this.ctx.remoteWorkspace.healthCheck(request.targetId)
  }

  /**
   * List one directory on a target.
   * @param request - Target and optional path.
   * @returns the listing.
   */
  @Remote('listDirectory')
  async listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteDirectoryListing> {
    try {
      return await this.ctx.remoteWorkspace.listDirectory(request.targetId, request.path)
    } catch (error: unknown) {
      throw pathError(error, request.path ?? '')
    }
  }

  /**
   * Build the canonical workspace URI for a native path on a target. Picking
   * surfaces call this instead of assembling a URI scheme themselves.
   * @param request - Target and native path.
   * @returns the canonical URI and its default title.
   */
  @Remote('resolveUri')
  resolveUri(request: RemoteWorkspaceResolveUriRequest): RemoteWorkspaceResolveUriValue {
    try {
      return this.ctx.remoteWorkspace.uriForTargetPath(request.targetId, request.path)
    } catch (error: unknown) {
      throw pathError(error, request.path)
    }
  }

  /**
   * Create a child directory on a target.
   * @param request - Target, parent, and name.
   * @returns the created path as a listing of that directory.
   */
  @Remote('createDirectory')
  async createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<{ readonly path: string }> {
    try {
      const path = await this.ctx.remoteWorkspace.createDirectory(
        request.targetId,
        request.parent,
        request.name,
      )
      return { path }
    } catch (error: unknown) {
      throw pathError(error, request.parent)
    }
  }

  /**
   * Bind a Session to a remote workspace so later tool calls route there.
   * @param request - Workspace and Session identities.
   * @returns resolution after durability.
   */
  @Remote('bindSession')
  async bindSession(request: RemoteWorkspaceBindRequest): Promise<void> {
    try {
      await this.ctx.remoteWorkspace.bindSession(request.sessionId, request.workspaceId)
    } catch (error: unknown) {
      throw mapError(error, request.workspaceId)
    }
  }
}

function mapError(error: unknown, workspaceId?: RemoteWorkspaceId): RemoteError {
  if (error instanceof WorkspaceError) {
    if (error.code === 'TARGET_NOT_FOUND' || error.code === 'TARGET_OFFLINE' || error.code === 'TARGET_START_FAILED') {
      const targetId = WorkspaceTargetId(
        error.metadata.distribution !== undefined
          ? `wsl:${error.metadata.distribution}`
          : error.metadata.targetId ?? '',
      )
      return new RemoteError(
        'remote-workspace/target-unavailable',
        error.message,
        { targetId },
        { cause: error },
      )
    }
    if (workspaceId !== undefined) {
      return new RemoteError('remote-workspace/not-found', error.message, { workspaceId }, { cause: error })
    }
  }
  return new RemoteError(
    'gateway/internal',
    error instanceof Error ? error.message : String(error),
    {},
    { cause: error },
  )
}

function pathError(error: unknown, path: string): RemoteError {
  return new RemoteError(
    'remote-workspace/path-failed',
    error instanceof Error ? error.message : String(error),
    { path },
    { cause: error },
  )
}

export default RemoteWorkspaceController
