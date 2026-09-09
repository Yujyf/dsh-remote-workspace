/**
 * Browser-safe request and result vocabulary of the remote-workspace HTTP API.
 * Types only.
 * @module @Yujyf/dsh-remote-workspace
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RemoteWorkspace, RemoteWorkspaceId, WorkspaceTarget, WorkspaceTargetId } from './types.ts';
export type { RemoteDirectoryListing, RemoteWorkspace, RemoteWorkspaceId, TargetHealth, WorkspaceTarget, WorkspaceTargetId, } from './types.ts';
/** Create-workspace request. */
export interface RemoteWorkspaceCreateRequest {
    readonly uri: string;
    readonly title?: string;
}
/** Create-workspace result. */
export interface RemoteWorkspaceCreateValue {
    readonly workspace: RemoteWorkspace;
}
/** Workspace identity request. */
export interface RemoteWorkspaceIdRequest {
    readonly workspaceId: RemoteWorkspaceId;
}
/** Bind a Session to a remote workspace. */
export interface RemoteWorkspaceBindRequest {
    readonly workspaceId: RemoteWorkspaceId;
    readonly sessionId: SessionId;
}
/** Directory listing request. */
export interface RemoteWorkspaceListDirectoryRequest {
    readonly targetId: WorkspaceTargetId;
    readonly path?: string;
}
/** Canonical-URI request for one native path on a target. */
export interface RemoteWorkspaceResolveUriRequest {
    readonly targetId: WorkspaceTargetId;
    readonly path: string;
}
/** Canonical-URI result: the identity string and its default display title. */
export interface RemoteWorkspaceResolveUriValue {
    readonly uri: string;
    readonly title: string;
}
/** Create-directory request. */
export interface RemoteWorkspaceCreateDirectoryRequest {
    readonly targetId: WorkspaceTargetId;
    readonly parent: string;
    readonly name: string;
}
/** Target catalog result. */
export interface RemoteWorkspaceTargetsValue {
    readonly targets: readonly WorkspaceTarget[];
}
/** Workspace catalog result. */
export interface RemoteWorkspaceListValue {
    readonly workspaces: readonly RemoteWorkspace[];
}
/** Health result. */
export interface RemoteWorkspaceHealthRequest {
    readonly targetId: WorkspaceTargetId;
}
//# sourceMappingURL=wire-types.d.ts.map