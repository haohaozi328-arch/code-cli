/**
 * ViewModel: durable-log replay, live assistant-stream paint + settlement
 * rebuild, injected-context collapse, command routing, flush-after-idle, and
 * exit/cancel/dispose semantics. All keyless: the agent is scripted, sessions
 * come from the real SessionStore.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent, UserMessage } from '@deepseek-ai/dsh-session'
import { LlmAttemptId, ToolCallId, createAssistantMessage, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ToolResultMessage } from '@deepseek-ai/dsh-llm'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { CompactionId } from '@deepseek-ai/dsh-compaction'
import type { TokenMeter } from '@deepseek-ai/dsh-token-meter'
import type { Agent, AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { createViewModel, createApprovalBus } from '../src/ui/state.ts'
import type { ViewModel } from '../src/ui/model.ts'

/** Scripted follow-up behavior: receives the sent message after send(). */
interface Script {
  before?(session: Session): void
  afterPrompt?(session: Session): void
}

const frameStates = new WeakMap<Agent, { attemptId: ReturnType<typeof LlmAttemptId>; revision: number; index: number }>()

function startFrames(agent: Agent, turn = 1): void {
  const state = { attemptId: LlmAttemptId(`${agent.id}:test`), revision: 1, index: 0 }
  frameStates.set(agent, state)
  agent.ctx.emit('agent/assistant-stream', {
    agent,
    frame: { type: 'start', attemptId: state.attemptId, revision: state.revision, turn, step: 1 },
  })
}

function emitChunk(agent: Agent, chunk: StreamChunk, time = Date.now()): void {
  const state = frameStates.get(agent)
  if (state === undefined) throw new Error('test Assistant frames have not started')
  const frame: AssistantStreamFrame = {
    type: 'chunk', attemptId: state.attemptId, revision: ++state.revision,
    index: state.index++, time, chunk,
  }
  agent.ctx.emit('agent/assistant-stream', { agent, frame })
}

function endAttempt(agent: Agent, outcome: Extract<AssistantStreamFrame, { type: 'end' }>['outcome']): void {
  const state = frameStates.get(agent)
  if (state === undefined) throw new Error('test Assistant frames have not started')
  agent.ctx.emit('agent/assistant-stream', {
    agent,
    frame: {
      type: 'end', attemptId: state.attemptId, revision: state.revision,
      index: state.index, outcome,
    },
  })
}

function assistantText(session: Session, turn: number, text: string): void {
  session.append('assistant/message', {
    stream: [], turn, step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text }],
      source: { provider: 'test-provider', model: 'test-model' },
    }),
  }, { surfaceOp: 'append' })
}

function appendTurn(
  session: Session,
  turn: number,
  message: UserMessage,
  text: string | undefined,
): void {
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step: 1 })
  session.append('user/message', message, { surfaceOp: 'append' })
  if (text !== undefined) assistantText(session, turn, text)
  session.append('step/end', { turn, step: 1 })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

interface BenchResult {
  ctx: Context
  agent: Agent
  vm: ViewModel
  flush: ReturnType<typeof vi.fn>
}

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
})

function register(vm: ViewModel): void {
  disposers.push(() => { vm.dispose() })
}

/** One scripted agent + real session store + view model. */
async function bench(
  script: Script = {},
  host: { requestScreenClear?: () => void; tokenMeter?: TokenMeter } = {},
): Promise<BenchResult> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  if (host.tokenMeter !== undefined) ctx.provide('tokenMeter', host.tokenMeter)
  const session = ctx.sessions.create(SessionId(`vm-${Math.random().toString(36).slice(2)}`))
  let resolveIdle: () => void = () => {}
  let idleSettled = false
  const idle = new Promise<void>((resolve) => { resolveIdle = resolve })
  const flush = vi.fn(async () => {})
  const agent = {
    id: session.id,
    options: { provider: 'test-provider', model: 'test-model' },
    session,
    ctx,
    status: 'idle',
    cancel: vi.fn(),
    followup: () => {
      script.afterPrompt?.(session)
      if (!idleSettled) {
        idleSettled = true
        queueMicrotask(resolveIdle)
      }
    },
    whenIdle: () => idle,
  } as unknown as Agent
  script.before?.(session)
  const vm = createViewModel({
    ctx,
    agent,
    session,
    sessionLabel: 'vm-test · work',
    catalog: [{ sessionId: 'other-session', title: 'Other', cwd: null, createdAt: 1, updatedAt: 1, blank: false, parentSession: null }],
    approvalBus: createApprovalBus(),
    flush,
    ...host,
  })
  register(vm)
  return { ctx, agent, vm, flush }
}

