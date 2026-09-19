/**
 * The dsh-taskboard: a full-screen task-progress-and-time board. Ctrl+B
 * swaps the whole chrome for this surface; the same chord returns. The board
 * is a two-pane scrubber: the timeline pane lists the session's turns (one
 * row per `turn/start`..`turn/end` span), and the arrow keys drag a cursor
 * through history while the content pane renders the selected turn's full
 * conversation — prompts, replies, and tool calls folded from the durable
 * log, so the board can never disagree with the transcript and a resumed
 * session replays its whole board from the log.
 * @module @dsh-external/dsh-cli-app/ui/taskboard
 */
import React from 'react'
import { Box, Text } from 'ink'
import { COPY } from './copy.ts'
import { blocksToText, collapseFirstLine } from './transcript.ts'
import type { TurnEntry, TurnMessage, ViewModel } from './model.ts'
import { TodoRow } from './todos.tsx'
import { formatElapsed, spinnerFrame } from './spinner.ts'
import { contextBand, contextRing, formatTokenCount } from './status.ts'
import type { ThemeTokens } from './theme.ts'

/** How many recent turns the board keeps; older entries fall off the tail. */
export const TURN_TIMELINE_LIMIT = 12
/** How many conversation messages one turn entry retains. */
export const TURN_MESSAGE_LIMIT = 40
/** How many rendered lines one conversation message gets before truncation. */
export const MESSAGE_LINE_LIMIT = 8
/** How many entries PageUp/PageDown move the timeline cursor. */
export const TIMELINE_PAGE = 5

/** Prompt/reply summary widths in the timeline rows. */
const PROMPT_WIDTH = 48
const REPLY_WIDTH = 60

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

/**
 * Move the timeline cursor one step from an ink key event. The cursor is an
 * index into the entry list, with `-1` meaning "live" (the newest entry,
 * following new events as they land).
 * @param index - current cursor (`-1` for live).
 * @param length - entry count; zero disables all movement.
 * @param key - the parsed ink key flags of the navigation event.
 * @returns the next cursor value.
 */
export function stepTimelineCursor(
  index: number,
  length: number,
  key: { upArrow: boolean; downArrow: boolean },
): number {
  if (length === 0) return -1
  const current = index === -1 ? length - 1 : Math.min(index, length - 1)
  if (key.upArrow) return current === 0 ? 0 : current - 1
  if (key.downArrow) return current === length - 1 ? -1 : current + 1
  return index
}

