/**
 * The dsh-taskboard: a full-screen task-progress-and-time board. Ctrl+B
 * swaps the whole chrome for this surface; the same chord returns. The board
 * reads only state the view model already projects — the `todo/write`
 * checklist and the per-turn conversation timeline folded from the durable
 * log (`turn/start`/`user/message`/`assistant/message`/`tool/call`/
 * `turn/end`) — so it can never disagree with the transcript about what
 * happened, and a resumed session replays its whole board from the log.
 * @module @dsh-external/dsh-cli-app/ui/taskboard
 */
import React from 'react'
import { Box, Text } from 'ink'
import { COPY } from './copy.ts'
import { blocksToText, collapseFirstLine } from './transcript.ts'
import type { TurnEntry, ViewModel } from './model.ts'
import { TodoRow } from './todos.tsx'
import { formatElapsed, spinnerFrame } from './spinner.ts'
import { contextBand, contextRing, formatTokenCount } from './status.ts'
import type { ThemeTokens } from './theme.ts'

/** How many recent turns the board keeps; older entries fall off the tail. */
export const TURN_TIMELINE_LIMIT = 12

/** Prompt/reply summary widths in the timeline rows. */
const PROMPT_WIDTH = 56
const REPLY_WIDTH = 64
const MAX_TOOL_NAMES = 3

/** The minimal key facts the board renders; `ReturnType<ViewModel['getState']>`. */
type BoardState = ReturnType<ViewModel['getState']>

/** The keyboard chord that swaps the board in and out: Ctrl+B. A plain control
 * character by design — Windows Terminal encodes Alt+letter as `ESC letter`,
 * so a Ctrl+Alt+letter chord reaches ink as plain Ctrl+letter (its keypress
 * parser never sets `meta` for that shape) and the chord is unreachable.
 * @param name - the parsed key name the useInput callback received.
 * @param key - the ink modifier flags for the same event.
 */
export function isBoardToggle(name: string, key: { ctrl: boolean; meta: boolean }): boolean {
  return key.ctrl && !key.meta && name === 'b'
}

/** `HH:MM` local clock label for a durable event timestamp. */
export function formatClock(ms: number): string {
  const date = new Date(ms)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** The turn counter carried by a `turn/*` event payload. */
function turnNumberOf(data: unknown): number {
  const turn = (data as { turn?: unknown } | undefined)?.turn
  return typeof turn === 'number' ? turn : 0
}

/** First human-readable text line of a durable `user/message` payload. */
function promptOf(data: unknown): string {
  const content = (data as { content?: unknown; source?: { kind?: unknown } }).content
  if (!Array.isArray(content)) return ''
  if ((data as { source?: { kind?: unknown } }).source?.kind !== 'user') return ''
  return collapseFirstLine(blocksToText(content as never[]).text, PROMPT_WIDTH)
}

/** First text line plus reported output tokens of a durable `assistant/message`. */
function replyOf(data: unknown): { reply: string; outputTokens: number } {
  const payload = data as { message?: { content?: unknown[] }; usage?: { outputTokens?: unknown } }
  const content = payload.message?.content
  const reply = Array.isArray(content)
    ? collapseFirstLine(blocksToText(content as never[]).text, REPLY_WIDTH)
    : ''
  const tokens = typeof payload.usage?.outputTokens === 'number' ? payload.usage.outputTokens : 0
  return { reply, outputTokens: tokens }
}

/**
 * Fold one committed session event into the conversation timeline. Pure and
 * reference-stable: unchanged input returns the same array, a turn event or
 * conversation content returns a fresh one.
 * @param entries - entries folded so far.
 * @param event - the committed session event (`type`/`time`/`data`).
 * @returns the original array or the advanced one.
 */
export function reduceTurnEntries(
  entries: readonly TurnEntry[],
  event: { type: string; time: number; data: unknown },
): readonly TurnEntry[] {
  if (event.type === 'turn/start') {
    const next = [...entries, {
      turn: turnNumberOf(event.data), startedAt: event.time, endedAt: null,
      prompt: '', reply: '', tools: [] as string[], outputTokens: 0,
    }]
    return next.length > TURN_TIMELINE_LIMIT ? next.slice(next.length - TURN_TIMELINE_LIMIT) : next
  }
  if (entries.length === 0) return entries
  const open = entries.length - 1
  const current = entries[open]
  if (current === undefined) return entries
  if (event.type === 'turn/end') {
    if (current.endedAt !== null) return entries
    const next = [...entries]
    next[open] = { ...current, endedAt: event.time }
    return next
  }
  if (event.type === 'user/message') {
    const prompt = promptOf(event.data)
    if (prompt === '') return entries
    const next = [...entries]
    next[open] = { ...current, prompt }
    return next
  }
  if (event.type === 'assistant/message') {
    const { reply, outputTokens } = replyOf(event.data)
    if (reply === '' && outputTokens === 0) return entries
    const next = [...entries]
    next[open] = {
      ...current,
      ...(reply !== '' ? { reply } : {}),
      outputTokens: current.outputTokens + outputTokens,
    }
    return next
  }
  if (event.type === 'tool/call') {
    const name = (event.data as { name?: unknown }).name
    if (typeof name !== 'string' || name === '' || current.tools.includes(name)) return entries
    const next = [...entries]
    next[open] = { ...current, tools: [...current.tools, name] }
    return next
  }
  return entries
}

/**
 * Fold a durable event slice into the board's conversation timeline (the
 * resume path: history recorded before this process started).
 * @param events - the durable events to fold, in seq order.
 * @returns the final entries, oldest last.
 */
export function collectTurnEntries(
  events: readonly { type: string; time: number; data: unknown }[],
): readonly TurnEntry[] {
  let entries: readonly TurnEntry[] = []
  for (const event of events) entries = reduceTurnEntries(entries, event)
  return entries
}

/** Duration label for one entry; the open entry reads live while running. */
function entryDuration(entry: TurnEntry, running: boolean, elapsedMs: number): string {
  if (entry.endedAt !== null) return formatElapsed(entry.endedAt - entry.startedAt)
  return running ? formatElapsed(elapsedMs) : COPY.measurementUnavailable
}

/** One timeline entry: header clock span, the prompt, the reply, and the tools. */
function TurnRow(props: { entry: TurnEntry; running: boolean; elapsedMs: number; theme: ThemeTokens }): React.JSX.Element {
  const { entry, running, elapsedMs, theme } = props
  const open = entry.endedAt === null
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={open && running ? theme.warn : theme.muted} dimColor={!open || !running}>
        {`#${entry.turn}  ${formatClock(entry.startedAt)} → ${open ? '··' : formatClock(entry.endedAt ?? entry.startedAt)}  ${entryDuration(entry, running, elapsedMs)}`}
        {entry.outputTokens > 0 && <Text> · {formatTokenCount(entry.outputTokens)} tok</Text>}
      </Text>
      {entry.prompt !== '' && (
        <Text color={theme.text}>
          <Text color={theme.brand}>{COPY.userLabel}: </Text>
          {entry.prompt}
        </Text>
      )}
      {entry.reply !== '' && (
        <Text color={theme.muted}>
          <Text color={theme.ok}>{COPY.boardReplyGlyph}: </Text>
          {entry.reply}
        </Text>
      )}
      {entry.tools.length > 0 && (
        <Text color={theme.muted} dimColor>
          {COPY.defaultToolGlyph} {entry.tools.slice(0, MAX_TOOL_NAMES).join(' · ')}
          {entry.tools.length > MAX_TOOL_NAMES && <Text> +{entry.tools.length - MAX_TOOL_NAMES}</Text>}
        </Text>
      )}
    </Box>
  )
}

