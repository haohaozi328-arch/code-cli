/**
 * The dsh-taskboard's pure board data (turn spans, toggle chord, clock
 * labels) and its full-screen render. The span fold mirrors the durable
 * `turn/start`/`turn/end` events, so the board's timeline can never disagree
 * with the transcript about what ran when.
 * @module tests/taskboard.spec
 */

import { describe, expect, it } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { SessionId } from '@deepseek-ai/dsh-session'
import { COPY } from '../src/ui/copy.ts'
import type { TurnSpan, UiState } from '../src/ui/model.ts'
import type { ThemeTokens } from '../src/ui/theme.ts'
import {
  collectTurnSpans,
  formatClock,
  isBoardToggle,
  TURN_SPAN_LIMIT,
  TaskBoard,
  reduceTurnSpans,
} from '../src/ui/index.ts'
import { resolveTheme } from '../src/ui/theme.ts'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

const theme: ThemeTokens = resolveTheme('cream-forest')

function turnEvent(type: string, turn: number, time: number): SessionEvent {
  return { type, time, data: { turn } } as unknown as SessionEvent
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
    turnSpans: [],
    choicePicker: null,
    connectWizard: null,
    transcriptEpoch: 0,
    ...overrides,
  }
}

describe('reduceTurnSpans', () => {
  it('opens a span on turn/start and closes the open one on turn/end', () => {
    let spans: readonly TurnSpan[] = []
    spans = reduceTurnSpans(spans, turnEvent('turn/start', 1, 1000))
    expect(spans).toEqual([{ turn: 1, startedAt: 1000, endedAt: null }])
    const closed = reduceTurnSpans(spans, turnEvent('turn/end', 1, 4000))
    expect(closed).toEqual([{ turn: 1, startedAt: 1000, endedAt: 4000 }])
  })

  it('keeps the same array reference when nothing changes', () => {
    const spans = [new Object()] as unknown as readonly TurnSpan[]
    expect(reduceTurnSpans(spans, turnEvent('step/start', 1, 1000))).toBe(spans)
    expect(reduceTurnSpans(spans, turnEvent('turn/end', 9, 1000))).toBe(spans)
  })

  it('caps the timeline at the board limit', () => {
    let spans: readonly TurnSpan[] = []
    for (let turn = 0; turn < TURN_SPAN_LIMIT + 3; turn += 1) {
      spans = reduceTurnSpans(spans, turnEvent('turn/start', turn, turn * 1000))
      spans = reduceTurnSpans(spans, turnEvent('turn/end', turn, turn * 1000 + 500))
    }
    expect(spans).toHaveLength(TURN_SPAN_LIMIT)
    expect(spans[0]?.turn).toBe(3)
  })
})

describe('collectTurnSpans', () => {
  it('folds a durable slice into spans, oldest first', () => {
    const events = [
      turnEvent('turn/start', 1, 1000),
      turnEvent('turn/end', 1, 2000),
      turnEvent('turn/start', 2, 3000),
      turnEvent('step/start', 2, 3100),
      turnEvent('turn/end', 2, 3500),
    ]
    expect(collectTurnSpans(events)).toEqual([
      { turn: 1, startedAt: 1000, endedAt: 2000 },
      { turn: 2, startedAt: 3000, endedAt: 3500 },
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

  it('renders the checklist, live turn, queue depth, and timeline rows', () => {
    const spans: readonly TurnSpan[] = [
      { turn: 1, startedAt: Date.now() - 90_000, endedAt: Date.now() - 48_000 },
      { turn: 2, startedAt: Date.now() - 5_000, endedAt: null },
    ]
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
          turnSpans: spans,
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
    expect(frame).toContain('#2')
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
