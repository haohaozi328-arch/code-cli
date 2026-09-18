# Agent Note: dsh CLI App（`dsh-cli-app`）—— 终端交互前端 bundle

Status: implemented

> 2026-09-06 · 工作副本 `D:\workspace\DeepSeek\dsh-cli`（deepseek-harness fork）· 配套：`docs/cli-app/architecture.md` · `packages/bundle/cli-app/README.md`

## Problem

给 dsh 补上缺失的产品面：**终端交互式 CLI**。官方现有面（web / headless / sdk / acp）里没有交互式终端前端；`apps/cli` 只是 launcher。本变更新增一个 profile bundle（`packages/bundle/cli-app/`），以一切皆插件的形态直接挂 `dsh-base`，进程内消费 agent 事件，不做任何核心改动。

## Decision

- **进程内插件而非外部协议**：100% 能力还原只能走进程内（ACP/SDK 有协议天花板，harness v1 已验证）。UI 消费者 = `ctx.agents` + `agent/assistant-stream` + `session/event`，与官方 web 的 host 侧消费同一批 seam。
- **保留 base 进程级 agent-plane**：官方 web patch 注释明确 base 保留这些行就是给单会话 TUI 的（web 才把它们挪进 preset）。cli-app 因此不 disable 任何 base 行、不引入 agent-presets。
- **durable log 是唯一事实源**：assistant-stream 只做进行中消息的增量补间；`end` 帧（committed + seq）后从 log 重建该行。注入的上下文（AGENTS.md/skills 等 plugin 来源 user/message）折叠为单行 `〔injected〕`。
- **Ink 5 + React 18 渲染**：官方生态首个 Ink 消费者（无先例可抄，UI 自研）。
- **Static 转录 + 单 Ink 实例**（2026-09-12 修订）：已定稿的行交给 Ink `<Static>`（写入一次即进入终端 scrollback），活动区只重绘流式行/浮层/输入；会话切换是同一个 Ink 实例换根 key 的 `rerender`，不 unmount、不手工清屏、不进备用屏、不抓鼠标。详见 `docs/cli-app/architecture.md` §6。
- **文案单一来源**：全部用户可见字符串在 `ui/copy.ts`；projection 拆到 `ui/transcript.ts`，两种 renderer 共用同一个 `projectEvent`。
- **cli-app 自身源码直跑**：root devDeps（bundle 解析锚点）+ `tsconfig.base.json` 手写 alias（`@dsh-external/dsh-cli-app*` → src）。host 官方包需一次 `pnpm build:lib:host`（typert 等 exports 子路径走 lib）。
- **theme fail-loud**：startup 校验合法值（`auto|cream-forest|deep-forest`），`resolveTheme` 对绕过校验的未知值抛 TypeError（评审 P2-5）。

## Alternatives considered

- **走 ACP / SDK 协议前端**：能力受协议天花板限制（harness v1 已验证），且多一次跨进程 hop。进程内消费 `ctx.agents` + `agent/assistant-stream` + `session/event` 才能 100% 还原。
- **复用 `apps/cli` launcher 或做独立 bin 直启**：与「只有 `dsh` profile 启动受支持应用」的仓库规则冲突，因此本包以 bundle patch 形态挂 `dsh-base`。
- **在 App 层手工接管滚动**（备用屏 + 鼠标上报 + `scrollOffset`）：与终端自身能力较劲，黑屏与 `\x1b` 字面量都出自这里；改用 Ink `<Static>` + 终端原生 scrollback。
- **会话切换 unmount → 清屏 → 重新 render**：整棵树重建，且清屏序列在编辑链路上被二次转义；改用同一 Ink 实例换根 key 的 `rerender`。
- **迁移到 OpenTUI / OpenCode 式 retained renderer**：Ink 在极端 resize 下有已知渲染边界，但迁移成本远大于收益，当前不采纳。

## Consequences

