/**
 * Public type vocabulary of the remote-workspace owner: target identity,
 * capability flags, workspace records, and URI values. Types only.
 * @module @Yujyf/dsh-remote-workspace
 */
import { brandString } from '@deepseek-ai/dsh-brand';
/**
 * Brand a string as a {@link WorkspaceTargetId}.
 * @param id - Raw target id.
 * @returns the same string with the target-id brand.
 */
export function WorkspaceTargetId(id) {
    return brandString(id);
}
/**
 * Brand a string as a {@link RemoteWorkspaceId}.
 * @param id - Raw workspace id.
 * @returns the same string with the workspace-id brand.
 */
export function RemoteWorkspaceId(id) {
    return brandString(id);
}
//# sourceMappingURL=types.js.map