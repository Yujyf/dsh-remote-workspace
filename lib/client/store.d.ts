/**
 * The remote-workspace selector's interaction store: whether the panel is
 * open, which target is being browsed, and the folder level on screen. The
 * catalog rows themselves stay in the Client object layer; this store carries
 * only viewing state that must survive a remount.
 * @module @Yujyf/dsh-remote-workspace/store
 */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-store';
import type { WorkspaceTargetId } from '../wire-types.ts';
/** Which of the panel's two views is on screen. */
export type RemoteWorkspaceView = 'targets' | 'browse';
/** Selector viewing state. */
type RemoteWorkspaceViewState = {
    open: boolean;
    view: RemoteWorkspaceView;
    /** Target being browsed while `view` is `browse`. */
    browseTargetId: WorkspaceTargetId | null;
    /** Directory level on screen while browsing; empty means the target root. */
    browsePath: string;
    /** Target ids whose workspace rows are expanded. */
    expandedTargets: Record<string, boolean>;
    /** Execution world the workspace list is filtered to; null shows every world. */
    worldFilter: string | null;
};
/** Annotation twin of the actions literal below. */
type RemoteWorkspaceActions = {
    openPanel: (draft: RemoteWorkspaceViewState) => void;
    closePanel: (draft: RemoteWorkspaceViewState) => void;
    startBrowse: (draft: RemoteWorkspaceViewState, targetId: WorkspaceTargetId, path: string) => void;
    setBrowsePath: (draft: RemoteWorkspaceViewState, path: string) => void;
    backToTargets: (draft: RemoteWorkspaceViewState) => void;
    setTargetExpanded: (draft: RemoteWorkspaceViewState, targetId: string, expanded: boolean) => void;
    setWorldFilter: (draft: RemoteWorkspaceViewState, world: string | null) => void;
};
/**
 * Create the selector's interaction store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export declare function createRemoteWorkspaceStore(): EngineStoreHandle<RemoteWorkspaceViewState, RemoteWorkspaceActions>;
export {};
//# sourceMappingURL=store.d.ts.map