- 官方核心零改动：能力全部来自 base 的进程级组合；cli-app 自身走 tsx 源码直跑，改码即生效。
- 维护负担：本包与 `docs/cli-app/` 是工作副本新增面，merge upstream 需手工保留四处接线（见末节）。
- 验证边界：真机 TTY 的滚轮 / 缩放 / 清屏视觉无法在无 TTY 环境断言，只能按 `docs/cli-app/manual-acceptance.md` 走查。
- 会话残留：官方 `sessionPersistence` 无删除 / GC 接口，「从已用会话 `/new` 到未输入的新会话再离开」会留 1 个空会话；`/new` 复用只保证反复 `/new` 不再堆积。
- 门禁：本包未达 per-file 100% 覆盖，属「贡献官方仓库」前置，不影响本地运行。

## 关键实现点

- `cordis.patch.yml`：restate `system-prompt`/`tools` + insert `code-runtime`/`cli-startup`/`cli-app` 三行，最薄同构 headless。
- glue `index.ts`：`loader.await()` → 会话循环（`openSession` → `createViewModel` → 首个会话 `render`、后续会话 `rerender`）→ `vm.done` 后 dispose + `appExit`。`internals.render` 测试缝（headless 的 internals 范式）。
- `ui/state.ts`：ViewModel 单边界（事件 → React），snapshot 引用缓存（useSyncExternalStore 契约，修掉过无限重渲染死循环）；投影函数在 `ui/transcript.ts`，`/connect` 状态机在 `ui/connect.ts`，文案在 `ui/copy.ts`。
- `ui/App.tsx`：`<Static>` 承载已定稿行、活动区承载流式/浮层/输入；静态列表以 `${sessionId}:${transcriptEpoch}` 为 key。
- UI 键位：Enter 发送、Ctrl+C 运行中停/空闲退、Ctrl+R 折叠思考、`/quit /help /clear`。

## 渲染与会话模型（2026-09-12 修订）

- **Static 转录**：`splitTranscript` 以「第一条未定稿行」为界，前缀交 Ink `<Static>`（写入一次即进入终端 scrollback），后缀每次重绘。resize 只重绘活动区，因此不再黑屏；终端原生滚轮/滚动条直接可用。
- **单 Ink 实例**：会话切换是 `ink.rerender(element)`（根 key = 会话 id），删除 unmount + 手工清屏 + 重新 render，也删除 opencode 的备用屏与鼠标上报。
- **会话边界清屏**：`/new`、`/sessions`、`/fork`、`/model` 换会话时先 `clearViewport`（清视口、保留 scrollback）再 `rerender`，旧会话内容不再残留在新会话上方。
- **`/new` 空会话复用**：只有当前会话已有真实对话内容（`hasConversation`）或已提交过 prompt（`promptSubmitted`）时，`/new` 才请求新会话；否则等价于「重置当前视图」，反复 `/new` 不再堆积空会话。
- **`/clear`**：清当前视口（`ui/terminal.ts` 的 `CLEAR_VIEWPORT`，有单测钉住是真 ESC 字节）并 bump `transcriptEpoch`，scrollback 保留。
- **缩窄重排校正**：Ink 的擦除计数是「上一帧写下来时的宽度」下的逻辑行数；终端变窄会把那一帧重新折行成更多物理行，擦除因此偏短、帧顶残留（拖动一次多一份输入框）。`ui/resize.ts` 在 Ink 之前包 `stdout.write`，记住上一帧原文，缩窄时把接下来那次 erase 的重复计数改写为按新宽度重排后的物理行数（grapheme 逐字贪心装行 + 游标行）。只改计数：不清屏、不动 scrollback；只在缩窄方向校正，变宽/同宽取消待用值，擦除数已 ≥ 目标时不动手。
- 具体根因、改动清单与门禁结果见 `docs/cli-app/2026-09-12-cli-fix-report.md`。

## 真机验收（M1）

