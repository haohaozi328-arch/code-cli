---
description: "The terminal interactive frontend (TUI) for dsh: an Ink-rendered REPL with streaming chat, tool cards, approvals, a task panel, and session management, for users running the dsh cli and code profiles."
kind: "package-bundle"
---

# @dsh-external/dsh-cli-app

English | [中文](README.zh.md)

## Summary

Run `dsh --profile cli` and the terminal becomes an interactive agent console: an Ink-rendered REPL with streaming answers, reasoning display, tool cards, approval prompts, a task panel, and full session management, composed in-process on `dsh-base`. Everything is a plugin: no official core changes, one bundle layer (a profile patch plus one glue plugin) over the base's process-level rows. The `code` profile assembles the same bundle with an opencode-style layout. Sessions persist as durable JSONL shared with every other surface, so a conversation can start in the terminal and be inspected by any session tooling.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Launch the terminal UI from a profile that bundles this package. The flags fine-tune the invocation.

### Launching the terminal UI

```sh
dsh --profile cli                       # new session
dsh --profile cli --resume <sessionId>  # resume a persisted session
dsh --profile cli --theme deep-forest   # pick a theme
dsh --profile cli --ui opencode         # switch the layout for one run
```

The `cli` profile is a user-layer directory (`~/.dsh/profiles/cli`) whose bundle list is `[@deepseek-ai/dsh-base, @dsh-external/dsh-cli-app]`; credentials come from the existing `~/.dsh` configuration. The `code` profile assembles the same bundle with a profile-level overlay that sets `ui: opencode`. An unknown theme or layout name fails loudly at startup instead of falling back silently.

### What you get

- Streaming chat with a reasoning display (`Ctrl+R` folds/unfolds the latest entry), rendered through a markdown subset: inline code/bold/italic, fenced code, headings, lists, quotes.
- Tool cards with the full lifecycle: streaming argument preview, folded result, running→done/error status with icons.
- Approval prompts (`[a] allow once · [r] reject · [esc] cancel`) bridged from the agent scope, with `/perm` presets.
- The session surface: `/new`, `/fork`, a `/sessions` picker over the 50 most recent persisted sessions, and a `/model` selector fed by the live model catalog (switching forks the session and keeps history).
- Skill invocation (Claude Code / opencode style): `/skills` opens a picker over the session's user-invocable skills, one-line rows pairing the `/<name>` invocation shorthand with the skill's simple description (clipped at the terminal edge, never wrapping); Enter stages `/<name> ` in the composer and waits for your guidance, and `/<name> [guidance]` sends the line verbatim so the host skill boundary injects the skill's `<skill_content>` for that step — same-named commands win, unknown or model-only names keep the unknown-command hint.
- A task panel projecting the agent's `todo_write` lists (`[✓]/[•]/[ ]`, `Ctrl+T` folds, rebuilt from the log on resume/fork).
- A metered status line: `token 42.5/s` throughput, cumulative usage, and a context-occupancy ring that steps down the moment compaction lands.
- A braille spinner with elapsed time while the agent runs; prompts typed while running queue FIFO and drain one per idle edge (slash commands are never queued).
- Two layouts over one interaction kernel: `classic` (single column, `❯` prompt, bottom status line) and the opencode style (centered welcome for empty sessions, full-width conversation afterwards).
- A full-screen task board (`dsh-taskboard`): `Ctrl+B` swaps the conversation for a board showing the task checklist, a draggable per-turn conversation timeline — the arrow keys or PageUp/PageDown select a turn and a content pane shows that turn's conversation, clamped to the terminal height with the newest messages first (clock span, your prompt, the assistant reply, tool calls, and output tokens), while `●` marks the live turn and `❯` the selected one — plus the live running elapsed time, queue depth, and the usage/context readouts; the same chord returns.
- Composer history and session naming: the up/down arrows recall the prompts this process has sent (each session seeds the shared store with its own durable prompts), and `/title <text>` renames the session while bare `/title` opens an inline editor prefilled with the current durable title (Enter confirms, Esc cancels); `/title <text>` still renames directly — the status bar and `/sessions` follow the durable title event, and renames pin it against automatic retitling.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bundle is one patch plus one glue plugin. The patch restates the base's mode rows (`system-prompt` persona, `tools` mode) for its single-session tree and inserts the cli rows: the `code-runtime` execution capability, the `cli-startup` argument parser, and the `cli-app` glue plugin. Unlike the web surface, no base row is disabled and no agent-presets are introduced: a single-session TUI consumes the base's process-level agent plane directly.

The data-consistency rule: **the durable session log is the single source of truth**. One projection in `src/ui/transcript.ts` serves both the initial replay and every live `session/event`; `assistant-stream` only tweens the in-flight message, and once the committed `end` frame lands (with its seq) the row is rebuilt from the log. A resumed session and an in-flight one can therefore never render two different ways.

