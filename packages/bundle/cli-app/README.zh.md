---
description: "dsh 的终端交互前端（TUI）：Ink 渲染的交互式 REPL，流式对话、工具卡片、审批、任务面板与会话管理，供用户运行 dsh 的 cli/code profile。"
kind: "package-bundle"
---

# @dsh-external/dsh-cli-app

[English](README.md) | 中文

## 概述

运行 `dsh --profile cli`，终端就变成一个交互式 agent 控制台：Ink 渲染的 REPL，流式回答、思考过程展示、工具卡片、审批提示、任务面板与完整会话管理，全部以进程内方式组合在 `dsh-base` 之上。一切皆插件：不改任何官方核心，一个 bundle 层（一个 profile patch 加一个 glue 插件）叠加在 base 的进程级行上。`code` profile 装配同一 bundle，采用 opencode 式布局。会话以 durable JSONL 持久化，与其他所有表层共享，对话可以从终端发起、由任意会话工具检视。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

从装配了本包的 profile 启动终端 UI。flag 微调启动方式。

### 启动终端 UI

```sh
dsh --profile cli                       # new session
dsh --profile cli --resume <sessionId>  # resume a persisted session
dsh --profile cli --theme deep-forest   # pick a theme
dsh --profile cli --ui opencode         # switch the layout for one run
```

`cli` profile 是用户层目录（`~/.dsh/profiles/cli`），bundle 列表为 `[@deepseek-ai/dsh-base, @dsh-external/dsh-cli-app]`；凭证复用 `~/.dsh` 现有配置。`code` profile 装配同一 bundle，用 profile 级 overlay 把 `ui` 设为 `opencode`。未知的主题或布局名在启动时 fail-loud，不会静默回退。

### 你会得到

- 流式对话与思考过程展示（`Ctrl+R` 展开/收起最近一条），经 markdown 子集渲染：行内 code/**bold**/*italic*、围栏代码、标题、列表、引用。
- 全生命周期工具卡片：流式参数预览、折叠结果、running→done/error 状态与图标。
- 审批提示（`[a] allow once · [r] reject · [esc] cancel`），自 agent scope 桥接，配 `/perm` 预设。
- 会话面：`/new`、`/fork`、覆盖最近 50 条持久化会话的 `/sessions` 选择器，以及由真实模型目录驱动的 `/model` 选择器（切换即 fork 会话并保留历史）。
- 技能调用（Claude Code / opencode 式）：`/skills` 弹出本会话用户可调用技能的选择器；回车把 `/<名称> ` 暂存进输入框等待补充指引，`/<名称> [指引]` 原样发送，由宿主 skill 边界为该步注入该技能的 `<skill_content>`——同名命令优先，未知或仅模型可调用的名字仍回 unknown 提示。
- 任务面板，投影 agent 的 `todo_write` 清单（`[✓]/[•]/[ ]`、`Ctrl+T` 折叠、resume/fork 后从 log 重建）。
- 带计量的状态行：`token 42.5/s` 吞吐、累计用量，以及压缩落地即时降档的上下文占用环。
- agent 运行时的盲文 spinner 与已用时间；运行中输入的普通提示按 FIFO 排队，空闲沿逐条发送（斜杠命令不受限）。
- 一套交互内核上的两种布局：`classic`（单列、`❯` 提示、底部状态行）与 opencode 式（空会话居中欢迎页，对话后全宽）。
- 全屏任务看板（`dsh-taskboard`）：`Ctrl+B` 把对话切换为看板——任务清单、可拖动的逐回合对话时间轴（↑↓ 或 PgUp/PgDn 选择回合，内容窗格按终端高度截取显示该回合对话、最新消息优先：时钟时段、你的提问、助手回复、工具调用与输出 token；`●` 标记 live 回合、`❯` 标记选中回合）、运行中的实时用时、排队深度与用量/上下文读数；同一组合键切回。
- 输入历史与会话命名：↑/↓ 回溯本进程发过的提示词（每个会话用自己的持久化提示词播种共享历史），`/title <text>` 重命名会话、裸 `/title` 弹出行内编辑器（带当前持久化标题，Enter 确认、Esc 取消），`/title <text>` 仍可直接改名——状态栏与 `/sessions` 跟随持久化标题事件，手动重命名会钉住标题、自动生成不再覆盖。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 —— 点开查看</summary>

