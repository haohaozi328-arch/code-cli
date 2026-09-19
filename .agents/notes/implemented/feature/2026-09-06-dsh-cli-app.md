# Agent Note: dsh CLI App (`dsh-cli-app`) — the interactive terminal frontend bundle

Status: implemented

English | [中文](2026-09-06-dsh-cli-app.zh.md)

> 2026-09-06 · Working copy `D:\workspace\DeepSeek\dsh-cli` (deepseek-harness fork) · Companions: `docs/cli-app/architecture.md` · `packages/bundle/cli-app/README.md`

## Problem

Give dsh its missing product surface: an **interactive terminal CLI**. The existing official surfaces (web / headless / sdk / acp) include no interactive terminal frontend; `apps/cli` is only a launcher. This change adds a profile bundle (`packages/bundle/cli-app/`) that mounts directly onto `dsh-base` in the everything-is-a-plugin shape, consumes agent events in-process, and touches no core code.

## Decision

- **An in-process plugin, not an external protocol**: 100% capability parity is only achievable in-process (the ACP/SDK protocol ceilings were already proven during harness v1). The UI consumer = `ctx.agents` + `agent/assistant-stream` + `session/event` — the same seams the official web host side consumes.
- **The base keeps its process-level agent-plane**: the official web patch comments state plainly that the base keeps those rows precisely for a single-session TUI (web is what moves them into presets). cli-app therefore disables no base rows and introduces no agent-presets.
- **The durable log is the only source of truth**: assistant-stream only tweens the in-flight message; after the `end` frame (committed + seq) the row is rebuilt from the log. Injected context (plugin-originated user/messages such as AGENTS.md/skills) folds into a single `〔injected〕` line.
- **Ink 5 + React 18 rendering**: the first Ink consumer in the official ecosystem (no precedent to copy; the UI is original).
- **Static transcript + single Ink instance** (2026-09-12 revision): settled rows go to Ink `<Static>` (written once into terminal scrollback); the live region repaints only the streaming row/overlays/input. Session switching is a `rerender` of the same Ink instance with a new root key — no unmount, no manual clears, no alternate screen, no mouse grabbing. See `docs/cli-app/architecture.md` §6.
- **Single copy source**: every user-visible string lives in `ui/copy.ts`; the projection split lives in `ui/transcript.ts`, and both renderers share one `projectEvent`.
- **cli-app runs from its own source**: root devDependencies (the bundle-resolution anchor) + a hand-written alias in `tsconfig.base.json` (`@dsh-external/dsh-cli-app*` → src). Official host packages need one `pnpm build:lib:host` (typert etc. exports subpaths resolve from lib).
- **theme fails loud**: startup validates legal values (`auto|cream-forest|deep-forest`), and `resolveTheme` throws a TypeError for unknown values that bypass validation (review P2-5).

## Alternatives considered

- **An ACP/SDK protocol frontend**: capability-capped by the protocol (proven in harness v1), plus one extra cross-process hop. Only in-process consumption of `ctx.agents` + `agent/assistant-stream` + `session/event` reaches 100%.
- **Reusing the `apps/cli` launcher or a standalone bin**: conflicts with the repo rule that only `dsh` profiles launch supported apps, so this package ships as a bundle patch over `dsh-base`.
- **Hand-rolling scrolling at the App layer** (alternate screen + mouse reporting + `scrollOffset`): fighting the terminal's own capabilities; the black screens and literal `\x1b` output both came from here. Replaced by Ink `<Static>` + native scrollback.
- **Session switching via unmount → clear → re-render**: rebuilt the whole tree, and the clear sequence was double-escaped on the editing path. Replaced by a same-instance `rerender` with a new root key.
- **Migrating to an OpenTUI / OpenCode-style retained renderer**: Ink has known rendering limits under extreme resizes, but the migration cost exceeds the benefit for now; not adopted.

## Consequences

