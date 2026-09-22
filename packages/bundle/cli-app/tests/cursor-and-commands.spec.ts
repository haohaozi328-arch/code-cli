import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { App } from '../src/ui/index.ts'
import { COMMAND_HINTS } from '../src/ui/state.ts'
import { THEMES } from '../src/ui/theme.ts'
import type { UiState, ViewModel } from '../src/ui/model.ts'

function snapshot(overrides: Partial<UiState> = {}): UiState {
  return {
    messages: [],
    running: false,
    error: null,
    modelLabel: 'Mock',
    permissionPreset: 'ask',
    sessionId: SessionId('s-cursor'),
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

describe('command menu and cursor editing', () => {
  it('COMMAND_HINTS includes /mcp and removes /plan /clear /goal', () => {
    const names = COMMAND_HINTS.map(h => h.name)
    expect(names).toContain('/mcp')
    expect(names).not.toContain('/plan')
    expect(names).not.toContain('/clear')
    expect(names).not.toContain('/goal')
  })

  it('renders command menu with all matches accessible from /', async () => {
    const state = snapshot({})
    const send = vi.fn()
    const vm: ViewModel = {
      subscribe: () => () => {},
      getState: () => state,
      send,
    }

    const instance = render(React.createElement(App, { key: 'test-cmd', vm, theme: THEMES['deep-forest'], ui: 'classic' }))
    await new Promise(resolve => setTimeout(resolve, 20))

    // Type /
    instance.stdin.write('/')
    await new Promise(resolve => setTimeout(resolve, 20))

    let frame = stripAnsi(instance.lastFrame() ?? '')
    expect(frame).toContain('/new')

    // Navigate down 8 times to reach /mcp (index 8)
    for (let i = 0; i < 8; i++) {
      instance.stdin.write('\x1b[B') // down arrow
      await new Promise(resolve => setTimeout(resolve, 10))
    }

    frame = stripAnsi(instance.lastFrame() ?? '')
    expect(frame).toContain('/mcp')

    // Press return to choose /mcp
    instance.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(send).toHaveBeenCalledWith('/mcp')
    instance.unmount()
  })

  it('supports cursor navigation and middle editing', async () => {
    const state = snapshot({})
    const send = vi.fn()
    const vm: ViewModel = {
      subscribe: () => () => {},
      getState: () => state,
      send,
    }

    const instance = render(React.createElement(App, { key: 'test-cursor', vm, theme: THEMES['deep-forest'], ui: 'classic' }))
    await new Promise(resolve => setTimeout(resolve, 20))

    // Type "ac"
    instance.stdin.write('a')
    instance.stdin.write('c')
    await new Promise(resolve => setTimeout(resolve, 20))

    let frame = stripAnsi(instance.lastFrame() ?? '')
    expect(frame).toContain('ac')

    // Left arrow to move between 'a' and 'c'
    instance.stdin.write('\x1b[D')
    await new Promise(resolve => setTimeout(resolve, 20))

    // Insert 'b'
    instance.stdin.write('b')
    await new Promise(resolve => setTimeout(resolve, 20))

    // Enter
    instance.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(send).toHaveBeenCalledWith('abc')
    instance.unmount()
  })

  it('continuously deletes backward with Backspace/Delete key without moving left', async () => {
    const state = snapshot({})
    const send = vi.fn()
    const vm: ViewModel = {
      subscribe: () => () => {},
      getState: () => state,
      send,
    }

    const instance = render(React.createElement(App, { key: 'test-bs', vm, theme: THEMES['deep-forest'], ui: 'classic' }))
    await new Promise(resolve => setTimeout(resolve, 20))

    // Type "hello"
    for (const ch of 'hello') {
      instance.stdin.write(ch)
      await new Promise(resolve => setTimeout(resolve, 5))
    }

    // Press \x7f (macOS delete key / terminal backspace) 3 times continuously
    instance.stdin.write('\x7f')
    await new Promise(resolve => setTimeout(resolve, 10))
    instance.stdin.write('\x7f')
    await new Promise(resolve => setTimeout(resolve, 10))
    instance.stdin.write('\x7f')
    await new Promise(resolve => setTimeout(resolve, 10))

    // Enter
    instance.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(send).toHaveBeenCalledWith('he')
    instance.unmount()
  })
})