bundle 是一个 patch 加一个 glue 插件。patch 为其单会话树 restate base 的模式行（`system-prompt` persona、`tools` mode），并 insert cli 行：`code-runtime` 执行能力、`cli-startup` 参数解析器、`cli-app` glue 插件。与 web 表层不同，这里不禁用任何 base 行、不引入 agent-presets：单会话 TUI 直接消费 base 的进程级 agent 面。

数据一致性铁律：**durable session log 是唯一事实源**。`src/ui/transcript.ts` 里的同一个投影函数既做初始 replay，也吃每一条 live `session/event`；`assistant-stream` 只做进行中消息的增量补间，commit（`end` 帧带 seq）落地后该行从 log 重建。因此恢复的会话与进行中的会话绝不会被渲染成两种样子。

渲染遵循 Ink 的 `<Static>`：已定稿的转录行一次写入终端 scrollback，活动区只重绘流式行、浮层与输入。切换会话是同一 Ink 实例在新根 key 下的 `rerender`；app 不抓取鼠标、不使用备用屏、不主动清屏（会话边界与 `/clear` 除外，且只清视口）。`src/ui/resize.ts` 里的 `stdout.write` 包装层在终端缩窄时校正 Ink 的擦除数，拖窄窗口不再残留多份帧。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | profile patch：restate base 模式行 + insert cli 行 |
| [`src/startup.ts`](src/startup.ts) | `cli-startup` provider：`--resume`、`--model`、`--cwd`、`--theme`、`--ui`、`--help` |
| [`src/index.ts`](src/index.ts) | `cli-app` glue 插件：单 Ink 实例上的会话循环 → `appExit` |
| [`src/sessions.ts`](src/sessions.ts) | 持久化会话目录、fork seed 捕获、显示格式 |
| [`src/ui/model.ts`](src/ui/model.ts) | UI 类型：快照、动作、控制器契约 |
| [`src/ui/transcript.ts`](src/ui/transcript.ts) | durable log → 消息行；replay 与 live 共用一个投影 |
| [`src/ui/state.ts`](src/ui/state.ts) | ViewModel：事件接线、动作、斜杠命令、运行排队 |
| [`src/ui/status.ts`](src/ui/status.ts) | 状态行算法：吞吐、用量、上下文占用与环 |
| [`src/ui/resize.ts`](src/ui/resize.ts) | 缩窄 reflow 擦除校正（包 `stdout.write`） |
| [`src/ui/App.tsx`](src/ui/App.tsx) | 根布局：Static 转录 + 活动区 + 输入 + 停靠面板 |
| [`tests/`](tests) | 单测（无 key，脚本化 agent）+ REAL-composition + 真 Ink reflow 断言 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

想深入了解设计、真机走查或共享核心时，读这些页面。

- [架构深读](../../../docs/cli-app/architecture.zh.md) — 目标、bundle patch、glue、UI 架构、能力矩阵、阶段计划。
- [人工真机走查](../../../docs/cli-app/manual-acceptance.zh.md) — 真机走查分组。
- [2026-09-12 修复报告](../../../docs/cli-app/2026-09-12-cli-fix-report.zh.md) — 会话/UI 回归修复与门禁。
- [Bundle 包地图](../README.zh.md) — 建在同一核心上的各表层。
- [dsh-base](../base/README.zh.md) — 终端 UI 运行其上的共享核心。

-----

<a id="model-experience"></a>
## 模型体验

