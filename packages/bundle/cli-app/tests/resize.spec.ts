/**
 * Resize reflow correction: Ink erases its previous frame with a row count
 * measured at the width that frame was written at, so a shrink that re-wraps
 * the frame into more physical rows leaves its top stranded as a duplicate
 * copy. Keyless — the streams are fakes and the frames are the exact byte
 * shapes Ink writes.
 */

import { EventEmitter } from 'node:events'
import { Console } from 'node:console'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { renderApp } from '../src/index.ts'
import { App } from '../src/ui/index.ts'
import { installResizeReflow, reflowedRows, wrappedRows } from '../src/ui/resize.ts'
import { THEMES } from '../src/ui/theme.ts'
import type { ExitRequest, UiState, ViewModel } from '../src/ui/model.ts'

// Ink routes console output through `patch-console`, which builds its console
// from `console.Console` — a property the test runner's console omits. Without
// it the real render path throws before writing a frame.
const consoleConstructor = console as unknown as { Console?: typeof Console }
consoleConstructor.Console ??= Console

const ERASE_LINE = '\u001b[2K'
const CURSOR_UP_ONE = '\u001b[1A'
const CURSOR_LEFT = '\u001b[G'

/** The erase sequence Ink's `log-update` writes for one row count. */
function eraseLines(count: number): string {
  let clear = ''
  for (let index = 0; index < count; index += 1) {
    clear += ERASE_LINE + (index < count - 1 ? CURSOR_UP_ONE : '')
  }
  return count === 0 ? clear : clear + CURSOR_LEFT
}

/** Rows one written chunk erases, 0 for a chunk with no erase prefix. */
function erasedRows(chunk: string): number {
  return chunk.split(ERASE_LINE).length - 1
}

/** The frame body of one written chunk, erase prefix removed. */
function frameContent(chunk: string): string {
  const index = chunk.lastIndexOf(CURSOR_LEFT)
  return index === -1 ? chunk : chunk.slice(index + CURSOR_LEFT.length)
}

/** One frame of `rows` lines, each exactly `width` display cells wide. */
function frame(width: number, rows: number): string {
  return Array.from({ length: rows }, () => 'x'.repeat(width)).join('\n') + '\n'
}

/** A TTY-shaped sink with a mutable width, so a test owns every resize. */
class FakeStdout extends EventEmitter {
  columns = 120
  rows = 40
  isTTY = true
  written: string[] = []
  write = (chunk: string): boolean => {
    this.written.push(chunk)
    return true
  }
}

/** The stream surface the module under test expects, from the fake. */
function asStream(stdout: FakeStdout): NodeJS.WriteStream {
  return stdout as unknown as NodeJS.WriteStream
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

/** The input surface Ink expects, from the fake. */
function asInput(stdin: FakeStdin): NodeJS.ReadStream {
  return stdin as unknown as NodeJS.ReadStream
}

/** Let React and Ink flush every scheduled render, past Ink's 32 ms log throttle. */
async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 60))
}

describe('reflowedRows', () => {
  it('keeps a line that fits at one row and wraps a wider one', () => {
    expect(wrappedRows('abc', 10)).toBe(1)
    expect(wrappedRows('x'.repeat(30), 10)).toBe(3)
    expect(wrappedRows('', 10)).toBe(1)
  })

  it('packs wide characters greedily the way the terminal wraps them', () => {
    // Five CJK glyphs are ten cells; four columns hold two glyphs per row.
    expect(wrappedRows('中'.repeat(5), 4)).toBe(3)
    // A single cell cannot hold a two-cell glyph, so it still occupies one row.
    expect(wrappedRows('中', 1)).toBe(1)
  })

  it('counts the cursor row Ink appends below the frame', () => {
    expect(reflowedRows(frame(10, 3), 10)).toBe(4)
    expect(reflowedRows(frame(30, 3), 10)).toBe(10)
  })
})

