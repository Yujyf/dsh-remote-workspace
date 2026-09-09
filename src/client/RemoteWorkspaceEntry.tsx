/**
 * The remote-workspace selector: the sidebar foot's entry plus the panel it
 * opens. The panel lists every discovered execution target with its reachable
 * status and its registered workspaces, and offers two ways to adopt one —
 * "Use in this session" on an existing row, or a folder browser that registers
 * a new workspace from a chosen directory. Binding a workspace to the open
 * session is what routes that session's official tools into the target; with
 * no open session the panel says so instead of silently doing nothing.
 *
 * All data arrives through the injected face and the catalog hook; this file
 * holds only view state (which view, the level on screen, in-flight verbs).
 */
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import {
  Button, IconChevronLeftOutline14, IconChevronRightOutline14, IconCloseOutline16, IconFolderClose16,
  IconFolderOpen16, IconGlobeOutline14, IconPlusOutline16, IconRefreshOutline14, Modal, StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkspaceTargetId } from '../wire-types.ts'
import type { RemoteWorkspaceEntryProps } from './contract.ts'
import css from './RemoteWorkspaceEntry.module.css'

/** How a target's reachability maps onto the shared status dot. */
function statusDot(status: string): StateDotState {
  switch (status) {
    case 'ready': return 'done'
    case 'starting': return 'ongoing'
    case 'stopped': return 'warning'
    case 'error': return 'error'
    default: return 'warning'
  }
}

/** The localized word for one target status. */
function statusKey(status: string): 'status.ready' | 'status.starting' | 'status.stopped'
| 'status.unavailable' | 'status.unknown' | 'status.error' {
  switch (status) {
    case 'ready': return 'status.ready'
    case 'starting': return 'status.starting'
    case 'stopped': return 'status.stopped'
    case 'unavailable': return 'status.unavailable'
    case 'error': return 'status.error'
    default: return 'status.unknown'
  }
}

/** Parent directory of an absolute POSIX or Windows path, or the path itself at a root. */
function parentPath(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, '')
  const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (cut <= 0) return trimmed.startsWith('/') ? '/' : trimmed
  const parent = trimmed.slice(0, cut)
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent
}

/**
 * Sidebar-foot entry: a labelled button in the wide column, an icon in the rail.
 * @param props - owner geometry, viewing store, injected face, and copy.
 * @returns the entry element, with its panel while open.
 */