function userMessage(text: string, source: UserMessage['source'] = { kind: 'user' }): UserMessage {
  return createUserMessage({ content: [{ type: 'text', text }], source })
}

/** Let the 16 ms streaming notify window elapse so getState() rebuilds. */
async function flushStream(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 25))
}

describe('createViewModel replay', () => {
  it('projects user/assistant turns; collapses plugin-injected rows; skips empty content', async () => {
    const injected = userMessage('AGENTS.md context dump', { kind: 'plugin', plugin: 'agent-instructions' })
    const direct = userMessage('direct ask')
    const { vm } = await bench({
      before(session) {
        // Turn 0: plugin injection (collapsed) + empty assistant row (skipped).
        session.append('turn/start', { turn: 0 })
        session.append('step/start', { turn: 0, step: 1 })
        session.append('user/message', injected, { surfaceOp: 'append' })
        session.append('assistant/message', {
          stream: [], turn: 0, step: 1,
          message: createAssistantMessage({ content: [], source: { provider: 'p', model: 'm' } }),
        }, { surfaceOp: 'append' })
        session.append('step/end', { turn: 0, step: 1 })
        session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
        // Turn 1: a real exchange.
        appendTurn(session, 1, direct, 'first reply')
      },
    })
    const rows = vm.getState().messages
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      role: 'user', system: true, status: 'done',
      text: '〔injected〕 AGENTS.md context dump',
    })
    expect(rows[1]).toMatchObject({ role: 'user', text: 'direct ask' })
    expect(rows[2]).toMatchObject({ role: 'assistant', text: 'first reply' })
  })

  it('keeps real user text verbatim and projects committed assistant rows with reasoning', async () => {
    const direct = userMessage('ask')
    const { vm } = await bench({
      before(session) {
        session.append('turn/start', { turn: 0 })
        session.append('step/start', { turn: 0, step: 1 })
        session.append('user/message', direct, { surfaceOp: 'append' })
        session.append('assistant/message', {
          stream: [], turn: 0, step: 1,
          message: createAssistantMessage({
            content: [
              { type: 'reasoning', text: 'thinking here' },
              { type: 'text', text: 'visible text' },
            ],
            source: { provider: 'test-provider', model: 'test-model' },
          }),
        }, { surfaceOp: 'append' })
        session.append('step/end', { turn: 0, step: 1 })
        session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
      },
    })
    expect(vm.getState().messages).toHaveLength(2)
    expect(vm.getState().messages[1]).toMatchObject({
      role: 'assistant', status: 'done', reasoning: 'thinking here', text: 'visible text',
    })
  })
})