describe('installResizeReflow', () => {
  it('amplifies the post-shrink erase to the reflowed frame height', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(11))
      // Ten 60-cell rows re-wrap to 20 rows at 30 columns, plus Ink's cursor row.
      expect(stdout.written.at(-1)).toBe(eraseLines(21))
    } finally {
      restore()
    }
  })

  it('models the first bare frame Ink writes before any erase-prefixed one', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(frame(60, 10))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(11))
      expect(stdout.written.at(-1)).toBe(eraseLines(21))
    } finally {
      restore()
    }
  })

  it('amplifies one erase per shrink', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(11))
      expect(stdout.written.at(-1)).toBe(eraseLines(21))
      stdout.write(eraseLines(11))
      expect(stdout.written.at(-1)).toBe(eraseLines(11))
    } finally {
      restore()
    }
  })

  it('a grow cancels the pending shrink amplification', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.columns = 120
      stdout.emit('resize')
      stdout.write(eraseLines(11))
      expect(stdout.written.at(-1)).toBe(eraseLines(11))
    } finally {
      restore()
    }
  })

  it('never shortens an erase that already exceeds the reflowed height', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(40))
      expect(stdout.written.at(-1)).toBe(eraseLines(40))
    } finally {
      restore()
    }
  })

  it('models the live frame of a static-commit burst, not the static rows', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      // Ink's static-commit burst: clear, the static rows bare, then the live
      // frame bare because the clear reset its counter. The last write wins.
      stdout.write(eraseLines(11))
      stdout.write(frame(60, 30))
      stdout.write(frame(60, 2))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(3))
      // Two 60-cell rows re-wrap to four rows at 30 columns, plus the cursor row.
      expect(stdout.written.at(-1)).toBe(eraseLines(5))
    } finally {
      restore()
    }
  })

  it('ignores a stray bare write outside a render burst', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      stdout.write('stray plugin output\n')
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(11))
      // Still the ten-row frame: the stray write did not become the model.
      expect(stdout.written.at(-1)).toBe(eraseLines(21))
    } finally {
      restore()
    }
  })

  it('drops the model when Ink replays the screen, so no erase is amplified', () => {
    const stdout = new FakeStdout()
    const { restore } = installResizeReflow(asStream(stdout))
    try {
      stdout.write(eraseLines(11) + frame(60, 10))
      // Ink's overflow reset: erase the screen, then every static row and the
      // live frame in one write, with no frame model to correct.
      stdout.write('\u001b[2J\u001b[3J\u001b[H' + frame(60, 40))
      stdout.columns = 30
      stdout.emit('resize')
      stdout.write(eraseLines(4))
      expect(stdout.written.at(-1)).toBe(eraseLines(4))
    } finally {
      restore()
    }
  })

  it('unwraps the stream and its resize listener on restore', () => {
    const stdout = new FakeStdout()
    const original = stdout.write
    const { restore } = installResizeReflow(asStream(stdout))
    expect(stdout.write).not.toBe(original)
    expect(stdout.listenerCount('resize')).toBe(1)
    restore()
    expect(stdout.write).toBe(original)
    expect(stdout.listenerCount('resize')).toBe(0)
  })
})

/** One snapshot with every field defaulted, so a test states only what it exercises. */
function snapshot(): UiState {
  return {
    messages: [],
    running: false,
    error: null,
    modelLabel: 'Mock',
    permissionPreset: 'ask',
    sessionId: SessionId('s-1'),
    sessionLabel: 'label',
    pickerOpen: false,
    pickerItems: [],
    pendingApproval: null,
    tokens: { input: 0, output: 0, reasoning: 0 },
    tokenRate: null,
    contextOccupancy: null,
    choicePicker: null,
    connectWizard: null,
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
    stop: noop,
    quit: noop,
    openPicker: noop,
    closePicker: noop,
    requestSwitch: noop,
    openModelPicker: noop,
    pickModel: noop,
    openPolicyPicker: noop,
    pickPolicy: noop,
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

describe('renderApp resize handling', () => {
  it('rewrites the erase Ink writes after a real shrink, and unwraps on unmount', async () => {
    const stdout = new FakeStdout()
    const originalWrite = stdout.write
    const surface = renderApp(
      React.createElement(App, { key: 's-1', vm: viewModel(snapshot()), theme: THEMES['deep-forest'], ui: 'opencode' }),
      { stdout: asStream(stdout), stdin: asInput(new FakeStdin()) },
    )
    try {
      await settle()
      // The modelled frame is the multi-line write; the other pre-resize write
      // is Ink's cursor-hide control sequence.
      const model = stdout.written.map(frameContent).filter(frame => frame.includes('\n')).at(-1) ?? ''
      expect(model).not.toBe('')

      stdout.columns = 40
      stdout.emit('resize')
      await settle()

      // Ink's own post-resize erase must cover the reflowed height of the frame
      // it is about to erase; without the correction it stays at the old count.
      expect(stdout.written.map(erasedRows)).toContain(reflowedRows(model, 40))
    } finally {
      surface.unmount()
    }
    expect(stdout.write).toBe(originalWrite)
  })
})
