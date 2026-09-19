/**
 * The dsh-taskboard's conversation timeline scrubber: the per-turn fold over
 * durable session events (full messages, not just summaries), the Ctrl+B
 * toggle chord, the draggable timeline cursor, clock labels, and the
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
import type { TurnEntry, TurnMessage, UiState } from '../src/ui/model.ts'
import type { ThemeTokens } from '../src/ui/theme.ts'
import { resolveTheme } from '../src/ui/theme.ts'
import {
  TURN_TIMELINE_LIMIT,
  TaskBoard,
  collectTurnEntries,
  formatClock,
  isBoardToggle,
  packPanePages,
  reduceTurnEntries,
  stepTimelineCursor,
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
    titleEditor: null,
    transcriptEpoch: 0,
    ...overrides,
  }
}

describe('reduceTurnEntries', () => {
  it('folds full messages, summary fields, tools, and tokens into the turn', () => {
    let entries: readonly TurnEntry[] = []
    entries = reduceTurnEntries(entries, turnStart(1, 1000))
    entries = reduceTurnEntries(entries, toolCall('bash', 1100))
    entries = reduceTurnEntries(entries, userMessage('修复会话列表的过滤条件', 1200))
    entries = reduceTurnEntries(entries, assistantMessage('已定位到 sessions.ts 的 blank 过滤。\n第二行也保留', 2000, 321))
    entries = reduceTurnEntries(entries, turnEnd(1, 4000))
    expect(entries).toHaveLength(1)
    const turn = entries[0]
    expect(turn?.turn).toBe(1)
    expect(turn?.startedAt).toBe(1000)
    expect(turn?.endedAt).toBe(4000)
    expect(turn?.prompt).toBe('修复会话列表的过滤条件')
    expect(turn?.reply).toBe('已定位到 sessions.ts 的 blank 过滤。')
    expect(turn?.tools).toEqual(['bash'])
    expect(turn?.outputTokens).toBe(321)
    expect(turn?.messages).toEqual([
      { role: 'tool', time: 1100, text: '', toolName: 'bash' },
      { role: 'user', time: 1200, text: '修复会话列表的过滤条件' },
      { role: 'assistant', time: 2000, text: '已定位到 sessions.ts 的 blank 过滤。\n第二行也保留' },
    ])
  })

  it('keeps tool order, dedupes the axis list, and keeps every invocation in messages', () => {
    let entries: readonly TurnEntry[] = []
    entries = reduceTurnEntries(entries, turnStart(1, 1000))
    entries = reduceTurnEntries(entries, toolCall('bash', 1100))
    entries = reduceTurnEntries(entries, toolCall('bash', 1200))
    entries = reduceTurnEntries(entries, toolCall('str_replace_editor', 1300))
    expect(entries[0]?.tools).toEqual(['bash', 'str_replace_editor'])
    expect(entries[0]?.messages.filter(m => m.role === 'tool')).toHaveLength(3)
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
    expect(timeline).toHaveLength(2)
    expect(timeline[0]?.messages.map(m => m.role)).toEqual(['user', 'assistant'])
    expect(timeline[1]?.prompt).toBe('q2')
    expect(timeline[1]?.tools).toEqual(['bash'])
    expect(timeline[1]?.outputTokens).toBe(200)
  })
})

describe('stepTimelineCursor', () => {
  const keys = {
    up: { upArrow: true, downArrow: false, home: false, end: false },
    down: { upArrow: false, downArrow: true, home: false, end: false },
  }
  it('starts live, drags up through history, and returns to live at the bottom', () => {
    expect(stepTimelineCursor(-1, 3, keys.up)).toBe(1)
    expect(stepTimelineCursor(1, 3, keys.up)).toBe(0)
    expect(stepTimelineCursor(0, 3, keys.up)).toBe(0)
    expect(stepTimelineCursor(0, 3, keys.down)).toBe(1)
    expect(stepTimelineCursor(1, 3, keys.down)).toBe(2)
    expect(stepTimelineCursor(2, 3, keys.down)).toBe(-1)
  })
  it('an empty timeline stays live whatever the key', () => {
    expect(stepTimelineCursor(0, 0, keys.up)).toBe(-1)
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

describe('packPanePages', () => {
  it('packs the conversation into pane-sized pages, newest first', () => {
    const message = (time: number, lines: number): TurnMessage => ({
      role: 'assistant', time, text: Array.from({ length: lines }, (_, i) => `行${i}`).join('\n'),
    })
    const messages = [message(1, 1), message(2, 1), message(3, 1), message(4, 1), message(5, 1), message(6, 1)]
    // One one-line assistant message costs 3 rows; a budget of 7 fits two plus the gap.
    expect(packPanePages(messages, 7).map(page => [page.start, page.end])).toEqual([[4, 6], [2, 4], [0, 2]])
    // A message taller than the whole budget still gets its own page.
    expect(packPanePages([message(1, 30), message(2, 1)], 2).map(page => [page.start, page.end])).toEqual([[1, 2], [0, 1]])
    expect(packPanePages([], 10)).toEqual([])
  })

  it('pages the content pane back through the turn with the arrow keys', () => {
    const longLine = '字'.repeat(200)
    const paged: TurnEntry[] = [{
      turn: 1,
      startedAt: Date.now() - 60_000,
      endedAt: Date.now(),
      prompt: '翻页回合',
      reply: longLine,
      tools: [],
      outputTokens: 0,
      messages: Array.from({ length: 12 }, (_, index) => ({
        role: 'assistant' as const,
        time: index,
        text: `序号 ${index} 的消息\n${longLine}`,
      })),
    }]
    const rich = boardState({ turnTimeline: paged })
    const tail = render(
      React.createElement(TaskBoard, { state: rich, theme, elapsedMs: 0, cursor: -1, rows: 40, columns: 60 }),
    ).frames.at(-1) ?? ''
    expect(tail).toContain('序号 11 的消息')
    expect(tail).toContain(COPY.boardMoreMessages)
    expect(tail).toContain('1/')
    expect(tail).toContain(COPY.boardPageHint)
    const older = render(
      React.createElement(TaskBoard, { state: rich, theme, elapsedMs: 0, cursor: -1, panePage: 1, rows: 40, columns: 60 }),
    ).frames.at(-1) ?? ''
    expect(older).not.toContain('序号 11 的消息')
    expect(older).toContain(COPY.boardMoreLater)
    expect(older).toContain('2/')
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
  const now = Date.now()
  const timeline = collectTurnEntries([
    turnStart(1, now - 90_000),
    toolCall('bash', now - 89_000),
    userMessage('修复会话列表的过滤条件', now - 88_000),
    assistantMessage('已定位到 sessions.ts 的过滤条件并修复。\n补充：补了三条回归用例。\n另外更新了 README。\n还跑了一遍 lint。', now - 60_000, 321),
    turnEnd(1, now - 48_000),
    turnStart(2, now - 5_000),
    userMessage('跑一遍全量测试', now - 4_000),
  ])

  it('shows session header, readouts, empty-task and empty-timeline hints', () => {
    const { frames } = render(
      React.createElement(TaskBoard, { state: boardState({ sessionLabel: '看板验证 · dsh-cli' }), theme, elapsedMs: 0, cursor: -1, rows: 44, columns: 110 }),
    )
    const frame = frames.at(-1) ?? ''
    expect(frame).toContain(COPY.boardTitle)
    expect(frame).toContain('看板验证 · dsh-cli')
    expect(frame).toContain(COPY.boardNoTodos)
    expect(frame).toContain(COPY.boardEmptySpans)
    expect(frame).toContain(COPY.boardHint)
    expect(frame).toContain('1.5K')
  })

  it('renders the timeline axis, the selected turn content, tools, and tokens', () => {
    const { frames } = render(
      React.createElement(TaskBoard, {
        state: boardState({
          running: true,
          queued: ['排队的一条', '排队的二条'],
          todos: [
            { content: '梳理目录结构', status: 'completed' },
            { content: '修复会话列表', status: 'in_progress' },
          ],
          turnTimeline: timeline,
        }),
        theme,
        elapsedMs: 65_000,
        cursor: -1,
        rows: 44,
        columns: 110,
      }),
    )
    const frame = frames.at(-1) ?? ''
    expect(frame).toContain('[✓] 梳理目录结构')
    expect(frame).toContain('[•] 修复会话列表')
    expect(frame).toContain('1m5s')
    expect(frame).toContain(`${COPY.boardQueueLabel} 2`)
    expect(frame).toContain('#1')
    expect(frame).toContain('#2')
    expect(frame).toContain('你')
    expect(frame).toContain('跑一遍全量测试')
  })

  it('shows the historical turn content when the cursor drags back', () => {
    const { frames } = render(
      React.createElement(TaskBoard, {
        state: boardState({ turnTimeline: timeline }),
        theme,
        elapsedMs: 0,
        cursor: 0,
        rows: 44,
        columns: 110,
      }),
    )
    const frame = frames.at(-1) ?? ''
    expect(frame).toContain('修复会话列表的过滤条件')
    expect(frame).toContain('已定位到 sessions.ts 的过滤条件并修复。')
    expect(frame).toContain('321 tok')
    expect(frame).toContain('⚙ bash')
    expect(frame).toContain(COPY.boardAxisCursor)
  })

  it('clamps itself below the terminal height so ink never replays the screen', () => {
    const longLine = '字'.repeat(200)
    const tall: TurnEntry[] = [{
      turn: 1,
      startedAt: now - 60_000,
      endedAt: now,
      prompt: '长回合',
      reply: longLine,
      tools: [],
      outputTokens: 0,
      messages: Array.from({ length: 40 }, (_, index) => ({
        role: 'assistant' as const,
        time: index,
        text: index === 0 ? `最早的独有标记 ${longLine}` : `最新回复可见\n${longLine}`,
      })),
    }]
    const rich = boardState({ turnTimeline: tall })
    const tallFrame = render(
      React.createElement(TaskBoard, { state: rich, theme, elapsedMs: 0, cursor: -1, rows: 40, columns: 60 }),
    ).frames.at(-1) ?? ''
    expect(tallFrame.split('\n').length).toBeLessThanOrEqual(40)
    expect(tallFrame).toContain(COPY.boardMoreMessages)
    expect(tallFrame).toContain('最新回复可见')
    expect(tallFrame).not.toContain('最早的独有标记')

    const smallFrame = render(
      React.createElement(TaskBoard, { state: rich, theme, elapsedMs: 0, cursor: -1, rows: 20, columns: 60 }),
    ).frames.at(-1) ?? ''
    expect(smallFrame.split('\n').length).toBeLessThanOrEqual(20)
    expect(smallFrame).not.toContain('最新回复可见')
  })

  it('flags a pending approval so the board cannot hide an unanswered gate', () => {
    const { frames } = render(
      React.createElement(TaskBoard, {
        state: boardState({ pendingApproval: { toolName: 'bash', reason: 'demo' } }),
        theme,
        elapsedMs: 0,
        cursor: -1,
        rows: 44,
        columns: 110,
      }),
    )
    expect(frames.at(-1)).toContain(COPY.boardApprovalPending)
  })
})