真实模型一问一答全链路：boot → 中文输入 → 流式（`◌` 增量）→ commit 重建（`●`）→ idle → `/quit` 退出零残留；会话以 v2 JSONL(zstd) 持久化。期间修：Ink5 `dim→dimColor`、ctrl 键参数、getSnapshot 引用不稳定死循环。

## M2 会话面（2026-09-06）

会话控制器循环（`openHandle` + `vm.done` 携带 `ExitRequest`）：fresh / resume / fork / switch 四种请求共用一条 open→render→dispose→loop 路径；fork 在父 handle 退役**前**用 `collectForkSeed` 捕获「到最后一个 `turn/end` 为止的平衡前缀」，种子经 `agents.create({ seed, inheritedEventCount, meta.parentSession, meta.isSeeded })` 进入子会话，父日志只读不受影响。会话目录（id/标题/cwd/时间/父引用）经官方 `sessionPersistence.list()` + projection-cache 标题投影读取，选择器上限 50 行按创建时间倒序。命令面：`/new`、`/fork`、`/sessions`（`/resume` 同义）打开 Ink 选择器（↑↓/enter/esc），状态栏显示标题·工作区尾。门禁：oxlint 0、vitest 36/36（新增 sessions.spec 与控制器循环 4 用例，修掉 mock `rerender` 不驱动新 vm 的 harness 缺陷）、typecheck 0。**真机验收已执行**（复用 `~/.dsh/.credentials.yaml`，真实模型）：resume 旧会话全量历史重放 + LLM 标题读取（如「自我介绍并回复收到」）+ 续聊上下文记忆正确；/sessions picker 列出跨 workspace 15 个会话（标题/时间/fork 标记，↑↓/enter/esc）；switch 到其他会话历史正常；/fork 子会话携带完整 seed（落盘 24KB、resume 可重放）且父会话日志零写入（文件时间戳验证）。途中修复：脏会话残留（.jsonl+.zstd 双文件）使 persistence.list 抛错 → catalog 降级为空目录；无其他阻塞。

## M3（工具/审批/模型/tokens）已实现

- **工具卡片**：`role:'tool'` 行（ToolUiMessage）从 session log 的 tool/call+tool/result 重放，live 经 session/event 增量；参数摘要（argsSummaryOf：优先 command/path/pattern 字段）、结果首行折叠（resultSummaryOf）、状态 running→done/error；UI 徽标🐚/🖥/📝/🌐/⚙。
- **审批 answerer（补 P2-4 缺口）**：agent scope 注册 `approval/request` waterfall → `createApprovalBus` 桥到 UI （ApprovalModal，`[a]/[r]/[esc]`）→ 返回 outcome；审计事件由 ApprovalService 自带。`/perm ask|never` 切策略（`ctx.approval.setPolicy`）。
- **/model**：输入 `provider/model` → `model-switch` → **fork 当前会话带完整 seed + 新 route**（同进程二次 resume 同 id 触发官方 `session already exists`，故用 model-fork 保留历史换新 id）。
- **状态栏 tokens**：assistant-stream usage chunk 累计（input/output/reasoning）显示 `N tok`。
- 测试 43/43 全绿（工具重放/live、bus 审批、tokens、/model、/perm、model-fork 循环）；lint 0、tsc 0。

**真机状态**：M3 交互链路（工具卡片/审批弹窗）的实现与单测全绿；TTY 自动化通道无法传送 CR（write_stdin 将 `\r` 当字面文本），真机触发工具/审批需用户在终端手动敲一条越界指令验证（M2 真机已证主链路：send/流式/工具执行均正常）。

