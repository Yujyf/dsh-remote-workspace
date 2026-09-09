/**
 * WSL filesystem backend over a persistent helper. Not a Cordis service: the
 * router FileSystem holds one instance per connected distribution.
 * @module @Yujyf/dsh-remote-workspace/src/wsl-fs
 */
import { posix } from 'node:path';
import { FsError, FsTargetKey, FsVersion, } from '@deepseek-ai/dsh-fs';
import { assertNotAborted, decodeTextBytes, detectsCrlf, literalEdit, normalizeLineEndings, restoreLineEndings, withKeyLock, } from "./text-helpers.js";
import { WorkspaceError } from "./errors.js";
import { windowsPathToWslMount } from "./path-mapper.js";
function mapWslError(error, operation, displayPath, signal) {
    if (error instanceof FsError)
        return error;
    if (signal?.aborted === true)
        return new FsError(`${operation} aborted`, 'FS_ABORTED', { cause: error });
    if (error instanceof WorkspaceError) {
        if (error.code === 'PATH_NOT_FOUND') {
            return new FsError(`cannot ${operation} "${displayPath}": not found`, 'FS_NOT_FOUND', { cause: error });
        }
        if (error.code === 'PERMISSION_DENIED') {
            return new FsError(`cannot ${operation} "${displayPath}": permission denied`, 'FS_PERMISSION_DENIED', { cause: error });
        }
        if (error.code === 'TIMEOUT') {
            return new FsError(`${operation} aborted`, 'FS_ABORTED', { cause: error });
        }
    }
    return new FsError(`cannot ${operation} "${displayPath}": ${String(error)}`, 'FS_IO_ERROR', { cause: error });
}
/**
 * WSL-backed filesystem operations used by the remote-workspace FileSystem router.
 */
