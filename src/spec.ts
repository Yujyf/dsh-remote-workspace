/**
 * Remote-workspace domain declaration: record schema and the `defineDomain`
 * spec the registry opens.
 * @module @Yujyf/dsh-remote-workspace
 */

import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { RemoteWorkspaceId, WorkspaceTargetId } from './types.ts'

const remoteWorkspaceId = z.string().transform(value => value as RemoteWorkspaceId)
const workspaceTargetId = z.string().transform(value => value as WorkspaceTargetId)

/**
 * Durable shape of one remote workspace record. `uri` is the canonical href;
 * uniqueness is string equality of that href.
 */
export const remoteWorkspaceRecord = z.object({
  targetId: workspaceTargetId,
  uri: z.string(),
  cwd: z.string(),
  title: z.string(),
  createdAt: z.number(),
  lastUsedAt: z.number(),
  sessionIds: z.array(z.string().transform(value => brandString<SessionId>(value))),
  /**
   * The DSH workspace this registration also created, when the deployment
   * mounts a workspace registry. That entry is what puts the remote workspace
   * in DSH's own workspace list and in front of every other plugin; removing
   * this registration removes it.
   */
  hostWorkspaceId: z.string().optional(),
})

/** One stored remote workspace record. */
export type RemoteWorkspaceRecord = z.infer<typeof remoteWorkspaceRecord>

/**
 * Durable registry state. `workspaceIds` is display order, newest-created first
 * unless the user reorders later.
 */
export const remoteWorkspaceDomainState = z.object({
  workspaceIds: z.array(remoteWorkspaceId),
  sessionBindings: z.record(z.string(), remoteWorkspaceId).default({}),
})

/** Durable registry state inferred from {@link remoteWorkspaceDomainState}. */
export type RemoteWorkspaceDomainState = z.infer<typeof remoteWorkspaceDomainState>

/**
 * The remote-workspace domain spec: one `workspaces` table plus the order and
 * session-binding singleton.
 */
export const remoteWorkspaceDomainSpec = defineDomain({
  name: 'remote_workspace',
  version: 1,
  global: {
    schema: remoteWorkspaceDomainState,
    initial: { workspaceIds: [], sessionBindings: {} },
  },
  tables: {
    workspaces: domainTable<RemoteWorkspaceId, RemoteWorkspaceRecord>(remoteWorkspaceRecord),
  },
})
