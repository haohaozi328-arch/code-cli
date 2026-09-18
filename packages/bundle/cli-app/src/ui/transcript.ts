/**
 * Durable-log projection for the transcript. One projector serves both the
 * initial replay of a session and every live `session/event`, so a resumed
 * conversation and an in-flight one can never render differently. The durable
 * log is the only source of truth; live assistant streaming paints separately
 * and settles back into these rows.
 * @module @dsh-external/dsh-cli-app/ui/transcript
 */

import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionSeq, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import { COPY } from './copy.ts'
import type { UiMessage } from './model.ts'

/**
 * Extract plain text and reasoning from content blocks.
 * @param content - the message content blocks.
 * @returns the concatenated text and reasoning.
 */
export function blocksToText(content: readonly ContentBlock[]): { text: string; reasoning: string } {
  let text = ''
  let reasoning = ''
  for (const block of content) {
    switch (block.type) {
      case 'text':
        if (text !== '') text += '\n\n'
        text += block.text
        break
      case 'reasoning':
        if (reasoning !== '') reasoning += '\n'
        reasoning += block.text
        break
      /* image/file/tool-call/tool-result blocks do not project into text rows */
      default:
        break
    }
  }
  return { text, reasoning }
}

/**
 * Collapse a long text into one readable hint line.
 * @param text - the full text.
 * @param max - longest line to keep before truncating.
 * @returns the first non-empty line, truncated when needed.
 */
export function collapseFirstLine(text: string, max = 80): string {
  const first = text.split('\n').find(line => line.trim() !== '') ?? ''
  const trimmed = first.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

/**
 * Short one-line argument preview from a raw tool-arguments JSON string.
 * @param argumentsJson - the tool call's raw arguments.
 * @returns the preview text, or an empty string for empty/`{}` arguments.
 */
export function argsSummaryOf(argumentsJson: string): string {
  const trimmed = argumentsJson.trim()
  if (trimmed === '' || trimmed === '{}') return ''
  // Prefer the command/path/pattern-ish field for readability.
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of ['command', 'path', 'pattern', 'text', 'file_path', 'action']) {
      const value = parsed[key]
      if (typeof value === 'string' && value !== '') {
        return `${key}: ${collapseFirstLine(value, 60)}`
      }
    }
  } catch {
    // Not JSON; fall through to the raw preview.
  }
  return collapseFirstLine(trimmed.replaceAll('\n', ' '), 70)
}

/**
 * One-line result preview from a tool result block's content.
 * @param content - the result message's content blocks.
 * @returns the preview text, or an empty string when no text block has content.
 */
export function resultSummaryOf(content: readonly ContentBlock[]): string {
  for (const block of content) {
    if (block.type === 'text' && block.text.trim() !== '') {
      return collapseFirstLine(block.text.trim(), 90)
    }
  }
  return ''
}

/**
 * Cumulative durable token usage across the log (a resumed session shows history, not zero).
 * @param session - the live session.
 * @returns the summed input, output, and reasoning tokens.
 */
export function countDurableTokens(session: Session): { input: number; output: number; reasoning: number } {
  const totals = { input: 0, output: 0, reasoning: 0 }
  const length = session.seq
  for (let seq = 0; seq < length; seq++) {
    const event = session.eventAt(SessionSeq(seq))
    if (event?.type === 'assistant/message' && event.data.usage !== undefined) {
      totals.input += event.data.usage.inputTokens
      totals.output += event.data.usage.outputTokens
      totals.reasoning += event.data.usage.reasoningTokens ?? 0
    }
  }
  return totals
}

/** Settle one running tool card with its durable result. */
function settleToolRow(row: UiMessage, isError: boolean, summary: string): UiMessage {
  return {
    ...row,
    toolStatus: isError ? 'error' : 'done',
    toolResult: isError ? (summary !== '' ? summary : 'error') : summary,
  }
}

