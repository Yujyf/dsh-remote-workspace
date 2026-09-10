/**
 * Client service face of the remote-workspace catalog: the bare snapshot
 * source plus every command the browser surfaces drive.
 * @module @Yujyf/dsh-remote-workspace/client/service
 */
import { Service, type Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RemoteDirectoryListing, RemoteWorkspace, RemoteWorkspaceId, TargetHealth, WorkspaceTargetId } from '../wire-types.ts';
import type { ClientRemoteWorkspaceModel, RemoteWorkspaceSource } from './model.ts';
/** Client remote-workspace catalog and commands. */
export interface IRemoteWorkspaces {
    /** Host-authoritative target and workspace rows. */
    readonly list: RemoteWorkspaceSource;
    /**
     * Reload the catalog.
     * @returns resolution after the snapshot is published.
     */
    refresh(): Promise<void>;
    /**
     * Create or reuse a workspace for a canonical URI.
     * @param uri - workspace URI.
     * @param title - display title used only when creating.
     * @returns the existing or newly durable workspace.
     */
    createWorkspace(uri: string, title?: string): Promise<RemoteWorkspace>;
    /**
     * Connect a workspace.
     * @param workspaceId - workspace to connect.
     */
    connectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Disconnect a workspace.
     * @param workspaceId - workspace to disconnect.
     */
    disconnectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Delete one workspace registration.
     * @param workspaceId - workspace to remove.
     */
    removeWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Bind a Session to a remote workspace.
     * @param sessionId - session to bind.
     * @param workspaceId - target workspace.
     */
    bindSession(sessionId: SessionId, workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Release one session's binding so its tools run on the host again.
     * @param sessionId - session to unbind.
     */
    unbindSession(sessionId: SessionId): Promise<void>;
    /**
     * List one directory level on a target.
     * @param targetId - target to browse.
     * @param path - directory path; omitted lists the target's default root.
     * @returns the listing.
     */
    listDirectory(targetId: WorkspaceTargetId, path?: string): Promise<RemoteDirectoryListing>;
    /**
     * Create one child directory on a target.
     * @param targetId - target to mutate.
     * @param parent - existing parent directory.
     * @param name - single path segment.
     * @returns the created directory path.
     */
    createDirectory(targetId: WorkspaceTargetId, parent: string, name: string): Promise<string>;
    /**
     * Build the canonical workspace URI for a native path on a target.
     * @param targetId - target the path lives in.
     * @param path - absolute path in that target's native spelling.
     * @returns the canonical URI and its default display title.
     */
    resolveUri(targetId: WorkspaceTargetId, path: string): Promise<{
        uri: string;
        title: string;
    }>;
    /**
     * Probe one target's reachability.
     * @param targetId - target to probe.
     * @returns live status and optional detail.
     */
    healthCheck(targetId: WorkspaceTargetId): Promise<TargetHealth>;
}
/** Registers the Client remote-workspace catalog as `ctx.remoteWorkspaces`. */
export declare class RemoteWorkspacesController extends Service implements IRemoteWorkspaces {
    private readonly model;
    readonly list: RemoteWorkspaceSource;
    /**
     * @param ctx - Client root Context.
     * @param model - Remote-backed catalog state and commands.
     */
    constructor(ctx: Context, model: ClientRemoteWorkspaceModel);
    refresh(): Promise<void>;
    createWorkspace(uri: string, title?: string): Promise<RemoteWorkspace>;
    connectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    disconnectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    removeWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    bindSession(sessionId: SessionId, workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Release one session's binding so its tools run on the host again.
     * @param sessionId - session to unbind.
     * @returns resolution after durability.
     */
    unbindSession(sessionId: SessionId): Promise<void>;
    listDirectory(targetId: WorkspaceTargetId, path?: string): Promise<RemoteDirectoryListing>;
    /**
     * Create one child directory on a target.
     * @param targetId - target to mutate.
     * @param parent - existing parent directory.
     * @param name - single path segment.
     * @returns the created directory path.
     */
    createDirectory(targetId: WorkspaceTargetId, parent: string, name: string): Promise<string>;
    /**
     * Build the canonical workspace URI for a native path on a target.
     * @param targetId - target the path lives in.
     * @param path - absolute path in that target's native spelling.
     * @returns the canonical URI and its default display title.
     */
    resolveUri(targetId: WorkspaceTargetId, path: string): Promise<{
        uri: string;
        title: string;
    }>;
    healthCheck(targetId: WorkspaceTargetId): Promise<TargetHealth>;
}
//# sourceMappingURL=service.d.ts.map