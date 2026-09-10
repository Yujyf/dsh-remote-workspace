import { RemoteWorkspaceApi } from "./api.js";
import { ClientRemoteWorkspaceModel } from "./model.js";
import { RemoteWorkspacesController } from "./service.js";
import { RemoteWorkspaceEntry } from "./RemoteWorkspaceEntry.js";
import { createRemoteWorkspaceStore } from "./store.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'remote-workspace';
/** Required services: the slot registry, locale, and the Session object layer. */
export const inject = ['slots', 'locale', 'sessions'];
/**
 * Register the dictionaries and the sidebar entry. The target slot is declared
 * by ui-sidebar's apply, whose activation order relative to this one is not
 * constrained, so the registration waits on the declaration through
 * `slots.inject()` instead of assuming order.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const model = new ClientRemoteWorkspaceModel(new RemoteWorkspaceApi());
    const catalog = new RemoteWorkspacesController(ctx, model);
    void model.refresh();
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'remote-workspace: dictionaries');
    const catalogSource = {
        getSnapshot: () => catalog.list.getSnapshot(),
        subscribe: listener => catalog.list.subscribe(listener),
    };
    const injected = () => ({
        hooks: { remoteWorkspaces: catalogSource },
        refresh: () => catalog.refresh(),
        browse: async (targetId, path) => {
            const listing = path === undefined
                ? await catalog.listDirectory(targetId)
                : await catalog.listDirectory(targetId, path);
            return {
                path: listing.path,
                entries: listing.entries.map(entry => ({ name: entry.name, type: entry.type })),
            };
        },
        createFolder: (targetId, parent, name) => catalog.createDirectory(targetId, parent, name),
        addWorkspace: async ({ targetId, path }) => {
            const resolved = await catalog.resolveUri(targetId, path);
            const workspace = await catalog.createWorkspace(resolved.uri, resolved.title);
            return workspace.id;
        },
        activateWorkspace: async (workspaceId) => {
            await catalog.connectWorkspace(workspaceId);
            const sessionId = ctx.sessions.list.getSnapshot().current;
            if (sessionId === undefined) {
                throw new Error('open a session before binding a remote workspace');
            }
            await catalog.bindSession(sessionId, workspaceId);
        },
        unbindSession: async () => {
            const sessionId = ctx.sessions.list.getSnapshot().current;
            if (sessionId === undefined) {
                throw new Error('open a session before releasing a remote workspace');
            }
            await catalog.unbindSession(sessionId);
        },
        removeWorkspace: workspaceId => catalog.removeWorkspace(workspaceId),
        currentSessionId: () => ctx.sessions.list.getSnapshot().current,
    });
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        id: 'remote-workspace.selector',
        name: 'sidebar.footer.action',
        store: createRemoteWorkspaceStore(),
        inject: injected,
        locale: NS,
    }, RemoteWorkspaceEntry));
}
//# sourceMappingURL=index.js.map