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
import type { WorkspaceTargetType, WorkspaceUri } from './types.ts';
/**
 * Normalize a POSIX absolute path: collapse `.` / `..`, reject NUL, and drop a
 * trailing slash except for `/`.
 * @param path - Absolute POSIX path, with or without a trailing slash.
 * @returns the canonical POSIX path.
 */
export declare function normalizePosixPath(path: string): string;
/**
 * Normalize a Windows absolute path to `D:\dir` form with an uppercase drive
 * letter and no trailing slash except `D:\`.
 * @param path - `D:\dir`, `D:/dir`, or `D:`.
 * @returns the canonical Windows path.
 */
export declare function normalizeWindowsPath(path: string): string;
/**
 * Encode a Windows path as the URI path segment `/D:/dir`.
 * @param windowsPath - Canonical `D:\dir` path.
 * @returns the URI path including the leading slash.
 */
export declare function windowsPathToUriPath(windowsPath: string): string;
/**
 * Decode a URI path `/D:/dir` into a canonical Windows path.
 * @param uriPath - URI path from a `local://` href.
 * @returns the canonical Windows path.
 */
export declare function uriPathToWindowsPath(uriPath: string): string;
/**
 * Build the canonical href for a parsed URI.
 * @param type - Target type / URI scheme.
 * @param authority - Unencoded authority (distro name, `windows`, …).
 * @param path - Canonical native path.
 * @returns the stable href.
 */
export declare function formatWorkspaceUri(type: WorkspaceTargetType, authority: string, path: string): string;
/**
 * Parse and canonicalize a workspace URI. Trailing slashes do not change identity.
 * @param value - Absolute workspace URI.
 * @returns the canonical URI record.
 */
export declare function parseWorkspaceUri(value: string): WorkspaceUri;
/**
 * Whether two URI spellings name the same workspace.
 * @param left - First URI.
 * @param right - Second URI.
 * @returns true when canonical hrefs match.
 */
export declare function workspaceUriEquals(left: string, right: string): boolean;
/**
 * Build a workspace URI from a target and a native path.
 * @param type - Target type.
 * @param authority - Target authority.
 * @param nativePath - Path in the target's native spelling.
 * @returns the canonical URI record.
 */
export declare function workspaceUriFromNative(type: WorkspaceTargetType, authority: string, nativePath: string): WorkspaceUri;
/**
 * Parse a Windows UNC WSL path into a workspace URI when the form is
 * `\\wsl.localhost\<distro>\...` or `\\wsl$\<distro>\...`.
 * @param unc - Windows UNC path.
 * @returns the WSL URI, or `undefined` when the UNC is not a WSL path.
 */
export declare function workspaceUriFromWslUnc(unc: string): WorkspaceUri | undefined;
/**
 * Default title for a workspace URI: the final path segment, or the root spelling.
 * @param uri - Canonical URI record.
 * @returns a non-empty display title.
 */
export declare function defaultRemoteWorkspaceTitle(uri: WorkspaceUri): string;
//# sourceMappingURL=uri.d.ts.map