export class WslFileSystem {
    bridge;
    defaultCwd;
    sandboxMode;
    locks = new Map();
    /**
     * @param bridge - Persistent helper for one distribution.
     * @param defaultCwd - Workspace cwd inside WSL.
     * @param sandboxMode - Deployment default advertised to tools.
     */
    constructor(bridge, defaultCwd, sandboxMode) {
        this.bridge = bridge;
        this.defaultCwd = defaultCwd;
        this.sandboxMode = sandboxMode;
    }
    /**
     * Resolve a path in this WSL world.
     * @param path - Path to resolve.
     * @param opts - Optional cwd and signal.
     * @returns the stable target.
     */
    async resolve(path, opts) {
        assertNotAborted(opts?.signal, 'resolve');
        if (path.trim().length === 0)
            throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND');
        const displayPath = posix.resolve(opts?.cwd ?? this.defaultCwd, path);
        try {
            const canonical = await this.bridge.request('REALPATH', displayPath);
            assertNotAborted(opts?.signal, 'resolve');
            return { targetKey: FsTargetKey(canonical), displayPath: canonical };
        }
        catch (error) {
            throw mapWslError(error, 'resolve', displayPath, opts?.signal);
        }
    }
    /**
     * @param target - Resolved target.
     * @returns the POSIX process path.
     */
    processPath(target) {
        return String(target.targetKey);
    }
    /**
     * @param hostPath - Absolute Windows path.
     * @returns the `/mnt/<drive>/...` path when the host file is a drive path.
     */
    processPathFromHostPath(hostPath) {
        try {
            return windowsPathToWslMount(hostPath);
        }
        catch {
            return undefined;
        }
    }
    /**
     * @param target - Resolved target.
     * @returns a POSIX `file:` URI.
     */
    fileUrl(target) {
        const path = this.processPath(target);
        return `file://${path.split('/').map(segment => encodeURIComponent(segment)).join('/')}`;
    }
    /**
     * @param parent - Directory target.
     * @param child - Candidate target.
     * @returns whether child is parent or a descendant.
     */
    contains(parent, child) {
        const relative = posix.relative(this.processPath(parent), this.processPath(child));
        return relative === '' || (relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative));
    }
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @returns metadata, or undefined when absent.
     */
    async stat(target, signal) {
        assertNotAborted(signal, 'stat');
        const probe = await this.probe(this.processPath(target), target.displayPath, 'STAT', signal);
        if (probe === undefined)
            return undefined;
        return {
            version: probe.version,
            type: probe.kind === 'file' || probe.kind === 'directory' ? probe.kind : 'other',
            ...(probe.kind === 'file' ? { size: probe.size } : {}),
        };
    }
    /**
     * @param path - Path to inspect without following the final symlink.
     * @param opts - Optional cwd.
     * @param signal - Abort signal.
     * @returns metadata, or undefined when absent.
     */
    async lstat(path, opts, signal) {
        assertNotAborted(signal, 'lstat');
        if (path.trim().length === 0)
            throw new FsError('file_path must be a non-empty string', 'FS_NOT_FOUND');
        const displayPath = posix.resolve(opts?.cwd ?? this.defaultCwd, path);
        const probe = await this.probe(displayPath, displayPath, 'LSTAT', signal);
        if (probe === undefined)
            return undefined;
        return {
            version: probe.version,
            type: probe.kind,
            ...(probe.kind === 'file' ? { size: probe.size } : {}),
        };
    }
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @returns decoded UTF-8 text.
     */
    async readText(target, signal) {
        const bytes = await this.readBytes(target, signal, Number.MAX_SAFE_INTEGER);
        return decodeTextBytes(bytes, target.displayPath, bytes.length);
    }
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @returns chunk iterable of the whole text.
     */
    streamText(target, signal) {
        return this.readText(target, signal).then((text) => {
            return {
                [Symbol.asyncIterator]() {
                    let done = false;
                    return {
                        next: () => {
                            if (done)
                                return Promise.resolve({ done: true, value: undefined });
                            done = true;
                            return Promise.resolve({ done: false, value: text });
                        },
                    };
                },
            };
        });
    }
    /**
     * @param target - Resolved target.
     * @param signal - Abort signal.
     * @param maxBytes - Inclusive byte cap.
     * @returns raw bytes.
     */
    async readBytes(target, signal, maxBytes) {
        assertNotAborted(signal, 'read');
        const info = await this.stat(target, signal);
        if (info === undefined)
            throw new FsError(`cannot read "${target.displayPath}": not found`, 'FS_NOT_FOUND');
        if (info.type !== 'file')
            throw new FsError(`cannot read "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE');
        if (info.size !== undefined && info.size > maxBytes) {
            throw new FsError(`cannot read "${target.displayPath}": ${info.size} bytes exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE');
        }
        try {
            const bytes = await this.bridge.requestBytes('READ', this.processPath(target));
            assertNotAborted(signal, 'read');
            if (bytes.byteLength > maxBytes) {
                throw new FsError(`cannot read "${target.displayPath}": ${bytes.byteLength} bytes exceeds the ${maxBytes}-byte limit`, 'FS_TOO_LARGE');
            }
            return bytes;
        }
        catch (error) {
            throw mapWslError(error, 'read', target.displayPath, signal);
        }
    }
    /**
     * Read one byte window without buffering the whole file.
     * @param target - Resolved target.
     * @param range - Zero-based offset and the largest byte count.
     * @param signal - Abort signal.
     * @returns the window's bytes, at most `range.length` long.
     */
    async readByteRange(target, range, signal) {
        assertNotAborted(signal, 'read');
        try {
            const bytes = await this.bridge.requestBytes('READRANGE', this.processPath(target), `${range.offset}:${range.length}`);
            assertNotAborted(signal, 'read');
            return bytes;
        }
        catch (error) {
            throw mapWslError(error, 'read', target.displayPath, signal);
        }
    }
    /**
     * @param target - Directory target.
     * @param signal - Abort signal.
     * @returns children in name order.
     */
    async listDir(target, signal) {
        assertNotAborted(signal, 'list');
        try {
            const payload = await this.bridge.request('LIST', this.processPath(target));
            assertNotAborted(signal, 'list');
            const entries = [];
            for (const line of payload.split('\n')) {
                if (line.length === 0)
                    continue;
                const [name, kind, sizeText] = line.split('\t');
                if (name === undefined || kind === undefined)
                    continue;
                const type = kind === 'd' ? 'directory' : kind === 'f' ? 'file' : 'other';
                const childPath = posix.join(this.processPath(target), name);
                const size = Number(sizeText);
                entries.push({
                    name,
                    type,
                    target: { targetKey: FsTargetKey(childPath), displayPath: childPath },
                    ...(Number.isFinite(size) ? { size } : {}),
                });
            }
            return entries;
        }
        catch (error) {
            throw mapWslError(error, 'list', target.displayPath, signal);
        }
    }
    /**
     * @param target - Target to write.
     * @param content - UTF-8 text.
     * @param expected - Optional write guard.
     * @param signal - Abort signal.
     * @param sandboxPolicy - Per-call sandbox policy.
     * @returns write outcome.
     */
    async writeText(target, content, expected, signal, sandboxPolicy) {
        this.assertWritable(target, sandboxPolicy);
        return withKeyLock(this.locks, String(target.targetKey), async () => {
            // The guard chain mirrors the local backend's, but the version token and
            // the atomic publication come from the helper: probe→guard→write→re-probe
            // runs as one serialized critical section per target key.
            const existing = await this.probe(this.processPath(target), target.displayPath, 'STAT', signal);
            if (existing && existing.kind !== 'file') {
                throw new FsError(`cannot write "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE');
            }
            if (expected?.kind === 'replaceIfVersion' && (!existing || existing.version !== expected.version)) {
                throw new FsError(`cannot write "${target.displayPath}": ${existing ? 'file changed since it was read' : 'file no longer exists'}`, 'FS_STALE_VERSION');
            }
            if (expected?.kind === 'createIfAbsent' && existing) {
                throw new FsError(`cannot overwrite existing "${target.displayPath}" without reading it first`, 'FS_NOT_OBSERVED');
            }
            const before = existing ? normalizeLineEndings(await this.readText(target, signal)) : null;
            try {
                await this.bridge.request('WRITE', this.processPath(target), content);
            }
            catch (error) {
                throw mapWslError(error, 'write', target.displayPath, signal);
            }
            const after = await this.probe(this.processPath(target), target.displayPath, 'STAT', signal);
            return {
                operation: existing ? 'update' : 'create',
                version: after?.version ?? FsVersion(`missing:${target.targetKey}`),
                before,
                after: normalizeLineEndings(content),
            };
        });
    }
    /**
     * @param target - Target to edit.
     * @param edit - Literal replacement.
     * @param expected - Optional version guard.
     * @param signal - Abort signal.
     * @param sandboxPolicy - Per-call sandbox policy.
     * @returns edit outcome.
     */
    async editText(target, edit, expected, signal, sandboxPolicy) {
        this.assertWritable(target, sandboxPolicy);
        return withKeyLock(this.locks, String(target.targetKey), async () => {
            const existing = await this.probe(this.processPath(target), target.displayPath, 'STAT', signal);
            if (!existing)
                throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION');
            if (existing.kind !== 'file')
                throw new FsError(`cannot edit "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE');
            if (expected && existing.version !== expected.version) {
                throw new FsError(`cannot edit "${target.displayPath}": file changed since it was read`, 'FS_STALE_VERSION');
            }
            const original = await this.readText(target, signal);
            const crlf = detectsCrlf(original);
            const normalized = normalizeLineEndings(original);
            const edited = literalEdit(normalized, edit, target.displayPath);
            const content = restoreLineEndings(edited, crlf);
            try {
                await this.bridge.request('WRITE', this.processPath(target), content);
            }
            catch (error) {
                throw mapWslError(error, 'edit', target.displayPath, signal);
            }
            const after = await this.probe(this.processPath(target), target.displayPath, 'STAT', signal);
            return {
                version: after?.version ?? FsVersion(`missing:${target.targetKey}`),
                before: normalized,
                after: edited,
            };
        });
    }
    assertWritable(target, sandboxPolicy) {
        const mode = sandboxPolicy?.mode ?? this.sandboxMode;
        if (mode === undefined || mode === 'danger-full-access')
            return;
        if (mode === 'read-only') {
            throw new FsError(`cannot write "${target.displayPath}": file access denied under read-only mode`, 'FS_SANDBOX_DENIED');
        }
        const root = sandboxPolicy?.workspaceRoot ?? this.defaultCwd;
        const path = this.processPath(target);
        const prefix = root.endsWith('/') ? root : `${root}/`;
        if (path === root || path.startsWith(prefix) || path === '/tmp' || path.startsWith('/tmp/'))
            return;
        throw new FsError(`cannot write "${target.displayPath}": file access denied under workspace-write mode`, 'FS_SANDBOX_DENIED');
    }
    async probe(path, displayPath, op, signal) {
        try {
            const payload = await this.bridge.request(op, path);
            assertNotAborted(signal, op.toLowerCase());
            const [kind, sizeText, mtime, ino, mode] = payload.split('\t');
            if (kind === undefined)
                return undefined;
            const size = Number(sizeText);
            return {
                kind: kind === 'file' || kind === 'directory' || kind === 'symlink' ? kind : 'other',
                size: Number.isFinite(size) ? size : 0,
                version: FsVersion(`wsl:${ino ?? '0'}:${sizeText ?? '0'}:${mtime ?? '0'}:${mode ?? '0'}`),
            };
        }
        catch (error) {
            if (error instanceof WorkspaceError && error.code === 'PATH_NOT_FOUND')
                return undefined;
            throw mapWslError(error, op.toLowerCase(), displayPath, signal);
        }
    }
}
//# sourceMappingURL=wsl-fs.js.map