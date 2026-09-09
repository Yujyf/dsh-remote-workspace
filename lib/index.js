/**
 * Remote workspace owner (`ctx.remoteWorkspace`): URI identity, target
 * discovery, durable registry, session binding, and WSL helper lifecycle.
 * @module @Yujyf/dsh-remote-workspace
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { LOCAL_CAPABILITIES, WSL_CAPABILITIES } from "./capabilities.js";
import { WorkspaceError } from "./errors.js";
import { defaultRemoteWorkspaceTitle, parseWorkspaceUri, workspaceUriFromNative, } from "./uri.js";
import { localPathMapper, wslPathMapper } from "./path-mapper.js";
import { listWslDistributions, terminateWslDistribution, WslBridge } from "./wsl-bridge.js";
import { remoteWorkspaceDomainSpec } from "./spec.js";
import { RemoteWorkspaceId, WorkspaceTargetId } from "./types.js";
/** Target types this owner can build identity for; a reserved type has no provider yet. */
const KNOWN_TARGET_TYPES = new Set(['local', 'wsl']);
export { WorkspaceError } from "./errors.js";
export { defaultRemoteWorkspaceTitle, formatWorkspaceUri, normalizePosixPath, normalizeWindowsPath, parseWorkspaceUri, uriPathToWindowsPath, windowsPathToUriPath, workspaceUriEquals, workspaceUriFromNative, workspaceUriFromWslUnc, } from "./uri.js";
export { localPathMapper, windowsPathToWslMount, wslPathMapper, wslPathToUnc, wslPathToWindowsMount, } from "./path-mapper.js";
export { LOCAL_CAPABILITIES, WSL_CAPABILITIES } from "./capabilities.js";
export { decodeWslListOutput, parseWslList } from "./wsl-list.js";
export { listWslDistributions, terminateWslDistribution, wslExecutable, WslBridge } from "./wsl-bridge.js";
export { remoteWorkspaceDomainSpec, remoteWorkspaceRecord, remoteWorkspaceDomainState } from "./spec.js";
export { RemoteWorkspaceId, WorkspaceTargetId, } from "./types.js";
/**
 * Host-local target for the current process platform.
 * @returns a ready local target.
 */
export function localHostTarget() {
    const authority = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    const displayName = authority === 'windows' ? 'Windows' : authority === 'macos' ? 'macOS' : 'Linux';
    return {
        id: WorkspaceTargetId(`local:${authority}`),
        type: 'local',
        displayName,
        identity: `local://${authority}`,
        status: 'ready',
        capabilities: LOCAL_CAPABILITIES,
    };
}
/**
 * Owner of remote-workspace identity, registry, and WSL helpers. Filesystem and
 * subprocess routers ask it which execution world the current agent is bound to.
 */
