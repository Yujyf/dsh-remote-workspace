/**
 * FileSystem router for remote workspaces. Isolates the shipped sandboxed
 * local backend and delegates WSL-bound sessions to a helper-backed filesystem.
 * @module @Yujyf/dsh-remote-workspace
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { FileSystem } from '@deepseek-ai/dsh-fs';
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local';
import type { FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsVersion, FsWriteIntent, FsWriteOutcome } from '@deepseek-ai/dsh-fs';
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox';
export type Config = LocalConfig;
/** Router config: the local backend's knobs verbatim, applied to the isolated sandboxed backend. */
export declare const Config: z<Config>;
/**
 * `ctx.fs` implementation that routes by the current remote-workspace binding.
 * Unbound sessions use the isolated local sandboxed backend unchanged. The
 * owner is read with `ctx.get('remoteWorkspace')` (optional-service access):
 * the router composes beside it, and agentless host calls have no binding.
 */
export declare class RemoteWorkspaceFileSystem extends FileSystem {
    static inject: string[];
    static Config: z<LocalConfig>;
    private local;
    private readonly wsl;
    private readonly localConfig;
    private readonly defaultMode;
    /** @param ctx - Host context. */
    constructor(ctx: Context, config: Config);
    get sandboxMode(): SandboxMode;
    /**
     * Isolate the shipped sandboxed local backend on a private `fs` realm. The
     * backend instance is captured through `ctx.inject()`: the isolated realm's
     * `fs` is a different implementation from this router, and reading it back
     * through this context's property proxy would resolve the router's own service.
     */
    protected [Service.init](): Promise<void>;
    resolve(path: string, opts?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<FsTarget>;
    processPath(target: FsTarget): string;
    processPathFromHostPath(hostPath: string): string | undefined;
    fileUrl(target: FsTarget): string;
    contains(parent: FsTarget, child: FsTarget): boolean;
    stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>;
    lstat(path: string, opts?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<FsPathInfo | undefined>;
    readText(target: FsTarget, signal?: AbortSignal): Promise<string>;
    streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>;
    readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    readByteRange(target: FsTarget, range: {
        offset: number;
        length: number;
    }, signal?: AbortSignal): Promise<Uint8Array>;
    listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>;
    writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
    editText(target: FsTarget, edit: FsEditRequest, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
    private backend;
}
export default RemoteWorkspaceFileSystem;
//# sourceMappingURL=fs.d.ts.map