- Zero official-core changes: all capability comes from the base's process-level composition; cli-app itself runs from source via tsx, so edits take effect immediately.
- Maintenance burden: this package and `docs/cli-app/` are new working-copy surfaces; merging upstream requires manually preserving four wiring points (see the last section).
- Verification boundary: real-TTY wheel/zoom/clear visuals cannot be asserted in a TTY-less environment; they are walked per `docs/cli-app/manual-acceptance.md`.
- Session residue: the official `sessionPersistence` has no delete/GC API, so "from a used session `/new` into a never-typed session, then leave" leaves 1 empty session; `/new` reuse only guarantees repeated `/new` no longer accumulates.
- Gates: this package has not reached the per-file 100% coverage bar — a prerequisite for contributing upstream, not a local-run blocker.

## Key implementation points

- `cordis.patch.yml`: restates `system-prompt`/`tools` + inserts the `code-runtime`/`cli-startup`/`cli-app` rows — the thinnest isomorphic headless.
- glue `index.ts`: `loader.await()` → session loop (`openSession` → `createViewModel` → first session `render`, later sessions `rerender`) → after `vm.done`, dispose + `appExit`. The `internals.render` test seam (the headless internals pattern).
- `ui/state.ts`: the single ViewModel boundary (events → React), with snapshot reference caching (the useSyncExternalStore contract — this fixed an earlier infinite-re-render loop); projection functions in `ui/transcript.ts`, the `/connect` state machine in `ui/connect.ts`, copy in `ui/copy.ts`.
- `ui/App.tsx`: `<Static>` carries settled rows; the live region carries streaming/overlays/input; the static list keys on `${sessionId}:${transcriptEpoch}`.
- UI keys: Enter sends, Ctrl+C stops while running/exits while idle, Ctrl+R folds reasoning, `/quit /help /clear`.

## Rendering and session model (2026-09-12 revision)

- **Static transcript**: `splitTranscript` splits at the first unsettled row; the prefix goes to Ink `<Static>` (written once into terminal scrollback) and the suffix repaints each frame. Resize repaints only the live region, so no more black screens; the terminal's native wheel/scrollbar work directly.
- **Single Ink instance**: session switching is `ink.rerender(element)` (root key = session id); the unmount + manual clear + re-render path is deleted, along with opencode's alternate screen and mouse reporting.
- **Session-boundary clear**: `/new`, `/sessions`, `/fork`, `/model` all clear the viewport first (viewport only, scrollback kept) before `rerender`; the old conversation no longer survives above the new session.
- **`/new` empty-session reuse**: `/new` requests a new session only when the current session has real conversation (`hasConversation`) or a submitted prompt (`promptSubmitted`); otherwise it equals "reset the current view", so repeated `/new` no longer accumulates sessions.
- **`/clear`**: clears the current viewport (`CLEAR_VIEWPORT` in `ui/terminal.ts`, unit-pinned to real ESC bytes) and bumps `transcriptEpoch`; scrollback is kept.
- **Shrink reflow correction**: Ink's erase counts are logical line counts computed at the width the previous frame was written; narrowing re-wraps that frame into more physical rows, so the erase falls short and the frame top survives (one more input box per shrink). `ui/resize.ts` wraps `stdout.write` before Ink, remembers the previous frame's text, and on a shrink rewrites the next erase's repeat count to the frame's physical row count reflowed at the new width (per-grapheme greedy packing + cursor row). Only the count changes: no clears, no scrollback touches, no extra repaints; correction only applies in the shrink direction, widen/same-width cancels, and an erase count already covering the target is left alone.
- Root causes, the change list, and gate results live in `docs/cli-app/2026-09-12-cli-fix-report.md`.

## Real-machine acceptance (M1)

The full real-model Q&A chain: boot → Chinese input → streaming (`◌` increments) → commit rebuild (`●`) → idle → `/quit` exits with zero residue; sessions persist as v2 JSONL (zstd). Fixed along the way: Ink 5 `dim→dimColor`, ctrl-key arguments, and the unstable-getSnapshot infinite re-render loop.

## M2 session surface (2026-09-06)