export class RemoteWorkspaceRuntime extends Service {
    static inject = ['storageDomain'];
    static Config = z.object({
        autoStart: z.boolean().default(true),
        shutdownOnDisconnect: z.boolean().default(false),
        commandTimeoutMs: z.number().default(30_000),
    });
    config;
    table;
    global;
    state;
    bridges = new Map();
    operationTail = Promise.resolve();
    /** @param ctx - Host context. */
    constructor(ctx, config) {
        super(ctx, 'remoteWorkspace');
        const resolved = config;
        this.config = {
            autoStart: resolved.autoStart,
            shutdownOnDisconnect: resolved.shutdownOnDisconnect,
            commandTimeoutMs: resolved.commandTimeoutMs,
        };
        ctx.effect(() => async () => {
            const pending = [...this.bridges.values()].map(bridge => bridge.dispose());
            this.bridges.clear();
            await Promise.all(pending);
        }, 'remote-workspace.bridges');
    }
    /** Open the domain and rebuild the in-memory order. */
    async [Service.init]() {
        const domain = await this.ctx.storageDomain.open(remoteWorkspaceDomainSpec);
        this.ctx.effect(() => () => domain.close(), 'remote-workspace.domainClose');
        this.table = domain.table('workspaces');
        this.global = domain.global;
        this.state = domain.global.get();
    }
    /**
     * Discover currently reachable targets. Local is always present; WSL
     * distributions appear only on Windows when `wsl.exe` is installed.
     * @returns the live target catalog.
     */
    async listTargets() {
        const targets = [localHostTarget()];
        if (process.platform !== 'win32')
            return targets;
        try {
            const distributions = await listWslDistributions(this.config.commandTimeoutMs);
            for (const distribution of distributions) {
                targets.push(this.targetFromDistribution(distribution.name, distribution.state === 'running' ? 'ready' : distribution.state === 'stopped' ? 'stopped' : 'unknown'));
            }
        }
        catch (error) {
            if (error instanceof WorkspaceError && error.code === 'TIMEOUT') {
                targets.push({
                    id: WorkspaceTargetId('wsl:unavailable'),
                    type: 'wsl',
                    displayName: 'WSL',
                    identity: 'wsl://',
                    status: 'unavailable',
                    capabilities: WSL_CAPABILITIES,
                    metadata: { detail: error.message },
                });
                return targets;
            }
        }
        return targets;
    }
    /**
     * Durable workspaces in registry order.
     * @returns a fresh array of workspace records.
     */
    listWorkspaces() {
        return this.requireState().workspaceIds.map((id) => {
            const record = this.requireTable().get(id);
            if (record === undefined) {
                throw new Error(`remote workspace order references missing workspace '${id}'`);
            }
            return this.toWorkspace(id, record);
        });
    }
    /**
     * Look up one workspace by id.
     * @param id - Workspace id.
     * @returns the workspace, or `undefined` when unknown.
     */
    getWorkspace(id) {
        const record = this.requireTable().get(id);
        return record === undefined ? undefined : this.toWorkspace(id, record);
    }
    /**
     * Create or reuse a workspace for a canonical URI. Same target + same
     * canonical path returns the existing record.
     * @param uri - Workspace URI.
     * @param title - Display title used only when creating.
     * @returns the existing or newly durable workspace.
     */
    createWorkspace(uri, title) {
        return this.enqueue(async () => {
            const parsed = parseWorkspaceUri(uri);
            const table = this.requireTable();
            for (const [id, record] of table.entries()) {
                if (record.uri === parsed.href)
                    return this.toWorkspace(id, record);
            }
            const targetId = this.targetIdOf(parsed);
            const id = RemoteWorkspaceId(randomUUID());
            const now = Date.now();
            const record = {
                targetId,
                uri: parsed.href,
                cwd: parsed.path,
                title: title ?? defaultRemoteWorkspaceTitle(parsed),
                createdAt: now,
                lastUsedAt: now,
                sessionIds: [],
            };
            await table.put(id, record);
            const state = this.requireState();
            await this.setState({
                workspaceIds: [id, ...state.workspaceIds],
                sessionBindings: state.sessionBindings,
            });
            return this.toWorkspace(id, record);
        });
    }
    /**
     * Delete one workspace registration. Sessions and target files are retained.
     * @param id - Workspace to remove.
     * @returns true when a record was deleted.
     */
    removeWorkspace(id) {
        return this.enqueue(async () => {
            const table = this.requireTable();
            if (table.get(id) === undefined)
                return false;
            const state = this.requireState();
            const sessionBindings = { ...state.sessionBindings };
            for (const [sessionId, workspaceId] of Object.entries(sessionBindings)) {
                if (workspaceId === id)
                    Reflect.deleteProperty(sessionBindings, sessionId);
            }
            await table.delete(id);
            await this.setState({
                workspaceIds: state.workspaceIds.filter(workspaceId => workspaceId !== id),
                sessionBindings,
            });
            return true;
        });
    }
    /**
     * Bind a session to a remote workspace. The session's `header.cwd` should be
     * the target-native path; this table is the execution-world authority.
     * @param sessionId - Session to bind.
     * @param workspaceId - Remote workspace.
     * @returns resolution after durability.
     */
    bindSession(sessionId, workspaceId) {
        return this.enqueue(async () => {
            const table = this.requireTable();
            const record = table.get(workspaceId);
            if (record === undefined) {
                throw new WorkspaceError(`remote workspace '${workspaceId}' was not found`, 'PATH_NOT_FOUND', {
                    workspaceId,
                });
            }
            const sessionIds = record.sessionIds.includes(sessionId)
                ? record.sessionIds
                : [sessionId, ...record.sessionIds];
            await table.update(workspaceId, current => ({
                ...current,
                sessionIds,
                lastUsedAt: Date.now(),
            }));
            const state = this.requireState();
            await this.setState({
                workspaceIds: state.workspaceIds,
                sessionBindings: { ...state.sessionBindings, [sessionId]: workspaceId },
            });
        });
    }
    /**
     * Resolve the workspace bound to a session.
     * @param sessionId - Session id.
     * @returns the workspace, or `undefined` when the session is local-unbound.
     */
    workspaceForSession(sessionId) {
        const workspaceId = this.requireState().sessionBindings[sessionId];
        if (workspaceId === undefined)
            return undefined;
        return this.getWorkspace(workspaceId);
    }
    /**
     * Execution world for the current initiating agent, if it is bound to a
     * remote workspace. Unbound sessions use the local host.
     * @returns the binding, or `undefined` for local/default execution.
     */
    currentBinding() {
        const agent = this.ctx.get('agents')?.currentInitiator();
        if (agent === undefined)
            return undefined;
        return this.bindingForSession(agent.session.id);
    }
    /**
     * Execution world for one session.
     * @param sessionId - Session id.
     * @returns the binding, or `undefined` when the session is not remote-bound.
     */
    bindingForSession(sessionId) {
        const workspace = this.workspaceForSession(sessionId);
        if (workspace === undefined)
            return undefined;
        const parsed = parseWorkspaceUri(workspace.uri);
        if (parsed.type === 'local') {
            return {
                workspace,
                target: localHostTarget(),
                cwd: workspace.cwd,
                pathMapper: localPathMapper(),
            };
        }
        if (parsed.type !== 'wsl')
            return undefined;
        const target = this.targetFromDistribution(parsed.authority, 'unknown');
        return {
            workspace,
            target,
            cwd: workspace.cwd,
            pathMapper: wslPathMapper(),
            bridge: this.bridgeFor(parsed.authority),
        };
    }
    /**
     * Connect a workspace: start a stopped WSL distro when configured, and
     * create the helper.
     * @param workspaceId - Workspace to connect.
     * @returns the live binding.
     */
    async connectWorkspace(workspaceId) {
        const workspace = this.getWorkspace(workspaceId);
        if (workspace === undefined) {
            throw new WorkspaceError(`remote workspace '${workspaceId}' was not found`, 'PATH_NOT_FOUND', {
                workspaceId,
            });
        }
        const parsed = parseWorkspaceUri(workspace.uri);
        if (parsed.type === 'wsl') {
            const bridge = this.bridgeFor(parsed.authority);
            await bridge.connect();
            await bridge.request('REALPATH', parsed.path);
        }
        if (parsed.type !== 'local' && parsed.type !== 'wsl') {
            throw new WorkspaceError(`cannot connect to unsupported target type '${parsed.type}'`, 'UNSUPPORTED', {
                uri: workspace.uri,
            });
        }
        const isLocal = parsed.type === 'local';
        return {
            workspace,
            target: isLocal ? localHostTarget() : this.targetFromDistribution(parsed.authority, 'ready'),
            cwd: workspace.cwd,
            pathMapper: isLocal ? localPathMapper() : wslPathMapper(),
            ...(isLocal ? {} : { bridge: this.bridgeFor(parsed.authority) }),
        };
    }
    /**
     * Release helpers for a workspace. Does not shut down the distribution unless
     * `shutdownOnDisconnect` is enabled.
     * @param workspaceId - Workspace to disconnect.
     * @returns resolution after helpers stop.
     */
    async disconnectWorkspace(workspaceId) {
        const workspace = this.getWorkspace(workspaceId);
        if (workspace === undefined)
            return;
        const parsed = parseWorkspaceUri(workspace.uri);
        if (parsed.type !== 'wsl')
            return;
        const stillUsed = this.listWorkspaces().some(candidate => (candidate.id !== workspaceId && parseWorkspaceUri(candidate.uri).authority === parsed.authority));
        if (stillUsed)
            return;
        const bridge = this.bridges.get(parsed.authority);
        if (bridge !== undefined) {
            await bridge.dispose();
            this.bridges.delete(parsed.authority);
        }
        if (this.config.shutdownOnDisconnect)
            await terminateWslDistribution(parsed.authority);
    }
    /**
     * Health-check one target.
     * @param targetId - Target id.
     * @returns live status.
     */
    async healthCheck(targetId) {
        if (targetId.startsWith('local:')) {
            return { targetId, status: 'ready' };
        }
        if (!targetId.startsWith('wsl:')) {
            return { targetId, status: 'unavailable', detail: 'unsupported target type' };
        }
        const distro = targetId.slice('wsl:'.length);
        try {
            await this.bridgeFor(distro).ping();
            return { targetId, status: 'ready' };
        }
        catch (error) {
            const typed = error instanceof WorkspaceError ? error : undefined;
            return {
                targetId,
                status: typed?.code === 'TARGET_NOT_FOUND' ? 'unavailable' : 'error',
                detail: typed?.message ?? String(error),
            };
        }
    }
    /**
     * List one directory on a target for the workspace path picker.
     * @param targetId - Target to browse.
     * @param path - Directory path in the target; omitted lists the default root.
     * @returns the path and its children.
     */
    async listDirectory(targetId, path) {
        if (targetId.startsWith('local:')) {
            const directory = path === undefined || path.length === 0 ? homedir() : path;
            const entries = await readdir(directory, { withFileTypes: true });
            return {
                path: directory,
                entries: entries.map(entry => ({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
                })),
            };
        }
        if (!targetId.startsWith('wsl:')) {
            throw new WorkspaceError(`cannot list directory on unsupported target '${targetId}'`, 'UNSUPPORTED', { targetId });
        }
        const distro = targetId.slice('wsl:'.length);
        const directory = path === undefined || path.length === 0 ? '/' : path;
        const payload = await this.bridgeFor(distro).request('LIST', directory);
        const entries = [];
        for (const line of payload.split('\n')) {
            if (line.length === 0)
                continue;
            const [name, kind] = line.split('\t');
            if (name === undefined)
                continue;
            entries.push({ name, type: kind === 'd' ? 'directory' : kind === 'f' ? 'file' : 'other' });
        }
        return { path: directory, entries };
    }
    /**
     * Create one child directory on a target.
     * @param targetId - Target to mutate.
     * @param parent - Existing parent directory.
     * @param name - Single path segment.
     * @returns the created directory path.
     */
    async createDirectory(targetId, parent, name) {
        if (name.trim() === '' || name === '.' || name === '..' || /[/\\]/.test(name)) {
            throw new WorkspaceError('directory name must be a single non-blank path segment', 'UNSUPPORTED', { name });
        }
        if (targetId.startsWith('local:')) {
            const created = join(parent, name);
            await mkdir(created);
            return created;
        }
        if (!targetId.startsWith('wsl:')) {
            throw new WorkspaceError(`cannot create directory on unsupported target '${targetId}'`, 'UNSUPPORTED', { targetId });
        }
        const distro = targetId.slice('wsl:'.length);
        const created = parent === '/' ? `/${name}` : `${parent.replace(/\/$/, '')}/${name}`;
        await this.bridgeFor(distro).request('MKDIR', created);
        return created;
    }
    /**
     * Return the helper for a distribution, creating it if needed.
     * @param distro - Distribution name.
     * @returns the shared bridge.
     */
    bridgeFor(distro) {
        const existing = this.bridges.get(distro);
        if (existing !== undefined)
            return existing;
        const bridge = new WslBridge(distro, this.config.commandTimeoutMs, this.config.autoStart);
        this.bridges.set(distro, bridge);
        return bridge;
    }
    /**
     * Parse a URI string.
     * @param uri - Workspace URI.
     * @returns the canonical record.
     */
    resolveUri(uri) {
        return parseWorkspaceUri(uri);
    }
    /**
     * Build a URI from a target and native path.
     * @param type - Target type.
     * @param authority - Target authority.
     * @param path - Native path.
     * @returns the canonical URI.
     */
    uriFromNative(type, authority, path) {
        return workspaceUriFromNative(type, authority, path);
    }
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
    uriForTargetPath(targetId, path) {
        const separator = targetId.indexOf(':');
        const type = targetId.slice(0, separator);
        const authority = targetId.slice(separator + 1);
        if (separator <= 0 || authority.length === 0 || !KNOWN_TARGET_TYPES.has(type)) {
            throw new WorkspaceError(`cannot resolve a workspace URI for target '${targetId}'`, 'UNSUPPORTED', { targetId });
        }
        const uri = workspaceUriFromNative(type, authority, path);
        return { uri: uri.href, title: defaultRemoteWorkspaceTitle(uri) };
    }
    targetFromDistribution(name, status) {
        return {
            id: WorkspaceTargetId(`wsl:${name}`),
            type: 'wsl',
            displayName: name,
            identity: `wsl://${encodeURIComponent(name)}`,
            status,
            capabilities: WSL_CAPABILITIES,
            metadata: { distribution: name },
        };
    }
    targetIdOf(uri) {
        if (uri.type === 'local')
            return WorkspaceTargetId(`local:${uri.authority}`);
        if (uri.type === 'wsl')
            return WorkspaceTargetId(`wsl:${uri.authority}`);
        return WorkspaceTargetId(`${uri.type}:${uri.authority}`);
    }
    toWorkspace(id, record) {
        return {
            id,
            targetId: record.targetId,
            uri: record.uri,
            cwd: record.cwd,
            title: record.title,
            createdAt: record.createdAt,
            lastUsedAt: record.lastUsedAt,
            sessionIds: record.sessionIds,
        };
    }
    requireTable() {
        if (this.table === undefined)
            throw new Error('remote workspace registry is not started yet');
        return this.table;
    }
    requireState() {
        if (this.state === undefined)
            throw new Error('remote workspace registry is not started yet');
        return this.state;
    }
    async setState(state) {
        await this.global.set(state);
        this.state = state;
    }
    enqueue(operation) {
        const result = this.operationTail.then(operation, operation);
        this.operationTail = result.then(() => { }, () => { });
        return result;
    }
}
export default RemoteWorkspaceRuntime;
//# sourceMappingURL=index.js.map