describe('createViewModel live stream', () => {
  it('paints text deltas and rebuilds the row from the committed log event', async () => {
    const { agent, vm } = await bench({
      afterPrompt(session) {
        session.append('turn/start', { turn: 1 })
        session.append('step/start', { turn: 1, step: 1 })
        startFrames(agent)
        emitChunk(agent, { type: 'text-delta', index: 0, text: 'hel' })
        emitChunk(agent, { type: 'text-delta', index: 0, text: 'lo' })
      },
    })
    vm.send('ask')
    const streaming = vm.getState().messages.at(-1)
    expect(streaming).toMatchObject({ role: 'assistant', status: 'streaming', text: 'hello' })

    // Settle durably at the next seq, then commit.
    const turn = 1
    const committedEvent = agent.session.append('assistant/message', {
      stream: [], turn, step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'hello (canonical)' }],
        source: { provider: 'test-provider', model: 'test-model' },
      }),
    }, { surfaceOp: 'append' })
    agent.session.append('step/end', { turn, step: 1 })
    agent.session.append('turn/end', { turn, reason: { kind: 'completed' } })
    endAttempt(agent, { kind: 'committed', eventType: 'assistant/message', seq: committedEvent.seq })
    expect(vm.getState().messages.at(-1)).toMatchObject({
      role: 'assistant', status: 'done', text: 'hello (canonical)',
    })
  })

  it('accumulates reasoning deltas and ignores empty deltas', async () => {
    const { agent, vm } = await bench({ afterPrompt() { startFrames(agent) } })
    vm.send('ask')
    emitChunk(agent, { type: 'reasoning-delta', index: 0, text: '' })
    emitChunk(agent, { type: 'text-delta', index: 0, text: '' })
    emitChunk(agent, { type: 'reasoning-delta', index: 0, text: 'step ' })
    emitChunk(agent, { type: 'reasoning-delta', index: 0, text: 'one' })
    expect(vm.getState().messages.at(-1)).toMatchObject({ reasoning: 'step one', text: '' })
  })

  it('estimates throughput from streamed characters, then takes the provider sample', async () => {
    const { agent, vm } = await bench({ afterPrompt() { startFrames(agent) } })
    vm.send('ask')
    // The first chunk only anchors the observation window.
    emitChunk(agent, { type: 'text-delta', index: 0, text: 'x'.repeat(400) }, 1_000)
    await flushStream()
    expect(vm.getState().tokenRate).toBeNull()
    // 800 characters ≈ 200 tokens over the 2 s window.
    emitChunk(agent, { type: 'text-delta', index: 0, text: 'x'.repeat(400) }, 3_000)
    await flushStream()
    expect(vm.getState().tokenRate).toBeCloseTo(100, 5)
    // The provider's own output count replaces the estimate on the same window.
    emitChunk(agent, { type: 'usage', usage: { inputTokens: 10, outputTokens: 500 } }, 3_000)
    expect(vm.getState().tokenRate).toBeCloseTo(250, 5)
  })

  it('drops the paint when an attempt is abandoned or commits no surface message', async () => {
    const { ctx, agent, vm } = await bench({ afterPrompt() { startFrames(agent) } })
    vm.send('ask')
    expect(vm.getState().messages.at(-1)?.status).toBe('streaming')
    endAttempt(agent, { kind: 'abandoned' })
    expect(vm.getState().messages.at(-1)).toMatchObject({ role: 'user' })
    ctx.emit('agent/status', { agent, status: 'idle' })

    vm.send('ask again')
    expect(vm.getState().messages.at(-1)?.status).toBe('streaming')
    endAttempt(agent, { kind: 'committed', eventType: 'assistant/attempt', seq: SessionSeq(agent.session.seq) })
    expect(vm.getState().messages.at(-1)).toMatchObject({ role: 'user' })
  })

  it('ignores frames from other agents', async () => {
    const other = new Context()
    const { agent, vm } = await bench({ afterPrompt() { startFrames(agent) } })
    vm.send('ask')
    const stranger = { id: 'someone-else', ctx: other } as unknown as Agent
    other.emit('agent/assistant-stream', { agent: stranger, frame: { type: 'start', attemptId: LlmAttemptId('x'), revision: 1, turn: 9, step: 9 } })
    emitChunk(agent, { type: 'text-delta', index: 0, text: 'ours' })
    expect(vm.getState().messages.at(-1)).toMatchObject({ text: 'ours' })
  })
})