export function RemoteWorkspaceEntry(props: RemoteWorkspaceEntryProps): React.ReactElement {
  const { t, actions, wide } = props
  const view = props.useStore(s => s)
  const catalog = props.useRemoteWorkspaces(s => s)
  const sessionId = props.currentSessionId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listing, setListing] = useState<{ path: string; entries: readonly { name: string; type: string }[] } | null>(null)
  const [folderDraft, setFolderDraft] = useState<string | null>(null)

  const run = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await operation()
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }, [])

  const openPanel = useCallback((): void => {
    actions.openPanel()
    void run(() => props.refresh())
  }, [actions, props, run])

  const browse = useCallback((targetId: WorkspaceTargetId, path: string): void => {
    actions.startBrowse(targetId, path)
    void run(async () => { setListing(await props.browse(targetId, path === '' ? undefined : path)) })
  }, [actions, props, run])

  // Load the first level whenever the browse view opens on a target.
  useEffect(() => {
    const targetId = view.browseTargetId
    if (!view.open || view.view !== 'browse' || listing !== null || targetId === null) return
    void run(async () => {
      setListing(await props.browse(targetId, view.browsePath === '' ? undefined : view.browsePath))
    })
  }, [view.open, view.view, view.browseTargetId, view.browsePath, listing, props, run])

  const closePanel = useCallback((): void => {
    actions.closePanel()
    setListing(null)
    setFolderDraft(null)
    setError(null)
  }, [actions])

  const boundWorkspaceId = sessionId === undefined
    ? undefined
    : catalog.workspaces.find(workspace => workspace.sessionIds.includes(sessionId))?.id

  const targetName = (targetId: string): string =>
    catalog.targets.find(target => target.id === targetId)?.displayName ?? targetId

  const renderTargets = (): React.ReactElement => {
    if (catalog.phase === 'loading' && catalog.targets.length === 0) {
      return <p className={css.hint}>{t('panel.loading')}</p>
    }
    if (catalog.targets.length === 0) {
      return <p className={css.hint}>{t('panel.targets.empty')}</p>
    }
    return (
      <ul className={css.list}>
        {catalog.targets.map((target) => {
          const rows = catalog.workspaces.filter(workspace => workspace.targetId === target.id)
          const expanded = view.expandedTargets[target.id] === true
          return (
            <li key={target.id} className={css.target}>
              <button
                type="button"
                className={css.targetRow}
                aria-expanded={expanded}
                onClick={() => { actions.setTargetExpanded(target.id, !expanded) }}
              >
                <IconChevronRightOutline14 className={clsx(css.chevron, expanded && css.chevronOpen)} />
                <IconGlobeOutline14 className={css.targetIcon} />
                <span className={css.targetName}>{target.displayName}</span>
                <StateDot state={statusDot(target.status)} />
                <span className={css.statusText}>{t(statusKey(target.status))}</span>
              </button>
              {expanded && (
                <div className={css.rows}>
                  {rows.length === 0
                    ? <p className={css.hint}>{t('panel.target.workspaces.empty')}</p>
                    : (
                      <ul className={css.list}>
                        {rows.map(workspace => (
                          <li key={workspace.id} className={css.workspaceRow}>
                            <IconFolderOpen16 className={css.folderIcon} />
                            <span className={css.workspaceText}>
                              <span className={css.workspaceTitle}>{workspace.title}</span>
                              <span className={css.workspacePath}>{workspace.cwd}</span>
                            </span>
                            {workspace.id === boundWorkspaceId && (
                              <span className={css.bound}>{t('panel.bound')}</span>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || sessionId === undefined}
                              onClick={() => {
                                void run(async () => { await props.activateWorkspace(workspace.id) })
                              }}
                            >
                              {t('panel.workspace.use')}
                            </Button>
                            <Button
                              size="sm"
                              disabled={busy}
                              aria-label={t('panel.workspace.remove')}
                              onClick={() => {
                                void run(async () => { await props.removeWorkspace(workspace.id) })
                              }}
                            >
                              <IconCloseOutline16 />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  <Button
                    size="sm"
                    icon={<IconPlusOutline16 />}
                    disabled={busy}
                    onClick={() => { browse(target.id, '') }}
                  >
                    {t('panel.target.browse')}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  const renderBrowse = (): React.ReactElement => {
    const targetId = view.browseTargetId
    if (targetId === null) return <p className={css.hint}>{t('panel.loading')}</p>
    const current = listing?.path ?? view.browsePath
    return (
      <div className={css.browse}>
        <div className={css.browseHead}>
          <Button
            size="sm"
            icon={<IconChevronLeftOutline14 />}
            disabled={busy}
            onClick={() => { actions.backToTargets(); setListing(null) }}
          >
            {t('browse.target')}: {targetName(targetId)}
          </Button>
          <span className={css.crumb}>{current === '' ? '/' : current}</span>
          {current !== '' && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const parent = parentPath(current)
                actions.setBrowsePath(parent)
                void run(async () => { setListing(await props.browse(targetId, parent)) })
              }}
            >
              {t('browse.up')}
            </Button>
          )}
        </div>
        {listing === null
          ? <p className={css.hint}>{t('browse.loading')}</p>
          : listing.entries.length === 0
            ? <p className={css.hint}>{t('browse.empty')}</p>
            : (
              <ul className={css.list}>
                {listing.entries.filter(entry => entry.type === 'directory').map((entry) => {
                  const child = current === '' || current.endsWith('/')
                    ? `${current}${entry.name}`
                    : `${current}/${entry.name}`
                  return (
                    <li key={entry.name}>
                      <button
                        type="button"
                        className={css.dirRow}
                        onClick={() => {
                          actions.setBrowsePath(child)
                          void run(async () => { setListing(await props.browse(targetId, child)) })
                        }}
                      >
                        <IconFolderClose16 className={css.folderIcon} />
                        <span>{entry.name}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
        <div className={css.browseFoot}>
          {folderDraft === null
            ? (
              <Button size="sm" icon={<IconPlusOutline16 />} disabled={busy || listing === null} onClick={() => { setFolderDraft('') }}>
                {t('browse.newFolder')}
              </Button>
            )
            : (
              <form
                className={css.folderForm}
                onSubmit={(event) => {
                  event.preventDefault()
                  const name = folderDraft.trim()
                  if (name === '') return
                  void run(async () => {
                    await props.createFolder(targetId, current === '' ? '/' : current, name)
                    setFolderDraft(null)
                    setListing(await props.browse(targetId, current === '' ? undefined : current))
                  })
                }}
              >
                <input
                  className={css.folderInput}
                  aria-label={t('browse.folderName')}
                  value={folderDraft}
                  autoFocus
                  onChange={(event) => { setFolderDraft(event.target.value) }}
                />
                <Button size="sm" variant="primary" type="submit" disabled={busy || folderDraft.trim() === ''}>
                  {t('browse.create')}
                </Button>
                <Button size="sm" type="button" onClick={() => { setFolderDraft(null) }}>
                  {t('browse.cancel')}
                </Button>
              </form>
            )}
          <Button
            size="sm"
            variant="primary"
            disabled={busy || listing === null || current === ''}
            onClick={() => {
              void run(async () => {
                const workspaceId = await props.addWorkspace({ targetId, path: current })
                await props.activateWorkspace(workspaceId)
                closePanel()
              })
            }}
          >
            {t('browse.select')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="toolbar"
        className={clsx(css.entry, !wide && css.entryRail)}
        icon={<IconGlobeOutline14 />}
        aria-label={t('entry.tooltip')}
        title={t('entry.tooltip')}
        onClick={openPanel}
      >
        {wide && t('entry.label')}
      </Button>
      <Modal
        open={view.open}
        onClose={closePanel}
        title={t('panel.title')}
        closeLabel={t('panel.close')}
        className={clsx(css.modal)}
      >
        <div className={css.body}>
          <div className={css.head}>
            <span className={css.session}>
              {sessionId === undefined
                ? t('panel.noSession')
                : boundWorkspaceId === undefined ? t('panel.unbound') : t('panel.bound')}
            </span>
            <Button
              size="sm"
              icon={<IconRefreshOutline14 />}
              disabled={busy}
              aria-label={t('panel.refresh')}
              onClick={() => { void run(() => props.refresh()) }}
            />
            {busy && <span className={css.busy}>{t('panel.busy')}</span>}
          </div>
          {error !== null && (
            <p className={css.error} role="alert">
              <strong>{t('error.title')}</strong> {error}
            </p>
          )}
          {view.view === 'targets' ? renderTargets() : renderBrowse()}
        </div>
      </Modal>
    </>
  )
}
