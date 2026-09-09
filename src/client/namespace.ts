/**
 * The remote-workspace Remote verbs the Client object layer calls. The
 * generated `/remote` contribution types these members, but this api-layer
 * package cannot import `dsh-api-remotes/client` — that assembly selects this
 * package, so the import would close a dependency cycle — and importing this
 * package's own generated artifact would put artifact-plane declarations into
 * the source-plane program. The narrow interface therefore declares exactly
 * the verbs the model uses; `apply` reaches them through the Gateway-owned
 * `ctx.remote` member.
 * @module @Yujyf/dsh-remote-workspace/client/namespace
 */

import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  RemoteDirectoryListing,
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
  TargetHealth,
} from '../wire-types.ts'

/** The `remoteWorkspace` namespace as the Client object layer consumes it. */
export interface RemoteWorkspaceNamespace {
  /**
   * List discovered execution targets.
   * @returns the target catalog.
   */
  listTargets(): Promise<RemoteResult<RemoteWorkspaceTargetsValue>>
  /**
   * List durable workspace registrations.
   * @returns the registry rows.
   */
  listWorkspaces(): Promise<RemoteResult<RemoteWorkspaceListValue>>
  /**
   * Create or reuse a workspace for a canonical URI.
   * @param request - URI and optional title.
   * @returns the workspace record.
   */
  createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteResult<RemoteWorkspaceCreateValue>>
  /**
   * Connect a workspace.
   * @param request - workspace identity.
   * @returns resolution after the helper is ready.
   */
  connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteResult<void>>
  /**
   * Disconnect a workspace.
   * @param request - workspace identity.
   * @returns resolution after helpers stop.
   */
  disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteResult<void>>
  /**
   * Delete a workspace registration.
   * @param request - workspace identity.
   * @returns resolution after deletion.
   */
  removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteResult<void>>
  /**
   * Bind a Session to a workspace.
   * @param request - workspace and session identities.
   * @returns resolution after durability.
   */
  bindSession(request: RemoteWorkspaceBindRequest): Promise<RemoteResult<void>>
  /**
   * List one directory level on a target.
   * @param request - target and optional path.
   * @returns the listing.
   */
  listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteResult<RemoteDirectoryListing>>
  /**
   * Create one child directory on a target.
   * @param request - target, parent, and name.
   * @returns the created path.
   */
  createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<RemoteResult<{ readonly path: string }>>
  /**
   * Build the canonical workspace URI for a native path on a target.
   * @param request - target and native path.
   * @returns the canonical URI and its default title.
   */
  resolveUri(request: RemoteWorkspaceResolveUriRequest): Promise<RemoteResult<RemoteWorkspaceResolveUriValue>>
  /**
   * Probe one target.
   * @param request - target identity.
   * @returns live status.
   */
  healthCheck(request: RemoteWorkspaceHealthRequest): Promise<RemoteResult<TargetHealth>>
}