describe('createViewModel context occupancy', () => {
  it('reads occupancy from the token meter and drops it when compaction shrinks the surface', async () => {
    let used = 51_200
    const meter = { measure: () => ({ totalTokens: used }) } as unknown as TokenMeter
    const { ctx, agent, vm } = await bench(
      {
        before(session) {
          session.append('request/context', { provider: 'p', model: 'm', contextWindow: 64_000 })
        },
      },
      { tokenMeter: meter },
    )
    expect(vm.getState().contextOccupancy).toEqual({
      percent: 80, usedTokens: 51_200, contextWindow: 64_000,
    })

    // A compaction shadows most of the surface; the meter reprices it, and the
    // ring must follow the committed event without waiting for a request.
    used = 12_800
    ctx.emit('session/event', agent.session, {
      type: 'compaction/end',
      seq: SessionSeq(agent.session.seq),
      time: Date.now(),
      data: { compactionId: CompactionId('compact-1'), turn: null },
    })
    expect(vm.getState().contextOccupancy).toEqual({
      percent: 20, usedTokens: 12_800, contextWindow: 64_000,
    })
  })

  it('hides the ring while the measured tokens or the window is unknown', async () => {
    const meter = { measure: () => ({ totalTokens: 1_000 }) } as unknown as TokenMeter
    const { vm } = await bench({}, { tokenMeter: meter })
    expect(vm.getState().contextOccupancy).toBeNull()
  })
})

describe('createViewModel session events', () => {
  it('appends plugin-originated messages not produced by send(), exactly once per id', async () => {
    const { ctx, agent, vm } = await bench()
    const injected = userMessage('context injected later', { kind: 'plugin', plugin: 'skills' })
    const event: SessionEvent<'user/message'> = {
      type: 'user/message', seq: SessionSeq(1), time: Date.now(), data: injected,
    }
    ctx.emit('session/event', agent.session, event)
    ctx.emit('session/event', agent.session, event)
    expect(vm.getState().messages).toHaveLength(1)
    expect(vm.getState().messages[0]).toMatchObject({
      role: 'user', system: true, text: '〔injected〕 context injected later',
    })
  })

  it('ignores session events from other sessions', async () => {
    const other = new Context()
    await other.plugin(SessionStore)
    const otherSession = other.sessions.create(SessionId('other'))
    const { vm } = await bench()
    const noise = userMessage('noise')
    const event: SessionEvent<'user/message'> = {
      type: 'user/message', seq: SessionSeq(1), time: Date.now(), data: noise,
    }
    other.emit('session/event', otherSession, event)
    expect(vm.getState().messages).toHaveLength(0)
  })
})

