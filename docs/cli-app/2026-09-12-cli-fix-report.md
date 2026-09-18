# dsh-cli 2026-09-12 fix and verification report

English | [中文](2026-09-12-cli-fix-report.zh.md)

## 1. Problems in this round

1. Enlarging/resizing the terminal window black-screens the UI and the content disappears.
2. `/sessions` session switches end up with empty content.
3. `/perm` can only toggle between `ask/never`; it cannot fully control the sandbox and approval policy.
4. The `/connect` provider-connection capability is missing; mainstream providers and custom URL/API Key/API format cannot be configured from the CLI.

## 2. Pre-change code locations

- `packages/bundle/cli-app/src/index.ts`
  - `code` used a hand-rolled `?1049h` alternate screen.
  - Lifecycle switches reused the same Ink root.
- `packages/bundle/cli-app/src/ui/App.tsx`
  - A resize listener actively ran `\x1b[2J\x1b[H`.
  - Settled messages used `<Static>`, but clearing on resize wiped the already-written Static content too.
  - ChoicePicker rendered all options at once.
- `packages/bundle/cli-app/src/ui/state.ts`
  - `/perm` only touched the approval policy `ask/never`.
  - `/model` queried only the current provider.
  - No provider connect wizard.
- `packages/llm/llm-pi-ai/src/config.ts` / `provider.ts`
  - Infrastructure for configurable providers, credential refs, baseURL, models, and the API protocol already existed and could be reused directly.
- `packages/interaction/permission-presets/src/index.ts`
  - Complete permission presets (sandbox + approval) already existed and could serve as `/perm`'s real control plane.

## 3. Changes applied

### 3.1 Resize black screen

- Removed the App-level active full-screen clear on resize.
- Kept Ink's own resize/layout handling.
- `index.ts` now clears the current visible surface only on session lifecycle switches, never on resize.
- Kept the normal terminal screen instead of the alternate screen, preserving scrollback.

### 3.2 Session switching

- The App root gained `key={vm.getState().sessionId}`, forcing a fresh React subtree per session.
- The lifecycle rerender clears the old visible frame so the old session's Static content cannot linger.
- The Static transcript rebuilds because the session key changed; after a resume, content is re-projected from the durable log.

### 3.3 Permissions

`/perm` now prefers the existing `permissionPresets` service instead of only manipulating the approval policy.

Full presets are supported, for example:

- `read-only`
- `workspace-write`
- `danger-full-access`
- plus any other preset the project's permission-presets service registers

The `ask` / `never` compatibility paths remain.

The status bar now shows the current permission preset instead of a plain "ask/never".

### 3.4 The `/connect` provider wizard

The interactive `/connect` is new:

1. Mainstream providers come from the existing LLM configurable-provider directory.
2. "Custom provider" is selectable.
3. Mainstream provider: enter API Key → optional Base URL → save.
4. Custom provider: provider ID → API Key → Base URL → API format → Model ID.
5. Supported API formats:
   - `openai-completions`
   - `openai-responses`
   - `anthropic-messages`
6. The API Key goes only into the credentials service, never into a UI snapshot or settings plaintext.
7. Provider configuration persists through the `llm-pi-ai` settings namespace.
8. `/model` now reads both the current provider and configured providers, so newly connected models are selectable.
9. ChoicePicker gained a visible-item cap; long provider/model lists scroll with the arrow keys instead of blowing up the terminal.

### 3.5 Dependencies / lockfile

- Updated `packages/bundle/cli-app/package.json`.
- Synced the `pnpm-lock.yaml` workspace importer.

## 4. Verification

### Completed

- `git diff --check`: passes.
- `package.json` JSON parse: passes.
- Reviewed the llm-pi-ai provider schema: the custom provider's models/api/baseURL/apiKeyEnv all align with the existing schema.
- Reviewed permission-presets and user-approval: confirmed presets cover both sandbox and approval.
- Reviewed Ink's resize/Static/alternate-screen mechanics and removed the hand-rolled resize clear that caused the black screen.

