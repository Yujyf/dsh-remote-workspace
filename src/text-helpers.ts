/**
 * Shared text-storage helpers for remote/sandboxed FileSystem backends. E2B,
 * the WSL helper backend, and the local backend all keep the same CRLF
 * normalization, literal-edit, and per-target serialization semantics; these
 * functions are the single home for those behaviors so remote backends cannot
 * drift from the shipped local ones.
 * @module @Yujyf/dsh-remote-workspace/src/text-helpers
 */

import { FsError } from '@deepseek-ai/dsh-fs'
import type { FsEditRequest } from '@deepseek-ai/dsh-fs'

/**
 * Normalize CRLF line endings to LF.
 * @param value - Raw text.
 * @returns text with every CRLF replaced by LF.
 */
export function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n')
}

/**
 * Detect CRLF-dominant text from a leading sample.
 * @param value - Raw text; the first 4096 code points decide.
 * @returns true when CRLF occurrences outnumber bare LF occurrences.
 */
export function detectsCrlf(value: string): boolean {
  const sample = value.slice(0, 4096)
  const crlf = sample.split('\r\n').length - 1
  const lf = sample.split('\n').length - 1 - crlf
  return crlf > lf
}

/**
 * Restore CRLF line endings on CRLF-dominant files.
 * @param value - LF-normalized text.
 * @param crlf - whether the original text was CRLF-dominant.
 * @returns text with LF restored to CRLF when `crlf` holds.
 */
export function restoreLineEndings(value: string, crlf: boolean): string {
  return crlf ? normalizeLineEndings(value).replaceAll('\n', '\r\n') : value
}

/**
 * Abort or timeout checks converge on the same FS_ABORTED outcome.
 * @param signal - Caller's cancellation signal.
 * @param operation - Verb named in the abort diagnostic.
 * @throws `FS_ABORTED` when the signal has fired.
 */
export function assertNotAborted(signal: AbortSignal | undefined, operation: string): void {
  if (signal?.aborted === true) throw new FsError(`${operation} aborted`, 'FS_ABORTED')
}

/**
 * Decode whole-file bytes as strict UTF-8 text, rejecting binary content.
 * @param bytes - Complete file bytes.
 * @param displayPath - Path named in diagnostics.
 * @param maxBytes - Inclusive sample bound for binary sniffing (the local backend
 *   sniffs a fixed prefix; a remote backend that already knows the byte length
 *   can pass it to sniff everything).
 * @returns decoded text.
 * @throws `FS_NOT_TEXT` for NUL bytes or invalid UTF-8.
 */
export function decodeTextBytes(bytes: Uint8Array, displayPath: string, maxBytes: number): string {
  if (bytes.subarray(0, maxBytes).includes(0)) {
    throw new FsError(`cannot read "${displayPath}": binary file`, 'FS_NOT_TEXT')
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    throw new FsError(`cannot read "${displayPath}": invalid UTF-8 text`, 'FS_NOT_TEXT', { cause: error })
  }
}

/**
 * Apply a literal search/replace with single-match semantics over LF-normalized text.
 * @param content - LF-normalized current file text.
 * @param request - The edit request; `oldString`/`newString` are normalized first.
 * @param displayPath - Path named in diagnostics.
 * @returns the edited LF-normalized text.
 * @throws `FS_EDIT_NOT_FOUND` when `oldString` is empty or absent.
 * @throws `FS_AMBIGUOUS_EDIT` when `oldString` matches more than once without `replaceAll`.
 */
export function literalEdit(content: string, request: FsEditRequest, displayPath: string): string {
  const oldString = normalizeLineEndings(request.oldString)
  const newString = normalizeLineEndings(request.newString)
  if (oldString.length === 0) {
    throw new FsError(`cannot edit "${displayPath}": old_string must be non-empty`, 'FS_EDIT_NOT_FOUND')
  }
  let matches = 0
  let offset = 0
  while (true) {
    const found = content.indexOf(oldString, offset)
    if (found < 0) break
    matches += 1
    offset = found + oldString.length
  }
  if (matches === 0) throw new FsError(`cannot edit "${displayPath}": old_string was not found`, 'FS_EDIT_NOT_FOUND')
  if (!request.replaceAll && matches !== 1) {
    throw new FsError(`cannot edit "${displayPath}": old_string matched ${matches} times`, 'FS_AMBIGUOUS_EDIT')
  }
  return request.replaceAll ? content.split(oldString).join(newString) : content.replace(oldString, newString)
}

/**
 * Serialize mutating operations per target key (FIFO per key), so a remote
 * backend's read→guard→write window cannot interleave — the same guarantee the
 * local backend implements inline.
 * @param locks - The backend's own lock map, one tail promise per key.
 * @param targetKey - Key to serialize on.
 * @param op - The mutation to run under exclusive access.
 * @returns the operation's outcome.
 */
export async function withKeyLock<T>(
  locks: Map<string, Promise<unknown>>,
  targetKey: string,
  op: () => Promise<T>,
): Promise<T> {
  const prior = locks.get(targetKey) ?? Promise.resolve()
  const run = prior.then(op, op)
  const tail = run.then(() => undefined, () => undefined)
  locks.set(targetKey, tail)
  try {
    return await run
  } finally {
    if (locks.get(targetKey) === tail) locks.delete(targetKey)
  }
}
