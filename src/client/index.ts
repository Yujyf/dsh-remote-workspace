/**
 * Browser half of the remote-workspace selector: registers this package's
 * dictionaries and fills the sidebar foot's action list with the entry that
 * opens the selector panel. The catalog itself belongs to the Client object
 * layer (`ctx.remoteWorkspaces`); this plugin exposes its snapshot through the
 * inject `hooks` compartment so the component reads it with a framework hook.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Gateway's ClientRemote face (ctx.remote) and the Session
// object layer's Context merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the owner slot contract for 'sidebar.footer.action'.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { RemoteWorkspaceInjected } from './contract.ts'
import type { RemoteWorkspaceSnapshot } from './model.ts'
import { ClientRemoteWorkspaceModel } from './model.ts'
import type { RemoteWorkspaceNamespace } from './namespace.ts'
import { RemoteWorkspacesController } from './service.ts'
import { RemoteWorkspaceEntry } from './RemoteWorkspaceEntry.tsx'
import { createRemoteWorkspaceStore } from './store.ts'
import { en, zh, type RemoteWorkspaceKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** React-free Client remote-workspace catalog and commands. */
    remoteWorkspaces: RemoteWorkspacesController
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The selector entry, panel, and folder browser copy. */
    'remote-workspace': RemoteWorkspaceKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'remote-workspace'

/** Required services: the slot registry, locale, sessions, and the Remote namespace. */
export const inject = ['slots', 'locale', 'sessions', 'remote', 'remote.remoteWorkspace']

/**
 * Register the dictionaries and the sidebar entry. The target slot is declared
 * by ui-sidebar's apply, whose activation order relative to this one is not
 * constrained, so the registration waits on the declaration through
 * `slots.inject()` instead of assuming order.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  // The namespace member's generated type is not reachable from a package that
  // is not the Remote assembly; the narrow interface declares the verbs used.
  const namespace = (ctx.remote as unknown as { remoteWorkspace: RemoteWorkspaceNamespace }).remoteWorkspace
  const model = new ClientRemoteWorkspaceModel(namespace)
  const catalog = new RemoteWorkspacesController(ctx, model)
  void model.refresh()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'remote-workspace: dictionaries')

  const catalogSource: HostObservable<RemoteWorkspaceSnapshot> = {
    getSnapshot: () => catalog.list.getSnapshot(),
    subscribe: listener => catalog.list.subscribe(listener),
  }

  const injected = (): RemoteWorkspaceInjected => ({
    hooks: { remoteWorkspaces: catalogSource },
    refresh: () => catalog.refresh(),
    browse: async (targetId, path) => {
      const listing = path === undefined
        ? await catalog.listDirectory(targetId)
        : await catalog.listDirectory(targetId, path)
      return {
        path: listing.path,
        entries: listing.entries.map(entry => ({ name: entry.name, type: entry.type })),
      }
    },
    createFolder: (targetId, parent, name) => catalog.createDirectory(targetId, parent, name),
    addWorkspace: async ({ targetId, path }) => {
      const resolved = await catalog.resolveUri(targetId, path)
      const workspace = await catalog.createWorkspace(resolved.uri, resolved.title)
      return workspace.id
    },
    activateWorkspace: async (workspaceId) => {
      await catalog.connectWorkspace(workspaceId)
      const sessionId = ctx.sessions.list.getSnapshot().current
      if (sessionId === undefined) {
        throw new Error('open a session before binding a remote workspace')
      }
      await catalog.bindSession(sessionId, workspaceId)
    },
    removeWorkspace: workspaceId => catalog.removeWorkspace(workspaceId),
    currentSessionId: () => ctx.sessions.list.getSnapshot().current,
  })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
    {
      id: 'remote-workspace.selector',
      name: 'sidebar.footer.action',
      store: createRemoteWorkspaceStore(),
      inject: injected,
      locale: NS,
    },
    RemoteWorkspaceEntry,
  ))
}