### Local run verification still outstanding

The current ShunCode execution environment has no `node.exe`, so these could not run there:

- `pnpm test`
- `pnpm exec tsc --noEmit`
- `pnpm dsh --profile code`

Earlier direct TypeScript checks confirmed the failure cause was the missing `node.exe` in that environment, not a compile error.

So the "functional verification" in this report is currently code-path verification; the final TUI regression still needs the user's local Node 24.19.0 machine.

## 5. Suggested final regression steps

```bash
pnpm install
pnpm exec tsc --noEmit
pnpm dsh --profile code
```

Then verify in order:

1. After startup, enlarge/shrink the terminal and confirm no black screen.
2. Let the AI output exceed one screen, then scroll up with the mouse wheel.
3. Enter `/sessions`, open an old session, press Enter, and confirm history reappears.
4. Pick `read-only / workspace-write / danger-full-access` via `/perm` and exercise tools under each.
5. `/connect` → OpenAI/DeepSeek/another mainstream provider → API Key → Base URL.
6. `/connect` → custom → provider ID → API Key → URL → API format → Model ID.
7. `/model` and check the new provider/model appears and is switchable.

## 6. Risks and follow-ups

- Still Ink-based; Ink has known rendering limits under extreme terminal resizes and Static content beyond the viewport, so this round's focus was removing the clear-screen/alternate-screen conflicts this project added on top.
- If resize ghosting survives the final regression, the next stage should shrink the dynamic region further or migrate to an OpenTUI/OpenCode-style retained renderer.
- `/connect` custom models currently use default context window/max tokens; optional fields for exact model capabilities can come later.

## 2026-09-12 real-machine feedback: `/sessions` switch re-review

### Symptom
A real-machine screenshot showed the terminal printing the literal `\\x1b[H\\x1b[2J` after a switch/repaint: the ANSI clear sequence had been double-escaped, so the terminal printed it as text instead of executing the clear.

### Root cause
Session switches reused the same Ink instance via `rerender()`. The opencode UI keeps the committed transcript in `<Static>`; carrying one Static tree across sessions left old-session lifecycle residue and failed to establish the new session's content correctly.

### Fix applied
- After picking a session in `/sessions` or `/resume`, the old Ink tree is no longer reused.
- `ink.unmount()` first, then clear the visible screen, then mount the new session via `internals.render(element)`.
- The clear sequence is built at runtime with `String.fromCharCode(27)` so PowerShell/source editing cannot produce another `\\x1b` literal.
- The terminal resize path never clears, so "enlarge → black/empty screen" cannot regress.

### Re-verification status
- Reviewed the switch code block structure: the current implementation is "unmount old tree → clear screen → render new tree".
- `git diff --check` reports no whitespace errors in the cli-app sources.
- Confirmed the `\\x1b` literal clear sequence from the screenshot no longer exists in the source.
- The execution environment still has no usable `node`, so a second real-machine pass could not run here; the final `/sessions` regression needs the user's machine.

## 2026-09-12 re-review rework: structural fix (gates green locally)

The previous "unmount → clear → re-render" only moved the symptom. Three problems remained: whole-tree rebuild on session switch, the `\\x1b` literal risk, and the app fighting resize/scroll on its own; additionally App.tsx copy had been double-encoded into mojibake during editing. This round rewrote the rendering layer the way Ink intends.

### Root cause

1. **Session switching**: reusing one Ink instance with `rerender` and a new root key is enough; the old code did `unmount()` + a clear sequence + a fresh `render()`, and the clear sequence was written as a twice-escaped string (the terminal printed it as text).
2. **Scroll/resize black screen**: the open `code` layout entered the alternate screen (`?1049h`) and turned on mouse reporting (`?1000h/?1006h`), plus the App layer's manual `scrollOffset`/clears; all of it fought the terminal's own capabilities.
3. **Mojibake copy**: some App.tsx Chinese strings were "UTF-8 bytes read as GBK then re-encoded" products (e.g. `浼氳瘽` = `会话`, `鉂?` = `❯`, `馃悮` = `🐚`).

