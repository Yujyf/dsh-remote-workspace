# @yujyf/dsh-remote-workspace

Run one DSH session inside a **Local** or **WSL** execution world, chosen per session from the Web GUI, without forking DSH and without adding a single `wsl_*` model tool.

[简体中文](README.zh.md)

## What it does

DSH ships one filesystem backend and one subprocess backend per profile. This package replaces both with **routers**: every existing model tool (`bash`, `read_file`, `write_file`, `edit_file`, …) keeps its name and schema, while the backend underneath resolves the session's current workspace binding and delegates to the right execution world.

- **No binding** — the shipped sandboxed local backend, unchanged. This is what every session uses until it is bound.
- **WSL target** — a distribution reached through `wsl.exe`; file and process operations run inside that distribution with POSIX paths, its own home, and its own toolchain.

One sidebar entry registers the selector: pick a target, browse to a folder, register it as a workspace, and bind it to the open session. From the next model request on, that session's shell commands, file reads and writes, and file searches execute there, with the bound directory as their working directory, and a runtime-context note tells the model which world it is in and to use `bash`.

The selector lists **remote** worlds only. The host's own world is never offered, because a session with nothing bound already runs there; on a Windows host the list is one row per WSL distribution. DSH's own workspaces appear beside them under **Local**, and the world filter narrows the list to a single execution world.

Every remote workspace is also registered as a **DSH workspace**, under the distribution's UNC view of its directory (`\\wsl.localhost\Ubuntu-26.04\home\me\project`) and titled `<name> · WSL <distro>`. That entry is what puts the workspace into DSH's own workspace list and in front of every other plugin reading `ctx.workspaceRegistry`, instead of living only in this package's registry; removing the registration removes it again. A session created in that workspace from DSH's own surface runs in the distribution without any binding, because the session directory already names the world.

**Run on the host again** releases the binding: the session goes back to running on the host, and nothing is deleted.

## Requirements

| | |
|---|---|
| DSH | `>=0.1.0 <0.2`; verified on `0.1.2-rc.1` (the version the desktop app ships) and built against the `0.1.5-alpha.2` type surface |
| Node | `^22.19 \|\| >=24` |
| OS | Windows 10/11 for WSL targets; on macOS and Linux the selector has no remote world to offer |
| WSL | `wsl.exe` on `PATH`, with at least one registered distribution |

WSL targets are only enumerated on Windows (`process.platform === 'win32'`). On every other platform the remote target list is empty, and sessions keep running in the host world.

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
2. Click **Remote workspace** at the bottom of the sidebar. The list shows **Local** (DSH's own workspaces) plus every WSL distribution; the filter row above it narrows the list to one world.
3. Pick a WSL distribution. The status dot shows `Available`, `Starting`, `Stopped`, or `Unavailable`; connecting a `Stopped` distribution starts it.
4. **Browse folders…**, navigate to the project directory, and choose **Use this folder**. The folder is registered as a workspace, connected, and added to DSH's own workspace list as `<name> · WSL <distro>`.
5. Click **Use in this session** on a workspace row. The panel header then reads *This session runs here · Ubuntu-26.04 · /home/me/project*, and `bash`, file reads, and file writes for that session execute in that directory. Relative paths resolve there, and the next request tells the model its world, directory, and to use `bash` instead of `pwsh`.
6. **Run on the host again** releases the binding; **Remove** deletes the registration only — the folder and its files stay untouched.

A session with no binding keeps running on the host. Binding is per session, so two open sessions can execute in two different worlds at the same time.

## How it is wired

Five Cordis plugins, one capability seam each:

| Entry | Service | Role |
|---|---|---|
| `.` | `ctx.remoteWorkspace` | Owner: targets, workspace registrations, connect/disconnect, session binding, health, directory listing, canonical URI resolution |
| `./fs` | `ctx.fs` | Filesystem router: local binding → isolated sandboxed backend; WSL binding → helper-backed `WslFileSystem` |
| `./subprocess` | `ctx.subprocess` | Process router: local binding → isolated local backend; WSL binding → `wsl.exe` argv translation |
| `./controller` | `ctx.webServer` route | JSON API the browser half calls: `POST /remote-workspace/api/<verb>` |
| `./ui` + `./client` | sidebar slot | Selector entry, panel, folder browser |

`cordis.patch.yml` disables the shipped `subprocess` and `fs-sandbox` rows and inserts these five, so exactly one provider serves `ctx.fs` and `ctx.subprocess` in the composed tree.

The browser half talks to the Host over a plain JSON route rather than a Remote namespace. DSH mounts Remote namespaces from a fixed list compiled into `@deepseek-ai/dsh-api-remotes`, so a package outside that assembly cannot contribute one; the client fiber would then wait forever for `remote.<namespace>` and the Web shell would never finish booting. The route applies the same browser-trust fence as the `/api` gateway: the request's Host authority must be loopback, or an authority the deployment declares in `webRuntime.trustedHosts`.

Design constraints this package holds to:

- **No `wsl_*` tools.** Execution worlds are selected by the *backend*, not by the model's choice of tool name.
- **No fake `cwd`.** A WSL workspace is never presented to Windows as `\\wsl.localhost\…` or `/mnt/c/…`; paths stay native to the world that executes them.
- **No daemon, no runtime install.** The WSL bridge starts a helper process inside the distribution on demand and speaks a line protocol over stdio; no HTTP server, no Node or Python requirement inside WSL.
- **No DSH core changes.** Everything composes through the published plugin and patch-layer contracts.

### How a bound session works in its world

DSH fixes a session's working directory when the session is created, and that header is immutable. Binding therefore does not rewrite the session; the routers translate each request instead:

- The session's own host directory (`E:\work\project`) becomes the bound workspace directory (`/home/me/project`), which is where a defaulted or relative tool path lands.
- Any other host path keeps its drive mapping (`C:\Users\me` is `/mnt/c/Users/me`), so an explicit `workdir` still reaches the host file it names.
- A runtime-context entry, emitted only while the session is bound, states the distribution, the working directory, and that `bash` is the shell to use — PowerShell does not exist inside WSL.

The session's recorded directory is read from the live session; the binding stays durable, so a restart rebinds the same world.

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
- **The DSH workspace entry carries the UNC path.** DSH's workspace registry only accepts a directory the harness process resolves, so the registered workspace is `\\wsl.localhost\<distro>\…`; that is also what a session created there records as its directory. Registering one therefore needs the distribution running (the flow connects first), and a distribution stopped afterwards leaves that workspace's directory unresolvable to DSH.
- **One binding per session.** Rebinding mid-session is allowed; the previous world's processes are not migrated.
- **The session header keeps its host directory.** DSH exposes no way to rewrite it, so the model's prompt still names the host path while the tools resolve in the bound world; the runtime-context note is what keeps the two consistent.
- **`pwsh` cannot run in a bound session.** PowerShell does not exist inside WSL; the note directs the model to `bash`. The tool stays in the schema because DSH selects tools by host platform.
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