The session-controller loop (`openHandle` + `vm.done` carrying an `ExitRequest`): fresh / resume / fork / switch share one open→render→dispose→loop path; fork captures "the balanced prefix up to the last `turn/end`" with `collectForkSeed` BEFORE the parent handle retires, and the seed enters the child via `agents.create({ seed, inheritedEventCount, meta.parentSession, meta.isSeeded })`; the parent log stays read-only and untouched. The session catalog (id/title/cwd/time/parent reference) reads through the official `sessionPersistence.list()` + the projection-cache title projection; the picker caps at 50 rows sorted newest first. Command surface: `/new`, `/fork`, `/sessions` (`/resume` alias) opens the Ink picker (↑↓/enter/esc); the status bar shows title · workspace tail. Gates: oxlint 0, vitest 36/36 (new sessions.spec and 4 controller-loop cases; fixed a harness defect where the mocked `rerender` never drove the new vm), typecheck 0. **Real-machine acceptance executed** (reusing `~/.dsh/.credentials.yaml`, real model): resume replays a session's full history + the LLM title read (e.g. "自我介绍并回复收到") + continued conversation memory correct; /sessions picker listed 15 cross-workspace sessions (title/time/fork mark, ↑↓/enter/esc); switching to another session showed its history correctly; /fork children carried the full seed (24KB on disk, replayable on resume) with zero writes to the parent log (verified by file timestamps). Fixed along the way: a dirty session residue (.jsonl+.zstd pair) made persistence.list throw → the catalog degrades to an empty listing; nothing else blocking.

## M3 (tools/approval/models/tokens) implemented

- **Tool cards**: `role:'tool'` rows (ToolUiMessage) replay from the session log's tool/call+tool/result, live via session/event increments; argument summaries (argsSummaryOf: prefers command/path/pattern fields), first-line folded results (resultSummaryOf), status running→done/error; UI badges 🐚/🖥/📝/🌐/⚙.
- **Approval answerer (closing the P2-4 gap)**: an agent-scope `approval/request` waterfall → `createApprovalBus` bridges to the UI (ApprovalModal, `[a]/[r]/[esc]`) → returns the outcome; the audit events come from ApprovalService itself. `/perm ask|never` switches the policy (`ctx.approval.setPolicy`).
- **/model**: input `provider/model` → `model-switch` → **fork the current session with a full seed + new route** (a second same-process resume with the same id triggers the official `session already exists`, hence model-fork keeps history under a new id).
- **Status-bar tokens**: assistant-stream usage chunks accumulate (input/output/reasoning) shown as `N tok`.
- Tests 43/43 green (tool replay/live, the approval bus, tokens, /model, /perm, the model-fork loop); lint 0, tsc 0.

**Real-machine status**: the M3 interaction chain (tool cards/approval modal) is implemented with green unit tests; the TTY automation channel cannot deliver CR (write_stdin sends `\r` as literal text), so triggering tools/approvals on the real machine needs the user to type an out-of-bounds command manually (M2 already proved the main chain: send/stream/tool execution all work).

### Review rework (M3, third review)
- Registry slash commands completed: send() routes non-builtin `/xxx` lines to `ctx.commands.execute` (the base command-* rows: /compact /feedback /goal /plan; executing them consumes no model turn); unregistered names get an unknown hint (no longer sent to the model); HELP updated.
- ApprovalBus concurrent-override fix: a second pending request now throws directly (ApprovalService normalizes it to `unavailable`), so the first resolver is never replaced and stranded; new concurrency unit test.
- tool-call-delta argument streaming deferred to M4 (code comment registered); resume-then-tokens-from-zero deferred to M5 (README registered).
- Unknown `/xxx` behavior change: from "send to the model" to an unknown hint, tests updated accordingly.

### composition.spec.ts targeted repair (REAL-composition end-to-end revived)