### 评审整改（M3 三审）
- 注册表斜杠命令补齐：send() 对内置命令外的 `/xxx` 转 `ctx.commands.execute` （base command-* 行：/compact /feedback /goal /plan；执行不占模型轮次），未注册则 unknown 提示（不再当消息发给模型）；HELP 更新。
- ApprovalBus 并发覆盖修复：第二个 pending 请求直接抛（ApprovalService 归一为 `unavailable`），首个 resolver 不再被替换悬空；新增并发单测。
- tool-call-delta 参数流式推迟 M4（代码注释登记）；resume 后 tokens 从 0 计推迟 M5（README 登记）。
- 未知 `/xxx` 行为变化：从「当消息发模型」改为 unknown 提示，对应测试同步。

### composition.spec.ts 专项修复（REAL-composition 端到端救活）

外部新增的 `tests/composition.spec.ts`（真组合 + ink-testing-library）3 用例全挂，专项修复后 **3/3 绿**，全包 56/56。根因四层：
1. **Loader include 子树 ctx inactive**：`ctx.plugin(Loader)+include` 组合的 entry 子树 settle 后，agent registry 的 owner ctx 对后续 create 已是 inactive fiber → `cannot create effect`。真机走官方 `boot()`（常驻 root 树）无此问题。修复：组合改 headless 测试范式（root ctx 直接 `ctx.plugin` 真服务 + 手动 `CliApp.apply`）。
2. **真 AgentLoop 需 loader 激活**：root ctx.plugin(AgentLoop) 报 `agent loop is not active`。修复：改 `agents.setFactory` 脚本化驱动（headless 官方范式）——真 tools/approval/commands 链仍走真服务。
3. **ink-testing-library 4 × ink 5.2 输入断裂**：ink 5.2 `render()` 忽略 stdin option（硬编码 process.stdin），ITL 假 stdin 永不达 useInput（最小 Probe 实证）。keystroke 驱动不可行 → 测试经 `CliApp.testHooks.currentVm` 驱动 vm（与按键同面）+ ITL 仅做帧断言。
4. 时序/语义：waitForFrame 容忍挂载前；fake driver 补 `agent/status` idle/running（真 loop 会发，fake 原缺导致 vm.running 恒真、后续 send 被拒）；durable 断言从内存 session log 读（fake 不经 persistence 落盘，真持久化已由真 agent-loop 在 M2 验证）。

另修复 M4 真实 bug：reasoning 折叠键从 `r` 改为 `Ctrl+R`（原 `r` 会吞掉普通输入的首字符，如 `run demo`）。

## M5 收尾（2026-09-06 晚）

- **merge upstream 演练**：`git fetch origin` 通；与官方 `origin/master` **零分叉**（官方自 0.1.3-alpha.1 后无新提交）。真冲突演练需本地先提交（工作副本全部改动未提交，commit 等用户指示）。
- **覆盖门禁定位**：cli-app 为 fork 内自定义包，官方 CI 门禁只在贡献官方（PR）时覆盖；当前行覆盖 src 88% / ui 80%，56 用例 + REAL-composition 全绿。100%/file 冲刺列为贡献官方前置，非本地运行必需（已写入 README）。
- **README 终稿**：Roadmap M1-M4 ✅/M5 收尾中；Known Limitations 全面同步 M2-M4 交付状态；链接走查文档与测试命令。
- 待办：真机人工走查（manual-acceptance.md 六组）、本地 commit 决策。

### 命令体验修复（opencode 式提醒）

- **命令优先于 running**：/new /quit /sessions 等斜杠命令在 agent 运行中也可用（此前被 running 拦截，短命令“失效”主因）；running 只拦普通文本。
- **命令菜单**：输入以 `/` 开头弹出命令候选（COMMAND_HINTS 元数据表与 dispatch switch 同源防漂移：名称+说明+参数提醒，随输入过滤前 6 条）；Tab 补全首个匹配（App.tsx，需终端手测）。
- **容忍度**：大小写（/New）、前导空格（“ /new”）均识别；命令名取首词（/new 后带多余参数仍命中）；`/model provider/model` 支持带参一步切换（此前只能开输入框两步）；registry 命令经 name/rest 结构统一转发。
- 提取 submitModelSpec 闭包（/model 路由与对象方法共用，消除 this 依赖）；dispatchCommand 重构为 createViewModel 闭包。
- 真机验证：菜单弹出/过滤（/ → 6 条，/m → 仅 /model）、/model 带参触发 model-fork 新会话（a0fbde8b → c8afbfb9）；Tab 与 Ctrl+R 需人工终端确认（TTY 无法注入控制键）。测试 59/59（+3：running 放行、/model 带参与大小写、多余参数仍识别）。

