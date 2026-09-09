/**
 * Public type vocabulary of the remote-workspace owner: target identity,
 * capability flags, workspace records, and URI values. Types only.
 * @module @Yujyf/dsh-remote-workspace
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/**
 * Identifies one discovered execution target. Stable for a process lifetime;
 * WSL values encode the distribution name, local values encode the host OS.
 */
export type WorkspaceTargetId = Branded<'WorkspaceTargetId'>

/**
 * Brand a string as a {@link WorkspaceTargetId}.
 * @param id - Raw target id.
 * @returns the same string with the target-id brand.
 */
export function WorkspaceTargetId(id: string): WorkspaceTargetId {
  return brandString<WorkspaceTargetId>(id)
}

/**
 * Identifies one durable remote workspace record. A generated uuid, never the
 * URI: URI normalization rewrites trailing slashes, and a reference must stay
 * stable.
 */
export type RemoteWorkspaceId = Branded<'RemoteWorkspaceId'>

/**
 * Brand a string as a {@link RemoteWorkspaceId}.
 * @param id - Raw workspace id.
 * @returns the same string with the workspace-id brand.
 */
export function RemoteWorkspaceId(id: string): RemoteWorkspaceId {
  return brandString<RemoteWorkspaceId>(id)
}

/**
 * Execution-world family. First-phase implementations are `local` and `wsl`;
 * the remaining members exist so UI and routing switch on capabilities rather
 * than growing a WSL-only branch.
 */
export type WorkspaceTargetType =
  | 'local'
  | 'wsl'
  | 'ssh'
  | 'docker'
  | 'podman'
  | 'kubernetes'

/** Live reachability of one target. */
export type WorkspaceTargetStatus =
  | 'unknown'
  | 'ready'
  | 'starting'
  | 'stopped'
  | 'unavailable'
  | 'error'

/**
 * Declared operations a target can serve. UI and routers switch on these
 * flags, never on {@link WorkspaceTargetType}.
 */
export interface WorkspaceCapabilities {
  readonly filesystem: boolean
  readonly process: boolean
  readonly terminal: boolean
  readonly git: boolean
  readonly environment: boolean
  readonly pathMapping: boolean
  readonly fileWatch: boolean
  readonly ports: boolean
  readonly debugger: boolean
}

/**
 * One execution environment the user can attach a workspace to.
 */
export interface WorkspaceTarget {
  readonly id: WorkspaceTargetId
  readonly type: WorkspaceTargetType
  readonly displayName: string
  /**
   * Stable identity URI without a workspace path.
   *
   * Example: `local://windows`, `wsl://Ubuntu`.
   */
  readonly identity: string
  readonly status: WorkspaceTargetStatus
  readonly capabilities: WorkspaceCapabilities
  readonly metadata?: Readonly<Record<string, string>>
}

/**
 * Canonical workspace resource identifier. `href` is the uniqueness key.
 *
 * Example: `local://windows/D:/workspace/demo`, `wsl://Ubuntu/home/cf220/project`.
 */
export interface WorkspaceUri {
  readonly type: WorkspaceTargetType
  /** Target authority: `windows` / `macos` / `linux` for local, the distro name for WSL. */
  readonly authority: string
  /** Canonical path inside the target: Windows `D:\demo` or POSIX `/home/demo`. */
  readonly path: string
  /** Stable normalized URI string, without a trailing slash except at a filesystem root. */
  readonly href: string
}

/**
 * Durable remote workspace: one target plus one canonical path, with the
 * sessions that currently execute there.
 */
export interface RemoteWorkspace {
  readonly id: RemoteWorkspaceId
  readonly targetId: WorkspaceTargetId
  readonly uri: string
  readonly cwd: string
  readonly title: string
  readonly createdAt: number
  readonly lastUsedAt: number
  readonly sessionIds: readonly SessionId[]
}

/** Health probe result for one target. */
export interface TargetHealth {
  readonly targetId: WorkspaceTargetId
  readonly status: WorkspaceTargetStatus
  readonly detail?: string
}

/** One child in a remote directory listing. */
export interface RemoteDirectoryEntry {
  readonly name: string
  readonly type: 'file' | 'directory' | 'other'
}

/** One directory level for the workspace path picker. */
export interface RemoteDirectoryListing {
  readonly path: string
  readonly entries: readonly RemoteDirectoryEntry[]
}

/** WSL distribution facts parsed from `wsl.exe --list --verbose`. */
export interface WslDistribution {
  readonly name: string
  readonly state: 'running' | 'stopped' | 'unknown'
  readonly version: 1 | 2
  readonly default: boolean
}
