/**
 * Host remote-workspace API route: target discovery, workspace CRUD, path
 * browsing, and session binding, served as JSON over `ctx.webServer`.
 * @module @Yujyf/dsh-remote-workspace
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { REMOTE_WORKSPACE_API_PREFIX, type RemoteWorkspaceApiEnvelope, type RemoteWorkspaceApiFailure, type RemoteWorkspaceVerb } from './api-wire.ts'
import { WorkspaceError } from './errors.ts'
import { WorkspaceTargetId } from './types.ts'
import type { RemoteWorkspaceId } from './types.ts'
// The owner owns the listing and health declarations; this route module names
// that package rather than re-exporting them.
import type { RemoteDirectoryListing, TargetHealth } from './wire-types.ts'
import type {
  LocalWorkspaceListValue,
  RemoteWorkspaceBindRequest,
  RemoteWorkspaceCreateDirectoryRequest,
  RemoteWorkspaceCreateRequest,
  RemoteWorkspaceCreateValue,
  RemoteWorkspaceHealthRequest,
  RemoteWorkspaceIdRequest,
  RemoteWorkspaceListDirectoryRequest,
  RemoteWorkspaceListValue,
  RemoteWorkspaceResolveUriRequest,
  RemoteWorkspaceResolveUriValue,
  RemoteWorkspaceTargetsValue,
  RemoteWorkspaceUnbindRequest,
} from './wire-types.ts'

export type * from './wire-types.ts'

/**
 * The one `ctx.webServer` capability this plugin uses. Declared locally because
 * the published webserver package ships no type declarations; the route fields
 * mirror `WebServer.register`.
 */
interface WebServerRoute {
  readonly kind: 'exact' | 'prefix'
  readonly path: string
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

/** Route registry face of the host webserver. */
interface WebServerFace {
  /**
   * @param route - kind, path, and the owning handler.
   * @returns the disposer removing the route.
   */
  register(route: WebServerRoute): () => void
}

/** Web runtime facts the browser-trust fence reads. */
interface WebRuntimeFace {
  /** Non-loopback authorities this deployment serves. */
  readonly trustedHosts?: readonly string[]
}

/**
 * The one `ctx.workspaceRegistry` capability this route reads. Declared locally
 * because the published workspace package ships no type declarations.
 */
interface WorkspaceRegistryFace {
  /** Every built-in workspace, in registry order. */
  list(): readonly {
    readonly id: string
    readonly title: string
    readonly path: string
    readonly sessionIds: readonly SessionId[]
  }[]
}

/** Largest request body accepted, in bytes. Every verb's payload is tiny. */
const MAX_BODY_BYTES = 64 * 1024

/** One verb handler; the payload arrives as parsed JSON from the wire. */
type VerbHandler = (payload: unknown) => Promise<unknown>

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host remote-workspace business API behind the HTTP route. */
    remoteWorkspaceController: RemoteWorkspaceController
  }
}

/** Host service serving the remote-workspace JSON route. */
export class RemoteWorkspaceController extends Service {
  static inject = ['remoteWorkspace', 'webServer']

  /** @param ctx - Host context containing the remote-workspace owner. */
  constructor(ctx: Context) {
    super(ctx, 'remoteWorkspaceController')
  }

  /**
   * Register the route. The registration is an effect: disposing the fiber
   * removes the route.
   */
  [Service.init](): void {
    const webServer = (this.ctx as unknown as { webServer: WebServerFace }).webServer
    this.ctx.effect(
      () => webServer.register({
        kind: 'prefix',
        path: REMOTE_WORKSPACE_API_PREFIX,
        handler: (request, response) => this.handle(request, response),
      }),
      'remote-workspace-controller: http route',
    )
  }

  /**
   * List discovered execution targets.
   * @returns the live target catalog.
   */
  async listTargets(): Promise<RemoteWorkspaceTargetsValue> {
    return { targets: await this.ctx.remoteWorkspace.listTargets() }
  }

  /**
   * List durable remote workspaces.
   * @returns registered workspaces in display order.
   */
  listWorkspaces(): RemoteWorkspaceListValue {
    return { workspaces: this.ctx.remoteWorkspace.listWorkspaces() }
  }