### 命令 Palette 完整化（opencode/claude-code 式）

按用户要求把命令交互升级为完整 palette：
- 输入 `/` → 候选列表（最多 8 条，随输入过滤），**↑↓ 移动高亮（❯）+ 回车执行高亮项 + Esc 关闭**（不再是只读提示）。菜单打开时普通字符仍追加过滤、退格可用；菜单项带 hint 与 arg 提示。
- `/model` → **模型选择器**：异步 `ctx.llm.listModels(provider)` 拉真实模型目录（真机：DeepSeek-V4-Flash/Pro/Vision-Exp 三条），ChoicePicker 组件↑↓ 选 + 回车确认 → model-switch（fork 保留历史）；带参 `/model x` 仍一步直切；llm 服务缺失时 fallback 单模型。
- `/perm` 无参 → 策略选择器（ask/never 两选项）；带参仍直设。
- 泛型 ChoicePicker 组件统一 model/policy 两种选择（state.choicePicker 单一状态 + title 分流）；移除旧 modelInputOpen 手输模式（接口替换 submitModel→pickModel 等）。
- 真机验证：菜单 ↑↓ 高亮渲染、/model 选择器真实目录弹出、回车确认触发 model-fork（645c30fa→d5f65b25）。↑↓/Esc 键位与 `/perm` 选择器需人工终端走查（TTY 控制键限制）。测试 60/60（+1：/perm 选择器）。

### code profile：opencode 式布局（居中列 chrome）

用户要求新增名为 `code` 的入口，UI 复刻 opencode 风格且消息列居中。全部只新增，cli 默认零变化：
- `ui/chrome.ts`：`UiChrome = 'classic' | 'opencode'` + 校验（App/index/ startup 共用，避免循环依赖）。
- cli-app 插件 config 新增 `ui` 字段（z.object default 'classic'），bundle patch 接线 `ctx.cliStartup.ui || 'classic'`；startup 新增 `--ui` 选项，默认**空串**（关键：默认值若是 'classic' 会让 profile overlay 的 `|| 'opencode'` 永远落空——truthy 优先），显式传值才校验。
- App.tsx：chrome 参数化。opencode 变体 = 全宽顶栏（左 `code` + 中 sessionLabel 截 72 + 右 running/model）、居中消息列（useColumnWidth hook 监听 stdout resize，列宽 min(term-2, 104) 居中）、`> ` 输入提示、全宽底栏（左 hints / 右 tok）；消息行无 role 前缀、工具卡 `⎿` 前缀。classic 分支原样保留（仅结构上抽取共享 messages/inputLine）。
- 新 profile `~/.dsh/profiles/code`：package.json bundles 与 cli 相同，cordis.patch.yml overlay 整体替换 cli-app config 并设 `ui: !!js ctx.cliStartup.ui || 'opencode'`；node_modules 三层由 dsh heal 自动生成（不要手工复制——heal 校验 ink 必须是它管理的链接）。
- 验证：61/61 测试（+1 未知 --ui 拒绝）；ITL 固定宽渲染确认居中列与顶栏/底栏/`>`/无前缀消息；真机 `pnpm dsh --profile code --theme deep-forest` 顶栏+输入态正确、`--profile cli` classic 无回归。居中列实际视觉与终端宽度联动需人工窗口缩放确认。

### 修订：空态居中欢迎页 / 对话态靠左

