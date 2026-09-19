/**
 * App rendering contract: committed rows belong to Ink's `<Static>` output and
 * a session change re-keys the root so the static transcript rebuilds. Keyless —
 * the view model is a fixed snapshot.
 */

import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { App } from '../src/ui/index.ts'
import { COPY } from '../src/ui/copy.ts'
import { THEMES } from '../src/ui/theme.ts'
import type { ExitRequest, UiMessage, UiState, ViewModel } from '../src/ui/model.ts'

/** One snapshot with every field defaulted, so a test states only what it exercises. */
function snapshot(overrides: Partial<UiState>): UiState {
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
    todos: null,
    queued: [],
    boardOpen: false,
    turnTimeline: [],
    choicePicker: null,
    connectWizard: null,
    transcriptEpoch: 0,
    ...overrides,
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

function userRow(key: string, text: string): UiMessage {
  return { key, role: 'user', text, reasoning: '', status: 'done' }
}

describe('App transcript', () => {
  it('writes committed rows and keeps the streaming row live', () => {
    const streaming: UiMessage = { key: 'stream-a', role: 'assistant', text: 'partial answer', reasoning: '', status: 'streaming' }
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ messages: [userRow('u1', 'committed ask'), streaming] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain('committed ask')
    expect(frame).toContain('partial answer')
    expect(frame).toContain(COPY.classicInputPlaceholder)
    instance.unmount()
  })

  it('rebuilds the static transcript when the session key changes', () => {
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ sessionId: SessionId('s-1'), messages: [userRow('u1', 'first session ask')] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    instance.rerender(React.createElement(App, {
      key: 's-2',
      vm: viewModel(snapshot({ sessionId: SessionId('s-2'), sessionLabel: 'second', messages: [userRow('u2', 'second session ask')] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain('second session ask')
    expect(frame).toContain('second')
    instance.unmount()
  })

  it('renders the idle status copy and the hidden injected rows on demand', () => {
    const injected: UiMessage = { key: 'i1', role: 'user', text: '〔injected〕 AGENTS.md', reasoning: '', status: 'done', system: true }
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ messages: [injected] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain(COPY.statusIdle)
    // Injected context stays out of the transcript even though it is in the log.
    expect(frame).not.toContain('AGENTS.md')
    instance.unmount()
  })

  it('replaces the command-hint line with throughput, usage, and the context ring', () => {
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({
        tokens: { input: 1_000, output: 2_345, reasoning: 0 },
        tokenRate: 42.5,
        contextOccupancy: { percent: 45, usedTokens: 57_600, contextWindow: 128_000 },
      })),
      theme: THEMES['deep-forest'],
      ui: 'opencode',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain('token 42.5/s')
    expect(frame).toContain(`${COPY.tokenUsageLabel} 3.3K`)
    expect(frame).toContain(`${COPY.contextLabel} ◑ 45%`)
    // The composer's model/permission line is untouched.
    expect(frame).toContain(`${COPY.permissionLabel} ask`)
    expect(frame).not.toContain('/model')
    instance.unmount()
  })

  it('shows a dash and no ring before any measurement exists', () => {
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({})),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain(`token ${COPY.measurementUnavailable}/s`)
    expect(frame).not.toContain(COPY.contextLabel)
    instance.unmount()
  })

  it('docks the task panel above the composer while tasks are open', () => {
    const todos = [
      { content: 'explore the repo', status: 'completed' },
      { content: 'patch the parser', status: 'in_progress' },
      { content: 'run the tests', status: 'pending' },
    ] as const
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ todos: [...todos] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain(COPY.todoTitle)
    expect(frame).toContain('[✓] explore the repo')
    expect(frame).toContain('[•] patch the parser')
    expect(frame).toContain('[ ] run the tests')
    instance.unmount()
  })

  it('hides the task panel once every task is completed', () => {
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ todos: [{ content: 'done deal', status: 'completed' }] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    expect(instance.lastFrame() ?? '').not.toContain(COPY.todoTitle)
    instance.unmount()
  })

  it('notes queued prompts above the composer', () => {
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ queued: ['follow up later'] })),
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    const frame = instance.lastFrame() ?? ''
    expect(frame).toContain(COPY.queuedLabel)
    expect(frame).toContain('follow up later')
    instance.unmount()
  })
})
