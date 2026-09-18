/**
 * The dsh-taskboard: a full-screen task-progress-and-time board. Ctrl+Alt
 * swaps the whole chrome for this surface; the same chord returns. The board
 * reads only state the view model already projects — the `todo/write`
 * checklist, per-turn wall-clock spans folded from `turn/start`/`turn/end`,
 * the running queue, and the usage/occupancy readouts — so it can never
 * disagree with the transcript about what happened.
 * @module @dsh-external/dsh-cli-app/ui/taskboard
 */
import React from 'react'
import { Box, Text } from 'ink'
import { COPY } from './copy.ts'
import type { TurnSpan, ViewModel } from './model.ts'
import { TodoRow } from './todos.tsx'
import { formatElapsed, spinnerFrame } from './spinner.ts'
import { contextBand, contextRing, formatTokenCount } from './status.ts'
import type { ThemeTokens } from './theme.ts'

/** How many recent turns the board keeps; older spans fall off the tail. */
export const TURN_SPAN_LIMIT = 12

/** The minimal key facts the board renders; `ReturnType<ViewModel['getState']>`. */
type BoardState = ReturnType<ViewModel['getState']>

/** The keyboard chord that swaps the board in and out. */
export function isBoardToggle(key: { ctrl: boolean; meta: boolean }): boolean {
  return key.ctrl && key.meta
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

/**
 * Fold one committed session event into the turn-span list. Pure and
 * reference-stable: unchanged input returns the same array, a turn open or
 * close returns a fresh one.
 * @param spans - spans folded so far.
 * @param event - the committed session event (`type`/`time`/`data`).
 * @returns the original array or the advanced one.
 */
export function reduceTurnSpans(
  spans: readonly TurnSpan[],
  event: { type: string; time: number; data: unknown },
): readonly TurnSpan[] {
  if (event.type === 'turn/start') {
    const next = [...spans, { turn: turnNumberOf(event.data), startedAt: event.time, endedAt: null }]
    return next.length > TURN_SPAN_LIMIT ? next.slice(next.length - TURN_SPAN_LIMIT) : next
  }
  if (event.type === 'turn/end') {
    let open = -1
    for (let index = spans.length - 1; index >= 0; index -= 1) {
      if (spans[index]?.endedAt === null) {
        open = index
        break
      }
    }
    if (open === -1) return spans
    return spans.map((span, index) =>
      index === open ? { ...span, endedAt: event.time } : span)
  }
  return spans
}

/**
 * Fold a durable event slice into the board's turn spans (the resume path:
 * history recorded before this process started).
 * @param events - the durable events to fold, in seq order.
 * @returns the final spans, newest last.
 */
export function collectTurnSpans(
  events: readonly { type: string; time: number; data: unknown }[],
): readonly TurnSpan[] {
  let spans: readonly TurnSpan[] = []
  for (const event of events) spans = reduceTurnSpans(spans, event)
  return spans
}

/** Duration label for one span; the open span reads live while running. */
function spanDuration(span: TurnSpan, running: boolean, elapsedMs: number): string {
  if (span.endedAt !== null) return formatElapsed(span.endedAt - span.startedAt)
  return running ? formatElapsed(elapsedMs) : COPY.measurementUnavailable
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
  const lastEnded = [...state.turnSpans].reverse().find(span => span.endedAt !== null)

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
          : (
            <Text color={theme.muted} dimColor>
              {COPY.statusIdle}
              {lastEnded !== undefined && lastEnded.endedAt !== null && (
                <Text>
                  {' · '}{COPY.boardLastTurn}{' '}
                  {formatElapsed(lastEnded.endedAt - lastEnded.startedAt)}
                  {' · '}{formatClock(lastEnded.endedAt)}
                </Text>
              )}
            </Text>
          )}
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
        {state.turnSpans.length === 0
          ? <Text color={theme.muted} dimColor>{COPY.boardEmptySpans}</Text>
          : [...state.turnSpans].reverse().map(span => (
            <Text
              key={`${span.turn}:${span.startedAt}`}
              color={span.endedAt === null && state.running ? theme.warn : theme.muted}
              dimColor={span.endedAt !== null}
            >
              {`#${span.turn}  ${formatClock(span.startedAt)} → ${span.endedAt === null ? '··' : formatClock(span.endedAt)}  ${spanDuration(span, state.running, elapsedMs)}`}
            </Text>
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
