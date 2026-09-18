# dsh CLI App（终端交互前端）架构设计

> 状态：**M1 已落地**（2026-09-06）· 工作副本：`D:\workspace\DeepSeek\dsh-cli` 设计稿 v1 经 M1 实现与评审整改，差异记录见文末「M1 落地差异」；Agent Note：`.agents/notes/implemented/feature/2026-09-06-dsh-cli-app.md`

## 1. 目标与边界

在 DeepSeek Harness（dsh）源码树内新增一个**终端交互式 CLI 前端**（TUI），与官方 `web` 面平级，但以进程内插件形态（profile + bundle）存在：

- **一切皆插件**：不改任何官方核心，新增一个 bundle（patch + glue 插件），复用 `dsh-base` 全部能力行；与 `web-app` / `headless` 结构同构。
- **100% 功能还原**：以官方 `web` 端能力为基准，能力/数据/交互语义全还原，呈现形式终端化。浏览器专属呈现（图片内嵌、GIF、iframe 卡片）不做，用终端等价物（路径提示、ANSI 帧、emoji/符号图标、主题色）替代。
- **性能优先**：进程内直连，零序列化零中间 hop；流式粒度 = chunk 级（text-delta 逐段），高于 ACP 的事件级。
- **漂亮 UI**：Ink（React for CLI）增量渲染，罗小黑双主题终端令牌。

非目标：不替代 web；不做 Electron；不对外提供 HTTP 服务；v1 不内嵌交互式 PTY（bash 结果以卡片展示）；MCP 面板后置。

## 2. 位置与命名

| 项 | 值 | 理由 |
|---|---|---|
| 工作副本 | `D:\workspace\DeepSeek\dsh-cli` | fork 官方 master，origin=官方，remote `local`=本地原 checkout |
| bundle 目录 | `packages/bundle/cli-app/` | 与 base/web-app/headless 平级，被 `packages/*/*` workspace 通配覆盖 |
| 包名 | `@dsh-external/dsh-cli-app` | 与 `dsh-deep-whale` 的 `@dsh-external/*` 分发先例一致，明示非官方，从第一天可独立发布 |
| profile | `~/.dsh/profiles/cli`（用户层） | bundles: `[@deepseek-ai/dsh-base, @dsh-external/dsh-cli-app]` |
| 启动命令 | `pnpm dsh --profile cli`（开发期，源码 tsx 直跑） | launcher 从 dsh 安装解析 bundles → workspace link 命中 cli-app，无需 build、无需 install 到 profile |
| 文档 | `docs/cli-app/architecture.md` | 未跟踪文件，merge upstream 无冲突 |

## 3. 总架构

```
┌─────────────────────────────────────────────────────────┐
│ 终端 (Windows Terminal / ConPTY, TrueColor 探测)         │
│  Ink App: Transcript · InputBar · StatusBar · Modals     │
├─────────────────────────────────────────────────────────┤
│  cli-app glue 插件 (process 内)                          │
│   ├─ startup.ts   解析 --resume/--model/--cwd → 服务     │
│   ├─ index.ts     建/恢复 Agent · 接线 IO · 生命周期     │
│   └─ bridge       事件泵: session-log & agent/* → UI     │
│                    输入: InputBar → followup/steer/cancel│
│                    approval answerer (agent scope)       │
├─────────────────────────────────────────────────────────┤
│  dsh-base 插件树（全部能力行，进程级组合）                │
│  agent-loop · session(JSONL) · tools · fs-sandbox ·      │
│  shell(pwsh/bash) · approval(ask) · llm · settings ·     │
│  skill · subagent · goal · plan · compaction · web · …   │
└─────────────────────────────────────────────────────────┘
```

官方在 `web-app` patch 注释中明确背书：
> "The base keeps them [agent-plane rows] for the TUI, which is single-session and composes its agent process-wide."

即：**cli-app 保留 base 的进程级工具行，不引入 agent-presets**（preset 是 web 为多会话隔离而设）；单会话 TUI 直接享受 base 全量能力。

## 4. cordis.patch.yml（cli-app bundle）

与 headless 同构，最薄：

