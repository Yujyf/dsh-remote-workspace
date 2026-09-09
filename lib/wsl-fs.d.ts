/**
 * WSL filesystem backend over a persistent helper. Not a Cordis service: the
 * router FileSystem holds one instance per connected distribution.
 * @module @Yujyf/dsh-remote-workspace/src/wsl-fs
 */
import { FsVersion } from '@deepseek-ai/dsh-fs';
import type { FsDirEntry, FsEditOutcome, FsEditRequest, FsInfo, FsPathInfo, FsTarget, FsWriteIntent, FsWriteOutcome } from '@deepseek-ai/dsh-fs';
import type { SandboxExecutionPolicy, SandboxMode } from '@deepseek-ai/dsh-sandbox';
import type { WslHelperClient } from './wsl-bridge.ts';
/**
 * WSL-backed filesystem operations used by the remote-workspace FileSystem router.
 */
export declare class WslFileSystem {
    private readonly bridge;
    private readonly defaultCwd;
    readonly sandboxMode: SandboxMode | undefined;
    private readonly locks;
    /**
     * @param bridge - Persistent helper for one distribution.
     * @param defaultCwd - Workspace cwd inside WSL.
     * @param sandboxMode - Deployment default advertised to tools.
     */
    constructor(bridge: WslHelperClient, defaultCwd: string, sandboxMode: SandboxMode | undefined);
    /**
     * Resolve a path in this WSL world.
     * @param path - Path to resolve.
     * @param opts - Optional cwd and signal.
     * @returns the stable target.
     */
    resolve(path: string, opts?: {
        cwd?: string;
        signal?: AbortSignal;
    }): Promise<FsTarget>;
    /**
     * @param target - Resolved target.
     * @returns the POSIX process path.
     */
    processPath(target: FsTarget): string;
    /**
     * @param hostPath - Absolute Windows path.
     * @returns the `/mnt/<drive>/...` path when the host file is a drive path.
     */
    processPathFromHostPath(hostPath: string): string | undefined;
    /**
     * @param target - Resolved target.
     * @returns a POSIX `file:` URI.
     */
    fileUrl(target: FsTarget): string;
    /**
     * @param parent - Directory target.
     * @param child - Candidate target.
     * @returns whether child is parent or a descendant.
     */
    contains(parent: FsTarget, child: FsTarget): boolean;
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @returns metadata, or undefined when absent.
     */
    stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>;
    /**
     * @param path - Path to inspect without following the final symlink.
     * @param opts - Optional cwd.
     * @param signal - Abort signal.
     * @returns metadata, or undefined when absent.
     */
    lstat(path: string, opts?: {
        cwd?: string;
    }, signal?: AbortSignal): Promise<FsPathInfo | undefined>;
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @returns decoded UTF-8 text.
     */
    readText(target: FsTarget, signal?: AbortSignal): Promise<string>;
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @returns chunk iterable of the whole text.
     */
    streamText(target: FsTarget, signal?: AbortSignal): Promise<AsyncIterable<string>>;
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @param maxBytes - Inclusive byte cap.
     * @returns raw bytes.
     */
    readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>;
    /**
     * Read one byte window without buffering the whole file.
     * @param target - Resolved target.
     * @param range - Zero-based offset and the largest byte count.
     * @param signal - Abort signal.
     * @returns the window's bytes, at most `range.length` long.
     */
    readByteRange(target: FsTarget, range: {
        offset: number;
        length: number;
    }, signal?: AbortSignal): Promise<Uint8Array>;
    /**
     * @param target - Directory target.
     * @param signal - Abort signal.
     * @returns children in name order.
     */
    listDir(target: FsTarget, signal?: AbortSignal): Promise<FsDirEntry[]>;
    /**
     * @param target - Target to write.
     * @param content - UTF-8 text.
     * @param expected - Optional write guard.
     * @param signal - Abort signal.
     * @param sandboxPolicy - Per-call sandbox policy.
     * @returns write outcome.
     */
    writeText(target: FsTarget, content: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsWriteOutcome>;
    /**
     * @param target - Target to edit.
     * @param edit - Literal replacement.
     * @param expected - Optional version guard.
     * @param signal - Abort signal.
     * @param sandboxPolicy - Per-call sandbox policy.
     * @returns edit outcome.
     */
    editText(target: FsTarget, edit: FsEditRequest, expected?: {
        version: FsVersion;
    }, signal?: AbortSignal, sandboxPolicy?: SandboxExecutionPolicy): Promise<FsEditOutcome>;
    private assertWritable;
    private probe;
}
//# sourceMappingURL=wsl-fs.d.ts.map