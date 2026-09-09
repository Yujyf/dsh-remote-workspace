/**
 * React-free Client remote-workspace state: the discovered target catalog, the
 * durable workspace rows, and the commands that mutate them. API calls answer
 * an envelope, so this model owns unwrapping: a failure throws
 * {@link RemoteWorkspaceCommandError} carrying the Host business code, while a
 * snapshot load records the failure in state instead of rejecting.
 * @module @Yujyf/dsh-remote-workspace/client/model
 */
/** One failed remote-workspace command, with the Host business code preserved. */
export class RemoteWorkspaceCommandError extends Error {
    operation;
    rpcError;
    name = 'RemoteWorkspaceCommandError';
    /**
     * @param operation - the verb that failed.
     * @param rpcError - Host business or transport failure.
     */
    constructor(operation, rpcError) {
        super(`remote workspace ${operation} failed: ${rpcError.code}: ${rpcError.message}`);
        this.operation = operation;
        this.rpcError = rpcError;
    }
}
const EMPTY = { phase: 'idle', targets: [], workspaces: [], error: null };
/**
 * Owns the Client-side catalog cache and every catalog command. Loads coalesce:
 * concurrent callers share one in-flight refresh, and a command invalidates the
 * cache so the next read reloads.
 */
export class ClientRemoteWorkspaceModel {
    remote;
    listeners = new Set();
    snapshot = EMPTY;
    cache = EMPTY;
    inflight;
    /** @param remote - the remote-workspace HTTP API client. */
    constructor(remote) {
        this.remote = remote;
    }
    /**
     * Read the current snapshot.
     * @returns the identity-stable snapshot.
     */
    getSnapshot() {
        return this.cache;
    }
    /**
     * Subscribe to snapshot invalidation.
     * @param listener - invalidation callback.
     * @returns unsubscribe function.
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }
    /**
     * Reload targets and workspaces, coalescing concurrent callers.
     * @returns resolution after the snapshot is published.
     */
    refresh() {
        this.inflight ??= this.load().finally(() => { this.inflight = undefined; });
        return this.inflight;
    }
    /**
     * Create or reuse a workspace for a canonical URI.
     * @param uri - workspace URI.
     * @param title - display title used only when creating.
     * @returns the existing or newly durable workspace.
     */
    async createWorkspace(uri, title) {
        const result = await this.remote.createWorkspace(title === undefined ? { uri } : { uri, title });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('createWorkspace', result.error);
        await this.refresh();
        return result.value.workspace;
    }
    /**
     * Connect a workspace, starting a stopped distribution when configured.
     * @param workspaceId - workspace to connect.
     * @returns resolution after the helper is ready.
     */
    async connectWorkspace(workspaceId) {
        const result = await this.remote.connectWorkspace({ workspaceId });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('connectWorkspace', result.error);
    }
    /**
     * Release the helpers a workspace holds.
     * @param workspaceId - workspace to disconnect.
     * @returns resolution after helpers stop.
     */
    async disconnectWorkspace(workspaceId) {
        const result = await this.remote.disconnectWorkspace({ workspaceId });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('disconnectWorkspace', result.error);
    }
    /**
     * Delete one workspace registration. Sessions and files are retained.
     * @param workspaceId - workspace to remove.
     * @returns resolution after deletion.
     */
    async removeWorkspace(workspaceId) {
        const result = await this.remote.removeWorkspace({ workspaceId });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('removeWorkspace', result.error);
        await this.refresh();
    }
    /**
     * Bind a Session to a remote workspace so its later tool calls route there.
     * @param sessionId - session to bind.
     * @param workspaceId - target workspace.
     * @returns resolution after durability.
     */
    async bindSession(sessionId, workspaceId) {
        const result = await this.remote.bindSession({ sessionId, workspaceId });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('bindSession', result.error);
        await this.refresh();
    }
    /**
     * List one directory level on a target.
     * @param targetId - target to browse.
     * @param path - directory path; omitted lists the target's default root.
     * @returns the listing.
     */
    async listDirectory(targetId, path) {
        const result = await this.remote.listDirectory(path === undefined ? { targetId } : { targetId, path });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('listDirectory', result.error);
        return result.value;
    }
    /**
     * Create one child directory on a target.
     * @param targetId - target to mutate.
     * @param parent - existing parent directory.
     * @param name - single path segment.
     * @returns the created directory path.
     */
    async createDirectory(targetId, parent, name) {
        const result = await this.remote.createDirectory({ targetId, parent, name });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('createDirectory', result.error);
        return result.value.path;
    }
    /**
     * Build the canonical workspace URI for a native path on a target.
     * @param targetId - target the path lives in.
     * @param path - absolute path in that target's native spelling.
     * @returns the canonical URI and its default display title.
     */
    async resolveUri(targetId, path) {
        const result = await this.remote.resolveUri({ targetId, path });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('resolveUri', result.error);
        return result.value;
    }
    /**
     * Probe one target's reachability.
     * @param targetId - target to probe.
     * @returns live status and optional detail.
     */
    async healthCheck(targetId) {
        const result = await this.remote.healthCheck({ targetId });
        if (!result.ok)
            throw new RemoteWorkspaceCommandError('healthCheck', result.error);
        return result.value;
    }
    async load() {
        this.publish({ ...this.snapshot, phase: 'loading', error: null });
        const [targets, workspaces] = await Promise.all([
            this.remote.listTargets(),
            this.remote.listWorkspaces(),
        ]);
        if (!targets.ok) {
            this.publish({ ...this.snapshot, phase: 'error', error: failureText(targets.error) });
            return;
        }
        if (!workspaces.ok) {
            this.publish({ ...this.snapshot, phase: 'error', error: failureText(workspaces.error) });
            return;
        }
        this.publish({
            phase: 'ready',
            targets: targets.value.targets,
            workspaces: workspaces.value.workspaces,
            error: null,
        });
    }
    publish(next) {
        this.snapshot = next;
        this.cache = next;
        for (const listener of [...this.listeners])
            listener();
    }
}
function failureText(failure) {
    return failure.message;
}
//# sourceMappingURL=model.js.map