```yaml
# 覆盖 base 的模式相关行（同 headless/web 的 restate 语义）
- id: system-prompt
  config:
    persona: >-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.

- id: tools
  config:
    mode: !!js process.env.DSH_TOOLS_MODE

- insert:
    # 代码运行时（PTC 模式的执行能力，headless 同款）
    - id: code-runtime
      name: '@deepseek-ai/dsh-code-runtime-worker-thread'

    # 解析 --resume/--model/--cwd/--help 的普通 provider
    - id: cli-startup
      name: '@dsh-external/dsh-cli-app/startup'

    # 终端 glue：等 loader settle → 建/恢复 Agent → 挂 Ink UI
    - id: cli-app
      name: '@dsh-external/dsh-cli-app'
      inject: [cliStartup]
      config:
        resumeSessionId: !!js ctx.cliStartup.resumeSessionId ?? null
        cwd: !!js ctx.cliStartup.cwd ?? process.cwd()
        model: !!js ctx.cliStartup.model ?? null
```

不动的行（关键决策）：
- **approval 保持 `ask`**：answerer 由 cli-app 在 agent scope 注册
- **fs-sandbox / sandbox-policy 保持 workspace-write**（`DSH_PERMISSION_MODE` 可覆盖）
- **不 insert** webserver / connection / client-* / agent-presets
- **不 disable** 进程级工具行（与 web 相反）

## 5. glue 插件

### startup.ts（`cli-startup`）
`commander` 程序，`inject: ['cmdlineArgs']`：`--resume <sessionId>`、`--model <provider/model>`、`--cwd <path>`、`--theme <cream-forest|deep-forest|auto>`、`--help`。action 后 `ctx.provide('cliStartup', {...})`。

### index.ts（`cli-app`）

```
apply(ctx, config):
  appExit = ctx.get('appExit')          // 退出 = dispose 整个 root fiber
  await ctx.get('loader').await()       // 等兄弟插件挂完
  agents / sessions / agentDefaultModel = ctx.get(...)

  selection = config.model ?? agentDefaultModel.currentSelection()
  handle = config.resumeSessionId
    ? await agents.resume({ resumeSessionId, agentOptions: selection, setup })
    : await agents.create({ sessionId: new UUID, meta:{cwd}, agentOptions: selection, setup })

  setup(agentCtx):
    installModelSelection(agentCtx, {current: selection})
    agentCtx.on('approval/request', answererBridge)   // → UI modal，返回 outcome

  // 会话循环：一个 Ink 实例贯穿整个进程
  loop:
    handle = openSession(request)                     // fresh / resume / fork / model-fork
    await handle.agent.whenIdle()
    vm = createViewModel({ ctx, agent, session, catalog, approvalBus, flush })
    element = <App key={agent.id} vm theme ui />      // 根 key = 会话 id
    ink === null ? ink = render(element) : ink.rerender(element)   // 会话切换 = rerender
    requested = await vm.done
    forkSeed = collectForkSeed(agent.session)         // 父 handle 退役前捕获
    dispose(vm) → dispose(handle) → request = next(requested)
```

headless 的 `run()` 已示范全部关键调用序列（loader.await → agents.create →followup → whenIdle → flush → summarize），cli-app 在其上把「一次」改成「会话循环 + 双向事件」。

### 退出路径
- 用户 `/quit` 或 Ctrl+C×2：`agent.cancel('user')` → `handle.dispose()` → `appExit(0)`（root fiber dispose 由 launcher 的 shutdown 兜底）
- SIGINT 第一次 = 取消当前轮次；运行中再按一次才退出

## 6. UI 架构（Ink）

### 数据一致性铁律
**durable log 是唯一事实源**；live 事件只做增量补间。`transcript.ts` 的同一个 `projectEvent` 既做初始 replay，也吃每一条 live `session/event`，因此恢复的会话与进行中的会话不可能渲染成两种样子。

- 会话进入（create/resume）后：`session.eventAt(0..seq)` 全量扫描，构建消息列表（user/message、assistant/message、tool/call+result）→ 渲染历史。
- 运行中：`agent/assistant-stream`（start/chunk/end）驱动「进行中的 assistant 消息」增量渲染；`end.frame.outcome.kind === 'committed'` 后用持久化事件（seq 定位）重建该条消息，保证与 log 完全一致。
- live `session/event` 只吃 user/message、tool/call、tool/result：已提交的 assistant/message 一律由 stream 的 end 帧落地，避免同一条消息画两遍。
- `agent/status` → 状态栏 idle/running；`agent/error` → 错误横幅。

