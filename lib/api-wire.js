/**
 * Wire vocabulary of the remote-workspace HTTP API: the route prefix, the
 * callable verb names, and the JSON envelope both halves speak. The Host route
 * and the browser client share this module, so a verb rename is one edit.
 *
 * The API is a plain JSON route on `ctx.webServer` rather than a generated
 * Remote namespace: DSH mounts Remote namespaces from a fixed list compiled
 * into `@deepseek-ai/dsh-api-remotes`, so a package outside that assembly
 * cannot contribute one.
 * @module @Yujyf/dsh-remote-workspace
 */
/** Route prefix the Host registers and the browser posts under. */
export const REMOTE_WORKSPACE_API_PREFIX = '/remote-workspace/api';
/** Verbs the browser may call; each one is a `POST` to `<prefix>/<verb>`. */
export const REMOTE_WORKSPACE_VERBS = [
    'listTargets',
    'listWorkspaces',
    'createWorkspace',
    'removeWorkspace',
    'connectWorkspace',
    'disconnectWorkspace',
    'healthCheck',
    'listDirectory',
    'resolveUri',
    'createDirectory',
    'bindSession',
];
//# sourceMappingURL=api-wire.js.map