  /**
   * Create or reuse a remote workspace for a canonical URI.
   * @param request - URI and optional title.
   * @returns the workspace record.
   */
  async createWorkspace(request: RemoteWorkspaceCreateRequest): Promise<RemoteWorkspaceCreateValue> {
    try {
      const workspace = await this.ctx.remoteWorkspace.createWorkspace(request.uri, request.title)
      return { workspace }
    } catch (error: unknown) {
      throw mapError(error)
    }
  }

  /**
   * Remove a remote workspace registration.
   * @param request - Workspace identity.
   * @returns resolution after deletion.
   */
  async removeWorkspace(request: RemoteWorkspaceIdRequest): Promise<void> {
    await this.ctx.remoteWorkspace.removeWorkspace(request.workspaceId)
  }

  /**
   * Connect a workspace, starting a stopped WSL distribution when configured.
   * @param request - Workspace identity.
   * @returns resolution after the helper is ready.
   */
  async connectWorkspace(request: RemoteWorkspaceIdRequest): Promise<void> {
    try {
      await this.ctx.remoteWorkspace.connectWorkspace(request.workspaceId)
    } catch (error: unknown) {
      throw mapError(error, request.workspaceId)
    }
  }

  /**
   * Disconnect a workspace without shutting down its target by default.
   * @param request - Workspace identity.
   * @returns resolution after helpers stop.
   */
  async disconnectWorkspace(request: RemoteWorkspaceIdRequest): Promise<void> {
    await this.ctx.remoteWorkspace.disconnectWorkspace(request.workspaceId)
  }

  /**
   * Probe one target.
   * @param request - Target identity.
   * @returns live status.
   */
  async healthCheck(request: RemoteWorkspaceHealthRequest): Promise<TargetHealth> {
    return await this.ctx.remoteWorkspace.healthCheck(request.targetId)
  }

  /**
   * List one directory on a target.
   * @param request - Target and optional path.
   * @returns the listing.
   */
  async listDirectory(request: RemoteWorkspaceListDirectoryRequest): Promise<RemoteDirectoryListing> {
    try {
      return await this.ctx.remoteWorkspace.listDirectory(request.targetId, request.path)
    } catch (error: unknown) {
      throw pathError(error, request.path ?? '')
    }
  }

  /**
   * Build the canonical workspace URI for a native path on a target. Picking
   * surfaces call this instead of assembling a URI scheme themselves.
   * @param request - Target and native path.
   * @returns the canonical URI and its default title.
   */
  resolveUri(request: RemoteWorkspaceResolveUriRequest): RemoteWorkspaceResolveUriValue {
    try {
      return this.ctx.remoteWorkspace.uriForTargetPath(request.targetId, request.path)
    } catch (error: unknown) {
      throw pathError(error, request.path)
    }
  }

  /**
   * Create a child directory on a target.
   * @param request - Target, parent, and name.
   * @returns the created path.
   */
  async createDirectory(request: RemoteWorkspaceCreateDirectoryRequest): Promise<{ readonly path: string }> {
    try {
      const path = await this.ctx.remoteWorkspace.createDirectory(
        request.targetId,
        request.parent,
        request.name,
      )
      return { path }
    } catch (error: unknown) {
      throw pathError(error, request.parent)
    }
  }

  /**
   * Bind a Session to a remote workspace so later tool calls route there.
   * @param request - Workspace and Session identities.
   * @returns resolution after durability.
   */
  async bindSession(request: RemoteWorkspaceBindRequest): Promise<void> {
    try {
      await this.ctx.remoteWorkspace.bindSession(request.sessionId, request.workspaceId)
    } catch (error: unknown) {
      throw mapError(error, request.workspaceId)
    }
  }

  /**
   * Release one session's binding so its tools run on the host again.
   * @param request - Session identity.
   * @returns resolution after durability.
   */
  async unbindSession(request: RemoteWorkspaceUnbindRequest): Promise<void> {
    await this.ctx.remoteWorkspace.unbindSession(request.sessionId)
  }

