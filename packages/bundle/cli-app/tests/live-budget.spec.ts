/**
 * Live-region row budget: the clip that keeps Ink's repaint one row shorter
 * than the viewport, so a fast reply never trips the reset that clears the
 * screen, erases scrollback, and replays the whole transcript. Keyless — the
 * rows are hand-built and the terminal is a fake stream that reports a size.
 */

import { EventEmitter } from 'node:events'
import { Console } from 'node:console'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { renderApp } from '../src/index.ts'
import { App } from '../src/ui/index.ts'
import { COPY } from '../src/ui/copy.ts'
import { THEMES } from '../src/ui/theme.ts'
import { fitLiveMessages, liveRowBudget, liveRowHeight } from '../src/ui/live-budget.ts'
import type { ExitRequest, UiMessage, UiState, ViewModel } from '../src/ui/model.ts'

// Ink routes console output through `patch-console`, which builds its console
// from `console.Console` — a property the test runner's console omits.
const consoleConstructor = console as unknown as { Console?: typeof Console }
consoleConstructor.Console ??= Console

/** Shape inputs shared by the height assertions. */
const shape = { columns: 80, labeled: false, expandedKey: null }

/** One streaming answer of `lines` short lines. */
function answer(lines: number): UiMessage {
  return {
    key: 'stream-1',
    role: 'assistant',
    text: Array.from({ length: lines }, (_unused, index) => `line ${index}`).join('\n'),
    reasoning: '',
    status: 'streaming',
  }
}

/** One settled tool card with a result body. */
function toolCard(result: string): UiMessage {
  return {
    key: 'tool-1',
    role: 'tool',
    text: '',
    reasoning: '',
    status: 'done',
    toolName: 'bash',
    toolStatus: 'done',
    toolResult: result,
  }
}

describe('liveRowBudget', () => {
  it('declines to clip a stream that reports no viewport', () => {
    expect(liveRowBudget(Number.NaN, 0)).toBe(0)
    expect(liveRowBudget(11, 0)).toBe(0)
  })

  it('stops one row short of the viewport the reset compares against', () => {
    expect(liveRowBudget(40, 8)).toBe(31)
  })

  it('keeps a floor when the chrome claims more than the viewport holds', () => {
    expect(liveRowBudget(12, 40)).toBe(3)
  })
})

describe('liveRowHeight', () => {
  it('counts the answer lines and the overhead around them', () => {
    expect(liveRowHeight(answer(5), shape)).toBe(7)
  })

  it('adds the classic role label to user and assistant rows only', () => {
    const labeled = { ...shape, labeled: true }
    expect(liveRowHeight(answer(1), labeled)).toBe(4)
    expect(liveRowHeight(toolCard(''), labeled)).toBe(2)
  })

  it('counts a wrapped answer line by the rows the terminal shows for it', () => {
    const narrow = { ...shape, columns: 10 }
    expect(liveRowHeight({ ...answer(1), text: 'x'.repeat(30) }, narrow)).toBe(5)
  })

  it('counts lines when the stream reports no width', () => {
    expect(liveRowHeight(answer(4), { ...shape, columns: Number.NaN })).toBe(6)
    expect(liveRowHeight(answer(4), { ...shape, columns: 0 })).toBe(6)
  })

  it('shows reasoning only once the row settles, and every line when it is expanded', () => {
    const settled: UiMessage = { ...answer(1), status: 'done', reasoning: 'a\nb' }
    expect(liveRowHeight({ ...settled, status: 'streaming' }, shape)).toBe(3)
    expect(liveRowHeight(settled, shape)).toBe(4)
    expect(liveRowHeight(settled, { ...shape, expandedKey: 'stream-1' })).toBe(5)
  })

  it('adds the streaming tool preview and a settled result body', () => {
    expect(liveRowHeight(toolCard('out'), shape)).toBe(3)
    expect(liveRowHeight({ ...toolCard('out'), toolPreview: 'echo hi' }, shape)).toBe(4)
  })
})

describe('fitLiveMessages', () => {
  it('paints an empty or unbounded region whole', () => {
    expect(fitLiveMessages([], 5, shape)).toMatchObject({ hiddenRows: 0, notice: false })
    const rows = [answer(20)]
    expect(fitLiveMessages(rows, 0, shape)).toMatchObject({ messages: rows, hiddenRows: 0 })
  })

  it('keeps the same row list while the region fits', () => {
    const rows = [toolCard('a'), answer(3)]
    const fit = fitLiveMessages(rows, 12, shape)
    expect(fit.messages).toBe(rows)
    expect(fit).toMatchObject({ hiddenRows: 0, notice: false })
  })

  it('trims the newest answer first, keeping every other row visible', () => {
    const rows = [toolCard('one'), answer(10)]
    // Heights 3 and 12 against a budget of 10: the 3-row tool card and the
    // notice stay, the answer gives up its leading six rows.
    const fit = fitLiveMessages(rows, 10, shape)
    expect(fit.messages.map(row => row.key)).toEqual(['tool-1', 'stream-1'])
    expect(fit.messages.at(-1)?.text.split('\n')).toEqual(['line 6', 'line 7', 'line 8', 'line 9'])
    expect(fit).toMatchObject({ hiddenRows: 6, notice: true })
  })

  it('drops whole leading rows once one answer line no longer fits beside them', () => {
    const rows = [toolCard('x'.repeat(200)), { ...answer(0), text: '' }]
    // The 5-row card cannot share a 4-row budget with the answer's overhead,
    // so it leaves and the newest row paints alone.
    const fit = fitLiveMessages(rows, 4, shape)
    expect(fit.messages.map(row => row.key)).toEqual(['stream-1'])
    expect(fit).toMatchObject({ hiddenRows: 5, notice: true })
  })

  it('holds one line of the newest answer even when the budget is smaller', () => {
    const rows = [answer(30), answer(1)]
    const fit = fitLiveMessages(rows, 3, shape)
    expect(fit.messages).toHaveLength(1)
    expect(fit.messages.at(-1)?.text).toBe('line 0')
    // No room is left for the notice, so the frame paints without it.
    expect(fit.notice).toBe(false)
  })

  it('counts lines instead of wrapped rows while tail-clipping a widthless stream', () => {
    const fit = fitLiveMessages([answer(10)], 5, { ...shape, columns: 0 })
    expect(fit.messages.at(-1)?.text.split('\n')).toEqual(['line 8', 'line 9'])
  })
})