An externally added `tests/composition.spec.ts` (real composition + ink-testing-library) had all 3 cases failing; after the targeted repair **3/3 green**, 56/56 package-wide. The root causes were four layers:
1. **Loader include subtree ctx inactive**: after an entry subtree settles under `ctx.plugin(Loader)+include`, the agent registry's owner ctx is an inactive fiber for later creates → `cannot create effect`. The real machine goes through the official `boot()` (a resident root tree) and never hits this. Fix: the composition follows the headless test pattern (root ctx directly `ctx.plugin`s the real services + manual `CliApp.apply`).
2. **A real AgentLoop needs the loader active**: `root ctx.plugin(AgentLoop)` reports `agent loop is not active`. Fix: `agents.setFactory` scripted driving (the official headless pattern) — the real tools/approval/commands chain still runs through the real services.
3. **ink-testing-library 4 × ink 5.2 broken input**: ink 5.2's `render()` ignores the stdin option (hard-wires process.stdin), so ITL's fake stdin never reaches useInput (proven with a minimal Probe). Keystroke driving is not viable → tests drive the vm via `CliApp.testHooks.currentVm` (the same surface as keys) + ITL only asserts frames.
4. Timing/semantics: waitForFrame tolerates pre-mount; the fake driver gained `agent/status` idle/running (the real loop emits these; the fake's absence made vm.running always true and later sends rejected); durable assertions read the in-memory session log (the fake bypasses persistence; real persistence was proven by the real agent-loop in M2).

Also fixed the real M4 bug: the reasoning fold key moved from `r` to `Ctrl+R` (the bare `r` swallowed the first character of normal input, e.g. `run demo`).

## M5 wrap-up (evening of 2026-09-06)

- **Merge-upstream drill**: `git fetch origin` works; zero divergence from official `origin/master` (no new official commits since 0.1.3-alpha.1). A true conflict drill needs a local commit first (all working-copy changes were uncommitted; commit awaits user instruction).
- **Coverage-gate positioning**: cli-app is a fork-local package; the official CI gate applies only when contributing upstream; current line coverage src 88% / ui 80%, 56 cases + REAL-composition green. The 100%/file sprint is an upstream-contribution prerequisite, not a local-run requirement (recorded in the README).
- **README final**: Roadmap M1-M4 ✅/M5 wrapping up; Known Limitations fully synced to M2-M4 delivery; links to the walkthrough doc and test commands.
- Outstanding: the real-machine manual walkthrough (six groups in manual-acceptance.md) and the local commit decision.

### Command-experience fixes (opencode-style reminders)

- **Commands beat running**: /new /quit /sessions and other slash commands work while the agent runs (they used to be blocked by the running check — the main cause of "short commands don't work"); running only gates plain text.
- **Command menu**: input starting with `/` pops command candidates (the COMMAND_HINTS metadata table shares one source with the dispatch switch to prevent drift: name+description+arg reminder, filtered to the first 6 as you type); Tab completes the first match (App.tsx, needs a real-terminal check).
- **Tolerance**: case (/New), leading whitespace (" /new") all recognized; the command name is the first word (/new with extra arguments still matches); `/model provider/model` supports one-step switching with an argument (previously two steps through the input box); registry commands forward through a unified name/rest structure.
- Extracted the submitModelSpec closure (the /model route and the object method share it, removing the `this` dependency); dispatchCommand refactored into a createViewModel closure.
- Real-machine verified: menu popup/filtering (/ → 6 entries, /m → only /model), /model with an argument triggers a model-fork into a new session (a0fbde8b → c8afbfb9); Tab and Ctrl+R need manual terminal confirmation (TTY cannot inject control keys). Tests 59/59 (+3: running pass-through, /model with argument and case, extra arguments still recognized).

### Command Palette completed (opencode/claude-code style)

As requested, the command interaction became a full palette:
- Input `/` → candidate list (up to 8, filtered as you type), **↑↓ move the highlight (❯) + Enter executes the highlighted item + Esc closes** (no longer a read-only hint). While the menu is open, ordinary characters keep filtering, backspace works; items carry a hint and an arg reminder.
- `/model` → **model selector**: asynchronously pulls the real model catalog via `ctx.llm.listModels(provider)` (real machine: DeepSeek-V4-Flash/Pro/Vision-Exp, three rows), a ChoicePicker component with ↑↓ select + Enter confirm → model-switch (fork keeps history); `/model x` with an argument still switches in one step; a missing llm service falls back to the single model.
- `/perm` with no argument → the policy selector (ask/never); with an argument it still sets directly.
- A generic ChoicePicker component unifies the model/policy choices (state.choicePicker as the single state + title-based dispatch); the old modelInputOpen free-input mode was removed (interface replaced by submitModel→pickModel etc.).
- Real-machine verified: menu ↑↓ highlight rendering, /model selector with a real catalog, Enter triggering model-fork (645c30fa→d5f65b25). ↑↓/Esc keys and the `/perm` selector need manual terminal walkthrough (TTY control-key limits). Tests 60/60 (+1: the /perm selector).

### code profile: the opencode-style layout (centered column chrome)

As requested, a new entry named `code` whose UI replicates the opencode style with a centered message column. Purely additive; the cli default is unchanged:
- `ui/chrome.ts`: `UiChrome = 'classic' | 'opencode'` + validation (shared by App/index/startup to avoid a cycle).
- The cli-app plugin config gained a `ui` field (z.object default 'classic'), the bundle patch wires `ctx.cliStartup.ui || 'classic'`; startup gained a `--ui` option defaulting to the **empty string** (critical: a 'classic' default would make the profile overlay's `|| 'opencode'` unreachable — truthy wins), and only explicit values are validated.
- App.tsx: chrome-parameterized. The opencode variant = full-width top bar (left `code`, center sessionLabel truncated to 72, right running/model), a centered message column (the useColumnWidth hook listens on stdout resize; column width min(term-2, 104) centered), a `> ` input prompt, a full-width bottom bar (left hints / right tok); message rows have no role prefixes and tool cards get a `⎿` prefix. The classic branch is untouched (just structurally extracted into shared messages/inputLine).
- New profile `~/.dsh/profiles/code`: package.json bundles identical to cli; the cordis.patch.yml overlay replaces the cli-app config wholesale and sets `ui: !!js ctx.cliStartup.ui || 'opencode'`; the three node_modules layers are generated by dsh heal (never copy them by hand — heal insists on owning the ink link).
- Verification: 61/61 tests (+1 rejecting an unknown --ui); ITL fixed-width rendering confirms the centered column, top/bottom bars, `>`, and prefix-free messages; real machine `pnpm dsh --profile code --theme deep-forest` shows the top bar + input state, and `--profile cli` classic shows no regression. The centered column's interaction with terminal width needs a manual window-resize check.

### Revision: a centered empty-state welcome / left-aligned conversation

Comparing against opencode screenshots, the user clarified: only a **new conversation (empty session)** should be centered; normal conversations are all left-aligned. The opencode branch became two states:
- `state.messages.length === 0` (empty state): no top bar; vertical whitespace sized by terminal height (useTerminalDims extended to return rows, padTop = (rows-12)/2 capped at 6), the `code` wordmark + `> ` input (width min(colWidth,88) capped) + an auxiliary row `new session · <model> · tip: /model switches route`, all horizontally centered; the bottom bar stays (hints left / idle right).
- Non-empty: top bar (code / sessionLabel ≤72 / idle·model) + messages and input **left-aligned full width** (justifyContent center and the column cap removed), bottom bar right adds tokens.
- Hook `useColumnWidth` → `useTerminalDims` ({columns, rows}, resize-listening); the classic branch is untouched.
- Verification: 61/61; ITL two-state rendering (empty state: code centered with 21-column indent, input indented 6; conversation state: messages flush left); real machine: after sending a message the top bar appears and messages sit flush left (5,374 tok).

### Revision: the empty state lost its overlays (centered mode couldn't invoke / commands)

The user reported the empty-state welcome page "couldn't invoke / commands". Root cause: the empty branch rendered only the centered input row — commandMenu / ChoicePicker / ApprovalModal / Picker were all unrendered; the key logic (useInput priority) still intercepted input, but the screen showed nothing, manifesting as "commands don't work".

Fix: shared rendering split into `transcriptRows` (error + message list) and `overlays` (session picker / approval / choicePicker / command menu); the empty branch renders `{overlays}` above the centered input, while conversation state and classic render `{transcriptRows}{overlays}` (order unchanged).

Real-machine verified the full empty-state chain: `/` → menu pops (❯ /new highlighted inside the centered column) → `/model` filters → Enter → the model selector pops (3 real models) → Enter confirms → model-fork returns to a new empty-state welcome. Also: earlier lint rounds only captured `Select-Object -Last 1` (the Finished line) and misreported 0 — the src side actually had 5 no-unnecessary-condition errors in this round (stdout.columns ?? fallback, chunk.name ??, listModels?., name !== undefined, a duplicate null check after an early return at 501), all cleaned; composition.spec.ts's 13 style/type errors are historical debt (untouched lines this round, see below).

### Fourth review response (6-point composition check)

The 6 review points mostly referenced intermediate states from the reviewer's parallel read (the file was mid-rewrite); checked one by one against the current (green) state: ① mount sync — solved by vmOf + waitForFrame(idle) (vm driving bypasses stdin); ② startup failure visibility — this round added the exitCode box + waitForFrame early exit (non-zero throws `see stderr above` immediately); ③ toEqual — collectLogEvents now strips envelopes (type/data only) and matches; ④ roots[i] — collectLogEvents reads composition.sessions with no index dependency; ⑤ lint 0 (14 files clean after the rewrite); ⑥ the `DSH_CLI_TRACE` diagnostic hook was deleted with the 2026-09-12 revision: the session loop now has exactly one render/rerender path, and failures go through `fail()` to stderr + `appExit(1)`.

## Status-line metering (M6)

The user asked to replace the `/model`-style command hints under the input box with `token xx/s` plus token usage, to place the context-occupancy ring right of the permission preset, and to have context compaction lower the occupancy automatically.

- **`ui/status.ts` (new, pure functions)**: the only number→text home. `estimateLiveTokens` uses a fixed 4 char/token density (the same scale as the token-meter estimator); `tokensPerSecond` returns null under a 100ms window (no reading, shows `—`); `contextOccupancy` produces occupancy only when both numerator and denominator validate; `contextRing` (`○/◔/◑/◕/●`) and `contextBand` (<60 ok, <85 warn, else high) own the ring shape and color bands.
- **Throughput source**: the VM anchors the window on the attempt's first chunk (`frame.time`), estimates from streamed characters while streaming, and switches to the provider's `outputTokens` once the attempt's `usage` frame lands; the reading is kept until the next turn, and `start` frames reset the window but not the reading.
- **Occupancy source**: numerator `ctx.tokenMeter.measure(session).totalTokens` (the next request's prompt pressure, including surface-folding repricing), denominator `session.requestContext()?.contextWindow` (durable `request/context`). Re-read on every committed `session/event`, so a `compaction/*` landing steps the band down without waiting for the next usage report; with either input missing, the ring does not render.
- **Layout**: opencode attaches the ring right of `permission <preset>`, and the line under the composer becomes right-aligned `token 42.5/s · 使用量 12.3K`; classic puts the ring after the session label with the same meter line on the right. `COPY.classicHints` / `COPY.opencodeHints` deleted.
- **Dependency**: `@deepseek-ai/dsh-token-meter` into peer + devDependencies and a `packages/bundle/cli-app/tsconfig.json` reference; the workspace importer synced by `pnpm install --lockfile-only` (+3 lines only).

## Narrow-terminal reflow (M7)

Dragging/zooming the window painted multiple copies of the input box and status line — one more per shrink.

- **Root cause**: Ink's `eraseLines(previousLineCount)` uses the line count computed at the width the previous frame was written; a narrower terminal re-soft-wraps that frame into more physical rows, so the erase stops short and the frame top survives. Both of Ink's own resize rendering and the App's `useTerminalDims` state update rendered with this wrong count.
- **Fix**: `ui/resize.ts` wraps `stdout.write` before Ink (registering its `resize` listener first, so it runs ahead of Ink's `resized`), remembers the previous frame's text, and on a shrink rewrites the next erase-prefixed write's repeat count to the frame's physical row count reflowed at the new width: `wrappedRows` packs per-grapheme greedily (`string-width` for wide chars/emoji and ANSI stripping), `reflowedRows` adds Ink's cursor row. Only the repeat count changes: no clears, no scrollback touches, no extra repaints.
- **Boundaries**: widen/same-width cancels the pending value; no-op when the erase count already covers the target; one shrink amplifies once. Ink's static-commit burst (`log.clear()` → bare static rows → bare live frame, last bare write wins) and the first bare frame are both modeled; a `\u001b[2J` full-screen replay discards the model. The widen direction is never corrected (terminal fold-merge behavior is inconsistent).
- **Wiring**: the `internals.render` implementation was extracted into the exported `renderApp(element, streams)`, with `installResizeReflow` → `inkRender` → `restore()` on unmount; new runtime dependency `string-width`.

## Tests

`tests/`: theme / startup (real Loader composition) / sessions (real SessionStore log slices) / transcript (projection + Static/live split + `hasConversation`) / status (throughput windows, usage/occupancy formatting, ring and bands) / resize (fake streams reproducing Ink's byte shapes + real Ink renders asserting erase counts recomputed at the new width) / terminal (clear-sequence bytes) / state (real SessionStore + scripted agent, throughput estimate→provider sample, post-compaction occupancy step-down) / app (ink-testing-library rendering Static and re-keying, metering line and ring) / index (real registries + scripted factory + render seam + session-boundary clears) / composition (REAL-composition mounting a real `TokenMeter`, asserting the real frames' metering line and ring) — **98 cases green**, keyless. `oxlint packages/bundle/cli-app` 0, `tsc -b tsconfig.host.json` 0, `verify-package-dependencies` passes. **The 100%/file coverage gate is still unmet** — an upstream-contribution prerequisite, not a local-run blocker (see README Known Limitations).

## Review rework (2026-09-06)

- P1-1 lint's 4 errors fixed (unbound-method → function-property interfaces + this-closure; no-unnecessary-type-conversion → dropped the redundant `String()`) — `oxlint` 0/0.
- P1-2 tests landed (see above); the coverage sprint is M5.
- P1-3 README committed with the package, including Known Limitations.
- P2-4 the approval answerer was not registered — explicitly registered in README Known Limitations (M3 delivered the answerer + the terminal approval UI).
- P2-5 theme validation fails loud (see Decision).
- P3-7 the reasoning fold (design spec) printed flat in M1 — registered for M4 polish.
- Second review: the 4 test type errors fixed (`internals.render` narrowed to the two-method `InkSurface` interface; session/event test emits carry the full SessionEvent envelope: seq/time/data); the README test command became `pnpm exec vitest run packages/bundle/cli-app` (no package-local test script, official style). tests fell under `tsconfig.client.json`'s wide glob (`packages/*/*/tests/**/*.ts`) into the official tsc gate; type errors surfaced via `pnpm run typecheck` and were cleared.

## Session and UI fixes + opencode alignment (2026-09-18)

During the working copy's idle period a GBK editor accident struck: overlays/sessions/state were re-saved as GBK, turning `·`→`路`, `—`→`鈥?`, `确认/取消`→`纭/鍙栨秷`; the sessions.spec `·` assertion went red with it. The `/fork` branch went missing from `dispatchCommand` (fork entirely broken; one case each in index/state failed), and `run()` unconditionally ran `clearViewport` on the quit path too (exit flash + three index.spec assertion failures). Fixes: a byte-level script restored the mojibake; the `/fork` case is back; the viewport clear runs only when another session follows (quit is erased by unmount); the dead `promptSubmitted` variable is gone; the `SessionSummary` test literal gained its missing fields. The composition context-ring assertion wrapped/clipped its `%` inside the 80-column ITL frame and now matches whitespace-tolerantly.

opencode alignment additions:

- **Spinner**: `ui/spinner.ts` braille frames `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (80ms); while running, the composer/status bar shows `⠹ 运行中 · 12s` (the running state was completely static before — the main body of the reported "UI animation problem").
- **Task panel**: `ui/todos.tsx` + `transcript.ts`'s `projectTodos/replayTodos`, same semantics as the official `todos` projection (whole-list replacement, cleared on `turn/start`); docked above the composer with `[✓]/[•]/[ ]` states, auto-hidden when everything completes, folded by `Ctrl+T`. Types enter through a type-only import of `@deepseek-ai/dsh-tool-todo` (peer + dev + tsconfig reference).
- **Running queue**: `send()` no longer errors while running; prompts queue FIFO and drain one per idle edge (`submitPrompt` extracted as the shared submit path); `stop()` (Ctrl+C) clears the queue too. The two old "still running" cases were rewritten to the new semantics (behavior change ships with its tests).
- Keys/help/README synced; 106 cases green, oxlint 0, tsc 0.

## The dsh-taskboard progress-time board (2026-09-18)

The user asked for a standalone **task progress-time board** beyond the todo panel: `Ctrl+B` swaps the whole screen between the conversation and the board (while up, the board swallows every other key). The board reads only state the view model already projects, so it can never disagree with the transcript: the task checklist (the `todo/write` projection, full `[✓]/[•]/[ ]` rows plus a done count), the current turn (spinner + live elapsed + queue depth while running; last turn duration and its end clock when idle), a per-turn conversation timeline (folded from `turn/start`/`user/message`/`assistant/message`/`tool/call`/`turn/end`: each turn's clock span plus the human prompt, the assistant reply summary, the tool sequence, and output tokens, `#turn HH:MM → HH:MM duration`, newest first, capped at 12 with ring discard, rebuilt from the durable log on resume), the model/permission/context-ring/usage readouts, and a pending-approval warning (the board must not hide an unanswered tool gate). Implementation: `ui/taskboard.tsx` owns `reduceTurnSpans/collectTurnSpans` (pure, reference-stable folds) and `isBoardToggle` (the Ctrl+B test over Ink's ctrl+meta key flags); the VM gains `boardOpen/turnSpans` state and a `toggleBoard` action (replay folds the history from the durable log once, the live path consumes `session/event`); App handles the toggle before every other key branch. The first cut used Ctrl+Alt and never fired on the real machine (Windows Terminal encodes Alt+letter as `ESC letter`; ink's keypress parser never sets `meta` for that shape), so the chord became Ctrl+B — a plain control character every terminal encodes reliably. The same round upgraded the session-boundary clear to a full wipe including the scrollback (`ESC[3J`): after `/new` and friends the retired conversation can no longer be scrolled back into view, while `/clear` keeps the scrollback. `/help` gained the chord line. Convention: tests never import `.tsx` directly (the host aggregate's TS6305 trap) — everything goes through the `ui/index.ts` barrel. Same-day second iteration (the user called the first cut too plain): the timeline became a conversation timeline — `TurnEntry` (prompt/reply/tools/outputTokens) replaced the duration-only `TurnSpan`, the fold consumes user/assistant/tool events (injected messages and empty text produce no entry, tools dedupe, the prompt keeps the latest), and the VM field `turnSpans` became `turnTimeline`. Gates: vitest 122/122, oxlint 0, tsc 0, whole-repo typecheck green, both profiles boot-smoked clean. Same-day third iteration (the user asked to drag the timeline): the board became a two-pane scrubber — the timeline renders as a cursor axis (`●` marks the live turn, `❯` the selected one) and a content pane shows the selected turn's full folded conversation (`TurnEntry` gained `messages: TurnMessage[]` user/assistant/tool rows, each message capped at 8 rendered lines with a more-marker, retention capped at 40 per turn); ↑/↓ step one turn, PgUp/PgDn page five, stepping past the newest returns to live. `stepTimelineCursor` is a pure cursor function; ink's `Key` type has no home/end flags, so only the arrows and page keys are bound. Gates: vitest 125/125, oxlint 0, tsc 0, whole-repo typecheck green, test:docs 15/15, both profiles boot-smoked clean (two unrelated suites flaked only under full-workspace parallel load and pass in isolation). Before release the user's machine hit an idle OOM (4 GB heap in about three minutes) that traced to ink's static handling: closing the board unmounted the transcript `<Static>`, the remount re-rendered the whole transcript as fresh static output that ink retains and replays whenever a frame reaches screen height, and the write flood backed up the terminal pipe onto the heap. The Static element is now the first child of every App branch so it stays mounted, and the board clamps itself below the terminal height (axis rows and pane messages budgeted, pane lines width-truncated to one physical row). A probe harness measured the write flood dropping from 4.3 GB to 2 MB per 800 board toggles and from 3.7 GB to 3 MB per 15 seconds of spinner. Gates: vitest 126/126, oxlint 0, tsc 0, whole-repo typecheck green, test:docs 15/15, both profiles boot-smoked clean.

## Working-copy merge notes

When merging upstream, manually preserve: root `package.json` devDeps, the `tsconfig.base.json` hand-written alias block, the `tsconfig.host.json` cli-app reference, the project references in `packages/bundle/cli-app/tsconfig.json` for permission-presets / credentials / settings / brand / values / token-meter / tool-todo, and cli-app's indirect entry in `scripts/verify-package-readme-model-experience.ts`. `packages/bundle/cli-app/` and `docs/cli-app/` are new untracked directories (now tracked on the fork).
