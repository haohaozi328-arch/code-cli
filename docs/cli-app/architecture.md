# dsh CLI App (interactive terminal frontend) architecture

English | [中文](architecture.zh.md)


> Status: **M1 landed** (2026-09-06) · Working copy: `D:\workspace\DeepSeek\dsh-cli` design draft v1, reworked through the M1 implementation and review fixes; deltas are recorded in "M1 landing deltas" at the end · Agent Note: `.agents/notes/implemented/feature/2026-09-06-dsh-cli-app.md`

## 1. Goals and boundaries

Add an **interactive terminal CLI frontend** (TUI) inside the DeepSeek Harness (dsh) source tree, peer of the official `web` surface, existing as an in-process plugin (profile + bundle):

- **Everything is a plugin**: no official core changes; one new bundle (patch + glue plugin) reuses every `dsh-base` capability row; structurally isomorphic to `web-app` / `headless`.
- **100% feature parity**: the official `web` surface is the baseline; capability/data/interaction semantics are fully reproduced with a terminal presentation. Browser-only presentations (inline images, GIFs, iframe cards) are out; terminal equivalents (path hints, ANSI frames, emoji/symbol icons, theme colors) replace them.
- **Performance first**: in-process direct connection, zero serialization, zero intermediate hops; streaming granularity = chunk level (per text-delta), finer than ACP's event level.
- **Beautiful UI**: Ink (React for the CLI) incremental rendering with Luo Xiaohei dual-theme terminal tokens.

Non-goals: not a web replacement; no Electron; no external HTTP service; v1 embeds no interactive PTY (bash results render as cards); an MCP panel is deferred.

## 2. Location and naming

| Item | Value | Rationale |
|---|---|---|
| Working copy | `D:\workspace\DeepSeek\dsh-cli` | fork of official master; origin=official; remote `local`=the original local checkout |
| Bundle directory | `packages/bundle/cli-app/` | peer of base/web-app/headless; covered by the `packages/*/*` workspace glob |
| Package name | `@dsh-external/dsh-cli-app` | follows the `@dsh-external/*` distribution precedent of `dsh-deep-whale`, marking it unofficial and independently publishable from day one |
| Profile | `~/.dsh/profiles/cli` (user layer) | bundles: `[@deepseek-ai/dsh-base, @dsh-external/dsh-cli-app]` |
| Launch command | `pnpm dsh --profile cli` (during development, tsx runs the source) | the launcher resolves bundles from the dsh install → the workspace link hits cli-app; no build, no install into the profile |
| Docs | `docs/cli-app/architecture.md` | untracked file, merge-conflict free with upstream |

## 3. Overall architecture

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

The official `web-app` patch comment explicitly endorses this:
> "The base keeps them [agent-plane rows] for the TUI, which is single-session and composes its agent process-wide."

Meaning: **cli-app keeps the base's process-level tool rows and introduces no agent-presets** (presets exist for web's multi-session isolation); a single-session TUI enjoys the base's full capabilities directly.

## 4. cordis.patch.yml (the cli-app bundle)

Isomorphic to headless, kept thinnest:

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

Untouched rows (key decisions):
- **approval stays `ask`**: the answerer is registered by cli-app in the agent scope
- **fs-sandbox / sandbox-policy stay workspace-write** (`DSH_PERMISSION_MODE` can override)
- **no insert** of webserver / connection / client-* / agent-presets
- **no disable** of the process-level tool rows (opposite of web)

## 5. The glue plugin

### startup.ts (`cli-startup`)
A `commander` program, `inject: ['cmdlineArgs']`: `--resume <sessionId>`, `--model <provider/model>`, `--cwd <path>`, `--theme <cream-forest|deep-forest|auto>`, `--help`. After the action it runs `ctx.provide('cliStartup', {...})`.

### index.ts (`cli-app`)

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