### Fix

- **Static transcript**: `splitTranscript` splits at the first unsettled row; the prefix goes to Ink `<Static>` (written once into terminal scrollback) and the suffix (streaming rows/overlays/input) repaints. Resize no longer reflows history; scrollback belongs to the terminal.
- **Single Ink instance**: the session loop runs `ink === null ? render(element) : ink.rerender(element)` with the root key = session id; `unmount + clear + render` and manual ANSI escapes are gone.
- **No alternate screen, no mouse reporting**: no wheel grabbing, no screen switching; scrolling belongs to the terminal.
- **`/clear`**: clears only the current viewport (the `CLEAR_VIEWPORT` constant) and bumps `transcriptEpoch` to rebuild the static list; scrollback stays. A unit test pins the constant to real ESC bytes.
- **Single copy source**: new `ui/copy.ts`; App/overlays/state/connect no longer inline user-visible strings; mojibake was restored to the correct Chinese/emoji from the original bytes.
- **One projection**: `transcript.ts`'s `projectEvent` serves both replay and live `session/event`, deleting the duplicated projection branches; `trimTranscript` was removed (a written Static row leaves the React tree, so trimming is unnecessary).
- **Module split**: `state.ts` (1137 lines) split into model / transcript / connect / copy / state; App.tsx (796 lines) split into App / messages / overlays; pure markdown projection moved to `markdown.ts`, its Ink rendering stayed in `markdown-view.tsx`.
- **Tests in step**: fixed 6 pre-existing failures (/help copy, /perm title, close after pickModel, unmount vs rerender, three composition cases) and added the transcript/terminal/app spec files. `pnpm exec vitest run packages/bundle/cli-app/tests` → **71/71 green** (REAL-composition dropped from 45s timeouts to ~0.5s); oxlint 0; `tsc -b tsconfig.host.json` 0.
- **Wiring**: `packages/bundle/cli-app/tsconfig.json` gained the project references its real dependencies need (permission-presets / credentials / settings / brand / values), and `scripts/verify-package-readme-model-experience.ts` gained the cli-app indirect entry (same rationale as `packages/bundle/base`). Merge upstream must keep root `package.json`, `tsconfig.base.json`, and `tsconfig.host.json` together with it.

### Still needs human confirmation

Real-TTY wheel/resize/`/clear` visuals cannot be asserted in a TTY-less CI environment; walk `manual-acceptance.md`.

## 2026-09-12 second feedback: two `/new` problems

### Symptom

1. `/new` in an old session kept the old conversation on screen (the new input box attached below the old content).
2. Every `/new` with nothing typed still counted as a conversation; `/sessions` piled up empty sessions.

### Root cause

1. A Static transcript cannot be unprinted after it enters terminal scrollback; the previous round had removed every clear path to fix the resize black screen, so the old session's static rows stayed on screen across switches.
2. `/new` directly ran `exitFn({type:'new'})` → the glue immediately created a new session via `agents.create` and disposed the old handle; the official persistence drains durably on handle close, so every never-typed session hit the disk as an empty session.

### Fix

- **Clear at session boundaries**: `InkSurface` gained `clearViewport()` (`instance.clear()` + `CLEAR_VIEWPORT`); the glue calls it before non-first `rerender`s; `/clear` and `/new` share the path. Scrollback is kept.
- **`/new` reuses untouched sessions**: new `transcript.ts#hasConversation` (only user-origin `user/message` and `assistant/message` count; injected context does not), and the VM covers the "optimistic send before the durable event lands" window with `promptSubmitted`. When the current session is untouched, `/new` runs `resetTranscriptView()` (clear + bump `transcriptEpoch`), creating and persisting nothing.
- **Tests**: VM cases cover "untouched-session `/new` resets locally, `done` never resolves" and "session with content `/new` still emits `new`"; index.spec covers "reset calls clearViewport, no second `create`" and "switch clears the viewport before rerender"; transcript.spec covers `hasConversation` returning false for injected context. `vitest run packages/bundle/cli-app/tests` → **74/74 green**; oxlint 0; `tsc -b tsconfig.host.json` 0.