用户对照 opencode 截图指出：只有**新建对话（空会话）**才应居中，正常对话全部靠左。opencode 分支改为双态：
- `state.messages.length === 0`（空态）：无顶栏；按终端高度留上部空白（`useTerminalDims` 扩展返回 rows，padTop = (rows-12)/2 封顶 6），`code` 品牌字 + `> ` 输入（宽 min(colWidth,88) 封顶）+ 辅助行 `new session · <model> · tip: /model switches route` 全部水平居中；底栏保留（hints 左 / idle 右）。
- 非空：顶栏（code / sessionLabel 截 72 / idle·model）+ 消息与输入**靠左全宽**（去掉 justifyContent center 与列宽限制），底栏右加 token。
- hook `useColumnWidth` → `useTerminalDims`（{columns, rows}，监听 resize）；classic 分支不受影响。
- 验证：61/61；ITL 双态渲染（空态 code 居中缩进 21 格、输入缩进 6 格；对话态消息顶格靠左）；真机发消息后顶栏出现且消息靠左（5,374 tok）。

### 修订：空态 overlay 缺失（居中时无法调 / 命令）

用户反馈空态欢迎页「无法调用 / 命令」。根因：empty 分支只渲染了居中输入行，commandMenu / ChoicePicker / ApprovalModal / Picker 等 overlay 全都未渲染——键盘逻辑（useInput 优先级）照常拦截输入，但屏幕上看不到菜单/选择器，表现为「命令无效」。

修法：把共享渲染拆成 `transcriptRows`（error + 消息列表）与 `overlays`（session picker / approval / choicePicker / 命令菜单）两块；empty 分支在居中输入上方渲染 `{overlays}`，对话态与 classic 渲染 `{transcriptRows}{overlays}`（顺序不变）。

真机验证空态全链路：`/` → 菜单弹出（居中列内 ❯ /new 高亮）→ `/model` 过滤 → Enter → 模型选择器弹出（3 真实模型）→ Enter 确认 → model-fork 回到新空态欢迎页。另：此前几轮 lint 只截 `Select-Object -Last 1`（Finished 行）误报为 0——实际 src 侧本轮有 5 处 no-unnecessary-condition（stdout.columns ?? 兜底、chunk.name ??、listModels?.、name !== undefined、501 提前 return 后的重复 null 检查）已全部清理；composition.spec.ts 的13 个风格/类型 error 为历史旧债（本轮未触碰行，见下）。

### 四审响应（composition 6 点核对）

评审 6 点大多指向其并行读取时的中间态（当时文件未完成重写）；逐条核对当前（已绿）状态：① 挂载同步——已由 vmOf + waitForFrame(idle) 解决（vm 驱动不经 stdin）；② 启动失败可见——本轮补 `exitCode` box + waitForFrame 早退（非 0 立即抛 `see stderr above`）；③ toEqual——collectLogEvents 已剥离信封（type/data only）匹配通过；④ roots[i]——已改 collectLogEvents 读 composition.sessions 无下标依赖；⑤ lint 0（重写后 14 文件干净）；⑥ `DSH_CLI_TRACE` 诊断钩子已随 2026-09-12 修订删除：会话循环现在只有一条 render/rerender 路径，失败经 `fail()` 写 stderr 并 `appExit(1)`。

## 状态行计量（M6）

用户要求输入框底部不再放 `/model` 等命令提示，改放 `token xx/s` 与 token 使用量，并把圆圈的上下文占用放在权限右侧，同时要求上下文压缩自动降低占用。

