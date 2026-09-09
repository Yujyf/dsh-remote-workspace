/**
 * Browser half of the remote-workspace selector: registers this package's
 * dictionaries and fills the sidebar foot's action list with the entry that
 * opens the selector panel. The catalog itself belongs to the Client object
 * layer (`ctx.remoteWorkspaces`); this plugin exposes its snapshot through the
 * inject `hooks` compartment so the component reads it with a framework hook.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { RemoteWorkspacesController } from './service.ts';
import { type RemoteWorkspaceKey } from './locales.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** React-free Client remote-workspace catalog and commands. */
        remoteWorkspaces: RemoteWorkspacesController;
    }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The selector entry, panel, and folder browser copy. */
        'remote-workspace': RemoteWorkspaceKey;
    }
}
/** Required services: the slot registry, locale, and the Session object layer. */
export declare const inject: string[];
/**
 * Register the dictionaries and the sidebar entry. The target slot is declared
 * by ui-sidebar's apply, whose activation order relative to this one is not
 * constrained, so the registration waits on the declaration through
 * `slots.inject()` instead of assuming order.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map