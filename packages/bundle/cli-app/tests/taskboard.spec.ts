/**
 * The dsh-taskboard's conversation timeline: the per-turn fold over durable
 * session events (`turn/start`, `user/message`, `assistant/message`,
 * `tool/call`, `turn/end`), the toggle chord, clock labels, and the
 * full-screen render. The timeline mirrors the durable log, so the board can
 * never disagree with the transcript about what ran when.
 * @module tests/taskboard.spec
 */

import { describe, expect, it } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { COPY } from '../src/ui/copy.ts'
import type { TurnEntry, UiState } from '../src/ui/model.ts'
import type { ThemeTokens } from '../src/ui/theme.ts'
import { resolveTheme } from '../src/ui/theme.ts'
import {
  TURN_TIMELINE_LIMIT,
  TaskBoard,
  collectTurnEntries,
  formatClock,
  isBoardToggle,
  reduceTurnEntries,
} from '../src/ui/index.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const theme: ThemeTokens = resolveTheme('cream-forest')

function event(type: string, time: number, data: unknown): SessionEvent {
  return { type, time, data } as unknown as SessionEvent
}

function turnStart(turn: number, time: number): SessionEvent {
  return event('turn/start', time, { turn })
}

function turnEnd(turn: number, time: number): SessionEvent {
  return event('turn/end', time, { turn })
}

function userMessage(text: string, time: number): SessionEvent {
  return event('user/message', time, {
    id: `u-${time}`, content: [{ type: 'text', text }], source: { kind: 'user' },
  })
}

function assistantMessage(text: string, time: number, outputTokens = 0): SessionEvent {
  return event('assistant/message', time, {
    message: createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'mock', model: 'mock' } }),
    ...(outputTokens > 0 ? { usage: { inputTokens: 10, outputTokens } } : {}),
  })
}

function toolCall(name: string, time: number): SessionEvent {
  return event('tool/call', time, { callId: `c-${name}-${time}`, name, arguments: '{}' })
}

function boardState(overrides: Partial<UiState> = {}): UiState {
  return {
    messages: [],
    running: false,
    error: null,
    modelLabel: 'deepseek-official/deepseek-v4-flash',
    permissionPreset: 'workspace-write',
    sessionId: SessionId('board-test'),
    sessionLabel: '测试会话 · work/app',
    pickerOpen: false,
    pickerItems: [],
    pendingApproval: null,
    tokens: { input: 1200, output: 340, reasoning: 0 },
    tokenRate: null,
    contextOccupancy: null,
    todos: null,
    queued: [],
    boardOpen: true,
    turnTimeline: [],
    choicePicker: null,
    connectWizard: null,
    transcriptEpoch: 0,
    ...overrides,
  }
}

describe('reduceTurnEntries', () => {
  it('folds prompt, reply, tools, and tokens into the open turn', () => {
    let entries: readonly TurnEntry[] = []
    entries = reduceTurnEntries(entries, turnStart(1, 1000))
    entries = reduceTurnEntries(entries, toolCall('bash', 1100))
    entries = reduceTurnEntries(entries, userMessage('修复会话列表的过滤条件', 1200))
    entries = reduceTurnEntries(entries, assistantMessage('已定位到 sessions.ts 的 blank 过滤。\n第二行忽略', 2000, 321))
    entries = reduceTurnEntries(entries, turnEnd(1, 4000))
    expect(entries).toEqual([{
      turn: 1, startedAt: 1000, endedAt: 4000,
      prompt: '修复会话列表的过滤条件',
      reply: '已定位到 sessions.ts 的 blank 过滤。',
      tools: ['bash'],
      outputTokens: 321,
    }])
  })

  it('keeps tool order, dedupes repeats, and overwrites the prompt with the latest one', () => {
    let entries: readonly TurnEntry[] = []
    entries = reduceTurnEntries(entries, turnStart(1, 1000))
    entries = reduceTurnEntries(entries, toolCall('bash', 1100))
    entries = reduceTurnEntries(entries, toolCall('bash', 1200))
    entries = reduceTurnEntries(entries, toolCall('str_replace_editor', 1300))
    entries = reduceTurnEntries(entries, userMessage('第一条', 1400))
    entries = reduceTurnEntries(entries, userMessage('第二条更正', 1500))
    expect(entries[0]?.tools).toEqual(['bash', 'str_replace_editor'])
    expect(entries[0]?.prompt).toBe('第二条更正')
  })

  it('ignores injected user messages and keeps the reference when nothing changes', () => {
    const entries = [new Object()] as unknown as readonly TurnEntry[]
    const injected = event('user/message', 100, {
      id: 'sys-1', content: [{ type: 'text', text: 'AGENTS.md' }], source: { kind: 'plugin' },
    })
    expect(reduceTurnEntries(entries, injected)).toBe(entries)
    expect(reduceTurnEntries(entries, event('step/start', 100, { turn: 1, step: 1 }))).toBe(entries)
  })

  it('caps the timeline at the board limit', () => {
    let entries: readonly TurnEntry[] = []
    for (let turn = 0; turn < TURN_TIMELINE_LIMIT + 3; turn += 1) {
      entries = reduceTurnEntries(entries, turnStart(turn, turn * 1000))
      entries = reduceTurnEntries(entries, turnEnd(turn, turn * 1000 + 500))
    }
    expect(entries).toHaveLength(TURN_TIMELINE_LIMIT)
    expect(entries[0]?.turn).toBe(3)
  })
})

