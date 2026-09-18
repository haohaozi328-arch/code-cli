/**
 * Transcript projection: one projector serves both the durable replay and the
 * live `session/event` path, and the static/live split must keep the terminal
 * output ordered. Keyless — sessions come from the real SessionStore.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { ToolCallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  argsSummaryOf,
  countDurableTokens,
  hasConversation,
  isSettledRow,
  projectEvent,
  replaySession,
  resultSummaryOf,
  splitTranscript,
} from '../src/ui/transcript.ts'
import type { UiMessage } from '../src/ui/model.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

async function session(): Promise<Session> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  return ctx.sessions.create(SessionId(`t-${Math.random().toString(36).slice(2)}`))
}

/** Append one completed turn with a user ask, a tool call, and an answer. */
function appendTurn(target: Session): void {
  target.append('turn/start', { turn: 1 })
  target.append('step/start', { turn: 1, step: 1 })
  target.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'run it' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  target.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('c1'), name: 'bash', arguments: JSON.stringify({ command: 'ls' }) })
  target.append('tool/result', {
    turn: 1, step: 1,
    message: createToolResultMessage({ callId: ToolCallId('c1'), content: [{ type: 'text', text: 'file.txt' }], isError: false }),
  }, { surfaceOp: 'append' })
  target.append('assistant/message', {
    stream: [], turn: 1, step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text: 'done' }], source: { provider: 'p', model: 'm' } }),
  }, { surfaceOp: 'append' })
  target.append('step/end', { turn: 1, step: 1 })
  target.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
}

describe('transcript projection', () => {
  it('replays user, settled tool, and assistant rows from the durable log', async () => {
    const target = await session()
    appendTurn(target)
    const rows = replaySession(target)
    expect(rows.map(row => row.role)).toEqual(['user', 'tool', 'assistant'])
    expect(rows[1]).toMatchObject({ role: 'tool', toolName: 'bash', argsSummary: 'command: ls', toolStatus: 'done', toolResult: 'file.txt' })
    expect(rows[2]).toMatchObject({ role: 'assistant', text: 'done', status: 'done' })
  })

  it('folds live events through the same projector and ignores repeats', async () => {
    const target = await session()
    appendTurn(target)
    const events = target.snapshotEvents()
    let live: UiMessage[] = []
    for (const event of events) live = projectEvent(live, event)
    expect(live.map(row => row.role)).toEqual(['user', 'tool', 'assistant'])
    // Re-delivering an already-folded event returns the same array reference, so
    // React can bail out instead of repainting.
    const last = events[events.length - 1]
    expect(last).toBeDefined()
    expect(projectEvent(live, last!)).toBe(live)
  })

  it('keeps hidden injected context out of the rendered split', async () => {
    const target = await session()
    const injected = createUserMessage({ content: [{ type: 'text', text: 'AGENTS.md dump' }], source: { kind: 'plugin', plugin: 'agent-instructions' } })
    target.append('user/message', injected, { surfaceOp: 'append' })
    const rows = replaySession(target)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ system: true })
    expect(splitTranscript(rows)).toEqual({ committed: [], live: [] })
  })

  it('reports a conversation only for real user or assistant content', async () => {
    const target = await session()
    expect(hasConversation(target)).toBe(false)
    // Injected context is not a conversation.
    target.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'AGENTS.md dump' }],
      source: { kind: 'plugin', plugin: 'agent-instructions' },
    }), { surfaceOp: 'append' })
    expect(hasConversation(target)).toBe(false)
    target.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'real ask' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    expect(hasConversation(target)).toBe(true)
  })

  it('moves the static boundary past everything before the first live row', () => {
    const settled: UiMessage = { key: 'a', role: 'assistant', text: 'one', reasoning: '', status: 'done' }
    const running: UiMessage = { key: 'b', role: 'tool', text: '', reasoning: '', status: 'done', toolStatus: 'running' }
    const later: UiMessage = { key: 'c', role: 'assistant', text: 'two', reasoning: '', status: 'done' }
    const { committed, live } = splitTranscript([settled, running, later])
    // `later` is settled but trails a running row: it must stay live so the
    // static list never prints above still-changing content.
    expect(committed.map(row => row.key)).toEqual(['a'])
    expect(live.map(row => row.key)).toEqual(['b', 'c'])
    expect(isSettledRow(settled)).toBe(true)
    expect(isSettledRow(running)).toBe(false)
  })

  it('derives argument previews, result previews, and durable token totals', async () => {
    const target = await session()
    target.append('turn/start', { turn: 1 })
    target.append('step/start', { turn: 1, step: 1 })
    target.append('assistant/message', {
      stream: [], turn: 1, step: 1,
      message: createAssistantMessage({ content: [{ type: 'text', text: 'hi' }], source: { provider: 'p', model: 'm' } }),
      usage: { inputTokens: 5, outputTokens: 2, reasoningTokens: 1 },
    }, { surfaceOp: 'append' })
    expect(countDurableTokens(target)).toEqual({ input: 5, output: 2, reasoning: 1 })
    expect(argsSummaryOf('{"path":"a.ts"}')).toBe('path: a.ts')
    expect(argsSummaryOf('not json')).toBe('not json')
    expect(resultSummaryOf([{ type: 'text', text: 'file.txt' }])).toBe('file.txt')
    expect(resultSummaryOf([{ type: 'text', text: '   ' }])).toBe('')
  })
})
