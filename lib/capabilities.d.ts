/**
 * Capability presets for first-phase targets. Future SSH/Docker/Kubernetes
 * providers declare their own objects with the same fields.
 * @module @Yujyf/dsh-remote-workspace
 */
import type { WorkspaceCapabilities } from './types.ts';
/** Local host capabilities: filesystem, process, and terminal on the Harness machine. */
export declare const LOCAL_CAPABILITIES: WorkspaceCapabilities;
/** WSL capabilities: Linux filesystem/process/terminal with Windows path mapping. */
export declare const WSL_CAPABILITIES: WorkspaceCapabilities;
//# sourceMappingURL=capabilities.d.ts.map