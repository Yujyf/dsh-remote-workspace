/**
 * Cross-environment path mapping. Mapping is explicit conversion, never the
 * default filesystem backend.
 * @module @Yujyf/dsh-remote-workspace
 */
/**
 * Convert a WSL path under `/mnt/<drive>/` into a Windows path. Paths outside
 * that prefix have no host mapping through this lexical converter.
 * @param targetPath - Absolute POSIX path in a WSL distribution.
 * @returns the Windows path, or `undefined` when the path is not a drive mount.
 */
export declare function wslPathToWindowsMount(targetPath: string): string | undefined;
/**
 * Convert a fully qualified Windows path into the WSL mount path `/mnt/<drive>/...`.
 * @param hostPath - Canonical Windows path `D:\dir`.
 * @returns the POSIX mount path.
 */
export declare function windowsPathToWslMount(hostPath: string): string;
/**
 * Convert a WSL native path into a Windows UNC path for the given distribution.
 * This is mapping only: it is not a filesystem backend.
 * @param distro - WSL distribution name.
 * @param targetPath - Absolute POSIX path.
 * @returns `\\wsl.localhost\<distro>\...`.
 */
export declare function wslPathToUnc(distro: string, targetPath: string): string;
/**
 * Path mapper for one connected target. Local mapping is identity; WSL mapping
 * converts `/mnt/<drive>` mounts and optional UNC spellings.
 */
export interface PathMapper {
    /**
     * Map a target-native path onto a host path when the two identify the same file.
     * @param targetPath - Path in the target execution world.
     * @returns the host path, or `undefined` when the target file is not on the host.
     */
    toHostPath(targetPath: string): string | undefined;
    /**
     * Map a host path onto a target-native path when the target can open it.
     * @param hostPath - Absolute host path.
     * @returns the target path, or `undefined` when the host file is not visible.
     */
    toTargetPath(hostPath: string): string | undefined;
}
/**
 * Identity mapper for the local Windows/POSIX host.
 * @returns a mapper that returns the input path unchanged when it is absolute.
 */
export declare function localPathMapper(): PathMapper;
/**
 * WSL mapper: Windows drive letters become `/mnt/<drive>`, and `/mnt/<drive>`
 * becomes a Windows path. Other POSIX paths have no host mapping.
 * @returns a WSL path mapper.
 */
export declare function wslPathMapper(): PathMapper;
//# sourceMappingURL=path-mapper.d.ts.map