  /**
   * List DSH's own workspaces, which the selector shows beside the remote ones.
   * Empty when the deployment mounts no workspace registry.
   * @returns the built-in workspace rows.
   */
  listLocalWorkspaces(): LocalWorkspaceListValue {
    const registry = this.ctx.get('workspaceRegistry') as WorkspaceRegistryFace | undefined
    if (registry === undefined) return { workspaces: [] }
    return {
      workspaces: registry.list().map(workspace => ({
        id: workspace.id,
        title: workspace.title,
        path: workspace.path,
        sessionIds: [...workspace.sessionIds],
      })),
    }
  }

  /** Verb table: one entry per browser-callable method. */
  private verbs(): Record<RemoteWorkspaceVerb, VerbHandler> {
    return {
      listTargets: async () => await this.listTargets(),
      listWorkspaces: async () => this.listWorkspaces(),
      createWorkspace: async payload => await this.createWorkspace(await readCreateRequest(payload)),
      removeWorkspace: async payload => await this.removeWorkspace(readIdRequest(payload)),
      connectWorkspace: async payload => await this.connectWorkspace(readIdRequest(payload)),
      disconnectWorkspace: async payload => await this.disconnectWorkspace(readIdRequest(payload)),
      healthCheck: async payload => await this.healthCheck(readTargetRequest(payload)),
      listDirectory: async payload => await this.listDirectory(readListRequest(payload)),
      resolveUri: async payload => this.resolveUri(readResolveRequest(payload)),
      createDirectory: async payload => await this.createDirectory(readCreateDirectoryRequest(payload)),
      bindSession: async payload => await this.bindSession(readBindRequest(payload)),
      unbindSession: async payload => await this.unbindSession(readUnbindRequest(payload)),
      listLocalWorkspaces: async () => this.listLocalWorkspaces(),
    }
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.trusted(request)) {
      return this.respond(response, 403, fail('forbidden', 'remote-workspace API rejects this Host header'))
    }
    if (request.method !== 'POST') {
      return this.respond(response, 405, fail('method-not-allowed', 'remote-workspace API accepts POST only'))
    }
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const verb = path.slice(REMOTE_WORKSPACE_API_PREFIX.length + 1)
    const handler = this.verbs()[verb as RemoteWorkspaceVerb]
    if (handler === undefined) {
      return this.respond(response, 404, fail('unknown-verb', `unknown remote-workspace verb '${verb}'`))
    }
    let payload: unknown
    try {
      payload = await readJsonBody(request)
    } catch (error: unknown) {
      return this.respond(response, 400, fail('bad-request', messageOf(error)))
    }
    try {
      // A verb that returns nothing still carries an explicit `value`, so the
      // browser never has to tell "no value" apart from a malformed envelope.
      this.respond(response, 200, { ok: true, value: (await handler(payload)) ?? null })
    } catch (error: unknown) {
      this.respond(response, 400, { ok: false, error: mapError(error) })
    }
  }

  /**
   * Whether the request may reach this route: the Host authority is the local
   * loopback one, or an authority this deployment declares trusted. Mirrors the
   * browser-trust fence the gateway applies to `/api`.
   */
  private trusted(request: IncomingMessage): boolean {
    const host = request.headers.host
    if (host === undefined) return false
    let authority: URL
    try {
      authority = new URL(`http://${host}`)
    } catch {
      return false
    }
    if (isLoopbackHostname(authority.hostname)) return true
    const runtime = this.ctx.get('webRuntime') as WebRuntimeFace | undefined
    return (runtime?.trustedHosts ?? []).some(entry => entry === authority.host || entry === authority.hostname)
  }

  private respond(response: ServerResponse, status: number, envelope: RemoteWorkspaceApiEnvelope<unknown>): void {
    const body = JSON.stringify(envelope)
    response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
    response.end(body)
  }
}