/** The full-screen task-progress-and-time board. */
export function TaskBoard(props: {
  state: BoardState
  theme: ThemeTokens
  /** Live elapsed of the running turn, ticking from the App's clock. */
  elapsedMs: number
}): React.JSX.Element {
  const { state, theme, elapsedMs } = props
  const todos = state.todos
  const done = todos?.filter(todo => todo.status === 'completed').length ?? 0

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} paddingX={1} margin={1}>
      <Text>
        <Text color={theme.brand} bold>{COPY.boardTitle}</Text>
        <Text color={theme.muted} dimColor>  ·  {state.sessionLabel}</Text>
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.muted} dimColor>
          {state.modelLabel} · {COPY.permissionLabel} <Text color={theme.brand}>{state.permissionPreset}</Text>
          {state.contextOccupancy !== null && (
            <Text>
              {' · '}{COPY.contextLabel}{' '}
              <Text color={
                contextBand(state.contextOccupancy.percent) === 'ok' ? theme.ok
                  : contextBand(state.contextOccupancy.percent) === 'warn' ? theme.warn : theme.error
              }>
                {contextRing(state.contextOccupancy.percent)} {state.contextOccupancy.percent}%
              </Text>
            </Text>
          )}
          {' · '}{COPY.tokenUsageLabel} {formatTokenCount(state.tokens.input + state.tokens.output)}
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.brand} bold>{COPY.boardTurnNow}</Text>
        {state.running
          ? (
            <Text color={theme.warn}>
              {spinnerFrame(elapsedMs)} {COPY.statusRunning} · {formatElapsed(elapsedMs)}
              {state.queued.length > 0 && (
                <Text color={theme.muted} dimColor>  ·  {COPY.boardQueueLabel} {state.queued.length}</Text>
              )}
            </Text>
          )
          : <Text color={theme.muted} dimColor>{COPY.statusIdle}</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.brand} bold>{COPY.todoTitle}</Text>
          {todos !== null && todos.length > 0 && (
            <Text color={theme.muted} dimColor>  {done}/{todos.length}</Text>
          )}
        </Text>
        {todos === null || todos.length === 0
          ? <Text color={theme.muted} dimColor>{COPY.boardNoTodos}</Text>
          : todos.map(todo => <TodoRow key={todo.content} todo={todo} theme={theme} />)}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.brand} bold>{COPY.boardTimeline}</Text>
        {state.turnTimeline.length === 0
          ? <Text color={theme.muted} dimColor>{COPY.boardEmptySpans}</Text>
          : [...state.turnTimeline].reverse().map(entry => (
            <TurnRow key={`${entry.turn}:${entry.startedAt}`} entry={entry} running={state.running} elapsedMs={elapsedMs} theme={theme} />
          ))}
      </Box>

      {state.pendingApproval !== null && (
        <Box marginTop={1}>
          <Text color={theme.warn}>{COPY.errorGlyph} {COPY.boardApprovalPending}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>{COPY.boardHint}</Text>
      </Box>
    </Box>
  )
}
