/**
 * Typed remote-workspace failures. UI and routers switch on {@link WorkspaceErrorCode};
 * raw Windows or WSL diagnostics stay on `cause`.
 * @module @Yujyf/dsh-remote-workspace
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'

/** Stable, machine-routable codes for remote-workspace failures. */
export type WorkspaceErrorCode =
  | 'TARGET_NOT_FOUND'
  | 'TARGET_OFFLINE'
  | 'TARGET_START_FAILED'
  | 'PATH_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'PROCESS_FAILED'
  | 'TERMINAL_FAILED'
  | 'FILESYSTEM_FAILED'
  | 'UNSUPPORTED'
  | 'TIMEOUT'

/**
 * Typed remote-workspace error. Extends {@link HarnessError} so it carries a
 * stable {@link WorkspaceErrorCode} and chains `cause`.
 */
export class WorkspaceError extends HarnessError {
  override readonly code: WorkspaceErrorCode
  /** Structured facts for UI copy, such as `distribution=Ubuntu`. */
  readonly metadata: Readonly<Record<string, string>>

  /**
   * @param message - Human diagnostic; never a raw errno string alone.
   * @param code - Stable failure code.
   * @param metadata - UI facts such as the missing distribution name.
   * @param options - Standard Error options; `cause` keeps the original failure.
   */
  constructor(
    message: string,
    code: WorkspaceErrorCode,
    metadata: Readonly<Record<string, string>> = {},
    options?: ErrorOptions,
  ) {
    super(message, code, options)
    this.code = code
    this.metadata = metadata
  }
}

/**
 * Map a Node or WSL failure onto {@link WorkspaceError}. Known codes stay
 * structured; unknown failures become `FILESYSTEM_FAILED` or `PROCESS_FAILED`.
 * @param error - Caught value.
 * @param operation - Verb included in the message (`stat`, `spawn`, …).
 * @param kind - Whether the failing operation is filesystem or process.
 * @param metadata - Extra UI facts.
 * @returns a typed workspace error; existing {@link WorkspaceError} values pass through.
 */
export function mapWorkspaceFailure(
  error: unknown,
  operation: string,
  kind: 'filesystem' | 'process' | 'terminal',
  metadata: Readonly<Record<string, string>> = {},
): WorkspaceError {
  if (error instanceof WorkspaceError) return error
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ENOENT') {
    return new WorkspaceError(
      `cannot ${operation}: path not found`,
      'PATH_NOT_FOUND',
      metadata,
      { cause: error },
    )
  }
  if (code === 'EACCES' || code === 'EPERM' || /permission denied/i.test(message)) {
    return new WorkspaceError(
      `cannot ${operation}: permission denied`,
      'PERMISSION_DENIED',
      metadata,
      { cause: error },
    )
  }
  if (code === 'ETIMEDOUT' || /timed out/i.test(message)) {
    return new WorkspaceError(
      `cannot ${operation}: timed out`,
      'TIMEOUT',
      metadata,
      { cause: error },
    )
  }
  const fallback: WorkspaceErrorCode = kind === 'filesystem'
    ? 'FILESYSTEM_FAILED'
    : kind === 'terminal'
      ? 'TERMINAL_FAILED'
      : 'PROCESS_FAILED'
  return new WorkspaceError(`cannot ${operation}: ${message}`, fallback, metadata, { cause: error })
}
