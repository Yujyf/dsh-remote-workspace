/**
 * Host remote-workspace API route: target discovery, workspace CRUD, path
 * browsing, and session binding, served as JSON over `ctx.webServer`.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Context, Service } from '@deepseek-ai/cordis';
import type { RemoteDirectoryListing, TargetHealth } from './wire-types.ts';
import type { RemoteWorkspaceBindRequest, RemoteWorkspaceCreateDirectoryRequest, RemoteWorkspaceCreateRequest, RemoteWorkspaceCreateValue, RemoteWorkspaceHealthRequest, RemoteWorkspaceIdRequest, RemoteWorkspaceListDirectoryRequest, RemoteWorkspaceListValue, RemoteWorkspaceResolveUriRequest, RemoteWorkspaceResolveUriValue, RemoteWorkspaceTargetsValue } from './wire-types.ts';
export type * from './wire-types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host remote-workspace business API behind the HTTP route. */
        remoteWorkspaceController: RemoteWorkspaceController;
    }
}
/** Host service serving the remote-workspace JSON route. */
export declare class RemoteWorkspaceController extends Service {
    static inject: string[];
    /** @param ctx - Host context containing the remote-workspace owner. */
    constructor(ctx: Context);
    /**
     * Register the route. The registration is an effect: disposing the fiber
     * removes the route.
     */
    [Service.init](): void;
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
     * @returns the created path.
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
    /** Verb table: one entry per browser-callable method. */
    private verbs;
    private handle;
    /**
     * Whether the request may reach this route: the Host authority is the local
     * loopback one, or an authority this deployment declares trusted. Mirrors the
     * browser-trust fence the gateway applies to `/api`.
     */
    private trusted;
    private respond;
}
export default RemoteWorkspaceController;
//# sourceMappingURL=controller.d.ts.map