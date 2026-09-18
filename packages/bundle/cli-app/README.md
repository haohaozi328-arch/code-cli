# `@dsh-external/dsh-cli-app`

DeepSeek Harness 的**终端交互前端**（TUI）：一个 Ink 渲染的交互式 CLI，以官方 profile/bundle 插件形态直接跑在 `dsh-base` 之上。一切皆插件：不改任何官方核心，能力全部来自 base 的进程级组合。

```
dsh --profile cli                       # 新会话
dsh --profile cli --resume <sessionId>  # 恢复持久化会话
dsh --profile cli --theme deep-forest   # 指定主题
dsh --profile cli --ui opencode         # 临时切换布局（code profile 默认）
```

## 它是什么

官方 dsh 的产品面里，`web` 是浏览器 GUI，`headless` 是一次性任务运行器，`acp`/`sdk` 是协议服务。本 bundle 补上缺失的一环：**在终端里像 web 一样多轮交互**——流式输出、工具调用、审批、会话管理，全部进程内直连，零协议 hop。

| 面 | 交互 | 集成方式 |
|---|---|---|
| web | 浏览器 | host RPC + SSE（client 插件树） |
| **cli（本包）** | 终端 REPL | **进程内事件直连**（agent/* + session/event） |
| headless | 一次性 | 进程内直连 |

## 结构

```
packages/bundle/cli-app/
├── cordis.patch.yml       # profile patch：restate base 模式行 + insert cli 行
├── src/
│   ├── startup.ts         # 解析 --resume/--model/--cwd/--theme/--ui
│   ├── index.ts           # glue：单 Ink 实例上的会话循环 → appExit
│   ├── sessions.ts        # 持久化会话目录 + fork seed + 显示格式
│   └── ui/
│       ├── model.ts       # UI 类型：快照、动作、控制器契约
│       ├── transcript.ts  # durable log → 消息行（replay 与 live 共用投影）
│       ├── state.ts       # ViewModel：事件接线、动作、斜杠命令
│       ├── status.ts      # 状态行算法：吞吐/用量/上下文占用与环
│       ├── connect.ts     # /connect 向导（settings + credentials）
│       ├── copy.ts        # 全部用户可见文案（单一来源）
│       ├── messages.tsx   # 转录行组件（user / assistant / tool）
│       ├── overlays.tsx   # 会话选择器、选择列表、审批、命令面板
│       ├── index.ts       # UI 入口（glue 挂载的 App）
│       ├── App.tsx        # 根布局：Static 转录 + 活动区 + 输入
│       ├── resize.ts      # 缩窄时的 reflow 擦除校正（包 stdout.write）
│       ├── render-error.ts     # 异常 → 单行诊断
│       ├── terminal.ts    # 终端控制序列常量
│       ├── markdown.ts    # markdown 行内/块级投影（纯函数）
│       ├── markdown-view.tsx   # 投影结果的 Ink 渲染
│       └── theme.ts       # 双主题令牌
└── tests/                 # 单测（无 key）+ REAL-composition
```

数据一致性铁律：**durable session log 是唯一事实源**。`transcript.ts` 的同一个投影函数既做初始 replay，也吃每一条 live `session/event`；assistant-stream 只做进行中消息的增量补间，commit（`end` 帧带 seq）后从 log 重建该消息。

## 渲染模型（会话与滚动）

- Ink 的 `<Static>` 承载**已定稿**的转录行：写入一次即进入终端 scrollback，窗口缩放和滚动都不会重绘它们；活动区只剩流式行、浮层和输入行。
- 静态列表以 `${sessionId}:${transcriptEpoch}` 为 key：切换会话或 `/clear` 时整棵静态子树重建，旧会话的行不会串进新会话。
- 静态前缀与活动区的分界是**第一条未定稿行**，因此乱序定稿（例如运行中的工具卡之后才落地的命令输出）也不会打印到活动内容之上。
- 终端原生滚轮与滚动条直接可用：app 不抓取鼠标、不使用备用屏、不主动清屏。
- `/sessions` 选定后复用同一个 Ink 实例 `rerender`（新根 key = 新会话 id），不再 unmount + 手工清屏。

### 缩窄终端的重排校正（`resize.ts`）

Ink 用「上一帧写下来时的行数」擦除自己：终端变窄后，终端会把已打印的那一帧**重新折行**成更多物理行，于是 Ink 的擦除数偏小、帧顶留在屏上——拖动窗口一次多一份输入框。

`resize.ts` 在 Ink 之前包住 `stdout.write`（这样它的 `resize` 监听先于 Ink 自己的跑），记住上一帧原文，并在缩窄时把 Ink 接下来那次擦除的行数改写为**该帧按新宽度重排后的物理行数**：按 grapheme 逐字贪心装行（宽字符占 2 格，与终端一致），加 Ink 附带的游标行。只改一次、只改一个重复计数：不清屏、不动 scrollback、不额外重绘。

- 只在**缩窄**时校正；变宽/同宽会取消待用值（重排后行数变少，再放大就会擦进已提交的 scrollback）。
- 擦除数已经 ≥ 目标时不动手；一帧一帧对照，行数不会累积放大。
- Ink 的静态提交突发（clear → 静态行 → 活动帧，后两者裸写）与首帧裸写都建模；`\u001b[2J` 全屏重放会丢弃模型，等下一次带 erase 前缀的渲染重新锚定。
- 已知边界：只在缩窄方向校正（变宽依赖终端是否合并折行，不同终端不一致）；活动区之外的裸写（第三方插件直接写 stdout）可能被误当作帧。

## 两种布局（chrome）

同一套交互内核渲染两种外层布局，`--ui` 切换（默认随 profile）：

```
dsh --profile cli     classic：原始单列（❯ 提示 + 底部状态行）
dsh --profile code    opencode 式：空会话居中欢迎页（wordmark + > 输入）→
                      发消息后转录与输入靠左全宽
dsh --profile cli --ui opencode   也可临时切到 opencode 布局
```

`code` profile 与 `cli` 装配同一 bundle，差异只在 profile 级 `cordis.patch.yml` 把 cli-app 的 `ui` 配置改为 `opencode`。

## 状态行（吞吐 / 用量 / 上下文）

两种布局共用同一条计量读数，命令提示行不再占位：

- **吞吐**：`token 42.5/s`。流式期间按已到字符数估算，attempt 上报 usage 后换成 provider 的真实 output 计数；两者都以该 attempt 的首个 chunk 时间为窗口起点，窗口短于 100ms 不出数（显示 `—`）。读数保留到下一轮。
- **用量**：`使用量 12.3K`，是本会话 durable log 的累计 input+output；resume 时从 log 补计。
- **上下文环**：`上下文 ◑ 45%`，紧随权限预设右侧（classic 布局在会话标签后）。分子取 `ctx.tokenMeter.measure(session).totalTokens`（下一次请求的 prompt 压力），分母取 durable `request/context` 记录的 `contextWindow`；两者缺一不显示。环按占用分档着色（<60% ok，<85% warn，其余 error）。
- **压缩自动降档**：token-meter 的表面折叠会按 `compaction/*` 的 shadow price 重新定价，所以压缩落地后占用立即下降，不必等下一次请求上报 usage。

## 命令与键位

```
输入 / → 弹出命令列表（↑↓ 移动 ❯ 高亮，回车执行，Esc 关闭；继续输入过滤）
选 /model → 模型选择器（真实模型目录，↑↓ + 回车确认）
选 /perm → 权限预设选择器（沙箱 + 审批）
选 /connect → 模型商选择器（主流 + 自定义），再进入分步输入

输入文本 + Enter   发送；运行中普通文本被拒（斜杠命令不受限）
Ctrl+C             运行中=停止当前轮次；空闲=退出
Ctrl+D / Ctrl+Q    退出
Ctrl+R             展开/收起最近一条的思考过程

命令大小写与前导空格容忍；命令名取首词。
/model provider/model   也可直接带参一步切换（fork 保留历史）
/perm <preset>          也可直接带参设置
/connect <provider>     也可直接带参开始向导
未知 /xxx 提示 unknown，不当消息发模型
```

## 主题

`--theme cream-forest`（浅）/ `deep-forest`（深，默认 auto 落深色）/ `auto`。非法主题名在启动时 fail-loud。

## Development

开发在 dsh 源码工作副本中进行（见 `docs/cli-app/architecture.md`；人工真机走查见 `docs/cli-app/manual-acceptance.md`）：

```sh
pnpm install && pnpm build:lib:host   # 首次：官方 host 包 lib 产物
pnpm dsh --profile cli                # cli-app 自身走 tsx 源码直跑，改码即生效

pnpm exec oxlint packages/bundle/cli-app            # lint
pnpm exec vitest run packages/bundle/cli-app/tests  # vitest（无 key，脚本化 agent）
```

`~/.dsh/profiles/cli` 是用户层 profile：`bundles = [dsh-base, dsh-cli-app]`，凭证复用 `~/.dsh` 现有配置。`cli-app` 包运行时从源码解析，依赖两条本地接线：root `package.json` devDeps（bundle 解析锚点）与 `tsconfig.base.json` 手写 alias（`@dsh-external/dsh-cli-app*` → `src`）。merge upstream 时这两处需要手动保留。

## Roadmap

| 阶段 | 内容 | 状态 |
|---|---|---|
| M1 | 骨架：patch+glue+Ink，流式对话/注入折叠/持久化/退出 | ✅ 真机验收 |
| M2 | 会话面：resume/switch、/new、/fork、标题、SessionPicker | ✅ 真机验收 |
| M3 | 工具卡片、审批 answerer、/model、状态栏 tokens、registry 斜杠命令 | ✅ 真机验收 |
| M4 | markdown 渲染、reasoning 折叠(Ctrl+R)、tool-call 流式预览、tokens resume | ✅ 真机验收 |
| M5 | Static 转录 + 单 Ink 实例：会话切换与 resize/滚动修正；文案单一来源；模块拆分；`/new` 空会话与切屏修正 | ✅ 74 用例 + REAL-composition |
| M6 | 状态行改为吞吐 + 用量 + 上下文环（含压缩降档）；命令提示行退场 | ✅ 85 用例 + REAL-composition |
| M7 | 缩窄终端重排校正：擦除数按新宽度重算，拖动窗口不再残留多份输入框 | ✅ 98 用例 + 真 Ink reflow 断言 |

## Model Experience

Indirectly, through each inserted row's package, which owns that row's model-facing behavior; the patch restates the `system-prompt` persona and `tools` mode for its single-session tree.

#### KV Cache effect

The persona restatement is fixed prefix content, so it does not perturb KV-cache reuse between turns.

## Known Limitations and Deferred Work

如实登记，不静默：
- **工具审批**：agent scope answerer 经 bus 桥 UI （`[a] allow once · [r] reject · [esc] cancel`）；`/perm` 走 permission-presets（沙箱 + 审批），无该服务时退化为 `ask|never`。审计落 log；REAL-composition 已覆盖 allow/reject/never 三路径。
- **会话面**：resume picker/`/new`/`/fork`/标题/会话标签；列表上限 50 条按创建时间倒序。
- **`/new` 与空会话**：`/new` 只在当前会话已有真实对话内容（用户消息或助手回复）时才打开新会话；未开始的会话按「重置当前视图」处理，因此反复 `/new` 不再堆积空会话。例外：从一个已使用的会话切走时，若新会话从未输入，它在 handle 关闭时仍会落盘（官方 persistence 无删除接口）——每次最多一个。
- **切会话清屏**：`/new`、`/sessions`、`/fork`、`/model` 换会话时先清空当前视口再写新会话的静态转录，旧会话内容不再残留在屏幕上方（scrollback 仍可上翻）。
- **markdown 子集**：行内 code/**bold**/*italic*、围栏代码、标题、列表、引用；表格/链接未渲染。
- **reasoning 折叠**：默认折叠为单行，`Ctrl+R` 展开/收起最近一条。
- **tool-call 参数流式预览**：流式行显示过渡预览，落地卡片接管。
- **转录不截断**：`state.messages` 与 durable log 等长（每行一个轻量对象），已定稿的静态行写入后即离开 React 树。`/clear` 只清当前视口并重建静态列表，终端 scrollback 保留。
- **tokens**：resume 时从 durable log 补计历史用量；状态行显示累计用量、当前吞吐与上下文占用（见上）。流式吞吐的前半段是字符密度估算，provider usage 到达后才替换。
- **注册表斜杠命令**：`/compact /feedback /goal /plan` 经 `ctx.commands` 执行，输出作为普通可见行；未注册 `/xxx` 提示 unknown。
- **输入**：单行输入（退格可用）；方向键编辑/多行粘贴未实现。
- **窗口缩放**：缩窄方向已校正（见上）；变宽方向依赖终端是否合并折行（xterm/Windows Terminal 会），不同终端行为不一致，未做校正。活动区外的裸写（插件直接写 stdout）可能被误当作待校正的帧；只影响擦除数，不影响内容。
- **auto 主题**：固定落深色，亮度探测未做。
- **覆盖门禁**：本包 98 用例全绿 + REAL-composition + 真 Ink reflow 断言；100%/file 门禁为「贡献官方仓库」前置，非本地运行必需。
