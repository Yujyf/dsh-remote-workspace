# @yujyf/dsh-remote-workspace

Run one DSH session inside a **Local** or **WSL** execution world, chosen per session from the Web GUI, without forking DSH and without adding a single `wsl_*` model tool.

[简体中文](README.zh.md)

## What it does

DSH ships one filesystem backend and one subprocess backend per profile. This package replaces both with **routers**: every existing model tool (`bash`, `read_file`, `write_file`, `edit_file`, …) keeps its name and schema, while the backend underneath resolves the session's current workspace binding and delegates to the right execution world.

- **Local target** — the shipped sandboxed local backend, unchanged.
- **WSL target** — a distribution reached through `wsl.exe`; file and process operations run inside that distribution with POSIX paths, its own home, and its own toolchain.

One sidebar entry registers the selector: pick a target, browse to a folder, register it as a workspace, and bind it to the open session. From the next model request on, that session's tools execute there.

## Requirements

| | |
|---|---|
| DSH | `>=0.1.0 <0.2` |
| Node | `^22.19 \|\| >=24` |
| OS | Windows 10/11 for WSL targets; the Local target also works on macOS and Linux |
| WSL | `wsl.exe` on `PATH`, with at least one registered distribution |

WSL targets are only enumerated on Windows (`process.platform === 'win32'`); elsewhere the target list contains the Local target alone.

## Install

```sh
dsh plugin --profile web add github:Yujyf/dsh-remote-workspace
```

The command forwards to pnpm inside the profile directory and then reconciles `dsh.profile.bundles`, so this package's `cordis.patch.yml` joins the profile's patch layer automatically. Restart the profile (or reload the Web GUI) to compose it.

Prebuilt `lib/` is committed, so the install runs no build step. Removing it:

```sh
dsh plugin --profile web remove @yujyf/dsh-remote-workspace
```

## Use

1. Open a session in the Web GUI.
2. Click **Remote workspace** at the bottom of the sidebar.
3. Pick a target. The status dot shows `Available`, `Starting`, `Stopped`, or `Unavailable`.
4. **Browse folders…**, navigate to the project directory, and choose **Use this folder**. The folder is registered as a workspace and connected.
5. Click **Use in this session** on a workspace row. The panel header then reads *This session runs here*; `bash`, file reads, and file edits for that session execute in that workspace.
6. **Remove** deletes the registration only — the folder and its files stay untouched.

A session with no binding keeps running locally. Binding is per session, so two open sessions can execute in two different worlds at the same time.

## How it is wired

Five Cordis plugins, one capability seam each:

| Entry | Service | Role |
|---|---|---|
| `.` | `ctx.remoteWorkspace` | Owner: targets, workspace registrations, connect/disconnect, session binding, health, directory listing, canonical URI resolution |
| `./fs` | `ctx.fs` | Filesystem router: local binding → isolated sandboxed backend; WSL binding → helper-backed `WslFileSystem` |
| `./subprocess` | `ctx.subprocess` | Process router: local binding → isolated local backend; WSL binding → `wsl.exe` argv translation |
| `./controller` | Remote verbs | Browser-facing RPC over the owner's API |
| `./ui` + `./client` | sidebar slot | Selector entry, panel, folder browser |

`cordis.patch.yml` disables the shipped `subprocess` and `fs-sandbox` rows and inserts these five, so exactly one provider serves `ctx.fs` and `ctx.subprocess` in the composed tree.

Design constraints this package holds to:

- **No `wsl_*` tools.** Execution worlds are selected by the *backend*, not by the model's choice of tool name.
- **No fake `cwd`.** A WSL workspace is never presented to Windows as `\\wsl.localhost\…` or `/mnt/c/…`; paths stay native to the world that executes them.
- **No daemon, no runtime install.** The WSL bridge starts a helper process inside the distribution on demand and speaks a line protocol over stdio; no HTTP server, no Node or Python requirement inside WSL.
- **No DSH core changes.** Everything composes through the published plugin and patch-layer contracts.

### Configuration

Set on the inserted `remote-workspace` row in the profile's `cordis.yml` (defaults shown):

```yaml
- id: remote-workspace
  name: '@yujyf/dsh-remote-workspace'
  config:
    autoStart: true             # start a stopped distribution when one of its workspaces connects
    shutdownOnDisconnect: false # never terminate a distribution another session may be using
    commandTimeoutMs: 30000     # ceiling for one wsl.exe invocation
```

## Known limitations

- **Windows + WSL only for remote worlds.** SSH, Docker, and Podman targets are reserved by the target-type abstraction but not implemented.
- **One binding per session.** Rebinding mid-session is allowed; the previous world's processes are not migrated.
- **WSL file operations are per-call.** There is no persistent in-guest filesystem handle; each call crosses the bridge.
- **Distribution termination is never automatic** unless you set `shutdownOnDisconnect: true`.

## Development

```sh
pnpm install
pnpm run typecheck   # host face + client face
pnpm run test        # behavior tests for the pure workspace-identity helpers
pnpm run build       # tsc (host face, client declarations) + esbuild browser bundle
```

`lib/` is committed on purpose: a git install must not need a build step, and pnpm blocks dependency build scripts until they are allowlisted. Rebuild and commit `lib/` together with any source change.

Layout:

```
src/                 host face: owner, fs router, subprocess router, controller, wire types
src/client/          browser half: slot entry, panel component, store, dictionaries
tests/               behavior tests, run against the built lib/
cordis.patch.yml     the profile layer this package contributes
scripts/build.mjs    tsc + esbuild closure-factory bundle for the browser half
```

The two compiler faces stay separate because the host face pulls in `@deepseek-ai/dsh-session`'s Host `ctx.sessions` merge, which conflicts with the Client Session object layer's merge of the same member.
