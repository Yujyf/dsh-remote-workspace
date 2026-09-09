# @yujyf/dsh-remote-workspace

让同一个 DSH 会话运行在 **Local** 或 **WSL** 执行世界里：在 Web GUI 里按会话选择执行目标，不 fork DSH，也不新增任何 `wsl_*` 模型工具。

[English](README.md)

## 它做什么

DSH 每个 profile 只提供一个文件系统后端和一个子进程后端。本包把这两个后端换成 **路由器**：模型可见的工具（`bash`、`read_file`、`write_file`、`edit_file` 等）名称与 schema 完全不变，由底层后端解析当前会话绑定的工作区，再委派给对应的执行世界。

- **Local 目标** —— 保持 DSH 自带的沙箱本地后端不变。
- **WSL 目标** —— 通过 `wsl.exe` 进入某个发行版；文件与进程操作都在该发行版内执行，使用它自己的 POSIX 路径、HOME 和工具链。

侧边栏新增一个入口用于选择：挑目标、浏览文件夹、登记为工作区，并绑定到当前会话。绑定之后，该会话的后续模型请求就在那里执行。

## 环境要求

| | |
|---|---|
| DSH | `>=0.1.0 <0.2` |
| Node | `^22.19 \|\| >=24` |
| 操作系统 | WSL 目标需要 Windows 10/11；Local 目标在 macOS 与 Linux 上同样可用 |
| WSL | `wsl.exe` 在 `PATH` 中，且至少注册了一个发行版 |

WSL 目标只在 Windows 上枚举（`process.platform === 'win32'`）；其他平台的目标列表只有 Local。

## 安装

```sh
dsh plugin --profile web add github:Yujyf/dsh-remote-workspace
```

该命令会在 profile 目录内转发给 pnpm，随后按已安装状态重建 `dsh.profile.bundles`，因此本包的 `cordis.patch.yml` 会自动加入 profile 的补丁层。重启该 profile（或刷新 Web GUI）即可生效。

`lib/` 已随仓库提交，安装过程不执行构建。卸载：

```sh
dsh plugin --profile web remove @yujyf/dsh-remote-workspace
```

## 使用

1. 在 Web GUI 中打开一个会话。
2. 点击侧边栏底部的 **远程工作区**。
3. 选择一个目标，状态点会显示 `可用`、`启动中`、`已停止` 或 `不可用`。
4. 点击 **浏览文件夹…**，进入项目目录，选择 **使用此文件夹**。该文件夹即被登记为工作区并连接。
5. 在工作区行上点击 **在此会话中使用**。面板标题随后显示 *当前会话在此执行*；该会话的 `bash`、读文件、改文件都在该工作区执行。
6. **删除** 只删除登记记录，不会删除文件夹或其中的文件。

未绑定任何工作区的会话继续在本地执行。绑定是按会话生效的，所以同时打开的两个会话可以分别运行在两个不同的世界里。

## 组成方式

五个 Cordis 插件，各占一个能力切面：

| 入口 | 服务 | 角色 |
|---|---|---|
| `.` | `ctx.remoteWorkspace` | 所有者：目标、工作区登记、连接/断开、会话绑定、健康检查、目录列举、规范化 URI 解析 |
| `./fs` | `ctx.fs` | 文件系统路由器：本地绑定 → 隔离的沙箱后端；WSL 绑定 → helper 驱动的 `WslFileSystem` |
| `./subprocess` | `ctx.subprocess` | 进程路由器：本地绑定 → 隔离的本地后端；WSL 绑定 → `wsl.exe` argv 转换 |
| `./controller` | Remote 动词 | 浏览器侧 RPC，转发所有者的 API |
| `./ui` + `./client` | 侧边栏插槽 | 入口、面板、文件夹浏览器 |

`cordis.patch.yml` 会停用自带的 `subprocess` 与 `fs-sandbox` 两行，并插入这五个插件，保证组合后的树里 `ctx.fs` 与 `ctx.subprocess` 各自只有一个提供者。

本包坚持的设计约束：

- **不新增 `wsl_*` 工具。** 执行世界由后端选择，不由模型挑选工具名。
- **不伪造 `cwd`。** WSL 工作区不会被映射成 Windows 的 `\\wsl.localhost\…` 或 `/mnt/c/…`；路径始终是执行它的那个世界的原生写法。
- **无守护进程、无运行时安装。** WSL 桥在需要时于发行版内启动一个 helper 进程，用 stdio 上的行协议通信；没有 HTTP 服务，也不要求 WSL 内安装 Node 或 Python。
- **不改 DSH 核心。** 全部通过已发布的插件与补丁层契约组合。

### 配置

在 profile 的 `cordis.yml` 中为插入的 `remote-workspace` 行设置（括号内为默认值）：

```yaml
- id: remote-workspace
  name: '@yujyf/dsh-remote-workspace'
  config:
    autoStart: true             # 连接该发行版下的工作区时自动启动已停止的发行版
    shutdownOnDisconnect: false # 绝不停掉可能仍被其他会话使用的发行版
    commandTimeoutMs: 30000     # 单次 wsl.exe 调用的超时上限
```

## 已知限制

- **远程世界目前仅支持 Windows + WSL。** SSH、Docker、Podman 由目标类型抽象预留，但尚未实现。
- **每个会话只有一个绑定。** 会话中途可以改绑；旧世界里的进程不会被迁移。
- **WSL 文件操作按调用跨桥。** 没有常驻的 guest 端文件句柄，每次调用都要过桥。
- **不会自动终止发行版**，除非把 `shutdownOnDisconnect` 设为 `true`。

## 开发

```sh
pnpm install
pnpm run typecheck   # host 面 + client 面
pnpm run build       # tsc（host 面、client 声明）+ esbuild 浏览器包
```

`lib/` 是刻意提交的：git 安装不应需要构建步骤，而 pnpm 在构建脚本被 allowlist 之前会拦截它们。任何源码改动都要重新构建并一并提交 `lib/`。

目录结构：

```
src/                 host 面：所有者、fs 路由器、subprocess 路由器、controller、线协议类型
src/client/          浏览器侧：插槽入口、面板组件、store、词典
cordis.patch.yml     本包贡献的 profile 层
scripts/build.mjs    tsc + esbuild 的闭包工厂浏览器包
```

两个编译面必须分开：host 面会引入 `@deepseek-ai/dsh-session` 的 Host 侧 `ctx.sessions` 合并声明，与 Client 会话对象层对同一成员的合并声明冲突。
