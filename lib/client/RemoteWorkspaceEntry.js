import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The remote-workspace selector: the sidebar foot's entry plus the panel it
 * opens. The panel lists DSH's own workspaces beside every discovered remote
 * world, filters them by execution world, and offers two ways to adopt a remote
 * one — "Use in this session" on an existing row, or a folder browser that
 * registers a new workspace from a chosen directory. Binding a workspace to the
 * open session is what routes that session's official tools into the target;
 * "Run on the host again" releases the binding. With no open session the panel
 * says so instead of silently doing nothing.
 *
 * All data arrives through the injected face and the catalog hook; this file
 * holds only view state (which view, the level on screen, in-flight verbs).
 */
import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button, IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16, IconFolderClose16, IconFolderOpen16, IconGlobeOutline14, IconPlusOutline16, IconRefreshOutline14, Modal, StateDot, } from '@deepseek-ai/dsh-client-ui-primitives';
import { LOCAL_WORLD_KEY } from "./model.js";
import css from './RemoteWorkspaceEntry.module.css';
/** How a target's reachability maps onto the shared status dot. */
function statusDot(status) {
    switch (status) {
        case 'ready': return 'done';
        case 'starting': return 'ongoing';
        case 'stopped': return 'warning';
        case 'error': return 'error';
        default: return 'warning';
    }
}
/** The localized word for one target status. */
function statusKey(status) {
    switch (status) {
        case 'ready': return 'status.ready';
        case 'starting': return 'status.starting';
        case 'stopped': return 'status.stopped';
        case 'unavailable': return 'status.unavailable';
        case 'error': return 'status.error';
        default: return 'status.unknown';
    }
}
/** Parent directory of an absolute POSIX or Windows path, or the path itself at a root. */
function parentPath(path) {
    const trimmed = path.replace(/[/\\]+$/, '');
    const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    if (cut <= 0)
        return trimmed.startsWith('/') ? '/' : trimmed;
    const parent = trimmed.slice(0, cut);
    return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}
/**
 * Sidebar-foot entry: a labelled button in the wide column, an icon in the rail.
 * @param props - owner geometry, viewing store, injected face, and copy.
 * @returns the entry element, with its panel while open.
 */