### chunk → UI 映射（StreamChunk 六帧）
| 帧 | UI 动作 |
|---|---|
| block-start | 无（等 committed end 重建整行） |
| text-delta | 追加到当前流式行 |
| reasoning-delta | 追加到思考折叠区（默认折叠，可展开） |
| tool-call-delta | 流式行上的过渡参数预览 |
| block-end | 无 |
| usage | 状态栏 token 计量 + 当前 attempt 吞吐采样 |
| finish | 无；committed end 帧负责落地 |

### 状态行计量
`status.ts` 是唯一的数字→文本去处，两种 chrome 共用：

- **吞吐**：流式期间用已到字符数按固定密度（4 char/token，与 token-meter 的估计器同尺度）估算；attempt 的 `usage` 帧到达后换成 provider 的 `outputTokens`；两者都以该 attempt 首个 chunk 的 `frame.time` 为窗口起点，窗口 <100ms 不出数。
- **上下文环**：分子 `ctx.tokenMeter.measure(session).totalTokens`（下一次请求的 prompt 压力），分母 `session.requestContext()?.contextWindow`；占用按 <60/<85/其余分 ok/warn/high 三档着色。缺任一输入则不渲染环。
- 每条已提交 `session/event` 都重读一次占用，因此 `compaction/*` 的 shadow price 落地即降档，无需等下一次请求。

### 组件与模块
```
src/ui/
 ├ model.ts       UiState / ViewModel / ChoicePickerState 等类型（无运行时代码）
 ├ transcript.ts  projectEvent / replaySession / splitTranscript（纯投影）
 ├ status.ts      吞吐/用量/上下文占用与环（纯函数）
 ├ resize.ts      缩窄重排校正：包装 stdout.write，改写擦除计数（含 wrappedRows/reflowedRows）
 ├ state.ts       createViewModel：事件接线、动作、斜杠命令、审批 bus
 ├ connect.ts     ConnectController：/connect 向导（settings + credentials）
 ├ copy.ts        全部用户可见文案（单一来源）
 ├ messages.tsx   MessageRow（user / assistant / tool，两种 chrome 共用）
 ├ overlays.tsx   SessionPicker / ChoiceList / ApprovalModal / CommandMenu / ConnectPrompt
 ├ App.tsx        根布局：Static 转录 + 活动区 + 输入 + 状态栏
 ├ markdown.ts    行内/块级 markdown 投影（纯函数）
 ├ markdown-view.tsx  投影结果的 Ink 渲染
 └ terminal.ts    CLEAR_VIEWPORT 等终端控制序列常量
```

### 渲染模型：Static 转录 + 单 Ink 实例
`App` 把 `state.messages` 分成**静态前缀**和**活动后缀**：第一条未定稿行是分界，之前的行走 Ink `<Static>`（写入一次即进入终端 scrollback），之后的走普通 Box。静态列表以 `${sessionId}:${transcriptEpoch}` 为 key，会话切换或 `/clear` 时整棵子树重建；根元素 key 是会话 id，切换会话走同一个 Ink 实例的 `rerender`。

