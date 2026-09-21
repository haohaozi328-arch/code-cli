/**
 * App rendering contract: committed rows belong to Ink's `<Static>` output and
 * a session change re-keys the root so the static transcript rebuilds. Keyless —
 * the view model is a fixed snapshot.
 */

import React from 'react'
import { render } from 'ink-testing-library'
import { describe, expect, it, vi } from 'vitest'
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
    titleEditor: null,
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

  it('draws a gutter rule in front of user rows so input stands apart from AI output', () => {
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm: viewModel(snapshot({ messages: [userRow('u1', 'ask with gutter')] })),
      theme: THEMES['deep-forest'],
      ui: 'opencode',
    }))
    const frame = (instance.lastFrame() ?? '').replace(/\x1b\[[0-9;]*m/g, '')
    expect(frame).toContain('▎ ask with gutter')
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

describe('App skill picker', () => {
  /** One open `/skills` picker whose pick closes and notifies, so Enter drives the real App reducer. */
  function skillPickerVm(): { vm: ViewModel; pickSkill: ReturnType<typeof vi.fn> } {
    const listeners = new Set<() => void>()
    let state = snapshot({
      choicePicker: {
        kind: 'skill',
        title: COPY.choiceTitleSkills,
        items: [{ label: '/deploy-checks', value: 'deploy-checks', description: 'Deploy checks' }],
      },
    })
    const pickSkill = vi.fn(() => {
      state = snapshot({})
      for (const listener of [...listeners]) listener()
    })
    const base = viewModel(state)
    return {
      vm: {
        ...base,
        subscribe(listener: () => void) {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        getState: () => state,
        pickSkill,
      },
      pickSkill,
    }
  }

  it('stages the picked `/name ` in the composer instead of sending, so guidance follows in the same draft', async () => {
    const { vm, pickSkill } = skillPickerVm()
    const instance = render(React.createElement(App, {
      key: 's-1',
      vm,
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    // Ink's useInput attaches in an effect; write keys only after it mounts.
    await new Promise(resolve => setTimeout(resolve, 10))
    instance.stdin.write('\r')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(pickSkill).toHaveBeenCalledWith('deploy-checks')
    // The staged token sits at the prompt (the terminal trims the trailing space it ends with).
    expect(instance.lastFrame() ?? '').toContain('❯ /deploy-checks')
    instance.unmount()
  })

  it('renders one-line `/name` rows: a padded name column, a gap, then the simple description', async () => {
    const { vm } = skillPickerVm()
    const instance = render(React.createElement(App, {
      key: 's-2',
      vm,
      theme: THEMES['deep-forest'],
      ui: 'classic',
    }))
    await new Promise(resolve => setTimeout(resolve, 10))
    const frame = (instance.lastFrame() ?? '').replace(/\x1b\[[0-9;]*m/g, '')
    const row = frame.split('\n').find(line => line.includes('/deploy-checks'))
    expect(row).toBeDefined()
    // The description shares the row (never wraps to a second line)…
    expect(row).toContain('Deploy checks')
    expect(frame.split('\n').filter(line => line.includes('Deploy checks'))).toHaveLength(1)
    // …and the name column keeps at least a two-column gap before it.
    expect(row).toMatch(/\/deploy-checks {2,}/)
    instance.unmount()
  })

  it('Esc closes the picker and hands the keyboard back to the composer', async () => {
    const listeners = new Set<() => void>()
    let state = snapshot({
      choicePicker: {
        kind: 'skill',
        title: COPY.choiceTitleSkills,
        items: [{ label: '/deploy-checks', value: 'deploy-checks', description: 'Deploy checks' }],
      },
    })
    const closeChoicePicker = vi.fn(() => {
      state = snapshot({})
      for (const listener of [...listeners]) listener()
    })
    const base = viewModel(state)
    const vm: ViewModel = {
      ...base,
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      getState: () => state,
      closeChoicePicker,
    }
    const instance = render(React.createElement(App, { key: 's-3', vm, theme: THEMES['deep-forest'], ui: 'classic' }))
    await new Promise(resolve => setTimeout(resolve, 10))
    instance.stdin.write('\x1b')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(closeChoicePicker).toHaveBeenCalledTimes(1)
    // The picker frame is gone and plain typing reaches the composer again.
    expect(instance.lastFrame() ?? '').not.toContain(COPY.choiceTitleSkills)
    instance.stdin.write('a')
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(instance.lastFrame() ?? '').toContain('❯ a')
    instance.unmount()
  })

  it('narrows the rows as you type and Backspace restores them, with a footer echo', async () => {
    const listeners = new Set<() => void>()
    const state = snapshot({
      choicePicker: {
        kind: 'skill',
        title: COPY.choiceTitleSkills,
        items: [
          { label: '/deploy-checks', value: 'deploy-checks', description: 'Deploy checks' },
          { label: '/lint-docs', value: 'lint-docs', description: 'Lint docs' },
        ],
      },
    })
    const base = viewModel(state)
    const vm: ViewModel = {
      ...base,
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      getState: () => state,
    }
    const instance = render(React.createElement(App, { key: 's-4', vm, theme: THEMES['deep-forest'], ui: 'classic' }))
    await new Promise(resolve => setTimeout(resolve, 10))
    instance.stdin.write('dep')
    await new Promise(resolve => setTimeout(resolve, 10))
    const strip = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, '')
    let frame = strip(instance.lastFrame() ?? '')
    expect(frame).toContain('/deploy-checks')
    expect(frame).not.toContain('/lint-docs')
    expect(frame).toContain(`${COPY.choiceFilterPrefix}dep`)
    // Backspace over the whole query restores every row.
    instance.stdin.write('\x7f')
    instance.stdin.write('\x7f')
    instance.stdin.write('\x7f')
    await new Promise(resolve => setTimeout(resolve, 10))
    frame = strip(instance.lastFrame() ?? '')
    expect(frame).toContain('/lint-docs')
    instance.unmount()
  })
})
