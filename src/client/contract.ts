/**
 * Registrant-side contract of the remote-workspace selector: the injected face
 * (plain callbacks and data bound in `apply`'s closure) plus the component
 * props composition. Business rows arrive through the `remoteWorkspaces`
 * compartment hook; nothing here reaches ctx.
 * @module @Yujyf/dsh-remote-workspace/contract
 */

import type { HostObservable, PropsHooks, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteWorkspaceSnapshot } from './model.ts'
import type { RemoteWorkspaceId, WorkspaceTargetId } from '../wire-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { createRemoteWorkspaceStore } from './store.ts'

/** One directory level as the browser renders it. */
export interface RemoteDirectoryView {
  /** Absolute directory path inside the target. */
  readonly path: string
  /** Direct children in host order. */
  readonly entries: readonly { readonly name: string; readonly type: 'file' | 'directory' | 'other' }[]
}

/** Injected face: data, callbacks, and the catalog hook compartment. */
export interface RemoteWorkspaceInjected {
  hooks: {
    /**
     * The Client catalog snapshot. It rides a hook rather than an injected
     * value because the renderer memoizes an entry's inject result for the
     * registration's lifetime, so a value read here would freeze at the first
     * render.
     */
    remoteWorkspaces: HostObservable<RemoteWorkspaceSnapshot>
  }
  /** Reload the catalog. */
  refresh: () => Promise<void>
  /**
   * Read one directory level on a target.
   * @param targetId - target to browse.
   * @param path - directory path; omitted lists the target's default root.
   * @returns the level's listing.
   */
  browse: (targetId: WorkspaceTargetId, path?: string) => Promise<RemoteDirectoryView>
  /**
   * Create one child directory on a target.
   * @param targetId - target to mutate.
   * @param parent - existing parent directory.
   * @param name - single path segment.
   * @returns the created path.
   */
  createFolder: (targetId: WorkspaceTargetId, parent: string, name: string) => Promise<string>
  /**
   * Register a workspace for a native path on a target and connect it. The
   * owner resolves the canonical URI, so no surface spells a URI scheme.
   * @param input - target and absolute native path.
   * @returns the durable workspace id.
   */
  addWorkspace: (input: { targetId: WorkspaceTargetId; path: string }) => Promise<RemoteWorkspaceId>
  /**
   * Connect a workspace and bind it to the open session.
   * @param workspaceId - workspace to activate.
   * @returns resolution after the session is bound.
   */
  activateWorkspace: (workspaceId: RemoteWorkspaceId) => Promise<void>
  /**
   * Read the session a binding would apply to.
   * @returns the open session id, or undefined when none is open.
   */
  currentSessionId: () => SessionId | undefined
  /**
   * Delete one workspace registration.
   * @param workspaceId - workspace to remove.
   * @returns resolution after deletion.
   */
  removeWorkspace: (workspaceId: RemoteWorkspaceId) => Promise<void>
}

/** Store handle type shared with components type-only. */
export type RemoteWorkspaceStore = ReturnType<typeof createRemoteWorkspaceStore>

/** Full props of the sidebar entry: owner geometry, store, injected face, copy. */
export type RemoteWorkspaceEntryProps =
  PropsRuntime<'sidebar.footer.action'>
  & PropsStore<RemoteWorkspaceStore>
  & Omit<RemoteWorkspaceInjected, 'hooks'>
  & PropsHooks<RemoteWorkspaceInjected['hooks']>
  & PropsLocale<'remote-workspace'>