describe('createViewModel actions', () => {
  it('send() appends the user row optimistically, wakes the driver, and flushes after idle', async () => {
    const { agent, vm, flush } = await bench()
    const followup = vi.spyOn(agent, 'followup')
    vm.send('hi')
    expect(followup).toHaveBeenCalledTimes(1)
    expect(vm.getState().messages.at(-1)).toMatchObject({ role: 'user', text: 'hi', status: 'done' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('ignores blank input and queues plain text while running', async () => {
    const { agent, vm } = await bench()
    const followup = vi.spyOn(agent, 'followup')
    vm.send('   ')
    expect(followup).not.toHaveBeenCalled()
    const { ctx, agent: runAgent, vm: runVm } = await bench()
    ctx.emit('agent/status', { agent: runAgent, status: 'running' })
    runVm.send('queued')
    // Queued for the next turn instead of bounced with an error.
    expect(runVm.getState().error).toBeNull()
    expect(runVm.getState().queued).toEqual(['queued'])
    expect(vm.getState().messages).toHaveLength(0)
    expect(runVm.getState().messages.filter(m => m.role === 'user')).toHaveLength(0)
    // The idle edge drains the queue FIFO into a real turn.
    ctx.emit('agent/status', { agent: runAgent, status: 'idle' })
    expect(runVm.getState().queued).toEqual([])
    expect(runVm.getState().messages.filter(m => m.role === 'user')).toHaveLength(1)
  })

  it('routes /help, /clear and /quit locally; unknown commands get a hint, not the model', async () => {
    const { agent, vm } = await bench()
    const followup = vi.spyOn(agent, 'followup')
    vm.send('/help')
    expect(vm.getState().messages.at(-1)?.text).toContain('dsh cli')
    vm.send('/clear')
    expect(vm.getState().messages).toHaveLength(0)
    vm.send('/custom')
    expect(followup).not.toHaveBeenCalled()
    expect(vm.getState().error).toContain('unknown command: /custom')
  })

  it('/quit and /exit resolve done with quit exactly once', async () => {
    const { vm } = await bench()
    const { vm: vm2 } = await bench()
    vm.send('/quit')
    await expect(vm.done).resolves.toEqual({ type: 'quit' })
    vm.quit()
    vm.quit()
    await expect(vm.done).resolves.toEqual({ type: 'quit' })
    vm2.send('/exit')
    await expect(vm2.done).resolves.toEqual({ type: 'quit' })
  })

  it('routes /new, /fork and /sessions; switch resolves done with the picked id', async () => {
    const { vm } = await bench()
    const { vm: vm2 } = await bench()
    const { vm: vm3 } = await bench()
    // `/new` on an untouched session resets the view in place.
    vm.send('/new')
    expect(vm.getState().messages).toHaveLength(0)
    // No lifecycle request: the session stays current.
    await expect(Promise.race([vm.done, Promise.resolve('pending')])).resolves.toBe('pending')
    vm2.send('/fork')
    await expect(vm2.done).resolves.toEqual({ type: 'fork' })
    vm3.openPicker()
    expect(vm3.getState().pickerOpen).toBe(true)
    expect(vm3.getState().pickerItems).toHaveLength(1)
    vm3.requestSwitch('other-session')
    expect(vm3.getState().pickerOpen).toBe(false)
    await expect(vm3.done).resolves.toEqual({ type: 'switch', sessionId: 'other-session' })
  })

  it('reuses an untouched session for /new instead of persisting an empty one', async () => {
    const cleared: string[] = []
    const { vm } = await bench({}, { requestScreenClear: () => { cleared.push('clear') } })
    vm.send('/new')
    expect(vm.getState().transcriptEpoch).toBe(1)
    expect(cleared).toEqual(['clear'])
    expect(vm.getState().messages).toHaveLength(0)
    // No lifecycle request leaves the view model: the session stays current.
    await expect(Promise.race([vm.done, Promise.resolve('pending')])).resolves.toBe('pending')
  })

  it('opens and closes the picker without acting; labels ride the snapshot', async () => {
    const { vm } = await bench()
    expect(vm.getState().sessionLabel).toBe('vm-test · work')
    expect(vm.getState().pickerOpen).toBe(false)
    vm.send('/sessions')
    expect(vm.getState().pickerOpen).toBe(true)
    vm.closePicker()
    expect(vm.getState().pickerOpen).toBe(false)
    // closing never resolves done
    await expect(Promise.race([vm.done, Promise.resolve('pending')])).resolves.toBe('pending')
  })

  it('stop() cancels the running turn with the user cause', async () => {
    const { ctx, agent, vm } = await bench()
    ctx.emit('agent/status', { agent, status: 'running' })
    vm.stop()
    // oxlint-disable-next-line typescript/unbound-method -- vi.fn captured through the Agent cast
    expect(agent.cancel).toHaveBeenCalledWith({ kind: 'user' })
    // oxlint-disable-next-line typescript/unbound-method -- vi.fn captured through the Agent cast
    expect(agent.cancel).toHaveBeenCalledTimes(1)
  })

  it('stop() drops queued prompts along with the running turn', async () => {
    const { ctx, agent, vm } = await bench()
    ctx.emit('agent/status', { agent, status: 'running' })
    vm.send('later')
    expect(vm.getState().queued).toEqual(['later'])
    vm.stop()
    expect(vm.getState().queued).toEqual([])
    // oxlint-disable-next-line typescript/unbound-method -- vi.fn captured through the Agent cast
    expect(agent.cancel).toHaveBeenCalledWith({ kind: 'user' })
  })

  it('surfaces agent status and errors; getState snapshots are reference-stable', async () => {
    const { ctx, agent, vm } = await bench()
    const first = vm.getState()
    expect(vm.getState()).toBe(first)
    ctx.emit('agent/status', { agent, status: 'running' })
    expect(vm.getState().running).toBe(true)
    ctx.emit('agent/error', { agent, turn: 1, step: 1, error: new Error('boom') })
    expect(vm.getState().error).toBe('boom')
    ctx.emit('agent/status', { agent, status: 'idle' })
    expect(vm.getState().running).toBe(false)
    expect(vm.getState().error).toBe('boom')
  })

  it('reports flush failures through the error banner', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('vm-flush-fail'))
    let resolveIdle: () => void = () => {}
    let idleSettled = false
    const idle = new Promise<void>((resolve) => { resolveIdle = resolve })
    const failing = vi.fn(async () => { throw new Error('disk full') })
    const agent = {
      id: session.id, options: { provider: 'p', model: 'm' }, session, ctx,
      status: 'idle', cancel: () => {}, followup: () => {
        if (!idleSettled) { idleSettled = true; queueMicrotask(resolveIdle) }
      },
      whenIdle: () => idle,
    } as unknown as Agent
    const vm = createViewModel({
      ctx, agent, session,
      sessionLabel: 'flush-fail · work',
      catalog: [],
      approvalBus: createApprovalBus(),
      flush: failing,
    })
    register(vm)
    vm.send('go')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(vm.getState().error).toBe('disk full')
  })
})

describe('createViewModel tools', () => {
  function toolResult(callId: string, text: string, isError: boolean): ToolResultMessage {
    return createToolResultMessage({
      callId: ToolCallId(callId),
      content: [{ type: 'text', text }],
      isError,
    })
  }

  it('replays a tool call into a running card and settles it from the result', async () => {
    const { vm } = await bench({
      before(session) {
        session.append('turn/start', { turn: 1 })
        session.append('step/start', { turn: 1, step: 1 })
        session.append('tool/call', { turn: 1, step: 1, callId: ToolCallId('c1'), name: 'bash', arguments: JSON.stringify({ command: 'ls' }) })
        session.append('tool/result', {
          turn: 1, step: 1,
          message: toolResult('c1', 'file.txt', false),
        }, { surfaceOp: 'append' })
        session.append('step/end', { turn: 1, step: 1 })
        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      },
    })
    const row = vm.getState().messages.find(m => m.role === 'tool')
    expect(row).toMatchObject({
      toolName: 'bash', argsSummary: 'command: ls',
      toolStatus: 'done', toolResult: 'file.txt', status: 'done',
    })
  })

  it('paints live tool calls and settles error results', async () => {
    const { ctx, agent, vm } = await bench()
    ctx.emit('session/event', agent.session, {
      type: 'tool/call', seq: SessionSeq(1), time: Date.now(),
      data: { turn: 1, step: 1, callId: ToolCallId('c9'), name: 'str_replace_editor', arguments: JSON.stringify({ path: 'a.ts' }) },
    })
    expect(vm.getState().messages.at(-1)).toMatchObject({ role: 'tool', toolStatus: 'running', argsSummary: 'path: a.ts' })
    ctx.emit('session/event', agent.session, {
      type: 'tool/result', seq: SessionSeq(2), time: Date.now(),
      data: {
        turn: 1, step: 1,
        message: toolResult('c9', 'boom', true),
      },
    })
    expect(vm.getState().messages.at(-1)).toMatchObject({ toolStatus: 'error', toolResult: 'boom' })
  })

  it('accumulates token usage from stream chunks into the snapshot', async () => {
    const { agent, vm } = await bench({ afterPrompt() { startFrames(agent) } })
    vm.send('ask')
    emitChunk(agent, { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, reasoningTokens: 3 } })
    emitChunk(agent, { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } })
    expect(vm.getState().tokens).toEqual({ input: 12, output: 6, reasoning: 3 })
  })

  it('seeds token counts from durable assistant messages on replay', async () => {
    const { vm } = await bench({
      before(session) {
        session.append('turn/start', { turn: 0 })
        session.append('step/start', { turn: 0, step: 1 })
        session.append('user/message', userMessage('q'), { surfaceOp: 'append' })
        session.append('assistant/message', {
          stream: [], turn: 0, step: 1,
          message: createAssistantMessage({ content: [{ type: 'text', text: 'a' }], source: { provider: 'p', model: 'm' } }),
          usage: { inputTokens: 40, outputTokens: 7, reasoningTokens: 4 },
        }, { surfaceOp: 'append' })
        session.append('step/end', { turn: 0, step: 1 })
        session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
      },
    })
    expect(vm.getState().tokens).toEqual({ input: 40, output: 7, reasoning: 4 })
  })

  it('shows a live tool-call preview on the streaming row', async () => {
    const { agent, vm } = await bench({ afterPrompt() { startFrames(agent) } })
    vm.send('ask')
    emitChunk(agent, { type: 'tool-call-delta', index: 0, id: ToolCallId('t1'), name: 'bash', argumentsDelta: '{"command":"ls' })
    expect(vm.getState().messages.at(-1)?.toolPreview).toContain('bash')
    // Durable tool/call lands later as its own card; preview is transitional.
  })

  it('keeps every durable row: the static transcript is append-only', async () => {
    const { ctx, agent, vm } = await bench()
    for (let i = 0; i < 605; i++) {
      const injected = userMessage(`noise ${i}`, { kind: 'plugin', plugin: 'x' })
      ctx.emit('session/event', agent.session, { type: 'user/message', seq: SessionSeq(i + 1), time: Date.now(), data: injected })
    }
    const rows = vm.getState().messages
    expect(rows).toHaveLength(605)
    expect(rows[0]).toMatchObject({ role: 'user', system: true, text: '〔injected〕 noise 0' })
    expect(rows[604]).toMatchObject({ text: '〔injected〕 noise 604' })
  })

  it('clears the transcript and bumps the epoch so the static list rebuilds', async () => {
    const cleared: string[] = []
    const { vm } = await bench(
      { before(session) { appendTurn(session, 1, userMessage('hi'), 'hello') } },
      { requestScreenClear: () => { cleared.push('clear') } },
    )
    expect(vm.getState().messages.length).toBeGreaterThan(0)
    expect(vm.getState().transcriptEpoch).toBe(0)
    vm.send('/clear')
    expect(cleared).toEqual(['clear'])
    expect(vm.getState().transcriptEpoch).toBe(1)
    expect(vm.getState().messages).toHaveLength(0)
  })
})

