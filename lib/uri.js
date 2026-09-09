/**
 * Workspace URI parse, normalize, and native-path conversion.
 *
 * Canonical href examples:
 * - `local://windows/D:/workspace/demo`
 * - `wsl://Ubuntu/home/cf220/workspace/demo`
 *
 * Trailing slashes are not identity. Distro names are percent-decoded once.
 * @module @Yujyf/dsh-remote-workspace
 */
import { posix } from 'node:path';
import { WorkspaceError } from "./errors.js";
const SCHEME_TYPES = new Set([
    'local',
    'wsl',
    'ssh',
    'docker',
    'podman',
    'kubernetes',
]);
const WINDOWS_DRIVE = /^([A-Za-z]):(?:\/|\\|$)/;
const WINDOWS_NATIVE = /^[A-Za-z]:[\\/]/;
const UNC_WSL = /^\\{2}wsl(?:\.localhost|\$)\\([^\\]+)(?:\\(.*))?$/i;
/**
 * Normalize a POSIX absolute path: collapse `.` / `..`, reject NUL, and drop a
 * trailing slash except for `/`.
 * @param path - Absolute POSIX path, with or without a trailing slash.
 * @returns the canonical POSIX path.
 */
export function normalizePosixPath(path) {
    if (path.includes('\0')) {
        throw new WorkspaceError('workspace path contains NUL', 'UNSUPPORTED');
    }
    if (!path.startsWith('/')) {
        throw new WorkspaceError(`POSIX path is not absolute: '${path}'`, 'UNSUPPORTED', { path });
    }
    const parts = [];
    for (const segment of path.split('/')) {
        if (segment === '' || segment === '.')
            continue;
        if (segment === '..') {
            parts.pop();
            continue;
        }
        parts.push(segment);
    }
    return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}
/**
 * Normalize a Windows absolute path to `D:\dir` form with an uppercase drive
 * letter and no trailing slash except `D:\`.
 * @param path - `D:\dir`, `D:/dir`, or `D:`.
 * @returns the canonical Windows path.
 */
export function normalizeWindowsPath(path) {
    if (path.includes('\0')) {
        throw new WorkspaceError('workspace path contains NUL', 'UNSUPPORTED');
    }
    const slash = path.replaceAll('/', '\\');
    const match = WINDOWS_DRIVE.exec(slash);
    if (match === null) {
        throw new WorkspaceError(`Windows path is not fully qualified: '${path}'`, 'UNSUPPORTED', { path });
    }
    const drive = match[1];
    if (drive === undefined) {
        throw new WorkspaceError(`Windows path is not fully qualified: '${path}'`, 'UNSUPPORTED', { path });
    }
    const upperDrive = drive.toUpperCase();
    const rest = slash.slice(match[0].length);
    const posixRest = normalizePosixPath(`/${rest.replaceAll('\\', '/')}`);
    if (posixRest === '/')
        return `${upperDrive}:\\`;
    return `${upperDrive}:${posixRest.replaceAll('/', '\\')}`;
}
/**
 * Encode a Windows path as the URI path segment `/D:/dir`.
 * @param windowsPath - Canonical `D:\dir` path.
 * @returns the URI path including the leading slash.
 */
export function windowsPathToUriPath(windowsPath) {
    const canonical = normalizeWindowsPath(windowsPath);
    if (canonical.length === 3)
        return `/${canonical[0]}:/`;
    return `/${canonical[0]}:${canonical.slice(2).replaceAll('\\', '/')}`;
}
/**
 * Decode a URI path `/D:/dir` into a canonical Windows path.
 * @param uriPath - URI path from a `local://` href.
 * @returns the canonical Windows path.
 */
export function uriPathToWindowsPath(uriPath) {
    const match = /^\/([A-Za-z]):(?:\/(.*))?$/.exec(uriPath);
    if (match === null) {
        throw new WorkspaceError(`local URI path is not a Windows drive path: '${uriPath}'`, 'UNSUPPORTED', {
            path: uriPath,
        });
    }
    const rest = match[2] ?? '';
    return normalizeWindowsPath(`${match[1]}:\\${rest.replaceAll('/', '\\')}`);
}
/**
 * Build the canonical href for a parsed URI.
 * @param type - Target type / URI scheme.
 * @param authority - Unencoded authority (distro name, `windows`, …).
 * @param path - Canonical native path.
 * @returns the stable href.
 */