- 终端原生滚轮/滚动条直接可用；app 不抓鼠标、不进备用屏。
- resize 只重绘活动区（流式行 + 浮层 + 输入），静态历史不参与重排，因此不会黑屏。
- **缩窄重排校正**：Ink 按「上一帧写下来时的行数」擦除，终端变窄会把那一帧重新折行成更多物理行，擦除数偏小 → 帧顶残留在屏上（拖动一次多一份输入框）。`resize.ts` 在 Ink 之前包 `stdout.write`（因此它的 `resize` 监听先跑），记住上一帧原文，缩窄时把接下来那次擦除的重复计数改写为「该帧按新宽度重排后的物理行数」：grapheme 逐字贪心装行（宽字符 2 格）+ Ink 的游标行。只改一个计数，不清屏、不动 scrollback、不额外重绘；只在缩窄方向校正，变宽/同宽取消待用值；擦除数已 ≥ 目标时不动手。
- **会话边界清屏**：`/new`、`/sessions`、`/fork`、`/model` 换会话时先 `clearViewport`（清视口 + 保留 scrollback）再 `rerender`，否则旧会话的静态行会留在新会话上方。
- `/clear` 只清当前视口（`CLEAR_VIEWPORT`）并 bump epoch 重建静态列表，scrollback 保留。
- **`/new` 空会话复用**：`/new` 只在当前会话已有真实对话内容时走 `exitFn({type:'new'})`；否则等价于「重置当前视图」（清屏 + bump epoch），不创建也不落盘新会话。判定见 `transcript.ts` 的 `hasConversation` 与 VM 的 `promptSubmitted`（乐观发送后 durable `user/message` 可能尚未落地）。

- 全部键位驱动（无鼠标依赖）；`useInput` 全局快捷键（Ctrl+C 停止/退出、Ctrl+R 折叠思考）
- Markdown：`markdown.ts` 纯投影 + `markdown-view.tsx` Ink 渲染；覆盖文本、行内 code/粗斜体、围栏代码、标题、列表、引用

### 罗小黑双主题终端令牌
| 令牌 | 奶油森林(浅) | 深夜森林(深) | 用途 |
|---|---|---|---|
| bg | #FDFBF5 | #0A140F | 背景（Ink 无背景刷，用于卡片内边） |
| brand | #2E7D5B | #A8E10C | 品牌强调、user 气泡边 |
| text | #20352B | #E9E4D0 | 正文 |
| muted | #5C6E62 | #A9B4A4 | 次要、时间戳 |
| ok/warn/err | #4C9A3E/#C98A1B/#C94F4F | #8FCF5A/#E0A93C/#E0705F | 工具状态 |
| reasoning | 弱化斜体 dim | 同 | 思考流 |
| 工具 icon | 🐚(bash) 📝(edit) 🔍(search) 🌐(web) ⚙(通用) | 同 | 卡片头部 |

`--theme auto` 探测 `COLORTERM`/`WT_SESSION`/终端背景亮度（OSC 11 查询可选项）；支持 `NO_COLOR`、`TERM=dumb` 降级。

## 7. 功能矩阵（对照 web 还原）

| 能力 | web | cli-app 计划 | 阶段 |
|---|---|---|---|
| 多轮对话（followup） | ✓ | ✓ followup + whenIdle | M1 |
| 流式输出（token 级） | ✓ | ✓ assistant-stream chunk | M1 |
| 思考流展示 | ✓ | ✓ 折叠 reasoning 区 | M1 |
| 工具调用卡片（全生命周期） | ✓ | ✓ ToolCard（参数流式+结果折叠） | M3 |
| 工具审批（ask/always/reject/never） | ✓ | ✓ approval answerer + Modal + `/perm` | M3 |
| 会话持久化 JSONL | ✓ | ✓ base 行自带 | M1 |
| 会话列表 / resume | ✓ | ✓ SessionPicker + agents.resume | M2 |
| 会话标题 | ✓ | ✓ base session-title 行，UI 显示 | M2 |
| 新会话 / 多会话切换 | ✓ | ✓ `/new` dispose+create | M2 |
| fork | ✓ | ✓ `/fork` seed=父 log 前缀 | M2 |
| 模型切换 / reasoning effort | ✓ | ✓ `/model`（request 层替换 / 重建 agent） | M3 |
| 斜杠命令体系 | ✓ | ✓ /help /clear /compact /feedback /goal /plan | M3 |
| compact / 上下文计量 | ✓ | ✓ base 行 + token-meter 投影 + 状态行上下文环 | M3/M6 |
| plan mode | ✓ | ✓ base plan-mode 行 + 提示 | P1 |
| skills / subagent / workflow | ✓（进程级） | ✓ base 行自动在线，卡片呈现 | P1 |
| 文件产物/附件引用 | ✓ | 路径链接 + 打开快捷键 | P2 |
| 设置（settings.yaml） | ✓ Models 页 | `/settings` 只读+编辑 key | P2 |
| 会话删除 / 导出 | ✓ | `/forget` `/export` | P2 |
| MCP 面板 | ✓ | 后置评估 | P2 |
| 消息反馈 / telemetry | ✓ | /feedback 复用 base | P1 |
| 皮肤（罗小黑 DOM 主题） | ✓ | 终端令牌等价物（上表） | M4 |
| 图片/GIF 内嵌、iframe | ✓ | ✗（呈现终端化边界） | — |