headless's `run()` already demonstrates every key call sequence (loader.await → agents.create → followup → whenIdle → flush → summarize); cli-app turns its "once" into "a session loop + bidirectional events".

### Exit paths
- User `/quit` or Ctrl+C×2: `agent.cancel('user')` → `handle.dispose()` → `appExit(0)` (root fiber disposal is backed by the launcher's bounded shutdown)
- First SIGINT = cancel the current turn; press again while running to exit

## 6. UI architecture (Ink)

### The data-consistency rule
**The durable log is the only source of truth**; live events only tween increments. The single `projectEvent` in `transcript.ts` serves both the initial replay and every live `session/event`, so a resumed session and an in-flight one can never render two different ways.

- On session entry (create/resume): a full scan of `session.eventAt(0..seq)` builds the message list (user/message, assistant/message, tool/call+result) → renders history.
- While running: `agent/assistant-stream` (start/chunk/end) drives the in-flight assistant message's incremental render; once `end.frame.outcome.kind === 'committed'`, the message is rebuilt from the persisted event (located by seq), guaranteeing exact agreement with the log.
- Live `session/event` consumes only user/message, tool/call, tool/result: a committed assistant/message always lands through the stream's end frame, so the same message is never painted twice.
- `agent/status` → status-bar idle/running; `agent/error` → the error banner.

### chunk → UI mapping (the StreamChunk frames)
| Frame | UI action |
|---|---|
| block-start | none (wait for the committed end to rebuild the row) |
| text-delta | append to the current streaming row |
| reasoning-delta | append to the reasoning fold (collapsed by default, expandable) |
| tool-call-delta | transient argument preview on the streaming row |
| block-end | none |
| usage | status-bar token metering + current attempt throughput sample |
| finish | none; the committed end frame lands the row |

### Status-line metering
`status.ts` is the only number→text home, shared by both chromes:

- **Throughput**: during streaming, chars are estimated at a fixed density (4 char/token, the same scale as the token-meter estimator); once the attempt's `usage` frame lands it switches to the provider's `outputTokens`; both anchor the window on the attempt's first chunk's `frame.time`, and windows <100ms produce no reading.
- **Context ring**: numerator `ctx.tokenMeter.measure(session).totalTokens` (next request's prompt pressure), denominator `session.requestContext()?.contextWindow`; occupancy is banded ok/warn/high at <60/<85/otherwise. The ring renders only when both inputs exist.
- Occupancy is re-read on every committed `session/event`, so a `compaction/*` shadow price steps the band down the moment it lands, without waiting for the next request.

### Components and modules
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

### Rendering model: Static transcript + one Ink instance
`App` splits `state.messages` into a **static prefix** and a **live suffix**: the first unsettled row is the boundary; rows before it go to Ink `<Static>` (written once into terminal scrollback), rows after it render in ordinary Boxes. The static list keys on `${sessionId}:${transcriptEpoch}`, rebuilding the whole subtree on session switch or `/clear`; the root element's key is the session id, and switching sessions calls `rerender` on the same Ink instance.

- The terminal's native wheel/scrollbar work directly; the app never grabs the mouse nor enters the alternate screen.
- Resize repaints only the live region (streaming rows + overlays + input); static history never reflows, so no black screen.
- **Shrink reflow correction**: Ink erases by "the line count written when the previous frame went down"; a narrower terminal re-wraps that frame into more physical rows, the erase count falls short → the frame top survives on screen (one more input box per drag). `resize.ts` wraps `stdout.write` before Ink (so its `resize` listener runs first), remembers the previous frame's text, and on a shrink rewrites the next erase's repeat count to "the frame's physical row count reflowed at the new width": per-grapheme greedy packing (wide chars take 2 columns) + Ink's cursor row. One count changes; no clearing, no scrollback touches, no extra repaint; corrected only in the shrink direction, widen/same-width cancels the pending value; no-op when the erase count already covers the target.
- **Session-boundary clear**: `/new`, `/sessions`, `/fork`, `/model` clear the viewport first (viewport only, scrollback kept) before `rerender`, otherwise the old session's static rows would survive above the new session.
- `/clear` clears only the current viewport (`CLEAR_VIEWPORT`) and bumps the epoch to rebuild the static list; scrollback stays.
- **`/new` empty-session reuse**: `/new` runs `exitFn({type:'new'})` only when the current session has real conversation content; otherwise it equals "reset the current view" (clear + bump epoch), creating and persisting nothing. The test lives in `transcript.ts`'s `hasConversation` plus the VM's `promptSubmitted` (after an optimistic send the durable `user/message` may not have landed yet).

- Everything is key-driven (no mouse dependency); `useInput` global shortcuts (Ctrl+C stop/exit, Ctrl+R folds reasoning)
- Markdown: pure projection in `markdown.ts` + Ink rendering in `markdown-view.tsx`; covers text, inline code/bold/italic, fenced code, headings, lists, quotes

### Luo Xiaohei dual-theme terminal tokens
| Token | Cream Forest (light) | Deep Night Forest (dark) | Used for |
|---|---|---|---|
| bg | #FDFBF5 | #0A140F | background (Ink has no background paint; used inside cards) |
| brand | #2E7D5B | #A8E10C | brand accent, user bubble border |
| text | #20352B | #E9E4D0 | body text |
| muted | #5C6E62 | #A9B4A4 | secondary, timestamps |
| ok/warn/err | #4C9A3E/#C98A1B/#C94F4F | #8FCF5A/#E0A93C/#E0705F | tool states |
| reasoning | dimmed italic dim | same | reasoning stream |
| tool icons | 🐚(bash) 📝(edit) 🔍(search) 🌐(web) ⚙(generic) | same | card headers |

`--theme auto` probes `COLORTERM`/`WT_SESSION`/terminal background luminance (OSC 11 query optional); `NO_COLOR` and `TERM=dumb` degrade it.

## 7. Feature matrix (parity against web)

| Capability | web | cli-app plan | Phase |
|---|---|---|---|
| Multi-turn conversation (followup) | ✓ | ✓ followup + whenIdle | M1 |
| Streaming output (token-level) | ✓ | ✓ assistant-stream chunks | M1 |
| Reasoning stream display | ✓ | ✓ collapsed reasoning region | M1 |
| Tool call cards (full lifecycle) | ✓ | ✓ ToolCard (streaming args + folded result) | M3 |
| Tool approval (ask/always/reject/never) | ✓ | ✓ approval answerer + Modal + `/perm` | M3 |
| Session persistence JSONL | ✓ | ✓ ships with the base rows | M1 |
| Session list / resume | ✓ | ✓ SessionPicker + agents.resume | M2 |
| Session titles | ✓ | ✓ base session-title row, shown in the UI | M2 |
| New session / multi-session switching | ✓ | ✓ `/new` dispose+create | M2 |
| fork | ✓ | ✓ `/fork` seed=parent log prefix | M2 |
| Model switch / reasoning effort | ✓ | ✓ `/model` (request-level swap / agent rebuild) | M3 |
| Slash-command system | ✓ | ✓ /help /clear /compact /feedback /goal /plan | M3 |
| compact / context metering | ✓ | ✓ base rows + token-meter projection + status-line ring | M3/M6 |
| plan mode | ✓ | ✓ base plan-mode rows + prompt | P1 |
| skills / subagent / workflow | ✓ (process-level) | ✓ base rows come online automatically, rendered as cards | P1 |
| File artifacts/attachment references | ✓ | path links + open shortcut | P2 |
| Settings (settings.yaml) | ✓ Models page | `/settings` read-only + key editing | P2 |
| Session delete / export | ✓ | `/forget` `/export` | P2 |
| MCP panel | ✓ | deferred evaluation | P2 |
| Message feedback / telemetry | ✓ | /feedback reuses base | P1 |
| Skins (Luo Xiaohei DOM theme) | ✓ | terminal token equivalents (table above) | M4 |
| Inline images/GIFs, iframes | ✓ | ✗ (the terminal-presentation boundary) | — |

## 8. Phase plan

| Phase | Content | Acceptance |
|---|---|---|
| **M1 skeleton** | bundle dir+patch+startup+glue; minimal Ink: history replay + input → followup → streaming text/reasoning render → exit | `pnpm dsh --profile cli` real-model Q&A with visible streaming |
| **M2 session surface** | resume list interaction, /new, /fork, titles, multi-session switching | resuming an old session continues correctly; fork never pollutes the parent |
| **M3 tools and commands** | ToolCard full lifecycle, ApprovalModal, /model /perm /compact /clear, status-bar tokens | tool calls+approvals+results all as cards; complete keymap |
| **M4 theme polish** | Luo Xiaohei dual themes, markdown completion, long-output virtualization, cancel/error recovery, Ctrl+C semantics | long high-load streaming without stutter; no ANSI leaks |
| **M5 wrap-up** | README, vitest (mock agent, no key), merge-upstream drill, independent-distribution assessment | full-chain smoke + docs |
| **M6 metering** | status line becomes throughput + cumulative usage + context ring; command hint line retired; compaction steps the band down on landing | 85 cases green + REAL-composition ring assertions |
| **M7 reflow** | shrink recomputes erase counts at the new width; assert 27 → 41 under real Ink rendering | 98 cases green |

## M1 landing deltas (against design draft v1)

1. **Injected-context folding**: plugin-originated user/messages (AGENTS.md, skill catalogs, etc. can reach 25KB) do not print in full; they fold into one `〔injected〕 <first line>` row; real user messages stay verbatim. The draft missed this; the real machine forced it.
2. **Snapshot reference cache**: the ViewModel's `getState()` returns a reference-stable snapshot (the useSyncExternalStore contract), otherwise an infinite re-render loop (on the real machine 4566 frames of repaint dropped to 4).
3. **theme fail-loud**: startup validates legal values + `resolveTheme` throws as the backstop (review P2-5).
4. **The `internals.render` test seam**: the Ink render is replaceable, so the glue's whole flow is testable.
5. **The ViewModel interface uses function properties** instead of methods (unbound-method lint); send/quit share the closure's `requestQuit` and never depend on `this` binding (review P1-1).
6. **Tests landed**: tests/ 4 files, 27 cases green (theme/startup/state/index, keyless); App.tsx render tests and the 100%/file coverage target deferred to M5 (review P1-2).
7. **Package README + Agent Note** committed with M1; Known Limitations explicitly registers the approval-answerer gap (review P2-4 / P2-6 / P1-3).
8. **Reasoning prints flat** (the fold arrives in M4): known deviation, registered (review P3-7).

## 9. Risks and open questions

1. **dsh 0.x breaking changes**: run `git fetch origin && git merge` regularly; cli-app keeps its private surface small (importing only public seams: dsh-agent/session/llm/user-approval/cmdline).
2. **The assistant/message content-block shape** (render rebuild): confirm the ContentBlock union and its text/reasoning/tool-call representation before M1 (assembler.ts is reusable).
3. **Approval-answerer timing**: the answerer registers in the agent scope (inside setup); the waterfall's `scopeTarget(agent, agent)` hits exactly; the loader mount order needs verification.
4. **Terminal exclusivity**: raw mode belongs to Ink; a bash PTY tool needing an interactive terminal is a future topic.
5. **Windows ConPTY**: Ink supports it well; CJK wide characters and wrapping need real-machine verification (the user is on win32).
6. **Package name / publishing**: `@dsh-external/dsh-cli-app` is a suggestion; one global rename covers it.
7. **The `dsh cli` short-command alias**: needs edits to `apps/cli`'s args.ts (official code); not done by default; if the user wants it, evaluate in M5.