/** The frame the terminal is showing: Ink's last multi-line write, cursor
 * controls and erase prefixes removed. */
function paintedFrame(stdout: FakeStdout): string {
  const frames = stdout.written
    .map(chunk => {
      const index = chunk.lastIndexOf('\u001b[G')
      return index === -1 ? chunk : chunk.slice(index + '\u001b[G'.length)
    })
    .filter(chunk => chunk.includes('\n'))
  return (frames.at(-1) ?? '').replace(/\n+$/, '')
}

/** A sized TTY double, so the app sees a viewport and the test sees every write. */
class FakeStdout extends EventEmitter {
  columns = 100
  rows = 14
  isTTY = true
  written: string[] = []
  write = (chunk: string): boolean => {
    this.written.push(chunk)
    return true
  }
}

/** Ink's raw-mode-capable stdin double, so its input hook can mount. */
class FakeStdin extends EventEmitter {
  isTTY = true
  setEncoding(): void {}
  setRawMode(): void {}
  resume(): void {}
  pause(): void {}
  ref(): void {}
  unref(): void {}
  read(): null { return null }
}

/** One snapshot with every field defaulted, so a test states only what it exercises. */
function snapshot(messages: UiMessage[]): UiState {
  return {
    messages,
    running: false,
    error: null,
    modelLabel: 'Mock',
    permissionPreset: 'ask',
    boardOpen: false,
    turnTimeline: [],
    sessionId: SessionId('s-1'),
    sessionLabel: 'label',
    pickerOpen: false,
    pickerItems: [],
    pendingApproval: null,
    tokens: { input: 0, output: 0, reasoning: 0 },
    tokenRate: null,
    todos: null,
    queued: [],
    contextOccupancy: null,
    choicePicker: null,
    connectWizard: null,
    titleEditor: null,
    transcriptEpoch: 0,
  }
}

/** A view model that never notifies and takes no actions. */
function viewModel(state: UiState): ViewModel {
  const noop = (): void => {}
  return {
    subscribe: () => noop,
    getState: () => state,
    send: noop,
    historyOlder: () => null,
    historyNewer: () => null,
    openTitleEditor: () => {},
    submitTitle: () => {},
    cancelTitleEditor: () => {},
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

/** Let React and Ink flush every scheduled render, past Ink's 32 ms log throttle. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 60))
}

describe('App live region', () => {
  it('clips a long streaming answer instead of tripping Ink screen reset', async () => {
    const stdout = new FakeStdout()
    const surface = renderApp(
      React.createElement(App, {
        vm: viewModel(snapshot([answer(60)])),
        theme: THEMES['deep-forest'],
        ui: 'opencode',
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
      },
    )
    try {
      await settle()
      // The reset Ink takes on an over-tall frame erases the viewport (`2J`)
      // before replaying every committed row; a clipped frame never earns it.
      expect(stdout.written.join('')).not.toContain('\u001b[2J')
      const painted = paintedFrame(stdout)
      expect(painted.split('\n').length).toBeLessThan(stdout.rows)
      // The newest lines of the answer stay on screen, and the footer says how
      // many rows the clip held back.
      expect(painted).toContain('line 59')
      expect(painted).not.toContain('line 0')
      expect(painted).toContain(`${COPY.liveTailMore}58 ${COPY.liveTailRest}`)
    } finally {
      surface.unmount()
    }
  })

  it('paints a short answer unclipped, with no notice row', async () => {
    const stdout = new FakeStdout()
    const surface = renderApp(
      React.createElement(App, {
        vm: viewModel(snapshot([answer(2)])),
        theme: THEMES['deep-forest'],
        ui: 'opencode',
      }),
      {
        stdout: stdout as unknown as NodeJS.WriteStream,
        stdin: new FakeStdin() as unknown as NodeJS.ReadStream,
      },
    )
    try {
      await settle()
      const painted = paintedFrame(stdout)
      expect(painted).toContain('line 0')
      expect(painted).not.toContain(COPY.liveTailMore)
    } finally {
      surface.unmount()
    }
  })
})
