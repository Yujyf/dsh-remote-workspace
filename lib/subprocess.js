/**
 * Subprocess router for remote workspaces. Isolates the shipped local backend
 * and wraps WSL-bound spawns with `wsl.exe --distribution` / `--cd`.
 * @module @Yujyf/dsh-remote-workspace
 */
import { homedir } from 'node:os';
import { Service } from '@deepseek-ai/cordis';
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local';
import { wslExecutable } from "./wsl-bridge.js";
import { windowsPathToWslMount } from "./path-mapper.js";
/**
 * `ctx.subprocess` implementation that routes by the current remote-workspace
 * binding. Unbound sessions use the isolated local backend unchanged.
 */
export class RemoteWorkspaceSubprocessRuntime extends SubprocessRuntime {
    static inject = ['remoteWorkspace'];
    local;
    /**
     * Isolate the shipped local subprocess backend on a private realm. The
     * backend instance is captured through `ctx.inject()`: the isolated realm's
     * `subprocess` is a different implementation from this router, and reading
     * it back through this context's property proxy would resolve the router's
     * own service.
     */
    async [Service.init]() {
        const localCtx = this.ctx.isolate('subprocess');
        let captured;
        localCtx.inject(['subprocess'], (subprocessCtx) => { captured = subprocessCtx.subprocess; });
        await localCtx.plugin(LocalSubprocessRuntime);
        if (captured === undefined || captured === this) {
            throw new Error('remote-workspace subprocess: the isolated local backend did not start');
        }
        this.local = captured;
    }
    async resolveExecutable(command, env, signal) {
        const binding = this.ctx.remoteWorkspace.currentBinding();
        if (binding?.target.type === 'wsl' && binding.bridge !== undefined) {
            signal?.throwIfAborted();
            return await binding.bridge.request('WHICH', command);
        }
        return await this.requireLocal().resolveExecutable(command, env, signal);
    }
    spawn(spec) {
        const binding = this.ctx.remoteWorkspace.currentBinding();
        if (binding?.target.type === 'wsl') {
            return this.requireLocal().spawn({
                ...spec,
                argv: wslExecArgv(binding, spec.argv, spec.cwd),
                cwd: homedir(),
            });
        }
        return this.requireLocal().spawn(spec);
    }
    spawnTerminal(spec) {
        const binding = this.ctx.remoteWorkspace.currentBinding();
        if (binding?.target.type === 'wsl') {
            const distro = binding.target.metadata?.distribution ?? binding.target.displayName;
            const cwd = linuxCwd(binding, spec.cwd);
            return this.requireLocal().spawnTerminal({
                ...spec,
                argv: [wslExecutable(), '--distribution', distro, '--cd', cwd],
                cwd: homedir(),
            });
        }
        return this.requireLocal().spawnTerminal(spec);
    }
    requireLocal() {
        if (this.local === undefined)
            throw new Error('remote-workspace subprocess is not started yet');
        return this.local;
    }
}
/**
 * Build `wsl.exe --distribution --cd --exec ...` argv for one spawn.
 * @param binding - WSL execution binding.
 * @param argv - Execution-world argv.
 * @param cwd - Requested cwd, Windows or POSIX.
 * @returns host argv that launches the command inside WSL.
 */
export function wslExecArgv(binding, argv, cwd) {
    const distro = binding.target.metadata?.distribution ?? binding.target.displayName;
    return [wslExecutable(), '--distribution', distro, '--cd', linuxCwd(binding, cwd), '--exec', ...argv];
}
/**
 * Translate a spawn cwd into a POSIX path for `--cd`.
 * @param binding - WSL binding whose workspace cwd is the fallback.
 * @param cwd - Requested cwd.
 * @returns a POSIX path.
 */
export function linuxCwd(binding, cwd) {
    if (cwd.startsWith('/'))
        return cwd;
    const mapped = binding.pathMapper.toTargetPath(cwd) ?? windowsPathToWslMountSafe(cwd);
    return mapped ?? binding.cwd;
}
function windowsPathToWslMountSafe(cwd) {
    try {
        return windowsPathToWslMount(cwd);
    }
    catch {
        return undefined;
    }
}
export default RemoteWorkspaceSubprocessRuntime;
//# sourceMappingURL=subprocess.js.map