/**
 * Apply one durable session event to the transcript rows.
 * @param rows - current rows, treated as immutable.
 * @param event - the durable event to fold in.
 * @returns a new row list, or `rows` itself when the event adds nothing.
 */
export function projectEvent(rows: UiMessage[], event: SessionEvent): UiMessage[] {
  if (event.type === 'user/message') {
    if (rows.some(row => row.key === event.data.id)) return rows
    const { text } = blocksToText(event.data.content)
    if (text === '') return rows
    const isUser = event.data.source.kind === 'user'
    return [...rows, {
      key: event.data.id,
      role: 'user',
      text: isUser ? text : `${COPY.injectedPrefix} ${collapseFirstLine(text)}`,
      reasoning: '',
      status: 'done',
      ...(isUser ? {} : { system: true }),
    }]
  }
  if (event.type === 'assistant/message') {
    const key = `a:${event.seq}`
    if (rows.some(row => row.key === key)) return rows
    const { text, reasoning } = blocksToText(event.data.message.content)
    if (text === '' && reasoning === '') return rows
    return [...rows, { key, role: 'assistant', text, reasoning, status: 'done', seq: event.seq }]
  }
  if (event.type === 'tool/call') {
    const key = `tool-${event.data.callId}`
    if (rows.some(row => row.key === key)) return rows
    return [...rows, {
      key,
      role: 'tool',
      text: '',
      reasoning: '',
      status: 'done',
      toolName: event.data.name,
      argsSummary: argsSummaryOf(event.data.arguments),
      toolStatus: 'running',
    }]
  }
  if (event.type === 'tool/result') {
    const first = event.data.message.content[0]
    const index = rows.findIndex(row => row.key === `tool-${first.toolCallId}`)
    const row = rows[index]
    if (row === undefined) return rows
    const isError = event.data.error !== undefined || first.isError === true
    const next = [...rows]
    next[index] = settleToolRow(row, isError, resultSummaryOf(first.content))
    return next
  }
  return rows
}

/**
 * Scan the durable log once and project it into transcript rows.
 * @param session - the session to replay.
 * @returns the projected rows.
 */
export function replaySession(session: Session): UiMessage[] {
  let rows: UiMessage[] = []
  const length = session.seq
  for (let seq = 0; seq < length; seq++) {
    const event = session.eventAt(SessionSeq(seq))
    if (event !== undefined) rows = projectEvent(rows, event)
  }
  return rows
}

/**
 * True once the session holds real conversation content: a user-originated
 * message or an assistant reply. Injected context alone does not count, so a
 * launched-but-untouched session reads as empty.
 * @param session - the session to inspect.
 * @returns whether the durable log contains a conversation.
 */
export function hasConversation(session: Session): boolean {
  const length = session.seq
  for (let seq = 0; seq < length; seq++) {
    const event = session.eventAt(SessionSeq(seq))
    if (event?.type === 'assistant/message') return true
    if (event?.type === 'user/message' && event.data.source.kind === 'user') return true
  }
  return false
}

/**
 * True once a row can never change again, so the static transcript may own it.
 * @param row - the transcript row.
 * @returns whether the row is settled.
 */
export function isSettledRow(row: UiMessage): boolean {
  return row.status === 'done' && row.toolStatus !== 'running'
}

/**
 * Split the transcript into the stable prefix Ink writes once and the still-live
 * suffix it repaints. The boundary is the first unsettled row, so an append that
 * settles out of order can never print above live content.
 * @param messages - the full row list, including hidden injected-context rows.
 * @returns the static prefix and the live suffix.
 */
export function splitTranscript(messages: readonly UiMessage[]): { committed: UiMessage[]; live: UiMessage[] } {
  const visible = messages.filter(row => row.system !== true)
  const boundary = visible.findIndex(row => !isSettledRow(row))
  if (boundary === -1) return { committed: visible, live: [] }
  return { committed: visible.slice(0, boundary), live: visible.slice(boundary) }
}
