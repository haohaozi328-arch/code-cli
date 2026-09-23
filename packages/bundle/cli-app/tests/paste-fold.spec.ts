import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { App } from '../src/ui/index.ts'
import { THEMES } from '../src/ui/theme.ts'
import {
  PASTE_FOLD_MIN, deletionRange, foldInput, isPasteChunk, spanCovering, spansAfterDelete,
  spansAfterInsert, stepCursor, summarizePaste,
} from '../src/ui/paste-spans.ts'
import type { ExitRequest, UiState, ViewModel } from '../src/ui/model.ts'

function snapshot(overrides: Partial<UiState> = {}): UiState {
  return {
    messages: [],
    running: false,
    error: null,
    modelLabel: 'Mock',
    permissionPreset: 'ask',
    sessionId: SessionId('s-paste'),
    sessionLabel: 'label',
    pickerOpen: false,
    pickerItems: [],
    pendingApproval: null,
    tokens: { input: 0, output: 0, reasoning: 0 },
    tokenRate: null,
    contextOccupancy: null,
    todos: null,
    queued: [],
    boardOpen: false,
    turnTimeline: [],
    choicePicker: null,
    connectWizard: null,
    titleEditor: null,
    transcriptEpoch: 0,
    ...overrides,
  }
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

/** A view model that never notifies, renders a fixed snapshot, and records sends. */
function viewModel(state: UiState, send: (text: string) => void): ViewModel {
  const noop = (): void => {}
  return {
    subscribe: () => noop,
    getState: () => state,
    send,
    historyOlder: () => null,
    historyNewer: () => null,
    openTitleEditor: noop,
    submitTitle: noop,
    cancelTitleEditor: noop,
    stop: noop,
    toggleBoard: noop,
    quit: noop,
    openPicker: noop,
    closePicker: noop,
    requestSwitch: noop,
    openModelPicker: noop,
    pickModel: noop,
    openPolicyPicker: noop,
    pickPolicy: noop,
    openSkillPicker: noop,
    pickSkill: noop,
    openMcpPicker: noop,
    pickMcp: noop,
    openConnectPicker: noop,
    pickConnectProvider: noop,
    submitConnectInput: noop,
    pickConnectApi: noop,
    cancelConnect: noop,
    closeChoicePicker: noop,
    resolveApproval: noop,
    done: new Promise<ExitRequest>(() => {}),
    dispose: noop,
  }
}

describe('paste folding', () => {
  it('treats a long or multi-line chunk as a paste and ordinary typing as typing', () => {
    expect(isPasteChunk('a')).toBe(false)
    expect(isPasteChunk('x'.repeat(PASTE_FOLD_MIN - 1))).toBe(false)
    expect(isPasteChunk('x'.repeat(PASTE_FOLD_MIN))).toBe(true)
    expect(isPasteChunk('two\nlines')).toBe(true)
  })

  it('summarizes a paste as head...tail plus its character count', () => {
    const text = `${'A'.repeat(30)}\n${'B'.repeat(70)}`
    const summary = summarizePaste(text)
    expect(summary.startsWith('【')).toBe(true)
    expect(summary.endsWith('101字符】')).toBe(true)
    expect(summary).toContain('...')
    // Head and tail are preserved verbatim.
    expect(summary).toContain('A'.repeat(20))
    expect(summary).toContain('B'.repeat(10))
  })

  it('counts code points, not UTF-16 units', () => {
    expect(summarizePaste('中'.repeat(120))).toContain('120字符')
  })

  it('keeps a short paste readable instead of eliding it', () => {
    expect(summarizePaste('hello\nworld')).toBe('【hello world，11字符】')
  })

  it('folds the buffer and maps the caret onto the placeholder edges', () => {
    const pasted = 'P'.repeat(100)
    const text = `pre${pasted}post`
    const folded = foldInput(text, [{ start: 3, length: pasted.length }])
    expect(folded.display).toBe(`pre${summarizePaste(pasted)}post`)
    expect(folded.mapCursor(0)).toBe(0)
    expect(folded.mapCursor(3)).toBe(3)
    // Anywhere inside the region resolves to the placeholder's trailing edge.
    expect(folded.mapCursor(50)).toBe(3 + summarizePaste(pasted).length)
    expect(folded.mapCursor(text.length)).toBe(folded.display.length)
  })

  it('re-bases spans around edits and unfolds a region an edit touches', () => {
    const spans = [{ start: 10, length: 100 }]
    expect(spansAfterInsert(spans, 0, 3, false)).toEqual([{ start: 13, length: 100 }])
    expect(spansAfterInsert(spans, 200, 3, false)).toEqual([{ start: 10, length: 100 }])
    expect(spansAfterInsert(spans, 50, 1, false)).toEqual([])
    expect(spansAfterDelete(spans, 0, 5)).toEqual([{ start: 5, length: 100 }])
    expect(spansAfterDelete(spans, 109, 1)).toEqual([])
    const withNew = spansAfterInsert([], 0, 90, true)
    expect(withNew).toEqual([{ start: 0, length: 90 }])
  })

  it('deletes a folded region whole instead of one character at a time', () => {
    const spans = [{ start: 3, length: 100 }]
    const length = 107
    // Backspace at the placeholder's trailing edge removes the whole region.
    expect(deletionRange(spans, 103, 'backward', length)).toEqual({ start: 3, length: 100 })
    // Delete at its leading edge does the same.
    expect(deletionRange(spans, 3, 'forward', length)).toEqual({ start: 3, length: 100 })
    // Ordinary text around it still deletes one character.
    expect(deletionRange(spans, 3, 'backward', length)).toEqual({ start: 2, length: 1 })
    expect(deletionRange(spans, 105, 'forward', length)).toEqual({ start: 105, length: 1 })
    // Buffer edges are no-ops.
    expect(deletionRange(spans, 0, 'backward', length)).toBeNull()
    expect(deletionRange(spans, length, 'forward', length)).toBeNull()
  })

  it('steps the caret across a whole placeholder', () => {
    const spans = [{ start: 3, length: 100 }]
    const length = 107
    expect(spanCovering(spans, 50)?.start).toBe(3)
    expect(spanCovering(spans, 2)).toBeUndefined()
    expect(stepCursor(spans, 103, -1, length)).toBe(3)
    expect(stepCursor(spans, 3, 1, length)).toBe(103)
    expect(stepCursor(spans, 2, 1, length)).toBe(3)
    expect(stepCursor(spans, 0, -1, length)).toBe(0)
  })

  it('renders a pasted block as one placeholder line and still sends the full text', async () => {
    const state = snapshot({})
    const send = vi.fn()
    const app = render(React.createElement(App, {
      key: 'test-paste', vm: viewModel(state, send), theme: THEMES['deep-forest'], ui: 'classic',
    }))
    await new Promise(resolve => setTimeout(resolve, 20))
    const pasted = `${'第一行内容'.repeat(10)}\n${'第二行内容'.repeat(10)}`
    app.stdin.write(pasted)
    await new Promise(resolve => setTimeout(resolve, 30))
    const frame = stripAnsi(app.lastFrame() ?? '')
    expect(frame).toContain('字符】')
    expect(frame).not.toContain('第一行内容第一行内容第一行内容第一行内容第一行内容第一行内容')
    // Enter still sends the verbatim buffer, not the placeholder.
    app.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(send).toHaveBeenCalledWith(pasted.trimEnd())
    app.unmount()
  })

  it('leaves ordinary typing unfolded', async () => {
    const state = snapshot({})
    const send = vi.fn()
    const app = render(React.createElement(App, {
      key: 'test-typing', vm: viewModel(state, send), theme: THEMES['deep-forest'], ui: 'classic',
    }))
    await new Promise(resolve => setTimeout(resolve, 20))
    app.stdin.write('hello')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('hello')
    app.unmount()
  })

  it('drops the whole paste on one Backspace', async () => {
    const state = snapshot({})
    const send = vi.fn()
    const app = render(React.createElement(App, {
      key: 'test-unpaste', vm: viewModel(state, send), theme: THEMES['deep-forest'], ui: 'classic',
    }))
    await new Promise(resolve => setTimeout(resolve, 20))
    app.stdin.write('尾巴')
    app.stdin.write('段落内容'.repeat(30))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(stripAnsi(app.lastFrame() ?? '')).toContain('字符】')
    // ONE backspace takes the whole placeholder, leaving the typed prefix.
    app.stdin.write('\x7f')
    await new Promise(resolve => setTimeout(resolve, 30))
    const frame = stripAnsi(app.lastFrame() ?? '')
    expect(frame).not.toContain('字符】')
    expect(frame).toContain('尾巴')
    app.unmount()
  })
})
