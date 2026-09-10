/**
 * Browser transport for the remote-workspace HTTP API: one `fetch` POST per
 * verb under {@link REMOTE_WORKSPACE_API_PREFIX}, returning the Host envelope
 * unchanged so the model owns unwrapping.
 * @module @Yujyf/dsh-remote-workspace/client/api
 */
import { type RemoteWorkspaceApiFailure } from '../api-wire.ts';
import type { LocalWorkspaceListValue, RemoteWorkspaceBindRequest, RemoteWorkspaceCreateDirectoryRequest, RemoteWorkspaceCreateRequest, RemoteWorkspaceCreateValue, RemoteWorkspaceHealthRequest, RemoteWorkspaceIdRequest, RemoteWorkspaceListDirectoryRequest, RemoteWorkspaceListValue, RemoteWorkspaceResolveUriRequest, RemoteWorkspaceResolveUriValue, RemoteWorkspaceTargetsValue, RemoteWorkspaceUnbindRequest } from '../wire-types.ts';
import type { RemoteDirectoryListing, TargetHealth } from '../wire-types.ts';
/** Host envelope as the model consumes it. */
export type RemoteWorkspaceResult<T> = {
    readonly ok: true;
    readonly value: T;
} | {
    readonly ok: false;
    readonly error: RemoteWorkspaceApiFailure;
};
/** Transport face the Client model depends on. */
export interface IRemoteWorkspaceApi {
    /**
     * List discovered execution targets.
     * @returns the live target catalog.
     */
    listTargets(): Promise<RemoteWorkspaceResult<RemoteWorkspaceTargetsValue>>;
    /**
     * List durable remote workspaces.
     * @returns registered workspaces in display order.
     */
    listWorkspaces(): Promise<RemoteWorkspaceResult<RemoteWorkspaceListValue>>;
    /**
     * Create or reuse a remote workspace.
     * @param request - URI and optional title.
     * @returns the workspace record.
     */
    createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceCreateValue>>;
    /**
     * Remove a remote workspace registration.
     * @param request - workspace identity.
     * @returns the empty success envelope.
     */
    removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>;
    /**
     * Connect a workspace.
     * @param request - workspace identity.
     * @returns the empty success envelope.
     */
    connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>;
    /**
     * Disconnect a workspace.
     * @param request - workspace identity.
     * @returns the empty success envelope.
     */
    disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>;
    /**
     * Probe one target.
     * @param request - target identity.
     * @returns live status.
     */
    healthCheck(request: RemoteWorkspaceHealthRequest): Promise<RemoteWorkspaceResult<TargetHealth>>;
    /**
     * List one directory level on a target.
     * @param request - target and optional path.
     * @returns the listing.
     */
    listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteWorkspaceResult<RemoteDirectoryListing>>;
    /**
     * Build the canonical workspace URI for a native path on a target.
     * @param request - target and native path.
     * @returns the canonical URI and its default title.
     */
    resolveUri(request: RemoteWorkspaceResolveUriRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceResolveUriValue>>;
    /**
     * Create one child directory on a target.
     * @param request - target, parent, and name.
     * @returns the created path.
     */
    createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<RemoteWorkspaceResult<{
        readonly path: string;
    }>>;
    /**
     * Bind a Session to a remote workspace.
     * @param request - workspace and Session identities.
     * @returns the empty success envelope.
     */
    bindSession(request: RemoteWorkspaceBindRequest): Promise<RemoteWorkspaceResult<null>>;
    /**
     * Release one session's binding so its tools run on the host again.
     * @param request - Session identity.
     * @returns the empty success envelope.
     */
    unbindSession(request: RemoteWorkspaceUnbindRequest): Promise<RemoteWorkspaceResult<null>>;
    /**
     * List DSH's own workspaces, shown beside the remote ones.
     * @returns the built-in workspace rows.
     */
    listLocalWorkspaces(): Promise<RemoteWorkspaceResult<LocalWorkspaceListValue>>;
}
/** `fetch` implementation of the remote-workspace API. */
export declare class RemoteWorkspaceApi implements IRemoteWorkspaceApi {
    private readonly base;
    /** @param base - route prefix, overridden only by tests. */
    constructor(base?: string);
    listTargets(): Promise<RemoteWorkspaceResult<RemoteWorkspaceTargetsValue>>;
    listWorkspaces(): Promise<RemoteWorkspaceResult<RemoteWorkspaceListValue>>;
    createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceCreateValue>>;
    removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>;
    connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>;
    disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<RemoteWorkspaceResult<null>>;
    healthCheck(request: RemoteWorkspaceHealthRequest): Promise<RemoteWorkspaceResult<TargetHealth>>;
    listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteWorkspaceResult<RemoteDirectoryListing>>;
    resolveUri(request: RemoteWorkspaceResolveUriRequest): Promise<RemoteWorkspaceResult<RemoteWorkspaceResolveUriValue>>;
    createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<RemoteWorkspaceResult<{
        readonly path: string;
    }>>;
    bindSession(request: RemoteWorkspaceBindRequest): Promise<RemoteWorkspaceResult<null>>;
    unbindSession(request: RemoteWorkspaceUnbindRequest): Promise<RemoteWorkspaceResult<null>>;
    listLocalWorkspaces(): Promise<RemoteWorkspaceResult<LocalWorkspaceListValue>>;
    private call;
}
//# sourceMappingURL=api.d.ts.map