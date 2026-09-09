/**
 * FileSystem router for remote workspaces. Isolates the shipped sandboxed
 * local backend and delegates WSL-bound sessions to a helper-backed filesystem.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { FileSystem } from '@deepseek-ai/dsh-fs';
import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox';
import { WslFileSystem } from "./wsl-fs.js";
/** Router config: the local backend's knobs verbatim, applied to the isolated sandboxed backend. */
export const Config = z.object({
    cwd: z.string().default(process.cwd()),
    diffBasisMaxBytes: z.number().default(10 * 1024 * 1024),
});
/**
 * `ctx.fs` implementation that routes by the current remote-workspace binding.
 * Unbound sessions use the isolated local sandboxed backend unchanged. The
 * owner is read with `ctx.get('remoteWorkspace')` (optional-service access):
 * the router composes beside it, and agentless host calls have no binding.
 */
export class RemoteWorkspaceFileSystem extends FileSystem {
    static inject = ['remoteWorkspace', 'sandboxPolicy'];
    static Config = Config;
    local;
    wsl = new Map();
    localConfig;
    defaultMode;
    /** @param ctx - Host context. */
    constructor(ctx, config) {
        super(ctx);
        this.localConfig = config;
        this.defaultMode = ctx.sandboxPolicy.defaultMode;
    }
    get sandboxMode() {
        return this.backend().sandboxMode ?? this.defaultMode;
    }
    /**
     * Isolate the shipped sandboxed local backend on a private `fs` realm. The
     * backend instance is captured through `ctx.inject()`: the isolated realm's
     * `fs` is a different implementation from this router, and reading it back
     * through this context's property proxy would resolve the router's own service.
     */
    async [Service.init]() {
        const localCtx = this.ctx.isolate('fs');
        let captured;
        localCtx.inject(['fs'], (fsCtx) => { captured = fsCtx.fs; });
        await localCtx.plugin(SandboxedFileSystem, this.localConfig);
        if (captured === undefined || captured === this) {
            throw new Error('remote-workspace filesystem: the isolated local backend did not start');
        }
        this.local = captured;
    }
    resolve(path, opts) {
        return this.backend().resolve(path, opts);
    }
    processPath(target) {
        return this.backend().processPath(target);
    }
    processPathFromHostPath(hostPath) {
        return this.backend().processPathFromHostPath(hostPath);
    }
    fileUrl(target) {
        return this.backend().fileUrl(target);
    }
    contains(parent, child) {
        return this.backend().contains(parent, child);
    }
    stat(target, signal) {
        return this.backend().stat(target, signal);
    }
    lstat(path, opts, signal) {
        return this.backend().lstat(path, opts, signal);
    }
    readText(target, signal) {
        return this.backend().readText(target, signal);
    }
    streamText(target, signal) {
        return this.backend().streamText(target, signal);
    }
    readBytes(target, signal, maxBytes) {
        return this.backend().readBytes(target, signal, maxBytes);
    }
    readByteRange(target, range, signal) {
        return this.backend().readByteRange(target, range, signal);
    }
    listDir(target, signal) {
        return this.backend().listDir(target, signal);
    }
    writeText(target, content, expected, signal, sandboxPolicy) {
        return this.backend().writeText(target, content, expected, signal, sandboxPolicy);
    }
    editText(target, edit, expected, signal, sandboxPolicy) {
        return this.backend().editText(target, edit, expected, signal, sandboxPolicy);
    }
    backend() {
        const remoteWorkspace = this.ctx.get('remoteWorkspace');
        const binding = remoteWorkspace?.currentBinding();
        if (binding?.target.type === 'wsl' && binding.bridge !== undefined) {
            const key = `${binding.target.id}:${binding.cwd}`;
            const existing = this.wsl.get(key);
            if (existing !== undefined)
                return existing;
            const created = new WslFileSystem(binding.bridge, binding.cwd, this.defaultMode);
            this.wsl.set(key, created);
            return created;
        }
        if (this.local === undefined)
            throw new Error('remote-workspace filesystem is not started yet');
        return this.local;
    }
}
export default RemoteWorkspaceFileSystem;
//# sourceMappingURL=fs.js.map