- **`ui/status.ts`（新，纯函数）**：唯一数字→文本去处。`estimateLiveTokens` 用固定 4 char/token 密度（与 token-meter 的估计器同尺度）估算流式 token；`tokensPerSecond` 在窗口 <100ms 时返回 null（不出数，显示 `—`）；`contextOccupancy` 只在校验到分子与分母时才产出占用；`contextRing`（`○/◔/◑/◕/●`）与 `contextBand`（<60 ok、<85 warn、其余 high）负责环的形状与配色分档。
- **吞吐来源**：VM 在该 attempt 的首个 chunk 上锚定窗口（`frame.time`），流式期间按已到字符数估算，attempt 的 `usage` 帧到达后换成 provider 的 `outputTokens`；读数保留到下一轮，`start` 帧只重置窗口不重置读数。
- **占用来源**：分子取 `ctx.tokenMeter.measure(session).totalTokens`（下一次请求的 prompt 压力，含表面折叠的重新定价），分母取 `session.requestContext()?.contextWindow`（durable `request/context`）。每条已提交 `session/event` 重读一次，因此 `compaction/*` 落地即降档，不必等下一次请求上报 usage；缺任一输入则不渲染环。
- **布局**：opencode 把环接在 `权限 <preset>` 右侧，输入框下方那行改为右对齐 `token 42.5/s · 使用量 12.3K`；classic 在会话标签后放环、右侧同一计量行。随之删除 `COPY.classicHints` / `COPY.opencodeHints`。
- **依赖**：`@deepseek-ai/dsh-token-meter` 进 peer + devDependencies 与 `packages/bundle/cli-app/tsconfig.json` reference；workspace importer 由 `pnpm install --lockfile-only` 同步（仅 +3 行）。

## 缩窄终端重排（M7）

拖动/缩放窗口时输入框与状态行在屏上出现多份，每缩窄一次多一份。

- **根因**：Ink 的 `eraseLines(previousLineCount)` 里的行数是在上一帧写下来时的宽度算的；终端变窄会把那一帧重新软折行成更多物理行，`eraseLines` 擦不到帧顶。Ink 自己的 `resize` 渲染与 App 的 `useTerminalDims` 状态更新两条渲染路径都带着这个错误计数。
- **修法**：`ui/resize.ts` 在 Ink 之前包 `stdout.write`（先注册 `resize` 监听，因此早于 Ink 的 `resized`），记住上一帧原文，缩窄时把接下来那次带 erase 前缀的写改写为按新宽度重排后的物理行数：`wrappedRows` 按 grapheme 逐字贪心装行（`string-width` 给宽字符/emoji 与 ANSI 剥离），`reflowedRows` 再加 Ink 的游标行。只改重复计数，不清屏、不动 scrollback、不额外重绘。
- **边界**：变宽/同宽取消待用值；擦除数已 ≥ 目标时不动手；一次缩窄只放大一次。Ink 的静态提交突发（`log.clear()` → 静态行裸写 → 活动帧裸写，末次裸写为准）与首帧裸写都建模，burst 以微任务为界；`\u001b[2J` 全屏重放丢弃模型。变宽方向不校正（终端是否合并折行不一致）。
- **接线**：`internals.render` 的实现抽成导出的 `renderApp(element, streams)`，`installResizeReflow` → `inkRender` → `unmount` 时 `restore()`；新增运行期依赖 `string-width`。

## 测试

`tests/`：theme / startup（真 Loader 组合）/ sessions（真 SessionStore 日志切片）/ transcript（投影 + Static/活动区切分 + `hasConversation`）/ status（吞吐窗口、用量/占用格式化、环与分档）/ resize（假流复现 Ink 字节形状 + 真 Ink 渲染断言擦除数按新宽度重算）/ terminal（清屏序列字节）/ state（真 SessionStore + 脚本 agent，含吞吐估算→provider 采样、压缩后占用降档）/ app（ink-testing-library 渲染 Static 与换 key、计量行与环）/ index（真 registries + 脚本 factory + render 缝 + 会话边界清屏）/ composition（REAL-composition，挂真实 `TokenMeter` 并断言真实帧的计量行与环）共**98 用例全绿**，无 key。`oxlint packages/bundle/cli-app` 0，`tsc -b tsconfig.host.json` 0，`verify-package-dependencies` 通过。**100%/file 覆盖门禁仍未达成**，属「贡献官方仓库」前置，本地运行不阻塞（见 README Known Limitations）。

