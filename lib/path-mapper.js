/**
 * Cross-environment path mapping. Mapping is explicit conversion, never the
 * default filesystem backend.
 * @module @Yujyf/dsh-remote-workspace
 */
import { normalizePosixPath, normalizeWindowsPath } from "./uri.js";
const MNT_DRIVE = /^\/mnt\/([a-z])(?:\/(.*))?$/i;
/**
 * Convert a WSL path under `/mnt/<drive>/` into a Windows path. Paths outside
 * that prefix have no host mapping through this lexical converter.
 * @param targetPath - Absolute POSIX path in a WSL distribution.
 * @returns the Windows path, or `undefined` when the path is not a drive mount.
 */
export function wslPathToWindowsMount(targetPath) {
    const canonical = normalizePosixPath(targetPath);
    const match = MNT_DRIVE.exec(canonical);
    if (match === null)
        return undefined;
    const drive = match[1]?.toUpperCase();
    if (drive === undefined)
        return undefined;
    const rest = match[2] ?? '';
    return rest.length === 0 ? `${drive}:\\` : normalizeWindowsPath(`${drive}:\\${rest.replaceAll('/', '\\')}`);
}
/**
 * Convert a fully qualified Windows path into the WSL mount path `/mnt/<drive>/...`.
 * @param hostPath - Canonical Windows path `D:\dir`.
 * @returns the POSIX mount path.
 */
export function windowsPathToWslMount(hostPath) {
    const canonical = normalizeWindowsPath(hostPath);
    const drive = canonical[0]?.toLowerCase() ?? '';
    if (canonical.length === 3)
        return `/mnt/${drive}`;
    return `/mnt/${drive}${canonical.slice(2).replaceAll('\\', '/')}`;
}
/**
 * Convert a WSL native path into a Windows UNC path for the given distribution.
 * This is mapping only: it is not a filesystem backend.
 * @param distro - WSL distribution name.
 * @param targetPath - Absolute POSIX path.
 * @returns `\\wsl.localhost\<distro>\...`.
 */
export function wslPathToUnc(distro, targetPath) {
    const canonical = normalizePosixPath(targetPath);
    if (canonical === '/')
        return `\\\\wsl.localhost\\${distro}\\`;
    return `\\\\wsl.localhost\\${distro}${canonical.replaceAll('/', '\\')}`;
}
/**
 * Host path that views the same directory as a workspace URI. DSH's own
 * workspace registry only accepts directories the harness process can resolve,
 * so a WSL workspace reaches it through the distribution's UNC share.
 * @param uri - canonical workspace URI record.
 * @returns the host path, or `undefined` for a target type with no host view.
 */
export function hostPathOfWorkspace(uri) {
    if (uri.type === 'local')
        return uri.path;
    if (uri.type === 'wsl')
        return wslPathToUnc(uri.authority, uri.path);
    return undefined;
}
/**
 * Whether two UNC spellings name the same share path. Windows comparisons are
 * case-insensitive and separator-insensitive, and a trailing separator is not
 * identity.
 * @param left - first UNC path.
 * @param right - second UNC path.
 * @returns true when both canonicals match.
 */
export function uncPathsEqual(left, right) {
    return canonicalUncPath(left) === canonicalUncPath(right);
}
function canonicalUncPath(path) {
    return path.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase();
}
/**
 * Identity mapper for the local Windows/POSIX host.
 * @returns a mapper that returns the input path unchanged when it is absolute.
 */
export function localPathMapper() {
    return {
        toHostPath(targetPath) {
            return targetPath;
        },
        toTargetPath(hostPath) {
            return hostPath;
        },
    };
}
/**
 * WSL mapper: Windows drive letters become `/mnt/<drive>`, and `/mnt/<drive>`
 * becomes a Windows path. Other POSIX paths have no host mapping.
 * @returns a WSL path mapper.
 */
export function wslPathMapper() {
    return {
        toHostPath(targetPath) {
            return wslPathToWindowsMount(targetPath);
        },
        toTargetPath(hostPath) {
            try {
                return windowsPathToWslMount(hostPath);
            }
            catch {
                return undefined;
            }
        },
    };
}
//# sourceMappingURL=path-mapper.js.map