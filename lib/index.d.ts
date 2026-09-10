/**
 * Remote workspace owner (`ctx.remoteWorkspace`): URI identity, target
 * discovery, durable registry, session binding, and WSL helper lifecycle.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { type PathMapper } from './path-mapper.ts';
import { WslBridge } from './wsl-bridge.ts';
import { RemoteWorkspaceId, WorkspaceTargetId } from './types.ts';
import type { RemoteDirectoryListing, RemoteWorkspace, TargetHealth, WorkspaceTarget, WorkspaceUri } from './types.ts';
export { WorkspaceError } from './errors.ts';
export type { WorkspaceErrorCode } from './errors.ts';
export { defaultRemoteWorkspaceTitle, formatWorkspaceUri, normalizePosixPath, normalizeWindowsPath, parseWorkspaceUri, uriPathToWindowsPath, windowsPathToUriPath, workspaceUriEquals, workspaceUriFromNative, workspaceUriFromWslUnc, } from './uri.ts';
export { localPathMapper, windowsPathToWslMount, wslPathMapper, wslPathToUnc, wslPathToWindowsMount, } from './path-mapper.ts';
export type { PathMapper } from './path-mapper.ts';
export { LOCAL_CAPABILITIES, WSL_CAPABILITIES } from './capabilities.ts';
export { decodeWslListOutput, parseWslList } from './wsl-list.ts';
export { worldCwd, sameHostPath } from './world-cwd.ts';
export type { WorldCwdFacts } from './world-cwd.ts';
export { listWslDistributions, terminateWslDistribution, wslExecutable, WslBridge } from './wsl-bridge.ts';
export type { WslHelperClient } from './wsl-bridge.ts';
export { remoteWorkspaceDomainSpec, remoteWorkspaceRecord, remoteWorkspaceDomainState } from './spec.ts';
export type { RemoteWorkspaceDomainState, RemoteWorkspaceRecord } from './spec.ts';
export { RemoteWorkspaceId, WorkspaceTargetId, } from './types.ts';
export type { RemoteDirectoryEntry, RemoteDirectoryListing, RemoteWorkspace, TargetHealth, WorkspaceCapabilities, WorkspaceTarget, WorkspaceTargetStatus, WorkspaceTargetType, WorkspaceUri, WslDistribution, } from './types.ts';
/** Plugin configuration. */
export interface Config {
    /** Start a stopped WSL distribution when a workspace on it connects. */
    autoStart?: boolean;
    /** Shut down the WSL distribution when its last workspace disconnects. Default false. */
    shutdownOnDisconnect?: boolean;
    /** Per-helper and listing command budget in milliseconds. */
    commandTimeoutMs?: number;
}
/** Bound execution world for one session or connected workspace. */
export interface ExecutionBinding {
    readonly workspace: RemoteWorkspace;
    readonly target: WorkspaceTarget;
    readonly cwd: string;
    readonly pathMapper: PathMapper;
    /**
     * Host directory of the bound session at resolution time. The routers use it
     * to recognize the session's own directory and land it on {@link cwd}; any
     * other host path keeps its drive mapping.
     */
    readonly sourceCwd?: string;
    readonly bridge?: WslBridge;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        remoteWorkspace: RemoteWorkspaceRuntime;
    }
}
/**
 * Host-local target for the current process platform.
 * @returns a ready local target.
 */
export declare function localHostTarget(): WorkspaceTarget;
/**
 * Owner of remote-workspace identity, registry, and WSL helpers. Filesystem and
 * subprocess routers ask it which execution world the current agent is bound to.
 */