## 8. 阶段计划

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M1 骨架** | bundle 目录+patch+startup+glue；最小 Ink：历史重放 + 输入 → followup → 流式文本/思考渲染 → 退出 | `pnpm dsh --profile cli` 真实模型一问一答，流式可见 |
| **M2 会话面** | resume 列表交互、/new、/fork、标题、多会话切换 | resume 旧会话续聊正确；fork 不污染父会话 |
| **M3 工具与命令** | ToolCard 全生命周期、ApprovalModal、/model /perm /compact /clear、状态栏 tokens | 工具调用+审批+结果全程卡片化；键位完备 |
| **M4 主题打磨** | 罗小黑双主题、markdown 完善、长输出虚拟化、取消/错误恢复、Ctrl+C 语义 | 长时间高负载流式不卡；无 ANSI 泄漏 |
| **M5 收尾** | README、vitest（mock agent，无 key）、merge upstream 演练、独立分发评估 | 全链路冒烟 + 文档 |
| **M6 计量** | 状态行改为吞吐 + 累计用量 + 上下文环；命令提示行退场；压缩落地即降档 | 85 用例全绿 + REAL-composition 环断言 |
| **M7 重排** | 缩窄终端按新宽度重算擦除数；真 Ink 渲染下断言擦除数 27 → 41 | 98 用例全绿 |

## M1 落地差异（相对设计稿 v1）

1. **注入上下文折叠**：plugin 来源的 user/message（AGENTS.md、skills 目录等可达 25KB）不整段平铺，折叠为单行 `〔injected〕 <首行>`；真实用户消息原样。设计稿未提，真机发现必改。
2. **snapshot 引用缓存**：ViewModel 的 `getState()` 返回引用稳定快照（useSyncExternalStore 契约），否则无限重渲染死循环（真机 4566 帧刷屏→ 4 帧）。
3. **theme fail-loud**：startup 校验合法值 + `resolveTheme` 兜底抛错（评审 P2-5）。
4. **`internals.render` 测试缝**：Ink render 可替换，glue 全流程可测。
5. **ViewModel 接口用函数属性**而非 method（unbound-method lint），send/quit 共享闭包内 `requestQuit`，不依赖 `this` 绑定（评审 P1-1）。
6. **测试落地**：tests/ 4 文件 27 用例全绿（theme/startup/state/index，无 key）；App.tsx 渲染测试与 100%/file 覆盖留 M5（评审 P1-2）。
7. **包 README + Agent Note** 随 M1 提交；Known Limitations 显式登记 approval answerer 缺口（评审 P2-4 / P2-6 / P1-3）。
8. **reasoning 平铺直出**（折叠区在 M4）：已知偏差，已登记（评审 P3-7）。

## 9. 风险与开放问题

1. **dsh 0.x 破坏性变更**：定期 `git fetch origin && git merge`；cli-app 保持低私有交叉（只 import 公开 seam：dsh-agent/session/llm/user-approval/cmdline）。
2. **assistant/message 的 content block 结构**（渲染重建）：M1 前确认 ContentBlock 联合与 text/reasoning/tool-call 表示（assembler.ts 可复用）。
3. **approval answerer 时序**：answerer 注册在 agent scope（setup 内），waterfall `scopeTarget(agent, agent)` 精确命中；需验证 loader 挂载顺序。
4. **终端独占**：raw mode 只属于 Ink；bash PTY 工具若需交互终端属未来课题。
5. **Windows ConPTY**：Ink 支持良好；中文宽字符与换行需真机验证（用户在 win32）。
6. **包名/发布**：`@dsh-external/dsh-cli-app` 仅是建议，可全局一处改名。
7. **`dsh cli` 短命令 alias**：需改 `apps/cli` 的 args.ts（官方代码），默认不做；若用户想要，列入 M5 评估。