export function RemoteWorkspaceEntry(props) {
    const { t, actions, wide } = props;
    const view = props.useStore(s => s);
    const catalog = props.useRemoteWorkspaces(s => s);
    const sessionId = props.currentSessionId();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [listing, setListing] = useState(null);
    const [folderDraft, setFolderDraft] = useState(null);
    const run = useCallback(async (operation) => {
        setBusy(true);
        setError(null);
        try {
            await operation();
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
        }
        finally {
            setBusy(false);
        }
    }, []);
    const openPanel = useCallback(() => {
        actions.openPanel();
        void run(() => props.refresh());
    }, [actions, props, run]);
    const browse = useCallback((targetId, path) => {
        actions.startBrowse(targetId, path);
        void run(async () => { setListing(await props.browse(targetId, path === '' ? undefined : path)); });
    }, [actions, props, run]);
    // Load the first level whenever the browse view opens on a target.
    useEffect(() => {
        const targetId = view.browseTargetId;
        if (!view.open || view.view !== 'browse' || listing !== null || targetId === null)
            return;
        void run(async () => {
            setListing(await props.browse(targetId, view.browsePath === '' ? undefined : view.browsePath));
        });
    }, [view.open, view.view, view.browseTargetId, view.browsePath, listing, props, run]);
    const closePanel = useCallback(() => {
        actions.closePanel();
        setListing(null);
        setFolderDraft(null);
        setError(null);
    }, [actions]);
    const boundWorkspaceId = sessionId === undefined
        ? undefined
        : catalog.workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.id;
    const targetName = (targetId) => catalog.targets.find(target => target.id === targetId)?.displayName ?? targetId;
    /** Header text for a bound session: the world it runs in, then its directory. */
    const boundSummary = () => {
        const workspace = catalog.workspaces.find(candidate => candidate.id === boundWorkspaceId);
        if (workspace === undefined)
            return t('panel.bound');
        return `${t('panel.bound')} · ${targetName(workspace.targetId)} · ${workspace.cwd}`;
    };
    const worlds = [
        { key: LOCAL_WORLD_KEY, label: t('panel.world.local') },
        ...catalog.targets.map(target => ({ key: target.id, label: target.displayName })),
    ];
    const showsWorld = (key) => view.worldFilter === null || view.worldFilter === key;
    const renderLocalWorld = () => (_jsxs("li", { className: css.target, children: [_jsxs("div", { className: css.worldHead, children: [_jsx(IconFolderOpen16, { className: css.folderIcon }), _jsx("span", { className: css.targetName, children: t('panel.world.local') })] }), _jsxs("div", { className: css.rows, children: [catalog.localWorkspaces.length === 0
                        ? _jsx("p", { className: css.hint, children: t('panel.local.empty') })
                        : (_jsx("ul", { className: css.list, children: catalog.localWorkspaces.map(workspace => (_jsxs("li", { className: css.workspaceRow, children: [_jsx(IconFolderOpen16, { className: css.folderIcon }), _jsxs("span", { className: css.workspaceText, children: [_jsx("span", { className: css.workspaceTitle, children: workspace.title }), _jsx("span", { className: css.workspacePath, children: workspace.path })] }), sessionId !== undefined && workspace.sessionIds.includes(sessionId) && (_jsx("span", { className: css.bound, children: t('panel.bound') }))] }, workspace.id))) })), _jsx("p", { className: css.hint, children: t('panel.local.hint') })] })] }, LOCAL_WORLD_KEY));
    const renderTargets = () => {
        if (catalog.phase === 'loading' && catalog.targets.length === 0) {
            return _jsx("p", { className: css.hint, children: t('panel.loading') });
        }
        if (catalog.targets.length === 0 && catalog.localWorkspaces.length === 0) {
            return _jsx("p", { className: css.hint, children: t('panel.targets.empty') });
        }
        return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.filter, role: "group", "aria-label": t('panel.world.filter'), children: [_jsx("button", { type: "button", className: clsx(css.chip, view.worldFilter === null && css.chipActive), onClick: () => { actions.setWorldFilter(null); }, children: t('panel.world.all') }), worlds.map(world => (_jsx("button", { type: "button", className: clsx(css.chip, view.worldFilter === world.key && css.chipActive), onClick: () => { actions.setWorldFilter(world.key); }, children: world.label }, world.key)))] }), _jsxs("ul", { className: css.list, children: [showsWorld(LOCAL_WORLD_KEY) && renderLocalWorld(), catalog.targets.filter(target => showsWorld(target.id)).map((target) => {
                            const rows = catalog.workspaces.filter(workspace => workspace.targetId === target.id);
                            const expanded = view.expandedTargets[target.id] === true;
                            return (_jsxs("li", { className: css.target, children: [_jsxs("button", { type: "button", className: css.targetRow, "aria-expanded": expanded, onClick: () => { actions.setTargetExpanded(target.id, !expanded); }, children: [_jsx(IconChevronRightOutline14, { className: clsx(css.chevron, expanded && css.chevronOpen) }), _jsx(IconGlobeOutline14, { className: css.targetIcon }), _jsx("span", { className: css.targetName, children: target.displayName }), _jsx(StateDot, { state: statusDot(target.status) }), _jsx("span", { className: css.statusText, children: t(statusKey(target.status)) })] }), expanded && (_jsxs("div", { className: css.rows, children: [rows.length === 0
                                                ? _jsx("p", { className: css.hint, children: t('panel.target.workspaces.empty') })
                                                : (_jsx("ul", { className: css.list, children: rows.map(workspace => (_jsxs("li", { className: css.workspaceRow, children: [_jsx(IconFolderOpen16, { className: css.folderIcon }), _jsxs("span", { className: css.workspaceText, children: [_jsx("span", { className: css.workspaceTitle, children: workspace.title }), _jsx("span", { className: css.workspacePath, children: workspace.cwd })] }), workspace.id === boundWorkspaceId && (_jsx("span", { className: css.bound, children: t('panel.bound') })), _jsx(Button, { size: "sm", variant: "outline", disabled: busy || sessionId === undefined, onClick: () => {
                                                                    void run(async () => { await props.activateWorkspace(workspace.id); });
                                                                }, children: t('panel.workspace.use') }), _jsx(Button, { size: "sm", disabled: busy, "aria-label": t('panel.workspace.remove'), onClick: () => {
                                                                    void run(async () => { await props.removeWorkspace(workspace.id); });
                                                                }, children: _jsx(IconCloseOutline16, {}) })] }, workspace.id))) })), _jsx(Button, { size: "sm", icon: _jsx(IconPlusOutline16, {}), disabled: busy, onClick: () => { browse(target.id, ''); }, children: t('panel.target.browse') })] }))] }, target.id));
                        })] })] }));
    };
    const renderBrowse = () => {
        const targetId = view.browseTargetId;
        if (targetId === null)
            return _jsx("p", { className: css.hint, children: t('panel.loading') });
        const current = listing?.path ?? view.browsePath;
        return (_jsxs("div", { className: css.browse, children: [_jsxs("div", { className: css.browseHead, children: [_jsxs(Button, { size: "sm", icon: _jsx(IconChevronLeftOutline14, {}), disabled: busy, onClick: () => { actions.backToTargets(); setListing(null); }, children: [t('browse.target'), ": ", targetName(targetId)] }), _jsx("span", { className: css.crumb, children: current === '' ? '/' : current }), current !== '' && (_jsx(Button, { size: "sm", disabled: busy, onClick: () => {
                                const parent = parentPath(current);
                                actions.setBrowsePath(parent);
                                void run(async () => { setListing(await props.browse(targetId, parent)); });
                            }, children: t('browse.up') }))] }), listing === null
                    ? _jsx("p", { className: css.hint, children: t('browse.loading') })
                    : listing.entries.length === 0
                        ? _jsx("p", { className: css.hint, children: t('browse.empty') })
                        : (_jsx("ul", { className: css.list, children: listing.entries.filter(entry => entry.type === 'directory').map((entry) => {
                                const child = current === '' || current.endsWith('/')
                                    ? `${current}${entry.name}`
                                    : `${current}/${entry.name}`;
                                return (_jsx("li", { children: _jsxs("button", { type: "button", className: css.dirRow, onClick: () => {
                                            actions.setBrowsePath(child);
                                            void run(async () => { setListing(await props.browse(targetId, child)); });
                                        }, children: [_jsx(IconFolderClose16, { className: css.folderIcon }), _jsx("span", { children: entry.name })] }) }, entry.name));
                            }) })), _jsxs("div", { className: css.browseFoot, children: [folderDraft === null
                            ? (_jsx(Button, { size: "sm", icon: _jsx(IconPlusOutline16, {}), disabled: busy || listing === null, onClick: () => { setFolderDraft(''); }, children: t('browse.newFolder') }))
                            : (_jsxs("form", { className: css.folderForm, onSubmit: (event) => {
                                    event.preventDefault();
                                    const name = folderDraft.trim();
                                    if (name === '')
                                        return;
                                    void run(async () => {
                                        await props.createFolder(targetId, current === '' ? '/' : current, name);
                                        setFolderDraft(null);
                                        setListing(await props.browse(targetId, current === '' ? undefined : current));
                                    });
                                }, children: [_jsx("input", { className: css.folderInput, "aria-label": t('browse.folderName'), value: folderDraft, autoFocus: true, onChange: (event) => { setFolderDraft(event.target.value); } }), _jsx(Button, { size: "sm", variant: "primary", type: "submit", disabled: busy || folderDraft.trim() === '', children: t('browse.create') }), _jsx(Button, { size: "sm", type: "button", onClick: () => { setFolderDraft(null); }, children: t('browse.cancel') })] })), _jsx(Button, { size: "sm", variant: "primary", disabled: busy || listing === null || current === '', onClick: () => {
                                void run(async () => {
                                    const workspaceId = await props.addWorkspace({ targetId, path: current });
                                    await props.activateWorkspace(workspaceId);
                                    closePanel();
                                });
                            }, children: t('browse.select') })] })] }));
    };
    return (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "toolbar", className: clsx(css.entry, !wide && css.entryRail), icon: _jsx(IconGlobeOutline14, {}), "aria-label": t('entry.tooltip'), title: t('entry.tooltip'), onClick: openPanel, children: wide && t('entry.label') }), _jsx(Modal, { open: view.open, onClose: closePanel, title: t('panel.title'), closeLabel: t('panel.close'), className: clsx(css.modal), children: _jsxs("div", { className: css.body, children: [_jsxs("div", { className: css.head, children: [_jsx("span", { className: css.session, children: sessionId === undefined
                                        ? t('panel.noSession')
                                        : boundWorkspaceId === undefined
                                            ? t('panel.unbound')
                                            : boundSummary() }), boundWorkspaceId !== undefined && sessionId !== undefined && (_jsx(Button, { size: "sm", variant: "outline", disabled: busy, onClick: () => { void run(() => props.unbindSession()); }, children: t('panel.backToLocal') })), _jsx(Button, { size: "sm", icon: _jsx(IconRefreshOutline14, {}), disabled: busy, "aria-label": t('panel.refresh'), onClick: () => { void run(() => props.refresh()); } }), busy && _jsx("span", { className: css.busy, children: t('panel.busy') })] }), error !== null && (_jsxs("p", { className: css.error, role: "alert", children: [_jsx("strong", { children: t('error.title') }), " ", error] })), view.view === 'targets' ? renderTargets() : renderBrowse()] }) })] }));
}
//# sourceMappingURL=RemoteWorkspaceEntry.js.map