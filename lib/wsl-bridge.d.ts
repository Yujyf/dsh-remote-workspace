/**
 * Persistent WSL helper process: one bash per distribution, TSV protocol on
 * stdin/stdout. Lifecycle is owned by the remote-workspace service.
 * @module @Yujyf/dsh-remote-workspace
 */
import type { WslDistribution } from './types.ts';
/** One helper response. */
export interface WslHelperResult {
    readonly ok: boolean;
    readonly code?: string;
    readonly payload: Buffer;
}
/**
 * Absolute `wsl.exe` path on Windows, or the bare name when SystemRoot is unset.
 * @returns the executable path used to talk to WSL.
 */
export declare function wslExecutable(): string;
/**
 * List installed WSL distributions. Missing `wsl.exe` yields an empty list.
 * @param timeoutMs - Kill the listing process after this budget.
 * @returns parsed distributions.
 */
/**
 * Terminate one WSL distribution (`wsl.exe --terminate`). Missing wsl.exe is ignored.
 * @param distro - Distribution name.
 * @returns resolution after the process exits.
 */
export declare function terminateWslDistribution(distro: string): Promise<void>;
/**
 * List installed WSL distributions. Missing `wsl.exe` yields an empty list.
 * @param timeoutMs - Kill the listing process after this budget.
 * @returns parsed distributions.
 */
export declare function listWslDistributions(timeoutMs: number): Promise<WslDistribution[]>;
/**
 * Helper operations the WSL filesystem backend needs. {@link WslBridge}
 * implements this; tests supply in-memory doubles.
 */
export interface WslHelperClient {
    /**
     * Run one helper operation and return UTF-8 text.
     * @param op - Protocol verb.
     * @param path - Target path inside the distribution.
     * @param arg - Optional payload.
     * @returns helper payload when ok.
     */
    request(op: string, path: string, arg?: string): Promise<string>;
    /**
     * Run one helper operation and return raw bytes.
     * @param op - Protocol verb.
     * @param path - Target path inside the distribution.
     * @param arg - Optional payload.
     * @returns helper payload bytes when ok.
     */
    requestBytes(op: string, path: string, arg?: string): Promise<Buffer>;
}
/**
 * Persistent helper for one distribution. Dispose kills the bash process.
 */
export declare class WslBridge implements WslHelperClient {
    readonly distro: string;
    private readonly timeoutMs;
    private readonly autoStart;
    private child;
    private buffer;
    private seq;
    private readonly pending;
    private ready;
    /**
     * Resolved by {@link onData} when the helper prints `READY`. The readiness
     * line is consumed by the same line loop that decodes responses, so polling
     * the buffer for it races that consumption: a cold distribution start, where
     * `READY` arrives after the first poll, would otherwise never be observed.
     */
    private readySignal;
    private disposed;
    /**
     * @param distro - Distribution name as reported by `wsl.exe --list`.
     * @param timeoutMs - Per-request budget.
     * @param autoStart - Start a stopped distribution on first use.
     */
    constructor(distro: string, timeoutMs: number, autoStart: boolean);
    /**
     * Ensure the helper is running. Starts a stopped distro when autoStart is set.
     * @returns resolution once READY has been read.
     */
    connect(): Promise<void>;
    /**
     * Run one helper operation.
     * @param op - Protocol verb.
     * @param path - Target path inside the distribution.
     * @param arg - Optional payload (already decoded); WRITE supplies base64 file bytes.
     * @returns helper payload when ok.
     */
    request(op: string, path: string, arg?: string): Promise<string>;
    /**
     * Run one helper operation and return the raw payload bytes.
     * @param op - Protocol verb.
     * @param path - Target path inside the distribution.
     * @param arg - Optional payload bytes encoded as UTF-8 then base64 on the wire.
     * @returns helper payload bytes when ok.
     */
    requestBytes(op: string, path: string, arg?: string): Promise<Buffer>;
    /**
     * Probe the distribution with a trivial command.
     * @returns `ok` when the helper answers.
     */
    ping(): Promise<string>;
    /**
     * Kill the helper. Does not shut down the distribution.
     * @returns resolution after the child exits or is already gone.
     */
    dispose(): Promise<void>;
    private start;
    private ensureStarted;
    /**
     * Await the helper's readiness line, bounded by the configured command budget.
     * @param signal - Resolvers the line loop settles on `READY`, the child
     *   `close`/`error` rejects, and this deadline rejects.
     * @returns resolution once the helper answered.
     */
    private waitReady;
    private onData;
    private failAll;
}
//# sourceMappingURL=wsl-bridge.d.ts.map