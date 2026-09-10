/**
 * Host remote-workspace API route: target discovery, workspace CRUD, path
 * browsing, and session binding, served as JSON over `ctx.webServer`.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Context, Service } from '@deepseek-ai/cordis';
import { REMOTE_WORKSPACE_API_PREFIX } from "./api-wire.js";
import { WorkspaceError } from "./errors.js";
import { WorkspaceTargetId } from "./types.js";
/** Largest request body accepted, in bytes. Every verb's payload is tiny. */
const MAX_BODY_BYTES = 64 * 1024;
/** Host service serving the remote-workspace JSON route. */
export class RemoteWorkspaceController extends Service {
    static inject = ['remoteWorkspace', 'webServer'];
    /** @param ctx - Host context containing the remote-workspace owner. */
    constructor(ctx) {
        super(ctx, 'remoteWorkspaceController');
    }
    /**
     * Register the route. The registration is an effect: disposing the fiber
     * removes the route.
     */
    [Service.init]() {
        const webServer = this.ctx.webServer;
        this.ctx.effect(() => webServer.register({
            kind: 'prefix',
            path: REMOTE_WORKSPACE_API_PREFIX,
            handler: (request, response) => this.handle(request, response),
        }), 'remote-workspace-controller: http route');
    }
    /**
     * List discovered execution targets.
     * @returns the live target catalog.
     */
    async listTargets() {
        return { targets: await this.ctx.remoteWorkspace.listTargets() };
    }
    /**
     * List durable remote workspaces.
     * @returns registered workspaces in display order.
     */
    listWorkspaces() {
        return { workspaces: this.ctx.remoteWorkspace.listWorkspaces() };
    }
    /**
     * Create or reuse a remote workspace for a canonical URI.
     * @param request - URI and optional title.
     * @returns the workspace record.
     */
    async createWorkspace(request) {
        try {
            const workspace = await this.ctx.remoteWorkspace.createWorkspace(request.uri, request.title);
            return { workspace };
        }
        catch (error) {
            throw mapError(error);
        }
    }
    /**
     * Remove a remote workspace registration.
     * @param request - Workspace identity.
     * @returns resolution after deletion.
     */
    async removeWorkspace(request) {
        await this.ctx.remoteWorkspace.removeWorkspace(request.workspaceId);
    }
    /**
     * Connect a workspace, starting a stopped WSL distribution when configured.
     * @param request - Workspace identity.
     * @returns resolution after the helper is ready.
     */
    async connectWorkspace(request) {
        try {
            await this.ctx.remoteWorkspace.connectWorkspace(request.workspaceId);
        }
        catch (error) {
            throw mapError(error, request.workspaceId);
        }
    }
    /**
     * Disconnect a workspace without shutting down its target by default.
     * @param request - Workspace identity.
     * @returns resolution after helpers stop.
     */
    async disconnectWorkspace(request) {
        await this.ctx.remoteWorkspace.disconnectWorkspace(request.workspaceId);
    }
    /**
     * Probe one target.
     * @param request - Target identity.
     * @returns live status.
     */
    async healthCheck(request) {
        return await this.ctx.remoteWorkspace.healthCheck(request.targetId);
    }
    /**
     * List one directory on a target.
     * @param request - Target and optional path.
     * @returns the listing.
     */
    async listDirectory(request) {
        try {
            return await this.ctx.remoteWorkspace.listDirectory(request.targetId, request.path);
        }
        catch (error) {
            throw pathError(error, request.path ?? '');
        }
    }
    /**
     * Build the canonical workspace URI for a native path on a target. Picking
     * surfaces call this instead of assembling a URI scheme themselves.
     * @param request - Target and native path.
     * @returns the canonical URI and its default title.
     */
    resolveUri(request) {
        try {
            return this.ctx.remoteWorkspace.uriForTargetPath(request.targetId, request.path);
        }
        catch (error) {
            throw pathError(error, request.path);
        }
    }
    /**
     * Create a child directory on a target.
     * @param request - Target, parent, and name.
     * @returns the created path.
     */
    async createDirectory(request) {
        try {
            const path = await this.ctx.remoteWorkspace.createDirectory(request.targetId, request.parent, request.name);
            return { path };
        }
        catch (error) {
            throw pathError(error, request.parent);
        }
    }
    /**
     * Bind a Session to a remote workspace so later tool calls route there.
     * @param request - Workspace and Session identities.
     * @returns resolution after durability.
     */
    async bindSession(request) {
        try {
            await this.ctx.remoteWorkspace.bindSession(request.sessionId, request.workspaceId);
        }
        catch (error) {
            throw mapError(error, request.workspaceId);
        }
    }
    /**
     * Release one session's binding so its tools run on the host again.
     * @param request - Session identity.
     * @returns resolution after durability.
     */
    async unbindSession(request) {
        await this.ctx.remoteWorkspace.unbindSession(request.sessionId);
    }
    /**
     * List DSH's own workspaces, which the selector shows beside the remote ones.
     * Empty when the deployment mounts no workspace registry.
     * @returns the built-in workspace rows.
     */
    listLocalWorkspaces() {
        const registry = this.ctx.get('workspaceRegistry');
        if (registry === undefined)
            return { workspaces: [] };
        return {
            workspaces: registry.list().map(workspace => ({
                id: workspace.id,
                title: workspace.title,
                path: workspace.path,
                sessionIds: [...workspace.sessionIds],
            })),
        };
    }
    /** Verb table: one entry per browser-callable method. */
    verbs() {
        return {
            listTargets: async () => await this.listTargets(),
            listWorkspaces: async () => this.listWorkspaces(),
            createWorkspace: async (payload) => await this.createWorkspace(await readCreateRequest(payload)),
            removeWorkspace: async (payload) => await this.removeWorkspace(readIdRequest(payload)),
            connectWorkspace: async (payload) => await this.connectWorkspace(readIdRequest(payload)),
            disconnectWorkspace: async (payload) => await this.disconnectWorkspace(readIdRequest(payload)),
            healthCheck: async (payload) => await this.healthCheck(readTargetRequest(payload)),
            listDirectory: async (payload) => await this.listDirectory(readListRequest(payload)),
            resolveUri: async (payload) => this.resolveUri(readResolveRequest(payload)),
            createDirectory: async (payload) => await this.createDirectory(readCreateDirectoryRequest(payload)),
            bindSession: async (payload) => await this.bindSession(readBindRequest(payload)),
            unbindSession: async (payload) => await this.unbindSession(readUnbindRequest(payload)),
            listLocalWorkspaces: async () => this.listLocalWorkspaces(),
        };
    }
    async handle(request, response) {
        if (!this.trusted(request)) {
            return this.respond(response, 403, fail('forbidden', 'remote-workspace API rejects this Host header'));
        }
        if (request.method !== 'POST') {
            return this.respond(response, 405, fail('method-not-allowed', 'remote-workspace API accepts POST only'));
        }
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        const verb = path.slice(REMOTE_WORKSPACE_API_PREFIX.length + 1);
        const handler = this.verbs()[verb];
        if (handler === undefined) {
            return this.respond(response, 404, fail('unknown-verb', `unknown remote-workspace verb '${verb}'`));
        }
        let payload;
        try {
            payload = await readJsonBody(request);
        }
        catch (error) {
            return this.respond(response, 400, fail('bad-request', messageOf(error)));
        }
        try {
            // A verb that returns nothing still carries an explicit `value`, so the
            // browser never has to tell "no value" apart from a malformed envelope.
            this.respond(response, 200, { ok: true, value: (await handler(payload)) ?? null });
        }
        catch (error) {
            this.respond(response, 400, { ok: false, error: mapError(error) });
        }
    }
    /**
     * Whether the request may reach this route: the Host authority is the local
     * loopback one, or an authority this deployment declares trusted. Mirrors the
     * browser-trust fence the gateway applies to `/api`.
     */
    trusted(request) {
        const host = request.headers.host;
        if (host === undefined)
            return false;
        let authority;
        try {
            authority = new URL(`http://${host}`);
        }
        catch {
            return false;
        }
        if (isLoopbackHostname(authority.hostname))
            return true;
        const runtime = this.ctx.get('webRuntime');
        return (runtime?.trustedHosts ?? []).some(entry => entry === authority.host || entry === authority.hostname);
    }
    respond(response, status, envelope) {
        const body = JSON.stringify(envelope);
        response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
        response.end(body);
    }
}
/** Whether a hostname names the local loopback authority. */
function isLoopbackHostname(hostname) {
    if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1')
        return true;
    const parts = hostname.split('.');
    return parts.length === 4
        && parts[0] === '127'
        && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
/** Read the request body as JSON, bounded and parsed once. */
async function readJsonBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.byteLength;
        if (size > MAX_BODY_BYTES)
            throw new Error(`remote-workspace request body exceeds ${MAX_BODY_BYTES} bytes`);
        chunks.push(buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (text.length === 0)
        return {};
    try {
        return JSON.parse(text);
    }
    catch (error) {
        throw new Error(`remote-workspace request body is not JSON: ${messageOf(error)}`);
    }
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
function fail(code, message) {
    return { ok: false, error: { code, message } };
}
/** Require an object payload. */
function asRecord(payload, verb) {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error(`remote-workspace ${verb} expects a JSON object payload`);
    }
    return payload;
}
/** Require a non-empty string field. */
function requiredString(source, field) {
    const value = source[field];
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`remote-workspace request field '${field}' must be a non-empty string`);
    }
    return value;
}
/** Require an optional string field. */
function optionalString(source, field) {
    const value = source[field];
    if (value === undefined)
        return undefined;
    if (typeof value !== 'string')
        throw new Error(`remote-workspace request field '${field}' must be a string`);
    return value;
}
function readIdRequest(payload) {
    const source = asRecord(payload, 'workspace command');
    return { workspaceId: requiredString(source, 'workspaceId') };
}
function readTargetRequest(payload) {
    const source = asRecord(payload, 'healthCheck');
    return { targetId: WorkspaceTargetId(requiredString(source, 'targetId')) };
}
function readCreateRequest(payload) {
    const source = asRecord(payload, 'createWorkspace');
    const title = optionalString(source, 'title');
    return title === undefined
        ? { uri: requiredString(source, 'uri') }
        : { uri: requiredString(source, 'uri'), title };
}
function readListRequest(payload) {
    const source = asRecord(payload, 'listDirectory');
    const path = optionalString(source, 'path');
    const targetId = WorkspaceTargetId(requiredString(source, 'targetId'));
    return path === undefined ? { targetId } : { targetId, path };
}
function readResolveRequest(payload) {
    const source = asRecord(payload, 'resolveUri');
    return { targetId: WorkspaceTargetId(requiredString(source, 'targetId')), path: requiredString(source, 'path') };
}
function readCreateDirectoryRequest(payload) {
    const source = asRecord(payload, 'createDirectory');
    return {
        targetId: WorkspaceTargetId(requiredString(source, 'targetId')),
        parent: requiredString(source, 'parent'),
        name: requiredString(source, 'name'),
    };
}
function readBindRequest(payload) {
    const source = asRecord(payload, 'bindSession');
    return {
        sessionId: requiredString(source, 'sessionId'),
        workspaceId: requiredString(source, 'workspaceId'),
    };
}
function readUnbindRequest(payload) {
    const source = asRecord(payload, 'unbindSession');
    return { sessionId: requiredString(source, 'sessionId') };
}
function mapError(error, workspaceId) {
    if (error instanceof WorkspaceError) {
        if (error.code === 'TARGET_NOT_FOUND' || error.code === 'TARGET_OFFLINE' || error.code === 'TARGET_START_FAILED') {
            return { code: 'remote-workspace/target-unavailable', message: error.message };
        }
        if (workspaceId !== undefined) {
            return { code: 'remote-workspace/not-found', message: error.message };
        }
        return { code: `remote-workspace/${error.code.toLowerCase().replaceAll('_', '-')}`, message: error.message };
    }
    return { code: 'remote-workspace/internal', message: messageOf(error) };
}
function pathError(error, path) {
    return {
        code: 'remote-workspace/path-failed',
        message: path.length === 0 ? messageOf(error) : `${messageOf(error)} (${path})`,
    };
}
export default RemoteWorkspaceController;
//# sourceMappingURL=controller.js.map