间接地，经由每个被 insert 行的所属包，由它拥有该行的模型侧行为；patch 为其单会话树 restate `system-prompt` persona 与 `tools` mode。

#### KV Cache 效应

persona restate 是固定前缀内容，不会扰动轮次间的 KV-cache 复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

当前约束，如实登记而非静默：

- **工具审批**经 agent scope answerer 与 bus 桥接（`[a]/[r]/[esc]`）；`/perm` 走 permission-presets（沙箱 + 审批），缺该服务时退化为 `ask|never`。审计事件落 log；REAL-composition 覆盖 allow/reject/never。
- **会话面**：resume 选择器、`/new`、`/fork`、标题、会话标签；列表上限 50 条，按最新在前。
- **升级后首次打开会话列表**：修复前持久化的会话，其列表元数据靠对未缓存日志的一次只读冷推导（数秒，每进程一次）；每个会话下次打开后即入缓存，此后列表零 I/O。
- **`/new` 与空会话**：`/new` 只在当前会话已有真实对话时才打开新会话；未触碰的会话按「重置当前视图」处理，因此反复 `/new` 不再堆积会话。例外：从一个已使用的会话切向一个从未输入的会话时，后者在 handle 关闭时仍会落盘（官方 persistence 无删除接口）——每次至多一个。
- **会话边界清屏**：`/new`、`/sessions`、`/fork`、`/model` 换会话时清空当前视口并擦除 scrollback（xterm `ESC[3J`），旧会话内容不能再上滑看到；`/clear` 仍只清视口、保留 scrollback。
- **markdown 子集**：行内 code/**bold**/*italic*、围栏代码、标题、列表、引用；表格与链接未渲染。
- **思考折叠**：默认折叠为单行；`Ctrl+R` 展开/收起最近一条。
- **tool-call 参数流式预览**：流式行上的过渡预览；落地卡片接管。
- **转录不截断**：`state.messages` 与 durable log 等长（每行一个轻量对象）；已定稿的静态行写入后即离开 React 树。`/clear` 只清当前视口并重建静态列表；终端 scrollback 保留。
- **tokens**：resume 时从 durable log 补计用量；流式吞吐读数的前半段是字符密度估算，provider usage 到达后替换。
- **注册表斜杠命令**：`/compact /goal /plan` 经 `ctx.commands` 执行，输出作为普通可见行；未注册的 `/xxx` 提示 unknown，不发给模型。
- **输入**：单行输入（退格可用）；方向键编辑/多行粘贴未实现。
- **窗口缩放**：缩窄方向已校正；变宽方向依赖终端的折行合并行为（xterm/Windows Terminal 会合并），未做校正。活动区外的裸写（插件直接写 stdout）可能被误当作帧；只影响擦除数，不影响内容。
- **`auto` 主题**固定落深色；亮度探测未做。
- **覆盖门禁**：106 用例全绿 + REAL-composition + 真 Ink reflow 断言；100%/file 门禁是「贡献官方仓库」前置，非本地运行必需。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文 —— 点开查看</summary>

开发在 dsh 源码工作副本中进行（见 `docs/cli-app/architecture.md`；人工真机走查见 `docs/cli-app/manual-acceptance.md`）：

```sh
pnpm install && pnpm build:lib:host   # first run: official host lib outputs
pnpm dsh --profile cli                # cli-app itself runs from source via tsx

pnpm exec oxlint packages/bundle/cli-app            # lint
pnpm exec vitest run packages/bundle/cli-app/tests  # vitest (keyless, scripted agent)
```

包运行时从源码解析，依赖两条本地接线：root `package.json` devDependencies（bundle 解析锚点）与 `tsconfig.base.json` 手写 alias（`@dsh-external/dsh-cli-app*` → `src`）。merge upstream 时这两处需手动保留，连同 `packages/bundle/cli-app/tsconfig.json` 里的 project references。

</details>
