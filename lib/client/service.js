/**
 * Client service face of the remote-workspace catalog: the bare snapshot
 * source plus every command the browser surfaces drive.
 * @module @Yujyf/dsh-remote-workspace/client/service
 */
import { Service } from '@deepseek-ai/cordis';
/** Registers the Client remote-workspace catalog as `ctx.remoteWorkspaces`. */
export class RemoteWorkspacesController extends Service {
    model;
    list;
    /**
     * @param ctx - Client root Context.
     * @param model - Remote-backed catalog state and commands.
     */
    constructor(ctx, model) {
        super(ctx, 'remoteWorkspaces');
        this.model = model;
        this.list = model;
    }
    refresh() {
        return this.model.refresh();
    }
    createWorkspace(uri, title) {
        return this.model.createWorkspace(uri, title);
    }
    connectWorkspace(workspaceId) {
        return this.model.connectWorkspace(workspaceId);
    }
    disconnectWorkspace(workspaceId) {
        return this.model.disconnectWorkspace(workspaceId);
    }
    removeWorkspace(workspaceId) {
        return this.model.removeWorkspace(workspaceId);
    }
    bindSession(sessionId, workspaceId) {
        return this.model.bindSession(sessionId, workspaceId);
    }
    /**
     * Release one session's binding so its tools run on the host again.
     * @param sessionId - session to unbind.
     * @returns resolution after durability.
     */
    unbindSession(sessionId) {
        return this.model.unbindSession(sessionId);
    }
    listDirectory(targetId, path) {
        return this.model.listDirectory(targetId, path);
    }
    /**
     * Create one child directory on a target.
     * @param targetId - target to mutate.
     * @param parent - existing parent directory.
     * @param name - single path segment.
     * @returns the created directory path.
     */
    createDirectory(targetId, parent, name) {
        return this.model.createDirectory(targetId, parent, name);
    }
    /**
     * Build the canonical workspace URI for a native path on a target.
     * @param targetId - target the path lives in.
     * @param path - absolute path in that target's native spelling.
     * @returns the canonical URI and its default display title.
     */
    resolveUri(targetId, path) {
        return this.model.resolveUri(targetId, path);
    }
    healthCheck(targetId) {
        return this.model.healthCheck(targetId);
    }
}
//# sourceMappingURL=service.js.map