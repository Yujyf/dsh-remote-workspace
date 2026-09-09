/**
 * Subprocess router for remote workspaces. Isolates the shipped local backend
 * and wraps WSL-bound spawns with `wsl.exe --distribution` / `--cd`.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Service } from '@deepseek-ai/cordis';
import { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import type { SubprocessHandle, SubprocessSpawnSpec, SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess';
import type { ExecutionBinding } from './index.ts';
/**
 * `ctx.subprocess` implementation that routes by the current remote-workspace
 * binding. Unbound sessions use the isolated local backend unchanged.
 */
export declare class RemoteWorkspaceSubprocessRuntime extends SubprocessRuntime {
    static inject: string[];
    private local;
    /**
     * Isolate the shipped local subprocess backend on a private realm. The
     * backend instance is captured through `ctx.inject()`: the isolated realm's
     * `subprocess` is a different implementation from this router, and reading
     * it back through this context's property proxy would resolve the router's
     * own service.
     */
    protected [Service.init](): Promise<void>;
    resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>;
    spawn(spec: SubprocessSpawnSpec): SubprocessHandle;
    spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>;
    private requireLocal;
}
/**
 * Build `wsl.exe --distribution --cd --exec ...` argv for one spawn.
 * @param binding - WSL execution binding.
 * @param argv - Execution-world argv.
 * @param cwd - Requested cwd, Windows or POSIX.
 * @returns host argv that launches the command inside WSL.
 */
export declare function wslExecArgv(binding: ExecutionBinding, argv: readonly string[], cwd: string): string[];
/**
 * Translate a spawn cwd into a POSIX path for `--cd`.
 * @param binding - WSL binding whose workspace cwd is the fallback.
 * @param cwd - Requested cwd.
 * @returns a POSIX path.
 */
export declare function linuxCwd(binding: ExecutionBinding, cwd: string): string;
export default RemoteWorkspaceSubprocessRuntime;
//# sourceMappingURL=subprocess.d.ts.map