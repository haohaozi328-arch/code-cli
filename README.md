# dsh-code-cli

`dsh` —— deepseek dsh 终端 AI 编程助手的 npm 全局安装封装。

安装后获得全局命令 `dsh`，打开 code profile 的 Ink 终端交互界面（TUI），
效果与开发模式下的 `pnpm dsh --profile code` 一致。

## 安装

直接从 GitHub 安装（无需单独配置 registry）：

```bash
npm install -g github:haohaozi328-arch/code-cli
```

要求 Node.js >= 20。npm >= 11 默认禁止依赖的安装脚本，如需 node-pty 等原生模块
（终端面板功能依赖它），首次安装请追加
`--allow-scripts=node-pty,fs-ext,koffi,@deepseek-ai/dsh-subprocess-local`；
不追加也不影响对话功能。

> 命令名刻意使用 `dsh`（而非 `code`），避免与 VS Code 自带的 `code`
> 命令冲突；两者可共存互不影响。0.1.2 起原 `code` 命令更名为 `dsh`。

## 使用

```bash
dsh
```

即在当前目录打开 TUI 对话界面。

- 首次启动会自动创建 `$DSH_HOME/profiles/code` 的 profile 配置
  （bundles：`@deepseek-ai/dsh-base` + `@dsh-external/dsh-cli-app`）。
- `dsh` 之后的参数原样透传给 dsh 启动器，例如
  `dsh --dump-config`、`dsh --plugin <name>`。
- 登录、配置等数据全部存放于 `$DSH_HOME`（默认 Windows 为
  `%USERPROFILE%\.dsh`，macOS/Linux 为 `~/.dsh`）。

## 卸载

```bash
npm uninstall -g dsh-code-cli
```

## 组成

| 部分 | 来源 |
| --- | --- |
| `bin/dsh.js` | 启动器：释放内置前端、初始化 profile，并拉起 `dsh --profile code` |
| `@deepseek-ai/dsh` | 官方 dsh 启动器（公开 npm 包，锁定 `0.1.3-alpha.2`） |
| `vendor/dsh-cli-app/` | 本仓库内置的 code TUI 前端包（Ink），首次启动 `dsh` 时自动释放到包内 node_modules |

协议：MIT
