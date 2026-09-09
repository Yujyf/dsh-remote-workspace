/**
 * Host remote-workspace Remote owner: target discovery, workspace CRUD, path
 * browsing, and session binding.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { RemoteDirectoryListing, TargetHealth } from './wire-types.ts';
import type { RemoteWorkspaceBindRequest, RemoteWorkspaceCreateDirectoryRequest, RemoteWorkspaceCreateRequest, RemoteWorkspaceCreateValue, RemoteWorkspaceHealthRequest, RemoteWorkspaceIdRequest, RemoteWorkspaceListDirectoryRequest, RemoteWorkspaceListValue, RemoteWorkspaceResolveUriRequest, RemoteWorkspaceResolveUriValue, RemoteWorkspaceTargetsValue } from './wire-types.ts';
export type * from './wire-types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host remote-workspace business API and Remote namespace owner. */
        remoteWorkspaceController: RemoteWorkspaceController;
    }
}
/** Host service backing the generated `ctx.remote.remoteWorkspace` namespace. */
export declare class RemoteWorkspaceController extends TypertRemoteService {
    static inject: string[];
    /** @param ctx - Host context containing the remote-workspace owner. */
    constructor(ctx: Context);
    /**
     * List discovered execution targets.
     * @returns the live target catalog.
     */
    listTargets(): Promise<RemoteWorkspaceTargetsValue>;
    /**
     * List durable remote workspaces.
     * @returns registered workspaces in display order.
     */
    listWorkspaces(): RemoteWorkspaceListValue;
    /**
     * Create or reuse a remote workspace for a canonical URI.
     * @param request - URI and optional title.
     * @returns the workspace record.
     */
    createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceCreateValue>;
    /**
     * Remove a remote workspace registration.
     * @param request - Workspace identity.
     * @returns resolution after deletion.
     */
    removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<void>;
    /**
     * Connect a workspace, starting a stopped WSL distribution when configured.
     * @param request - Workspace identity.
     * @returns resolution after the helper is ready.
     */
    connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<void>;
    /**
     * Disconnect a workspace without shutting down its target by default.
     * @param request - Workspace identity.
     * @returns resolution after helpers stop.
     */
    disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<void>;
    /**
     * Probe one target.
     * @param request - Target identity.
     * @returns live status.
     */
    healthCheck(request: RemoteWorkspaceHealthRequest): Promise<TargetHealth>;
    /**
     * List one directory on a target.
     * @param request - Target and optional path.
     * @returns the listing.
     */
    listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteDirectoryListing>;
    /**
     * Build the canonical workspace URI for a native path on a target. Picking
     * surfaces call this instead of assembling a URI scheme themselves.
     * @param request - Target and native path.
     * @returns the canonical URI and its default title.
     */
    resolveUri(request: RemoteWorkspaceResolveUriRequest): RemoteWorkspaceResolveUriValue;
    /**
     * Create a child directory on a target.
     * @param request - Target, parent, and name.
     * @returns the created path as a listing of that directory.
     */
    createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<{
        readonly path: string;
    }>;
    /**
     * Bind a Session to a remote workspace so later tool calls route there.
     * @param request - Workspace and Session identities.
     * @returns resolution after durability.
     */
    bindSession(request: RemoteWorkspaceBindRequest): Promise<void>;
}
export default RemoteWorkspaceController;
//# sourceMappingURL=controller.d.ts.map