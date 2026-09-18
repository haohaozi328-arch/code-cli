# cli-app manual real-terminal walkthrough checklist

English | [中文](manual-acceptance.zh.md)

The automation side (oxlint / vitest 71 / `tsc -b tsconfig.host.json` / REAL-composition) fully passes; the flows below depend on a real TTY (mouse wheel, window resizing, control-key injection), which the automation channel cannot reach, so they must be **walked manually in a terminal**. Start from the `D:\workspace\DeepSeek\dsh-cli` directory:

```sh
pnpm dsh --profile cli --theme deep-forest
```

## Prerequisites

- Confirm the status bar shows `空闲 · DeepSeek V4 Flash · <会话>`
- Credentials are reused from `~/.dsh`; real model calls consume a small number of tokens

---

## ⓪ Rendering-layer regression (the focus of this round of fixes)

1. **Window resizing never black-screens**: let the agent output exceed one screen, then freely enlarge/shrink the terminal window. **Expected**: already-written history stays put; only the bottom streaming/input rows reflow; no black screen and no literal `\x1b[2J`-style control-sequence text appears.
2. **Shrinking leaves no duplicated input box**: **continuously and slowly shrink** the window edge (a few columns at a time), then drag it wide again. **Expected**: the screen always holds exactly one input box/status line; dragging must not accumulate duplicated input boxes or status lines, and after release the frame settles clean (erase counts recomputed at the new width). If duplicates appear, record the terminal program and version (the correction is computed by reflowing the pre-shrink frame; a terminal that does not reflow soft-wrapped lines needs no correction).
3. **Terminal-native scrolling**: scroll the mouse wheel up to see history pushed off-screen. **Expected**: the terminal itself scrolls; the app never intercepts the wheel, never enters the alternate screen; wheel text selection is not disturbed by mouse reporting.
4. **Session switch replays history**: `/sessions` (or `/resume`) → ↑↓ pick another session → Enter. **Expected**: the viewport clears first, then the new session's full history appears; the old session's content **no longer remains** on screen (it is still scrollable above); the status-bar session label updates accordingly.
5. **Continue the conversation after switching**: ask one more question in the new session. **Expected**: history context is correct and streaming output lands after the new session's history.
6. **`/clear`**: send `/clear`. **Expected**: the current viewport clears to an empty screen plus the input line; scrolling up still shows the pre-clear scrollback (by design).
7. **`/new` clears the screen**: run `/new` in a session with content. **Expected**: the screen clears and the old conversation no longer shows above the input box.
8. **Repeated `/new` produces no empty sessions**: in a new session **type nothing at all**, run `/new` several times, then `/quit`, then `/sessions` to inspect the catalog. **Expected**: the catalog has **no** pile of empty sessions (at most the single unused session you ended on).
9. **`/new` → send → `/new`**: after `/new`, send one message, then `/new` again. **Expected**: the second `/new` opens a new session normally (the current session already has conversation content).

---

## ① code profile (opencode layout)

```sh
pnpm dsh --profile code --theme deep-forest
```

1. **Empty-session first screen**: centered wordmark (`𝗖𝗢𝗗𝗘`) + `DeepSeek 终端助手` + centered composer (`> ` prompt + model/permission/context line) + bottom-right meter line `token —/s · 使用量 0`
2. Send a message (e.g. `say ok`): messages and the input area go **left-aligned full width** (no longer centered), the agent reply streams left-aligned with **no `你`/`● 助手` prefixes**; while streaming, the bottom-right `token` shows a real rate (readable ~0.1s after the first chunk) and the reading is kept after the turn ends
3. On a narrow terminal (~80 columns) the empty-state content stays horizontally centered without overflow; widening caps the composer width
4. After exiting with `Esc`/`Ctrl+C`, use `pnpm dsh --profile cli` to confirm the classic layout is unaffected (`❯ ` + bottom status line: `空闲 · 模型 · 会话 · 上下文 ◔ n%` + the same meter line on the right)

---

## ② Tool call → approval modal → [a] allow → ✓ card

1. Type and send: `在 D:/workspace/DeepSeek/dsh-cli 下运行 git status 并总结`
2. **Expected**: the model reasons, then calls the `bash`/`pwsh` tool → a tool row appears: `… 🐚 bash  command: git …` (running state)
3. If the call triggers approval → a **double-bordered `工具调用确认`** panel appears: tool name + `[a] 本次允许 · [r] 拒绝 · [Esc] 取消`
4. Press `a`
5. **Expected**: the panel disappears → the tool row turns `✓ …` + the result's first line → the agent continues its summary
6. When everything finishes, the status bar returns to `空闲`

