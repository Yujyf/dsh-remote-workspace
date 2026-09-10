/**
 * Working-directory translation for a bound execution world.
 *
 * A session's working directory always stays the host path DSH recorded when
 * the session was created; binding a remote workspace does not rewrite it. The
 * routers therefore translate each request cwd into the bound world's native
 * spelling, and the session's own directory becomes the bound workspace
 * directory — which is what makes relative tool paths land in the workspace the
 * user picked instead of in the host directory that merely shares its files.
 * @module @Yujyf/dsh-remote-workspace
 */

import { windowsPathToWslMount } from './path-mapper.ts'

/** Binding facts one cwd translation needs. */
export interface WorldCwdFacts {
  /** Directory of the bound workspace, in the execution world's spelling. */
  readonly cwd: string
  /** Host directory of the session when the binding was resolved, when known. */
  readonly sourceCwd?: string
}

/**
 * Translate a requested cwd into the execution world's native spelling.
 *
 * A POSIX path is already native and passes through. The session's own host
 * directory becomes the bound workspace directory. Any other host path keeps
 * its drive mapping (`C:\dir` is `/mnt/c/dir`), so an explicit `workdir` still
 * reaches the host file it names.
 * @param facts - the bound world and the session directory it replaced.
 * @param requested - cwd the caller asked for, when it asked for one.
 * @returns a path in the execution world.
 */
export function worldCwd(facts: WorldCwdFacts, requested: string | undefined): string {
  if (requested === undefined || requested.length === 0) return facts.cwd
  if (requested.startsWith('/')) return requested
  if (facts.sourceCwd !== undefined && sameHostPath(requested, facts.sourceCwd)) return facts.cwd
  return mappedHostPath(requested) ?? facts.cwd
}

/**
 * Whether two Windows spellings name the same directory. DSH records the
 * session directory as it was given, so `E:\a\b`, `E:/a/b/`, and `e:\A\B`
 * reach this module as different strings for one directory.
 * @param left - first path.
 * @param right - second path.
 * @returns true when both canonicals match.
 */
export function sameHostPath(left: string, right: string): boolean {
  return canonicalHostPath(left) === canonicalHostPath(right)
}

/** Canonical form of a Windows path for comparison: separators, case, trailing slash. */
function canonicalHostPath(path: string): string {
  const unified = path.replaceAll('/', '\\').replace(/\\+$/, '')
  return unified.toLowerCase()
}

/** `/mnt/<drive>/...` for a fully qualified Windows path, or undefined when it is not one. */
function mappedHostPath(path: string): string | undefined {
  try {
    return windowsPathToWslMount(path)
  } catch {
    return undefined
  }
}