### Known residue

The official `sessionPersistence` has no delete API, so "from a used session `/new` into a never-typed session, then leave" still leaves 1 empty session (not one per `/new`). Getting to zero needs lazy creation (`agents.create` on first input) or an official delete/GC API; filed as follow-up work.

## 2026-09-12 third feedback: the status line becomes metering readouts

### Request

1. Replace the `/model`-style command hint line under the input box with `token xx/s` and token usage.
2. Put the context-occupancy ring right of the permission preset.
3. Context compaction must lower the displayed context usage automatically.

### Fix

- **`ui/status.ts` (new)**: the only number→text home. `tokensPerSecond` / `estimateLiveTokens` (fixed 4 char/token density, same scale as the token meter) / `formatTokenRate` / `formatTokenCount` / `contextOccupancy` / `contextRing` / `contextBand`.
- **Throughput**: `state.ts` anchors the window on the attempt's first chunk, estimates from streamed characters while streaming, and replaces the estimate with the provider's `outputTokens` when the `usage` frame arrives; windows <100ms show `—`. The reading is kept until the next turn.
- **Context ring**: numerator `ctx.tokenMeter.measure(session).totalTokens` (next request's prompt pressure), denominator `session.requestContext()?.contextWindow`. Re-read on every committed `session/event`, so a `compaction/*` shadow price steps the band down the moment it lands — **without waiting for the next usage report**. A five-step `○/◔/◑/◕/●` ring, <60% ok, <85% warn, otherwise error.
- **Layout**: the opencode layout attaches the ring right of `权限 <preset>` and turns the line under the composer into a right-aligned `token 42.5/s · 使用量 12.3K`; the classic layout puts the ring after the session label with the same meter line on the right. `COPY.classicHints` / `COPY.opencodeHints` deleted; the `/` palette and input placeholders still own command discovery.
- **Dependency**: new `@deepseek-ai/dsh-token-meter` (peer + dev) and a tsconfig project reference; `pnpm install --lockfile-only` added only 3 importer lines.
- **Tests**: new `tests/status.spec.ts` (6 cases); `state.spec.ts` covers estimate→provider-sample replacement and "occupancy drops 80% → 20% after a compaction event"; `app.spec.ts` covers both layouts' readouts and ring plus the `—` before any measurement; REAL-composition mounts a real `TokenMeter` and asserts real frames show `使用量` and `上下文 ○ 0%`. `vitest run packages/bundle/cli-app/tests` → **85/85 green**; oxlint 0; `tsc -b tsconfig.host.json` 0; `verify-package-dependencies` passes.

### Known residue

The first half of streaming throughput is a character-density estimate, not a provider count; only the attempt-ending `usage` frame is exact. Whole-run precision needs providers to report usage incrementally.

## 2026-09-12 fourth feedback: dragging/resizing the terminal duplicates the input box

### Symptom

Dragging the window edge, or enlarging/shrinking the terminal, paints multiple copies of the input box (and status line) — one more per drag.

### Root cause

Ink erases the previous frame with `eraseLines(previousLineCount)`, and that count is the logical line count computed **at the width the frame was written**. When the terminal narrows, it re-soft-wraps on-screen content to the new width, so that frame now occupies more physical rows; `eraseLines` stops at the old count and the frame top (input box/status line) survives on screen. The next render paints another copy — one per shrink. Additionally the process runs two render paths, Ink's own `resize` listener and the App's `useTerminalDims` state update, both rendering with the wrong count, so residue stacks during the drag.

### Fix

- **`ui/resize.ts` (new)**: wraps `stdout.write` before Ink (it registers its `resize` listener first, so it runs ahead of Ink's own `resized`). It remembers the previous frame's text; on a shrink it rewrites the next erase-prefixed write to "the frame's physical row count reflowed at the new width" — a per-grapheme greedy line pack (wide chars take 2 columns via `string-width`) plus Ink's cursor row. Only that repeat count changes: no clearing, no scrollback touches, no extra repaints.
- Widen/same-width cancels the pending value (a reflow can only shrink the row count; amplifying it on a widen would erase into committed scrollback); no-op when the erase count already covers the target; one shrink amplifies once. Ink's static-commit burst (`log.clear()` → bare static rows → bare live frame) and the first bare frame are both modeled (burst bounded by the microtask, last bare write wins); a `\u001b[2J` full-screen replay discards the model until the next erase-prefixed render re-anchors it.
- **Wiring**: the `internals.render` implementation was extracted into the exported `renderApp(element, streams)` (stdout + optional stdin), which runs `installResizeReflow` → `inkRender` → `restore()` on unmount.
- **Dependency**: new `string-width` (wide-char/emoji widths and ANSI stripping, so CJK lines are not undercounted by code points).
- **Tests**: new `tests/resize.spec.ts` (13 cases). 11 reproduce Ink's byte shapes on fake streams (widen, one-shot, widen-cancel, never-shrink, static burst, stray bare writes, full-screen replay, restore); 1 renders the App with real Ink and asserts the erase count Ink writes after a shrink equals the reflowed row count (27 → 41 measured) and that `stdout.write` is restored on unmount. `vitest run packages/bundle/cli-app/tests` → **98/98 green**; oxlint 0; `tsc -b tsconfig.host.json` 0.

### Known residue

Only the **shrink** direction is corrected: whether a widen merges soft-wrapped rows depends on the terminal (xterm/Windows Terminal do; others may not), so the widen direction is never amplified to avoid over-erasing on terminals that do not merge. Stray bare writes outside the live region (third-party plugins writing stdout) may be mistaken for a frame; only the erase count is affected, never content. The real-machine drag walkthrough lives in `manual-acceptance.md` ⓪-2.

## 2026-09-13 /sessions and /new real-machine issue fixes

### Newly reported issues
1. Opening a history session from `/sessions`, then running `/new`, still left the old session's content on the new session's screen.
2. Repeated `/new` produced a large number of empty sessions, and `/sessions` listed Sessions the user never typed into.
3. The Session list sorted by creation time instead of the last user-input time.

### Fix
- `/new` now truly triggers the Session lifecycle `ExitRequest({ type: 'new' })`; after the old Session disposes, the host recreates a fresh Session and clears the old viewport, so no old Static/transcript lingers.
- When the current Session never saw user input, `/new` does not create a new Session; it reuses the current empty one.
- The `/sessions` list reads the `sessionListMetadata` projection: only Sessions with `blank === false` enter the list — i.e. a committed user message must exist, so empty Sessions created by `/new` are hidden.
- The list gained `updatedAt`, using `lastPromptAt` as the activity time; the list sorts by `updatedAt` descending.
- The Session picker's time display switched to `updatedAt` too.

### Verification
- The key cli-app TS/TSX files were transform-checked individually with the in-repo esbuild 0.28.1; currently 0 syntax failures.
- `git diff --check` found no whitespace errors.
- `pnpm exec tsc --noEmit` could not actually start in that tool environment: its `pnpm.ps1` could not find `node.exe`, so the full TypeScript check was not claimed as passing.

### Suggested real-machine regression path
```text
1. Start the code profile
2. Enter "session A" and wait for completion
3. /sessions -> pick session A
4. /new
   Expected: the screen shows only the new empty composer, not A's history
5. Run /new 2-3 more times without typing anything
6. /sessions
   Expected: those empty Sessions do not appear in the list
7. Return to session A and send a second message
8. /sessions
   Expected: session A's time updated and it moved to the top of the list
```