Rendering follows Ink's `<Static>`: settled transcript rows are written once into terminal scrollback, and the live region repaints only the streaming row, overlays, and input. Session switching is a `rerender` of the same Ink instance under a new root key; the app never grabs the mouse, uses the alternate screen, or clears the screen (except at session boundaries and `/clear`, viewport only). A `stdout.write` wrapper in `src/ui/resize.ts` corrects Ink's erase counts when the terminal shrinks, so dragging the window narrower no longer leaves duplicated frames.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | The profile patch: restated base mode rows plus the inserted cli rows |
| [`src/startup.ts`](src/startup.ts) | The `cli-startup` provider: `--resume`, `--model`, `--cwd`, `--theme`, `--ui`, `--help` |
| [`src/index.ts`](src/index.ts) | The `cli-app` glue plugin: session loop over one Ink instance → `appExit` |
| [`src/sessions.ts`](src/sessions.ts) | Persisted-session catalog, fork seed capture, display formatting |
| [`src/ui/model.ts`](src/ui/model.ts) | UI types: snapshots, actions, controller contracts |
| [`src/ui/transcript.ts`](src/ui/transcript.ts) | durable log → message rows; one projection for replay and live |
| [`src/ui/state.ts`](src/ui/state.ts) | ViewModel: event wiring, actions, slash commands, running queue |
| [`src/ui/status.ts`](src/ui/status.ts) | Status-line math: throughput, usage, context occupancy and ring |
| [`src/ui/resize.ts`](src/ui/resize.ts) | Shrink-reflow erase correction (wraps `stdout.write`) |
| [`src/ui/App.tsx`](src/ui/App.tsx) | Root layout: Static transcript + live region + input + docked panel |
| [`tests/`](tests) | Unit tests (keyless, scripted agent) + REAL-composition + real-Ink reflow assertions |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when you want to go deeper into the design, the acceptance walkthrough, or the shared core.

- [Architecture deep dive](../../../docs/cli-app/architecture.md) — goals, bundle patch, glue, UI architecture, feature matrix, phase plan.
- [Manual acceptance walkthrough](../../../docs/cli-app/manual-acceptance.md) — real-machine walkthrough groups.
- [2026-09-12 fix report](../../../docs/cli-app/2026-09-12-cli-fix-report.md) — the session/UI regression fixes and gates.
- [Bundle package map](../README.md) — the surfaces built on the same core.
- [dsh-base](../base/README.md) — the shared core the terminal UI runs on.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through each inserted row's package, which owns that row's model-facing behavior; the patch restates the `system-prompt` persona and `tools` mode for its single-session tree.

#### KV Cache effect

The persona restatement is fixed prefix content, so it does not perturb KV-cache reuse between turns.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

Current constraints, registered honestly rather than silently:

- **Tool approvals** are bridged through the agent-scope answerer and the bus (`[a]/[r]/[esc]`); `/perm` goes through permission-presets (sandbox + approval) and degrades to `ask|never` when that service is absent. Audit events land in the log; REAL-composition covers allow/reject/never.
- **Session surface**: resume picker, `/new`, `/fork`, titles, session label; the list is capped at 50 entries, newest first.
- **First picker open after an upgrade**: list metadata for sessions persisted before the picker fix is derived by one read-only pass over the uncached logs (seconds, once per process); each session's next open caches the facts for zero-I/O listings afterwards.
- **`/new` and empty sessions**: `/new` opens a new session only when the current one has real conversation; an untouched session is treated as "reset the current view", so repeated `/new` no longer accumulates sessions. Exception: leaving a used session for one that never receives input still persists that empty session at handle close (official persistence has no delete API) — at most one at a time.
- **Session-boundary clear**: `/new`, `/sessions`, `/fork`, `/model` clear the current viewport and erase the scrollback (xterm `ESC[3J`) before writing the new session's static transcript, so the retired conversation can no longer be scrolled back into view; `/clear` still keeps the scrollback.
- **Markdown subset**: inline code/**bold**/*italic*, fenced code, headings, lists, quotes; tables and links are not rendered.
- **Reasoning fold**: collapsed to one line by default; `Ctrl+R` expands/collapses the latest entry.
- **tool-call argument streaming preview**: transient preview on the streaming row; the landed card takes over.
- **Untruncated transcript**: `state.messages` matches the durable log in length (one light object per row); settled static rows leave the React tree once written. `/clear` clears the current viewport and rebuilds the static list; terminal scrollback is kept.
- **Tokens**: usage is re-accumulated from the durable log on resume; the first half of a streaming throughput reading is a character-density estimate, replaced when the provider usage arrives.
- **Registry slash commands**: `/compact /goal /plan` execute through `ctx.commands` and print as ordinary visible rows; unregistered `/xxx` prints an unknown hint instead of being sent to the model.
- **Input**: single-line input (backspace works); arrow-key editing and multi-line paste are not implemented.
- **Window resize**: the shrink direction is corrected; the widen direction depends on the terminal's fold-merge behavior (xterm/Windows Terminal merge) and is not corrected. Bare writes outside the live region (a plugin writing stdout directly) may be mistaken for a frame; only the erase count is affected, never content.
- **`auto` theme** always lands dark; luminance probing is not implemented.
- **Coverage gate**: 106 cases green + REAL-composition + real-Ink reflow assertions; the 100%-per-file gate is a prerequisite for contributing upstream, not a local-run requirement.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

Development happens in the dsh source working copy (see `docs/cli-app/architecture.md`; the real-machine walkthrough lives in `docs/cli-app/manual-acceptance.md`):

```sh
pnpm install && pnpm build:lib:host   # first run: official host lib outputs
pnpm dsh --profile cli                # cli-app itself runs from source via tsx

pnpm exec oxlint packages/bundle/cli-app            # lint
pnpm exec vitest run packages/bundle/cli-app/tests  # vitest (keyless, scripted agent)
```

The package resolves from source at runtime through two local wirings: the root `package.json` devDependencies (the bundle-resolution anchor) and the hand-written alias in `tsconfig.base.json` (`@dsh-external/dsh-cli-app*` → `src`). Both must be preserved manually when merging upstream, together with the project references in `packages/bundle/cli-app/tsconfig.json`.

</details>