## 评审整改（2026-09-06）

- P1-1 lint 4 错误已修（unbound-method → 函数属性接口 + this 闭包化；no-unnecessary-type-conversion → 去掉多余 `String()`）`oxlint` 0/0。
- P1-2 测试落地（见上）；coverage 冲刺 M5。
- P1-3 README 随包提交，含 Known Limitations。
- P2-4 approval answerer 未注册 —— 已显式登记 README Known Limitations （M3 交付 answerer + 终端审批 UI）。
- P2-5 theme 校验 fail-loud（见决策）。
- P3-7 reasoning 折叠区（设计稿）在 M1 平铺直出 —— 已登记 M4 打磨。
- 二轮评审：tests 4 个类型错误已修（`internals.render` 收窄为 `InkSurface` 两方法接口；`session/event` 测试 emit 补完整 SessionEvent envelope：seq/time/data）；README 测试命令改为 `pnpm exec vitest run packages/bundle/cli-app`（包无独立 test script，官方 style）。tests 由 `tsconfig.client.json` 的宽 glob（`packages/*/*/tests/**/*.ts`）纳入官方 tsc 门禁，类型错误经 `pnpm run typecheck` 暴露并已清零。

## 会话与 UI 修复 + opencode 对齐（2026-09-18）

工作副本停滞期发生一次 GBK 编辑器事故：overlays/sessions/state 三文件被以 GBK 重存，`·`→`路`、`—`→`鈥?`、`确认/取消`→`纭/鍙栨秷`，sessions.spec 的 `·` 断言随之变红；`dispatchCommand` 中 `/fork` 分支丢失（fork 整体失效，index/state 各一用例挂）；`run()` 在 quit 路径也无条件 `clearViewport`（退出闪屏 + 三个 index 用例断言失败）。修复：字节级脚本恢复乱码；恢复 `/fork` case；清屏只在继续下一会话时执行（quit 由 unmount 擦除）；删除死变量 `promptSubmitted`；补 `SessionSummary` 测试字面量缺失字段。composition 的上下文环断言在 80 列 ITL 帧下 `%` 会被换行/裁剪，改为空白容忍匹配。

opencode 对齐新增：

- **spinner**：`ui/spinner.ts` 盲文帧 `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`（80ms），运行中在 composer/状态栏显示 `⠹ 运行中 · 12s`（此前运行态完全静止，即用户报告的「UI 动画问题」主体）。
- **任务面板**：`ui/todos.tsx` + `transcript.ts` 的 `projectTodos/replayTodos`，与官方 `todos` projection 同语义（整表替换、`turn/start` 清空）；停靠输入框上方，`[✓]/[•]/[ ]` 三态，全完成自动隐藏，`Ctrl+T` 折叠。类型经 `@deepseek-ai/dsh-tool-todo` type-only import 接入（peer + dev + tsconfig reference 三处）。
- **running 排队**：`send()` 运行中不再报错，改为 FIFO 队列，idle 边沿逐条 drain（`submitPrompt` 提取共用）；`stop()`（Ctrl+C）同时清队列。两个旧「still running」用例按新语义改写（行为变更随测试更新）。
- 键位/帮助/README 同步；106 用例全绿，oxlint 0，tsc 0。

## 工作副本 merge 提示

merge upstream 时需手动保留：root `package.json` 的 devDeps、`tsconfig.base.json` 手写 alias 区、`tsconfig.host.json` 的 cli-app reference、`packages/bundle/cli-app/tsconfig.json` 里为 permission-presets / credentials / settings / brand / values / token-meter 补的项目引用，以及 `scripts/verify-package-readme-model-experience.ts` 中 cli-app 的间接条目。`packages/bundle/cli-app/` 与 `docs/cli-app/` 为新增未跟踪目录。
