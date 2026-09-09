/**
 * Cross-environment path mapping. Mapping is explicit conversion, never the
 * default filesystem backend.
 * @module @Yujyf/dsh-remote-workspace
 */

import { normalizePosixPath, normalizeWindowsPath } from './uri.ts'

const MNT_DRIVE = /^\/mnt\/([a-z])(?:\/(.*))?$/i

/**
 * Convert a WSL path under `/mnt/<drive>/` into a Windows path. Paths outside
 * that prefix have no host mapping through this lexical converter.
 * @param targetPath - Absolute POSIX path in a WSL distribution.
 * @returns the Windows path, or `undefined` when the path is not a drive mount.
 */
export function wslPathToWindowsMount(targetPath: string): string | undefined {
  const canonical = normalizePosixPath(targetPath)
  const match = MNT_DRIVE.exec(canonical)
  if (match === null) return undefined
  const drive = match[1]?.toUpperCase()
  if (drive === undefined) return undefined
  const rest = match[2] ?? ''
  return rest.length === 0 ? `${drive}:\\` : normalizeWindowsPath(`${drive}:\\${rest.replaceAll('/', '\\')}`)
}

/**
 * Convert a fully qualified Windows path into the WSL mount path `/mnt/<drive>/...`.
 * @param hostPath - Canonical Windows path `D:\dir`.
 * @returns the POSIX mount path.
 */
export function windowsPathToWslMount(hostPath: string): string {
  const canonical = normalizeWindowsPath(hostPath)
  const drive = canonical[0]?.toLowerCase() ?? ''
  if (canonical.length === 3) return `/mnt/${drive}`
  return `/mnt/${drive}${canonical.slice(2).replaceAll('\\', '/')}`
}

/**
 * Convert a WSL native path into a Windows UNC path for the given distribution.
 * This is mapping only: it is not a filesystem backend.
 * @param distro - WSL distribution name.
 * @param targetPath - Absolute POSIX path.
 * @returns `\\wsl.localhost\<distro>\...`.
 */
export function wslPathToUnc(distro: string, targetPath: string): string {
  const canonical = normalizePosixPath(targetPath)
  if (canonical === '/') return `\\\\wsl.localhost\\${distro}\\`
  return `\\\\wsl.localhost\\${distro}${canonical.replaceAll('/', '\\')}`
}

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
  toHostPath(targetPath: string): string | undefined
  /**
   * Map a host path onto a target-native path when the target can open it.
   * @param hostPath - Absolute host path.
   * @returns the target path, or `undefined` when the host file is not visible.
   */
  toTargetPath(hostPath: string): string | undefined
}

/**
 * Identity mapper for the local Windows/POSIX host.
 * @returns a mapper that returns the input path unchanged when it is absolute.
 */
export function localPathMapper(): PathMapper {
  return {
    toHostPath(targetPath) {
      return targetPath
    },
    toTargetPath(hostPath) {
      return hostPath
    },
  }
}

/**
 * WSL mapper: Windows drive letters become `/mnt/<drive>`, and `/mnt/<drive>`
 * becomes a Windows path. Other POSIX paths have no host mapping.
 * @returns a WSL path mapper.
 */
export function wslPathMapper(): PathMapper {
  return {
    toHostPath(targetPath) {
      return wslPathToWindowsMount(targetPath)
    },
    toTargetPath(hostPath) {
      try {
        return windowsPathToWslMount(hostPath)
      } catch {
        return undefined
      }
    },
  }
}