/** Appends one conversation message, keeping only the most recent TURN_MESSAGE_LIMIT of them. */
function appendMessage(messages: readonly TurnMessage[], message: TurnMessage): TurnMessage[] {
  const next = [...messages, message]
  return next.length > TURN_MESSAGE_LIMIT ? next.slice(-TURN_MESSAGE_LIMIT) : next
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

/** Full text of one conversation message payload. */
function messageText(data: unknown): string {
  const payload = data as { content?: unknown; message?: { content?: unknown[] } }
  const content = payload.content ?? payload.message?.content
  return Array.isArray(content) ? blocksToText(content as never[]).text : ''
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
      messages: [] as TurnMessage[],
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
    const messages = appendMessage(current.messages, { role: 'user' as const, time: event.time, text: messageText(event.data) })
    next[open] = { ...current, prompt, messages }
    return next
  }
  if (event.type === 'assistant/message') {
    const { reply, outputTokens } = replyOf(event.data)
    const text = messageText(event.data)
    if (reply === '' && outputTokens === 0 && text === '') return entries
    const next = [...entries]
    next[open] = {
      ...current,
      ...(reply !== '' ? { reply } : {}),
      outputTokens: current.outputTokens + outputTokens,
      ...(text === '' ? {} : { messages: appendMessage(current.messages, { role: 'assistant' as const, time: event.time, text }) }),
    }
    return next
  }
  if (event.type === 'tool/call') {
    const name = (event.data as { name?: unknown }).name
    if (typeof name !== 'string' || name === '') return entries
    const next = [...entries]
    next[open] = {
      ...current,
      ...(current.tools.includes(name) ? {} : { tools: [...current.tools, name] }),
      messages: appendMessage(current.messages, { role: 'tool' as const, time: event.time, text: '', toolName: name }),
    }
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

/** Render at most the first lines of one conversation message. */
function renderLines(text: string, theme: ThemeTokens, key: string): React.JSX.Element {
  const lines = text.split('\n')
  const shown = lines.slice(0, MESSAGE_LINE_LIMIT)
  const rest = lines.length - shown.length
  return (
    <Box key={key} flexDirection="column">
      {shown.map((line, index) => <Text key={`${key}:${index}`} wrap="end">{line}</Text>)}
      {rest > 0 && <Text color={theme.muted} dimColor>{COPY.boardMoreLines} {rest}</Text>}
    </Box>
  )
}

/** One timeline axis row; the cursor marks the entry shown in the content pane. */
function AxisRow(props: {
  entry: TurnEntry
  selected: boolean
  live: boolean
  running: boolean
  elapsedMs: number
  theme: ThemeTokens
}): React.JSX.Element {
  const { entry, selected, live, running, elapsedMs, theme } = props
  const open = entry.endedAt === null
  const cursor = live ? COPY.boardLiveCursor : selected ? COPY.boardAxisCursor : ' '
  const summary = entry.prompt !== '' ? entry.prompt : entry.reply !== '' ? entry.reply : COPY.axisEmpty
  return (
    <Text color={selected || live ? theme.text : theme.muted} dimColor={!selected && !live}>
      <Text color={live ? theme.warn : selected ? theme.brand : theme.muted} bold={selected}>{cursor} </Text>
      {`#${entry.turn} ${formatClock(entry.startedAt)}→${open ? '··' : formatClock(entry.endedAt ?? entry.startedAt)} ${entryDuration(entry, running, elapsedMs)}  `}
      {collapseFirstLine(summary, PROMPT_WIDTH)}
    </Text>
  )
}

/** The full-screen task-progress-and-time board with a draggable timeline. */
export function TaskBoard(props: {
  state: BoardState
  theme: ThemeTokens
  /** Live elapsed of the running turn, ticking from the App's clock. */
  elapsedMs: number
  /** Timeline cursor into `state.turnTimeline`; `-1` follows the live turn. */
  cursor: number
}): React.JSX.Element {
  const { state, theme, elapsedMs, cursor } = props
  const todos = state.todos
  const done = todos?.filter(todo => todo.status === 'completed').length ?? 0
  const length = state.turnTimeline.length
  const selected = cursor === -1 ? length - 1 : Math.min(cursor, length - 1)
  const entry = selected >= 0 ? state.turnTimeline[selected] : undefined
  const live = cursor === -1

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
        <Text color={theme.brand} bold>{COPY.boardTimeline}</Text>
        {length === 0
          ? <Text color={theme.muted} dimColor>{COPY.boardEmptySpans}</Text>
          : [...state.turnTimeline].reverse().map((row, reverseIndex) => {
            const index = length - 1 - reverseIndex
            return (
              <AxisRow
                key={`${row.turn}:${row.startedAt}`}
                entry={row}
                selected={index === selected}
                live={index === length - 1 && live}
                running={state.running && index === length - 1}
                elapsedMs={elapsedMs}
                theme={theme}
              />
            )
          })}
      </Box>

      {entry !== undefined && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor={theme.muted} paddingX={1}>
          <Text>
            <Text color={theme.brand} bold>
              {`#${entry.turn} ${formatClock(entry.startedAt)} → ${entry.endedAt === null ? '··' : formatClock(entry.endedAt)}  ${entryDuration(entry, state.running, elapsedMs)}`}
            </Text>
            {entry.outputTokens > 0 && (
              <Text color={theme.muted} dimColor> · {formatTokenCount(entry.outputTokens)} tok</Text>
            )}
            {entry.endedAt === null && state.running && (
              <Text color={theme.warn}> · {COPY.boardLiveSuffix}</Text>
            )}
          </Text>
          {entry.messages.length === 0
            ? <Text color={theme.muted} dimColor>{COPY.boardNoMessages}</Text>
            : entry.messages.map((message, index) => {
              if (message.role === 'tool') {
                return (
                  <Text key={`t:${message.time}:${index}`} color={theme.muted} dimColor>
                    {COPY.defaultToolGlyph} {message.toolName}
                  </Text>
                )
              }
              const label = message.role === 'user'
                ? <Text color={theme.brand}>{COPY.userLabel}: </Text>
                : <Text color={theme.ok}>{COPY.boardReplyGlyph}: </Text>
              return (
                <Box key={`m:${message.time}:${index}`} marginTop={index === 0 ? 0 : 1} flexDirection="column">
                  <Text>{label}</Text>
                  {renderLines(message.text, theme, `m:${message.time}:${index}`)}
                </Box>
              )
            })}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.brand} bold>{COPY.todoTitle}</Text>
          {todos !== null && todos.length > 0 && (
            <Text color={theme.muted} dimColor>  {done}/{todos.length}</Text>
          )}
          {state.running && (
            <Text color={theme.warn}>  ·  {spinnerFrame(elapsedMs)} {COPY.statusRunning} · {formatElapsed(elapsedMs)}</Text>
          )}
          {state.queued.length > 0 && (
            <Text color={theme.muted} dimColor>  ·  {COPY.boardQueueLabel} {state.queued.length}</Text>
          )}
        </Text>
        {todos === null || todos.length === 0
          ? <Text color={theme.muted} dimColor>{COPY.boardNoTodos}</Text>
          : todos.map(todo => <TodoRow key={todo.content} todo={todo} theme={theme} />)}
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