export declare class RemoteWorkspaceRuntime extends Service {
    static inject: string[];
    static Config: z<Config>;
    private readonly config;
    private table?;
    private global?;
    private state?;
    private readonly bridges;
    private operationTail;
    /** @param ctx - Host context. */
    constructor(ctx: Context, config: Config);
    /** Open the domain, then announce the bound world to the model. */
    protected [Service.init](): Promise<void>;
    /**
     * Model-facing description of the world this session's tools run in. Empty
     * for an unbound session: the host world is DSH's default and needs no note.
     * @param sessionId - Session the request belongs to.
     * @returns the runtime-context text, or an empty string.
     */
    private executionWorldContext;
    /**
     * Discover the remote execution worlds a session can be bound to. The
     * host-local world is never listed: a session that is not bound already runs
     * there, so it is not a remote workspace. WSL distributions appear on Windows
     * when `wsl.exe` is installed.
     * @returns the live remote target catalog.
     */
    listTargets(): Promise<WorkspaceTarget[]>;
    /**
     * Durable workspaces in registry order.
     * @returns a fresh array of workspace records.
     */
    listWorkspaces(): RemoteWorkspace[];
    /**
     * Look up one workspace by id.
     * @param id - Workspace id.
     * @returns the workspace, or `undefined` when unknown.
     */
    getWorkspace(id: RemoteWorkspaceId): RemoteWorkspace | undefined;
    /**
     * Create or reuse a workspace for a canonical URI. Same target + same
     * canonical path returns the existing record.
     * @param uri - Workspace URI.
     * @param title - Display title used only when creating.
     * @returns the existing or newly durable workspace.
     */
    createWorkspace(uri: string, title?: string): Promise<RemoteWorkspace>;
    /**
     * Delete one workspace registration. Sessions and target files are retained.
     * @param id - Workspace to remove.
     * @returns true when a record was deleted.
     */
    removeWorkspace(id: RemoteWorkspaceId): Promise<boolean>;
    /**
     * Bind a session to a remote workspace. The session's `header.cwd` should be
     * the target-native path; this table is the execution-world authority.
     * @param sessionId - Session to bind.
     * @param workspaceId - Remote workspace.
     * @returns resolution after durability.
     */
    bindSession(sessionId: SessionId, workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Resolve the workspace bound to a session.
     * @param sessionId - Session id.
     * @returns the workspace, or `undefined` when the session is local-unbound.
     */
    workspaceForSession(sessionId: SessionId): RemoteWorkspace | undefined;
    /**
     * Execution world for the current initiating agent, if it is bound to a
     * remote workspace. Unbound sessions use the local host.
     * @returns the binding, or `undefined` for local/default execution.
     */
    currentBinding(): ExecutionBinding | undefined;
    /**
     * Execution world for one session.
     * @param sessionId - Session id.
     * @returns the binding, or `undefined` when the session is not remote-bound.
     */
    bindingForSession(sessionId: SessionId): ExecutionBinding | undefined;
    /**
     * Working directory DSH recorded for one session. The header is immutable, so
     * this is the directory the session keeps for its whole life; the routers
     * substitute the bound workspace for it.
     * @param sessionId - Session id.
     * @returns the recorded host directory, or `undefined` for an unknown session.
     */
    sessionDirectory(sessionId: SessionId): string | undefined;
    /**
     * Release one session's binding so its tools run on the host again.
     * @param sessionId - Session to unbind.
     * @returns true when a binding was removed.
     */
    unbindSession(sessionId: SessionId): Promise<boolean>;
    /**
     * Connect a workspace: start a stopped WSL distro when configured, and
     * create the helper.
     * @param workspaceId - Workspace to connect.
     * @returns the live binding.
     */
    connectWorkspace(workspaceId: RemoteWorkspaceId): Promise<ExecutionBinding>;
    /**
     * Release helpers for a workspace. Does not shut down the distribution unless
     * `shutdownOnDisconnect` is enabled.
     * @param workspaceId - Workspace to disconnect.
     * @returns resolution after helpers stop.
     */
    disconnectWorkspace(workspaceId: RemoteWorkspaceId): Promise<void>;
    /**
     * Health-check one target.
     * @param targetId - Target id.
     * @returns live status.
     */
    healthCheck(targetId: WorkspaceTargetId): Promise<TargetHealth>;
    /**
     * List one directory on a target for the workspace path picker.
     * @param targetId - Target to browse.
     * @param path - Directory path in the target; omitted lists the default root.
     * @returns the path and its children.
     */
    listDirectory(targetId: WorkspaceTargetId, path?: string): Promise<RemoteDirectoryListing>;
    /**
     * Create one child directory on a target.
     * @param targetId - Target to mutate.
     * @param parent - Existing parent directory.
     * @param name - Single path segment.
     * @returns the created directory path.
     */
    createDirectory(targetId: WorkspaceTargetId, parent: string, name: string): Promise<string>;
    /**
     * Return the helper for a distribution, creating it if needed.
     * @param distro - Distribution name.
     * @returns the shared bridge.
     */
    bridgeFor(distro: string): WslBridge;
    /**
     * Parse a URI string.
     * @param uri - Workspace URI.
     * @returns the canonical record.
     */
    resolveUri(uri: string): WorkspaceUri;
    /**
     * Build a URI from a target and native path.
     * @param type - Target type.
     * @param authority - Target authority.
     * @param path - Native path.
     * @returns the canonical URI.
     */
    uriFromNative(type: WorkspaceUri['type'], authority: string, path: string): WorkspaceUri;
    /**
     * Build the canonical workspace URI and default title for one native path on
     * a target. Consumers that pick a directory must not spell a URI scheme
     * themselves: this is the single place a target's native path becomes
     * identity, so a new target type needs no caller change.
     * @param targetId - target the path lives in.
     * @param path - absolute path in that target's native spelling.
     * @returns the canonical URI string and its default display title.
     * @throws `UNSUPPORTED` when the target id names no known target type or an empty authority.
     */
    uriForTargetPath(targetId: WorkspaceTargetId, path: string): {
        uri: string;
        title: string;
    };
    private targetFromDistribution;
    private targetIdOf;
    private toWorkspace;
    private requireTable;
    private requireState;
    private setState;
    private enqueue;
}
export default RemoteWorkspaceRuntime;
//# sourceMappingURL=index.d.ts.map