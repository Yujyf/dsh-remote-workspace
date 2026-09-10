/**
 * Remote-workspace domain declaration: record schema and the `defineDomain`
 * spec the registry opens.
 * @module @Yujyf/dsh-remote-workspace
 */
import { z } from 'zod';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RemoteWorkspaceId, WorkspaceTargetId } from './types.ts';
/**
 * Durable shape of one remote workspace record. `uri` is the canonical href;
 * uniqueness is string equality of that href.
 */
export declare const remoteWorkspaceRecord: z.ZodObject<{
    targetId: z.ZodPipe<z.ZodString, z.ZodTransform<WorkspaceTargetId, string>>;
    uri: z.ZodString;
    cwd: z.ZodString;
    title: z.ZodString;
    createdAt: z.ZodNumber;
    lastUsedAt: z.ZodNumber;
    sessionIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>>;
    hostWorkspaceId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** One stored remote workspace record. */
export type RemoteWorkspaceRecord = z.infer<typeof remoteWorkspaceRecord>;
/**
 * Durable registry state. `workspaceIds` is display order, newest-created first
 * unless the user reorders later.
 */
export declare const remoteWorkspaceDomainState: z.ZodObject<{
    workspaceIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<RemoteWorkspaceId, string>>>;
    sessionBindings: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodPipe<z.ZodString, z.ZodTransform<RemoteWorkspaceId, string>>>>;
}, z.core.$strip>;
/** Durable registry state inferred from {@link remoteWorkspaceDomainState}. */
export type RemoteWorkspaceDomainState = z.infer<typeof remoteWorkspaceDomainState>;
/**
 * The remote-workspace domain spec: one `workspaces` table plus the order and
 * session-binding singleton.
 */
export declare const remoteWorkspaceDomainSpec: {
    name: string;
    version: number;
    global: {
        schema: z.ZodObject<{
            workspaceIds: z.ZodArray<z.ZodPipe<z.ZodString, z.ZodTransform<RemoteWorkspaceId, string>>>;
            sessionBindings: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodPipe<z.ZodString, z.ZodTransform<RemoteWorkspaceId, string>>>>;
        }, z.core.$strip>;
        initial: {
            workspaceIds: never[];
            sessionBindings: {};
        };
    };
    tables: {
        workspaces: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<RemoteWorkspaceId, {
            targetId: WorkspaceTargetId;
            uri: string;
            cwd: string;
            title: string;
            createdAt: number;
            lastUsedAt: number;
            sessionIds: SessionId[];
            hostWorkspaceId?: string | undefined;
        }>;
    };
};
//# sourceMappingURL=spec.d.ts.map