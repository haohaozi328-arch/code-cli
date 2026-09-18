/**
 * Session-surface pure helpers: fork-seed collection over a real session log,
 * time/workspace formatting, and status-bar labels.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { collectForkSeed, formatWhen, sessionLabel, shortCwd } from '../src/sessions.ts'

async function sessionWithEvents(build: (session: Session) => void): Promise<Session> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId(`seed-${Math.random().toString(36).slice(2)}`))
  build(session)
  return session
}

function direct(text: string): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

/** One completed exchange ending with an assistant message. */
function appendExchange(session: Session, turn: number): void {
  const message = direct(`q${turn}`)
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('user/message', message, { surfaceOp: 'append' })
  session.append('assistant/message', {
    stream: [], turn, step: 1,
    message: createAssistantMessage({ content: [{ type: 'text', text: `a${turn}` }], source: { provider: 'p', model: 'm' } }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

describe('collectForkSeed', () => {
  it('returns an empty seed before any turn completes', async () => {
    const session = await sessionWithEvents((s) => {
      s.append('turn/start', { turn: 0 })
    })
    expect(collectForkSeed(session)).toEqual([])
  })

  it('slices up to and including the last turn/end, excluding the in-flight turn', async () => {
    const session = await sessionWithEvents((s) => {
      appendExchange(s, 0)
      appendExchange(s, 1)
      // In-flight third turn: must not appear in the seed.
      s.append('turn/start', { turn: 2 })
      s.append('step/start', { turn: 2, step: 1 })
      s.append('user/message', direct('in-flight'), { surfaceOp: 'append' })
    })
    const seed = collectForkSeed(session)
    const types = seed.map(event => event.type)
    expect(types[0]).toBe('turn/start')
    expect(types.at(-1)).toBe('turn/end')
    expect(types.filter(t => t === 'turn/end')).toHaveLength(2)
    expect(seed.some(event => event.type === 'user/message' && event.data.content.some(block => block.type === 'text' && block.text === 'in-flight'))).toBe(false)
  })
})

describe('formatWhen', () => {
  const now = 1_700_000_000_000
  it('renders recent, hourly, daily and older timestamps', () => {
    expect(formatWhen(now, now)).toBe('just now')
    expect(formatWhen(now - 5 * 60_000, now)).toBe('5m ago')
    expect(formatWhen(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(formatWhen(now - 2 * 86_400_000, now)).toBe('2d ago')
    expect(formatWhen(now - 30 * 86_400_000, now)).toMatch(/^\d{1,2}-\d{1,2}$/)
  })
})

describe('shortCwd', () => {
  it('keeps shallow paths, takes the last two segments of deep ones', () => {
    expect(shortCwd('D:/work')).toBe('D:/work')
    expect(shortCwd('D:\\workspace\\DeepSeek\\dsh-cli')).toBe('DeepSeek/dsh-cli')
    expect(shortCwd(null)).toBe('')
  })
})

describe('sessionLabel', () => {
  it('prefers the title, falls back to the id stem, appends the workspace tail', () => {
    expect(sessionLabel({ title: 'Fix the parser', sessionId: 'session-1234567890abcdef', cwd: 'D:/work/app' }))
      .toBe('Fix the parser · work/app')
    expect(sessionLabel({ title: null, sessionId: 'session-abcdef', cwd: null }))
      .toBe('abcdef')
  })
})
