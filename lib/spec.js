/**
 * Remote-workspace domain declaration: record schema and the `defineDomain`
 * spec the registry opens.
 * @module @Yujyf/dsh-remote-workspace
 */
import { z } from 'zod';
import { brandString } from '@deepseek-ai/dsh-brand';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
const remoteWorkspaceId = z.string().transform(value => value);
const workspaceTargetId = z.string().transform(value => value);
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
    sessionIds: z.array(z.string().transform(value => brandString(value))),
});
/**
 * Durable registry state. `workspaceIds` is display order, newest-created first
 * unless the user reorders later.
 */
export const remoteWorkspaceDomainState = z.object({
    workspaceIds: z.array(remoteWorkspaceId),
    sessionBindings: z.record(z.string(), remoteWorkspaceId).default({}),
});
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
        workspaces: domainTable(remoteWorkspaceRecord),
    },
});
//# sourceMappingURL=spec.js.map