describe('createViewModel approval', () => {
  it('answers the pending question and resolves the requester', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    const session = ctx.sessions.create(SessionId('vm-approval'))
    const bus = createApprovalBus()
    const agent = {
      id: session.id, options: { provider: 'p', model: 'm' }, session, ctx,
      status: 'idle', cancel: () => {}, followup: () => {},
      whenIdle: () => Promise.resolve(),
    } as unknown as Agent
    const vm = createViewModel({
      ctx, agent, session, sessionLabel: 'approval · work', catalog: [], approvalBus: bus,
    })
    register(vm)
    const asked = bus.request({ toolName: 'bash' })
    expect(vm.getState().pendingApproval).toMatchObject({ toolName: 'bash' })
    vm.resolveApproval('rejected')
    await expect(asked).resolves.toBe('rejected')
    expect(vm.getState().pendingApproval).toBeNull()
    // A second answer is a no-op.
    vm.resolveApproval('allowed-once')
  })

  it('rejects a second overlapping request instead of stranding the first', async () => {
    const bus = createApprovalBus()
    const first = bus.request({ toolName: 'bash' })
    expect(() => bus.request({ toolName: 'fs' })).toThrow(/overlapping approval/)
    bus.answer('cancelled')
    await expect(first).resolves.toBe('cancelled')
  })

  it('opens the model choice picker on /model and validates a picked spec', async () => {
    const { vm } = await bench()
    vm.send('/model')
    // No llm service in the bench: the picker falls back to one known model.
    // The catalog lookup is async, so give the microtask chain a tick.
    await new Promise(resolve => setTimeout(resolve, 0))
    const picker = vm.getState().choicePicker
    expect(picker).not.toBeNull()
    expect(picker?.title).toBe('model')
    expect(picker?.items.length ?? 0).toBeGreaterThan(0)
    vm.closeChoicePicker()
    expect(vm.getState().choicePicker).toBeNull()
    vm.send('/model')
    await new Promise(resolve => setTimeout(resolve, 0))
    vm.pickModel('bad-spec')
    expect(vm.getState().error).toContain('provider/model')
    vm.pickModel('deepseek-official/other-v2')
    await expect(vm.done).resolves.toEqual({ type: 'model-switch', spec: 'deepseek-official/other-v2' })
  })

  it('routes registry commands through ctx.commands: success text lands as a system row, errors as the banner', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(CommandRuntime)
    disposers.push(() => { void ctx.fiber.dispose() })
    const session = ctx.sessions.create(SessionId('vm-commands'))
    const agent = {
      id: session.id, options: { provider: 'p', model: 'm' }, session, ctx,
      status: 'idle', cancel: () => {}, followup: () => {},
      whenIdle: () => Promise.resolve(),
    } as unknown as Agent
    const vm = createViewModel({
      ctx, agent, session, sessionLabel: 'commands', catalog: [], approvalBus: createApprovalBus(),
    })
    register(vm)
    ctx.commands.register({
      name: 'demo-echo',
      description: 'test command',
      handler: invocation => ({ kind: 'success', text: `echo:${invocation.rawInput.trim()}` }),
    })
    ctx.commands.register({
      name: 'demo-fail',
      description: 'failing test command',
      handler: () => ({ kind: 'error', text: 'demo exploded' }),
    })
    vm.send('/demo-echo hi there')
    await new Promise(resolve => setTimeout(resolve, 0))
    // Registry output is a normal visible row, not injected context.
    expect(vm.getState().messages.at(-1)).toMatchObject({
      role: 'assistant', text: 'echo:hi there',
    })
    expect(vm.getState().messages.at(-1)?.system).toBeUndefined()
    vm.send('/demo-fail')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(vm.getState().error).toBe('demo exploded')
    vm.send('/no-such-registry-command')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(vm.getState().error).toContain('unknown command')
  })

  it('rejects a malformed /perm and answers never', async () => {
    const { vm } = await bench()
    vm.send('/perm bogus')
    expect(vm.getState().error).toContain('usage: /perm')
  })

  it('dispatches commands while running: /new is not blocked by the running guard', async () => {
    const { ctx, agent, vm } = await bench()
    vm.send('first prompt')
    ctx.emit('agent/status', { agent, status: 'running' })
    vm.send('normal message')
    expect(vm.getState().queued).toEqual(['normal message'])
    // /new must still work mid-task; it resets the view without resolving done.
    vm.send(' /New  ') // leading whitespace + case tolerated
    expect(vm.getState().messages).toHaveLength(0)
    await expect(Promise.race([vm.done, Promise.resolve('pending')])).resolves.toBe('pending')
  })

  it('accepts /model with an inline spec and case/whitespace tolerance', async () => {
    const { vm } = await bench()
    vm.send('/MODEL deepseek-official/other-v3')
    await expect(vm.done).resolves.toEqual({ type: 'model-switch', spec: 'deepseek-official/other-v3' })
    const { vm: vm2 } = await bench()
    vm2.send('/model')
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(vm2.getState().choicePicker?.title).toBe('model')
  })

  it('opens the approval-policy picker on a bare /perm and applies the picked policy', async () => {
    const { vm } = await bench()
    vm.send('/perm')
    expect(vm.getState().choicePicker?.title).toBe('approval policy')
    // No approval service in the bench: picking must not throw and closes.
    vm.pickPolicy('ask')
    expect(vm.getState().choicePicker).toBeNull()
    vm.closeChoicePicker()
    expect(vm.getState().choicePicker).toBeNull()
  })

  it('treats a command with unknown arguments as unknown, not as model text', async () => {
    const { agent, vm } = await bench()
    const followup = vi.spyOn(agent, 'followup')
    vm.send('real prompt')
    vm.send('/new extra-arg')
    // Name resolution takes the first word only, so extra args still mean /new.
    // /new resets the view in place; it never resolves done.
    await expect(Promise.race([vm.done, Promise.resolve('pending')])).resolves.toBe('pending')
    expect(followup).toHaveBeenCalledTimes(1)
  })
})