> Note: inside the workspace-write sandbox most ordinary reads/writes **do not trigger approval** (the ask policy only gates out-of-bounds/sensitive operations). If no approval panel ever appears, that is normal — verify with an out-of-bounds instruction instead: `读取 C:/Windows/System32/config/SAM 文件头 16 字节并告诉我内容`.

## ③ The [r] / [esc] rejection paths

1. Send the out-of-bounds read instruction again; once the approval panel appears press `r`
2. **Expected**: the tool row turns `x …` (error) **and shows the denial reason** (`the user rejected tool "…"`); the model replies from it and the session does not crash

## ④ /perm → permission presets

1. Send `/perm`: **expected** a choice list opens (`read-only` / `workspace-write` / `danger-full-access` when the permission-presets service exists, otherwise `ask`/`never`)
2. Pick `never`, then send the same out-of-bounds instruction: **expected** no panel; the tool is denied directly (fail-closed) and the error result is visible on the card
3. Restore with `/perm workspace-write`

## ⑤ /model keeps the conversation across the switch

1. Chat a few turns in the current session first (so history exists)
2. Send `/model`: the real model catalog opens (↑↓ + Enter); or run `/model deepseek-official/deepseek-v4-flash` directly
3. **Expected**: after confirmation a **new session** is forked (the status-bar session id changes), history fully replays, and modelLabel shows the chosen route
4. Ask one more question to confirm the context carried over

## ⑥ /connect providers

1. Send `/connect`: the mainstream provider list opens + `自定义模型商`
2. Pick a provider → enter the API Key → Base URL (Enter to leave empty) → save
3. **Expected**: a `已连接模型商 …` notice appears; the provider's models show up in the `/model` catalog
4. Custom path: pick `自定义模型商` → provider ID → API Key → Base URL → API format (OpenAI Chat/Responses, Anthropic) → model ID
5. The API Key lands only in credentials and never appears in any UI text

## ⑦ /compact prints its output and steps the context down

1. After a few accumulated turns, note the `上下文 ◑ n%` to the right of the permission preset
2. Send `/compact`
3. **Expected**: the compaction summary lands as an ordinary visible row; **without waiting for the next prompt**, the status-line occupancy drops on the spot (repricing comes from the token meter's surface folding)
4. Ask one more question and the model still continues; the bottom-right cumulative `使用量` only grows (compaction never refunds historical usage)
5. Try `/feedback` (if there is no interactive form, an explanatory text should print)

## ⑧ Session-management regression

- `/sessions` opens the picker (↑↓/enter/esc, type to filter)
- `/new` in an empty session is equivalent to resetting the view (see ⓪-6/7); in a session with content it opens a new session
- `/quit` exits cleanly (no leftover node/bin.ts process in Task Manager)

---

## Failure lookup table

| Symptom | Likely cause |
|---|---|
| Black/empty screen after resizing | Regression to "clear on resize"; confirm the App no longer writes clear sequences |
| Duplicated input boxes/status lines after shrinking | `resize.ts` not installed (it must wrap before `inkRender` in `renderApp`), or erase counts not recomputed at the new width |
| A few history lines lost after widening | The widen-direction fold merge is uncorrected (known boundary); confirm the shrink-direction erase count was not amplified as a widen value |
| A literal `\x1b[2J` appears on screen | Some call site hand-writes the escape string; `CLEAR_VIEWPORT` must be a real ESC byte |
| The old conversation still shows above after `/new` | The session switch did not call `clearViewport`; check the glue's rerender branch |
| Blank screen after switching sessions | The static list key did not change with the session; confirm the root element key = session id |
| A pile of empty sessions in `/sessions` | `/new` did not reuse the untouched session; check `hasConversation` + `promptSubmitted` |
| The approval panel never appears | The operation never went out of bounds (see the ② note) or `/perm never` is still active (run `/perm workspace-write` first) |
| No ✓ after [a] | The answerer is not in effect → check whether `~/.dsh` config is cached from an older version |
| History lost after /model | A fresh session ran instead of a model-fork → check whether the status-bar session id changed |
| /compact prints nothing | The command had no success text (normal: some commands succeed silently) |
| Chinese/emoji mojibake | The terminal is not UTF-8; if only individual strings are mangled it is the source double-encoding problem |

After the walkthrough, record the results in the rendering-and-session-model section and the real-terminal acceptance section of `.agents/notes/implemented/feature/2026-09-06-dsh-cli-app.md`.
