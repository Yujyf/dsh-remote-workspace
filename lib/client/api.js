/**
 * Browser transport for the remote-workspace HTTP API: one `fetch` POST per
 * verb under {@link REMOTE_WORKSPACE_API_PREFIX}, returning the Host envelope
 * unchanged so the model owns unwrapping.
 * @module @Yujyf/dsh-remote-workspace/client/api
 */
import { REMOTE_WORKSPACE_API_PREFIX } from "../api-wire.js";
/** `fetch` implementation of the remote-workspace API. */
export class RemoteWorkspaceApi {
    base;
    /** @param base - route prefix, overridden only by tests. */
    constructor(base = REMOTE_WORKSPACE_API_PREFIX) {
        this.base = base;
    }
    listTargets() {
        return this.call('listTargets', {});
    }
    listWorkspaces() {
        return this.call('listWorkspaces', {});
    }
    createWorkspace(request) {
        return this.call('createWorkspace', request);
    }
    removeWorkspace(request) {
        return this.call('removeWorkspace', request);
    }
    connectWorkspace(request) {
        return this.call('connectWorkspace', request);
    }
    disconnectWorkspace(request) {
        return this.call('disconnectWorkspace', request);
    }
    healthCheck(request) {
        return this.call('healthCheck', request);
    }
    listDirectory(request) {
        return this.call('listDirectory', request);
    }
    resolveUri(request) {
        return this.call('resolveUri', request);
    }
    createDirectory(request) {
        return this.call('createDirectory', request);
    }
    bindSession(request) {
        return this.call('bindSession', request);
    }
    async call(verb, payload) {
        let response;
        try {
            response = await fetch(`${this.base}/${verb}`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }
        catch (error) {
            return { ok: false, error: { code: 'network', message: messageOf(error) } };
        }
        const envelope = await readEnvelope(response);
        if (envelope === undefined) {
            return { ok: false, error: { code: 'http', message: `HTTP ${response.status}` } };
        }
        return envelope;
    }
}
/** Parse one response envelope; undefined when the body is not one. */
async function readEnvelope(response) {
    let parsed;
    try {
        parsed = await response.json();
    }
    catch {
        return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return undefined;
    const envelope = parsed;
    if (envelope.ok === true && 'value' in envelope) {
        return { ok: true, value: envelope.value };
    }
    const error = envelope.error;
    if (typeof error === 'object' && error !== null) {
        const failure = error;
        if (typeof failure.code === 'string' && typeof failure.message === 'string') {
            return { ok: false, error: { code: failure.code, message: failure.message } };
        }
    }
    return undefined;
}
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=api.js.map