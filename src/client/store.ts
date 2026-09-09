/**
 * The remote-workspace selector's interaction store: whether the panel is
 * open, which target is being browsed, and the folder level on screen. The
 * catalog rows themselves stay in the Client object layer; this store carries
 * only viewing state that must survive a remount.
 * @module @Yujyf/dsh-remote-workspace/store
 */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { WorkspaceTargetId } from '../wire-types.ts'

/** Which of the panel's two views is on screen. */
export type RemoteWorkspaceView = 'targets' | 'browse'

/** Selector viewing state. */
type RemoteWorkspaceViewState = {
  open: boolean
  view: RemoteWorkspaceView
  /** Target being browsed while `view` is `browse`. */
  browseTargetId: WorkspaceTargetId | null
  /** Directory level on screen while browsing; empty means the target root. */
  browsePath: string
  /** Target ids whose workspace rows are expanded. */
  expandedTargets: Record<string, boolean>
}

/** Annotation twin of the actions literal below. */
type RemoteWorkspaceActions = {
  openPanel: (draft: RemoteWorkspaceViewState) => void
  closePanel: (draft: RemoteWorkspaceViewState) => void
  startBrowse: (draft: RemoteWorkspaceViewState, targetId: WorkspaceTargetId, path: string) => void
  setBrowsePath: (draft: RemoteWorkspaceViewState, path: string) => void
  backToTargets: (draft: RemoteWorkspaceViewState) => void
  setTargetExpanded: (draft: RemoteWorkspaceViewState, targetId: string, expanded: boolean) => void
}

/**
 * Create the selector's interaction store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createRemoteWorkspaceStore(): EngineStoreHandle<RemoteWorkspaceViewState, RemoteWorkspaceActions> {
  return defineStore({
    init: (): RemoteWorkspaceViewState => ({
      open: false,
      view: 'targets',
      browseTargetId: null,
      browsePath: '',
      expandedTargets: {},
    }),
    // Panel visibility is per-browser-session, not durable: a reload starts
    // with the panel closed. The store stays in-memory on purpose.
    actions: {
      openPanel: (d) => { d.open = true },
      closePanel: (d) => {
        d.open = false
        d.view = 'targets'
        d.browseTargetId = null
        d.browsePath = ''
      },
      startBrowse: (d, targetId: WorkspaceTargetId, path: string) => {
        d.view = 'browse'
        d.browseTargetId = targetId
        d.browsePath = path
      },
      setBrowsePath: (d, path: string) => { d.browsePath = path },
      backToTargets: (d) => {
        d.view = 'targets'
        d.browseTargetId = null
        d.browsePath = ''
      },
      setTargetExpanded: (d, targetId: string, expanded: boolean) => {
        d.expandedTargets[targetId] = expanded
      },
    },
  })
}
