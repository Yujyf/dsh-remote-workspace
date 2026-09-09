/**
 * Browser transport for the remote-workspace HTTP API: one `fetch` POST per
 * verb under {@link REMOTE_WORKSPACE_API_PREFIX}, returning the Host envelope
 * unchanged so the model owns unwrapping.
 * @module @Yujyf/dsh-remote-workspace/client/api
 */

import { REMOTE_WORKSPACE_API_PREFIX, type RemoteWorkspaceApiEnvelope, type RemoteWorkspaceApiFailure, type RemoteWorkspaceVerb } from '../api-wire.ts'
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
} from '../wire-types.ts'
import type { RemoteDirectoryListing, TargetHealth } from '../wire-types.ts'

/** Host envelope as the model consumes it. */
export type RemoteWorkspaceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: RemoteWorkspaceApiFailure }

/** Transport face the Client model depends on. */
export interface IRemoteWorkspaceApi {
  /**
   * List discovered execution targets.
   * @returns the live target catalog.
   */
  listTargets(): Promise<RemoteWorkspaceResult<RemoteWorkspaceTargetsValue>>
  /**
   * List durable remote workspaces.
   * @returns registered workspaces in display order.
   */
  listWorkspaces(): Promise<RemoteWorkspaceResult<RemoteWorkspaceListValue>>
  /**
   * Create or reuse a remote workspace.
   * @param request - URI and optional title.
   * @returns the workspace record.
   */
  createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceCreateValue>>
  /**
   * Remove a remote workspace registration.
   * @param request - workspace identity.
   * @returns the empty success envelope.
   */
  removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>
  /**
   * Connect a workspace.
   * @param request - workspace identity.
   * @returns the empty success envelope.
   */
  connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>
  /**
   * Disconnect a workspace.
   * @param request - workspace identity.
   * @returns the empty success envelope.
   */
  disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>
  /**
   * Probe one target.
   * @param request - target identity.
   * @returns live status.
   */
  healthCheck(request: RemoteWorkspaceHealthRequest): Promise<RemoteWorkspaceResult<TargetHealth>>
  /**
   * List one directory level on a target.
   * @param request - target and optional path.
   * @returns the listing.
   */
  listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteWorkspaceResult<RemoteDirectoryListing>>
  /**
   * Build the canonical workspace URI for a native path on a target.
   * @param request - target and native path.
   * @returns the canonical URI and its default title.
   */
  resolveUri(request: RemoteWorkspaceResolveUriRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceResolveUriValue>>
  /**
   * Create one child directory on a target.
   * @param request - target, parent, and name.
   * @returns the created path.
   */
  createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<RemoteWorkspaceResult<{ readonly path: string }>>
  /**
   * Bind a Session to a remote workspace.
   * @param request - workspace and Session identities.
   * @returns the empty success envelope.
   */
  bindSession(request: RemoteWorkspaceBindRequest): Promise<RemoteWorkspaceResult<null>>
}

/** `fetch` implementation of the remote-workspace API. */
export class RemoteWorkspaceApi implements IRemoteWorkspaceApi {
  /** @param base - route prefix, overridden only by tests. */
  constructor(private readonly base: string = REMOTE_WORKSPACE_API_PREFIX) {}

  listTargets(): Promise<RemoteWorkspaceResult<RemoteWorkspaceTargetsValue>> {
    return this.call('listTargets', {})
  }

  listWorkspaces(): Promise<RemoteWorkspaceResult<RemoteWorkspaceListValue>> {
    return this.call('listWorkspaces', {})
  }

  createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceCreateValue>> {
    return this.call('createWorkspace', request)
  }

  removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>> {
    return this.call('removeWorkspace', request)
  }

  connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>> {
    return this.call('connectWorkspace', request)
  }

  disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>> {
    return this.call('disconnectWorkspace', request)
  }

  healthCheck(request: RemoteWorkspaceHealthRequest): Promise<RemoteWorkspaceResult<TargetHealth>> {
    return this.call('healthCheck', request)
  }

  listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteWorkspaceResult<RemoteDirectoryListing>> {
    return this.call('listDirectory', request)
  }

  resolveUri(request: RemoteWorkspaceResolveUriRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceResolveUriValue>> {
    return this.call('resolveUri', request)
  }

  createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<RemoteWorkspaceResult<{ readonly path: string }>> {
    return this.call('createDirectory', request)
  }

  bindSession(request: RemoteWorkspaceBindRequest): Promise<RemoteWorkspaceResult<null>> {
    return this.call('bindSession', request)
  }

  private async call<T>(verb: RemoteWorkspaceVerb, payload: unknown): Promise<RemoteWorkspaceResult<T>> {
    let response: Response
    try {
      response = await fetch(`${this.base}/${verb}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (error: unknown) {
      return { ok: false, error: { code: 'network', message: messageOf(error) } }
    }
    const envelope = await readEnvelope<T>(response)
    if (envelope === undefined) {
      return { ok: false, error: { code: 'http', message: `HTTP ${response.status}` } }
    }
    return envelope
  }
}

/** Parse one response envelope; undefined when the body is not one. */
async function readEnvelope<T>(response: Response): Promise<RemoteWorkspaceApiEnvelope<T> | undefined> {
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const envelope = parsed as { ok?: unknown; value?: unknown; error?: unknown }
  if (envelope.ok === true && 'value' in envelope) {
    return { ok: true, value: envelope.value as T }
  }
  const error = envelope.error
  if (typeof error === 'object' && error !== null) {
    const failure = error as { code?: unknown; message?: unknown }
    if (typeof failure.code === 'string' && typeof failure.message === 'string') {
      return { ok: false, error: { code: failure.code, message: failure.message } }
    }
  }
  return undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