describe('collectTurnEntries', () => {
  it('folds a durable slice into a conversation timeline, oldest first', () => {
    const timeline = collectTurnEntries([
      turnStart(1, 1000),
      userMessage('q1', 1100),
      assistantMessage('a1', 1500, 100),
      turnEnd(1, 2000),
      turnStart(2, 3000),
      toolCall('bash', 3100),
      userMessage('q2', 3200),
      assistantMessage('a2', 3600, 200),
      turnEnd(2, 4000),
    ])
    expect(timeline).toEqual([
      { turn: 1, startedAt: 1000, endedAt: 2000, prompt: 'q1', reply: 'a1', tools: [], outputTokens: 100 },
      { turn: 2, startedAt: 3000, endedAt: 4000, prompt: 'q2', reply: 'a2', tools: ['bash'], outputTokens: 200 },
    ])
  })
})

describe('isBoardToggle', () => {
  it('matches only the Ctrl+B chord', () => {
    expect(isBoardToggle('b', { ctrl: true, meta: false })).toBe(true)
    expect(isBoardToggle('b', { ctrl: true, meta: true })).toBe(false)
    expect(isBoardToggle('b', { ctrl: false, meta: false })).toBe(false)
    expect(isBoardToggle('t', { ctrl: true, meta: false })).toBe(false)
  })
})

describe('formatClock', () => {
  it('renders a local HH:MM label', () => {
    const date = new Date()
    date.setHours(9, 5, 0, 0)
    expect(formatClock(date.getTime())).toBe('09:05')
    date.setHours(23, 59, 0, 0)
    expect(formatClock(date.getTime())).toBe('23:59')
  })
})

describe('TaskBoard render', () => {
  it('shows session header, readouts, empty-task and empty-timeline hints', () => {
    const { frames } = render(
      React.createElement(TaskBoard, { state: boardState({ sessionLabel: '看板验证 · dsh-cli' }), theme, elapsedMs: 0 }),
    )
    const frame = frames.at(-1) ?? ''
    expect(frame).toContain(COPY.boardTitle)
    expect(frame).toContain('看板验证 · dsh-cli')
    expect(frame).toContain(COPY.boardNoTodos)
    expect(frame).toContain(COPY.boardEmptySpans)
    expect(frame).toContain(COPY.boardHint)
    expect(frame).toContain('1.5K')
  })

  it('renders the conversation timeline: prompt, reply, tools, tokens per turn', () => {
    const now = Date.now()
    const timeline = collectTurnEntries([
      turnStart(1, now - 90_000),
      toolCall('bash', now - 89_000),
      userMessage('修复会话列表的过滤条件', now - 88_000),
      assistantMessage('已定位到 sessions.ts 的过滤条件并修复。', now - 60_000, 321),
      turnEnd(1, now - 48_000),
      turnStart(2, now - 5_000),
      userMessage('跑一遍全量测试', now - 4_000),
    ])
    const { frames } = render(
      React.createElement(TaskBoard, {
        state: boardState({
          running: true,
          queued: ['排队的一条', '排队的二条'],
          todos: [
            { content: '梳理目录结构', status: 'completed' },
            { content: '修复会话列表', status: 'in_progress' },
            { content: '补回归用例', status: 'pending' },
          ],
          turnTimeline: timeline,
        }),
        theme,
        elapsedMs: 65_000,
      }),
    )
    const frame = frames.at(-1) ?? ''
    expect(frame).toContain('[✓] 梳理目录结构')
    expect(frame).toContain('[•] 修复会话列表')
    expect(frame).toContain('[ ] 补回归用例')
    expect(frame).toContain('1m5s')
    expect(frame).toContain(`${COPY.boardQueueLabel} 2`)
    expect(frame).toContain('#1')
    expect(frame).toContain('你: 修复会话列表的过滤条件')
    expect(frame).toContain('已定位到 sessions.ts 的过滤条件并修复。')
    expect(frame).toContain('⚙ bash')
    expect(frame).toContain('321 tok')
    expect(frame).toContain('#2')
    expect(frame).toContain('你: 跑一遍全量测试')
  })

  it('flags a pending approval so the board cannot hide an unanswered gate', () => {
    const { frames } = render(
      React.createElement(TaskBoard, {
        state: boardState({ pendingApproval: { toolName: 'bash', reason: 'demo' } }),
        theme,
        elapsedMs: 0,
      }),
    )
    expect(frames.at(-1)).toContain(COPY.boardApprovalPending)
  })
})
