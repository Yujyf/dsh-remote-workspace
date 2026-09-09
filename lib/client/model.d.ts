/**
 * React-free Client remote-workspace state: the discovered target catalog, the
 * durable workspace rows, and the commands that mutate them. Remote calls
 * answer `RemoteResult`, so this model owns unwrapping: a failure throws
 * {@link RemoteWorkspaceCommandError} carrying the Host business code, while a
 * snapshot load records the failure in state instead of rejecting.
 * @module @Yujyf/dsh-remote-workspace/client/model
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RemoteFailure } from '@deepseek-ai/dsh-typert-protocol';
import type { RemoteWorkspaceNamespace } from './namespace.ts';
import type { RemoteDirectoryListing, RemoteWorkspace, RemoteWorkspaceId, TargetHealth, WorkspaceTarget, WorkspaceTargetId } from '../wire-types.ts';
/** Lifecycle of the cached catalog. */
export type RemoteWorkspacePhase = 'idle' | 'loading' | 'ready' | 'error';
/** Identity-stable Client view of the remote-workspace catalog. */
export interface RemoteWorkspaceSnapshot {
    readonly phase: RemoteWorkspacePhase;
    /** Discovered targets, Local first then one entry per WSL distribution. */
    readonly targets: readonly WorkspaceTarget[];
    /** Durable workspace registrations in registry order. */
    readonly workspaces: readonly RemoteWorkspace[];
    /** Host failure text from the last load, or null. */
    readonly error: string | null;
}
/** Bare observable source over {@link RemoteWorkspaceSnapshot}. */
export interface RemoteWorkspaceSource {
    /**
     * Read the identity-stable current snapshot.
     * @returns the cached snapshot.
     */
    getSnapshot(): RemoteWorkspaceSnapshot;
    /**
     * Subscribe to snapshot changes.
     * @param listener - invalidation callback.
     * @returns unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
}
/** One failed remote-workspace command, with the Host business code preserved. */
export declare class RemoteWorkspaceCommandError extends Error {
    readonly operation: string;
    readonly rpcError: RemoteFailure;
    readonly name = "RemoteWorkspaceCommandError";
    /**
     * @param operation - the verb that failed.
     * @param rpcError - Host business or folded carrier failure.
     */
    constructor(operation: string, rpcError: RemoteFailure);
}
/**
 * Owns the Client-side catalog cache and every catalog command. Loads coalesce:
 * concurrent callers share one in-flight refresh, and a command invalidates the
 * cache so the next read reloads.
 */
export declare class ClientRemoteWorkspaceModel implements RemoteWorkspaceSource {
    private readonly remote;
    private readonly listeners;
    private snapshot;
    private cache;
    private inflight;
    /** @param remote - the generated remote-workspace Remote namespace. */
    constructor(remote: RemoteWorkspaceNamespace);
    /**
     * Read the current snapshot.
     * @returns the identity-stable snapshot.
     */
    getSnapshot(): RemoteWorkspaceSnapshot;
    /**
     * Subscribe to snapshot invalidation.
     * @param listener - invalidation callback.
     * @returns unsubscribe function.
     */
    subscribe(listener: () => void): () => void;
    /**
     * Reload targets and workspaces, coalescing concurrent callers.
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
     * Connect a workspace, starting a stopped distribution when configured.
     * @param workspaceId - workspace to connect.
     * @returns resolution after the helper is ready.
     */
    connectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Release the helpers a workspace holds.
     * @param workspaceId - workspace to disconnect.
     * @returns resolution after helpers stop.
     */
    disconnectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Delete one workspace registration. Sessions and files are retained.
     * @param workspaceId - workspace to remove.
     * @returns resolution after deletion.
     */
    removeWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Bind a Session to a remote workspace so its later tool calls route there.
     * @param sessionId - session to bind.
     * @param workspaceId - target workspace.
     * @returns resolution after durability.
     */
    bindSession(sessionId: SessionId, workspaceId: RemoteWorkspaceId): Promise<void>;
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
    private load;
    private publish;
}
//# sourceMappingURL=model.d.ts.map