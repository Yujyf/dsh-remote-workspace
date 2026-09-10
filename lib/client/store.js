/**
 * The remote-workspace selector's interaction store: whether the panel is
 * open, which target is being browsed, and the folder level on screen. The
 * catalog rows themselves stay in the Client object layer; this store carries
 * only viewing state that must survive a remount.
 * @module @Yujyf/dsh-remote-workspace/store
 */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/**
 * Create the selector's interaction store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createRemoteWorkspaceStore() {
    return defineStore({
        init: () => ({
            open: false,
            view: 'targets',
            browseTargetId: null,
            browsePath: '',
            expandedTargets: {},
            worldFilter: null,
        }),
        // Panel visibility is per-browser-session, not durable: a reload starts
        // with the panel closed. The store stays in-memory on purpose.
        actions: {
            openPanel: (d) => { d.open = true; },
            closePanel: (d) => {
                d.open = false;
                d.view = 'targets';
                d.browseTargetId = null;
                d.browsePath = '';
            },
            startBrowse: (d, targetId, path) => {
                d.view = 'browse';
                d.browseTargetId = targetId;
                d.browsePath = path;
            },
            setBrowsePath: (d, path) => { d.browsePath = path; },
            backToTargets: (d) => {
                d.view = 'targets';
                d.browseTargetId = null;
                d.browsePath = '';
            },
            setTargetExpanded: (d, targetId, expanded) => {
                d.expandedTargets[targetId] = expanded;
            },
            setWorldFilter: (d, world) => { d.worldFilter = world; },
        },
    });
}
//# sourceMappingURL=store.js.map