export function formatWorkspaceUri(type, authority, path) {
    const encodedAuthority = encodeURIComponent(authority);
    if (type === 'local')
        return `local://${encodedAuthority}${windowsPathToUriPath(path)}`;
    const posixPath = normalizePosixPath(path);
    return `${type}://${encodedAuthority}${posixPath === '/' ? '/' : posixPath}`;
}
/**
 * Parse and canonicalize a workspace URI. Trailing slashes do not change identity.
 * @param value - Absolute workspace URI.
 * @returns the canonical URI record.
 */
export function parseWorkspaceUri(value) {
    const separator = value.indexOf('://');
    if (separator <= 0) {
        throw new WorkspaceError(`not a workspace URI: '${value}'`, 'UNSUPPORTED', { uri: value });
    }
    const scheme = value.slice(0, separator);
    if (!SCHEME_TYPES.has(scheme)) {
        throw new WorkspaceError(`unsupported workspace URI scheme: '${scheme}'`, 'UNSUPPORTED', { uri: value });
    }
    const type = scheme;
    const rest = value.slice(separator + 3);
    const slash = rest.indexOf('/');
    const encodedAuthority = slash === -1 ? rest : rest.slice(0, slash);
    if (encodedAuthority.length === 0) {
        throw new WorkspaceError(`workspace URI is missing an authority: '${value}'`, 'UNSUPPORTED', { uri: value });
    }
    let authority;
    try {
        authority = decodeURIComponent(encodedAuthority);
    }
    catch (error) {
        throw new WorkspaceError(`workspace URI authority is not valid percent-encoding: '${value}'`, 'UNSUPPORTED', { uri: value }, { cause: error });
    }
    if (slash === -1) {
        throw new WorkspaceError(`workspace URI is missing a path: '${value}'`, 'UNSUPPORTED', { uri: value });
    }
    const rawPath = rest.slice(slash);
    if (type === 'local') {
        const stripped = /^\/[A-Za-z]:\/$/.test(rawPath) || !rawPath.endsWith('/')
            ? rawPath
            : rawPath.slice(0, -1);
        const path = uriPathToWindowsPath(stripped);
        const href = formatWorkspaceUri(type, authority, path);
        return { type, authority, path, href };
    }
    const trimmed = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
    const path = normalizePosixPath(trimmed);
    const href = formatWorkspaceUri(type, authority, path);
    return { type, authority, path, href };
}
/**
 * Whether two URI spellings name the same workspace.
 * @param left - First URI.
 * @param right - Second URI.
 * @returns true when canonical hrefs match.
 */
export function workspaceUriEquals(left, right) {
    return parseWorkspaceUri(left).href === parseWorkspaceUri(right).href;
}
/**
 * Build a workspace URI from a target and a native path.
 * @param type - Target type.
 * @param authority - Target authority.
 * @param nativePath - Path in the target's native spelling.
 * @returns the canonical URI record.
 */
export function workspaceUriFromNative(type, authority, nativePath) {
    if (type === 'local') {
        const path = WINDOWS_NATIVE.test(nativePath) || WINDOWS_DRIVE.test(nativePath)
            ? normalizeWindowsPath(nativePath)
            : nativePath;
        const href = formatWorkspaceUri(type, authority, path);
        return { type, authority, path, href };
    }
    const path = normalizePosixPath(nativePath);
    const href = formatWorkspaceUri(type, authority, path);
    return { type, authority, path, href };
}
/**
 * Parse a Windows UNC WSL path into a workspace URI when the form is
 * `\\wsl.localhost\<distro>\...` or `\\wsl$\<distro>\...`.
 * @param unc - Windows UNC path.
 * @returns the WSL URI, or `undefined` when the UNC is not a WSL path.
 */
export function workspaceUriFromWslUnc(unc) {
    const normalized = unc.replaceAll('/', '\\');
    const match = UNC_WSL.exec(normalized);
    if (match === null)
        return undefined;
    const distro = match[1] ?? '';
    const rest = (match[2] ?? '').replaceAll('\\', '/');
    const path = normalizePosixPath(rest.length === 0 ? '/' : `/${rest}`);
    return workspaceUriFromNative('wsl', distro, path);
}
/**
 * Default title for a workspace URI: the final path segment, or the root spelling.
 * @param uri - Canonical URI record.
 * @returns a non-empty display title.
 */
export function defaultRemoteWorkspaceTitle(uri) {
    if (uri.type === 'local') {
        const base = posix.basename(uri.path.replaceAll('\\', '/'));
        return base.length === 0 ? uri.path : base;
    }
    const base = posix.basename(uri.path);
    return base.length === 0 ? uri.path : base;
}
//# sourceMappingURL=uri.js.map