/** Whether a hostname names the local loopback authority. */
function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/** Read the request body as JSON, bounded and parsed once. */
async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error(`remote-workspace request body exceeds ${MAX_BODY_BYTES} bytes`)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.length === 0) return {}
  try {
    return JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`remote-workspace request body is not JSON: ${messageOf(error)}`)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fail(code: string, message: string): RemoteWorkspaceApiEnvelope<never> {
  return { ok: false, error: { code, message } }
}

/** Require an object payload. */
function asRecord(payload: unknown, verb: string): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(`remote-workspace ${verb} expects a JSON object payload`)
  }
  return payload as Record<string, unknown>
}

/** Require a non-empty string field. */
function requiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`remote-workspace request field '${field}' must be a non-empty string`)
  }
  return value
}

/** Require an optional string field. */
function optionalString(source: Record<string, unknown>, field: string): string | undefined {
  const value = source[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`remote-workspace request field '${field}' must be a string`)
  return value
}

function readIdRequest(payload: unknown): RemoteWorkspaceIdRequest {
  const source = asRecord(payload, 'workspace command')
  return { workspaceId: requiredString(source, 'workspaceId') as RemoteWorkspaceId }
}

function readTargetRequest(payload: unknown): RemoteWorkspaceHealthRequest {
  const source = asRecord(payload, 'healthCheck')
  return { targetId: WorkspaceTargetId(requiredString(source, 'targetId')) }
}

function readCreateRequest(payload: unknown): RemoteWorkspaceCreateRequest {
  const source = asRecord(payload, 'createWorkspace')
  const title = optionalString(source, 'title')
  return title === undefined
    ? { uri: requiredString(source, 'uri') }
    : { uri: requiredString(source, 'uri'), title }
}

function readListRequest(payload: unknown): RemoteWorkspaceListDirectoryRequest {
  const source = asRecord(payload, 'listDirectory')
  const path = optionalString(source, 'path')
  const targetId = WorkspaceTargetId(requiredString(source, 'targetId'))
  return path === undefined ? { targetId } : { targetId, path }
}

function readResolveRequest(payload: unknown): RemoteWorkspaceResolveUriRequest {
  const source = asRecord(payload, 'resolveUri')
  return { targetId: WorkspaceTargetId(requiredString(source, 'targetId')), path: requiredString(source, 'path') }
}

function readCreateDirectoryRequest(payload: unknown): RemoteWorkspaceCreateDirectoryRequest {
  const source = asRecord(payload, 'createDirectory')
  return {
    targetId: WorkspaceTargetId(requiredString(source, 'targetId')),
    parent: requiredString(source, 'parent'),
    name: requiredString(source, 'name'),
  }
}

function readBindRequest(payload: unknown): RemoteWorkspaceBindRequest {
  const source = asRecord(payload, 'bindSession')
  return {
    sessionId: requiredString(source, 'sessionId') as RemoteWorkspaceBindRequest['sessionId'],
    workspaceId: requiredString(source, 'workspaceId') as RemoteWorkspaceId,
  }
}

function readUnbindRequest(payload: unknown): RemoteWorkspaceUnbindRequest {
  const source = asRecord(payload, 'unbindSession')
  return { sessionId: requiredString(source, 'sessionId') as RemoteWorkspaceUnbindRequest['sessionId'] }
}

function mapError(error: unknown, workspaceId?: RemoteWorkspaceId): RemoteWorkspaceApiFailure {
  if (error instanceof WorkspaceError) {
    if (error.code === 'TARGET_NOT_FOUND' || error.code === 'TARGET_OFFLINE' || error.code === 'TARGET_START_FAILED') {
      return { code: 'remote-workspace/target-unavailable', message: error.message }
    }
    if (workspaceId !== undefined) {
      return { code: 'remote-workspace/not-found', message: error.message }
    }
    return { code: `remote-workspace/${error.code.toLowerCase().replaceAll('_', '-')}`, message: error.message }
  }
  return { code: 'remote-workspace/internal', message: messageOf(error) }
}

function pathError(error: unknown, path: string): RemoteWorkspaceApiFailure {
  return {
    code: 'remote-workspace/path-failed',
    message: path.length === 0 ? messageOf(error) : `${messageOf(error)} (${path})`,
  }
}

export default RemoteWorkspaceController
