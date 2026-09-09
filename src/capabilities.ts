/**
 * Capability presets for first-phase targets. Future SSH/Docker/Kubernetes
 * providers declare their own objects with the same fields.
 * @module @Yujyf/dsh-remote-workspace
 */

import type { WorkspaceCapabilities } from './types.ts'

/** Local host capabilities: filesystem, process, and terminal on the Harness machine. */
export const LOCAL_CAPABILITIES: WorkspaceCapabilities = {
  filesystem: true,
  process: true,
  terminal: true,
  git: true,
  environment: true,
  pathMapping: true,
  fileWatch: true,
  ports: false,
  debugger: false,
}

/** WSL capabilities: Linux filesystem/process/terminal with Windows path mapping. */
export const WSL_CAPABILITIES: WorkspaceCapabilities = {
  filesystem: true,
  process: true,
  terminal: true,
  git: true,
  environment: true,
  pathMapping: true,
  fileWatch: false,
  ports: false,
  debugger: false,
}
