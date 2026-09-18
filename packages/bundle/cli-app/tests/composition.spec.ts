/**
 * REAL-composition coverage: cli-app runs on REAL session, approval, commands,
 * tools and persistence services. Only the model adapter and the agent driver
 * are scripted (the headless-bundle test pattern); the approval modal, the
 * /perm policy, registry-command routing and the durable audit trail all flow
 * through real services.
 *
 * Keystrokes are NOT driven through ink-testing-library's stdin: ink 5.2
 * hard-wires process.stdin and ignores the render() stdin option, so ITL's
 * fake stdin never reaches useInput. Tests drive the live view model through
 * CliApp.testHooks.currentVm instead (the same send/resolveApproval surface
 * the key handlers call), and assert on the rendered frames.
 *
 * @module tests/composition.spec
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ReactElement } from 'react'
import { cleanup, render } from 'ink-testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, LlmAttemptId, MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import UserApproval from '@deepseek-ai/dsh-user-approval'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import * as CliApp from '../src/index.ts'
import { CLI_STARTUP_SERVICE } from '../src/startup.ts'
import { COPY } from '../src/ui/copy.ts'
import type { ViewModel } from '../src/ui/model.ts'

/** Scripted model responses consumed one model call at a time. */
class ScriptedAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private readonly script: StreamChunk[][]
  constructor(script: StreamChunk[][]) {
    super()
    this.script = script
  }
  override async *stream(_options: GenerateOptions): AsyncGenerator<StreamChunk> {
    this.requests.push(_options)
    for (const chunk of this.script.shift() ?? []) yield chunk
  }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: 'mock model', context: { contextWindow: 128_000 } }
  }
}

/** One final text answer closing the turn. */
function textResponse(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: text.length } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

/** One assistant turn that calls a tool. */
function toolCallResponse(callId: string, name: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id: ToolCallId(callId), name, argumentsDelta: '{}' },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId(callId), name, arguments: '{}' } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}

/** The `ask`-gated tool the scripted model calls. */
const askTool = defineTool({
  name: 'demo-ask',
  description: 'test tool gated behind approval',
  parameters: {},
  output: {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute() {
    return 'demo-ok'
  },
})

/** One mounted composition plus its ink-testing-library surface. */
interface Composition {
  ctx: Context
  instance: ReturnType<typeof render>
  exited: Promise<number>
  workspace: string
  /** Every live session the scripted driver created, for log assertions. */
  sessions: import('@deepseek-ai/dsh-session').Session[]
  /** Settled exit code box (shared reference); undefined while running. */
  exitCode: { value: number | undefined }
}

const compositions: Composition[] = []
const roots: string[] = []

afterEach(async () => {
  cleanup()
  CliApp.testHooks.currentVm = null
  for (const composition of compositions.splice(0)) {
    await composition.ctx.fiber.dispose()
  }
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function bootComposition(script: StreamChunk[][]): Promise<Composition> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-cli-composition-'))
  roots.push(root)
  const workspace = join(root, 'workspace')

  const ctx = new Context()
  // Real services on the ROOT context (headless-bundle pattern). A Loader
  // include subtree settles its entry fibers after load, which made the
  // agent registry's owner context inactive for later creates; the official
  // boot() keeps one resident root tree, so tests mount services directly.
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(TokenMeter)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'mock' })
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(UserApproval)
  await ctx.plugin(CommandRuntime)

  // The launcher-shaped services the glue requires before its row mounts.
  let exitResolve: (code: number) => void = () => {}
  const exited = new Promise<number>((resolve) => { exitResolve = resolve })
  const exitCode = { value: undefined as number | undefined }
  void exited.then((code) => { exitCode.value = code })
  ctx.provide(CLI_STARTUP_SERVICE, { resumeSessionId: '', cwd: workspace, model: '', theme: 'cream-forest', ui: 'classic' })
  ctx.provide('appExit', (code: number) => { exitResolve(code) })

  // Render slot: mount the real App on the ink-testing-library surface so
  // frame assertions observe real output.
  const instance = {
    rerender: () => {}, unmount: () => {}, cleanup: () => {}, stdin: { write: () => {} },
  } as unknown as ReturnType<typeof render>
  let mounted: ReturnType<typeof render> | undefined
  const originalRender = CliApp.internals.render
  CliApp.internals.render = (element: ReactElement) => {
    mounted = render(element)
    Object.assign(instance, mounted)
    return {
      rerender: (next) => { mounted?.rerender(next) },
      unmount: () => { mounted?.unmount() },
    }
  }
  try {
    // The only protocol mock: the model adapter.
    ctx.llm.registerAdapter(['mock'], new ScriptedAdapter(script))
    ctx.tools.register(askTool)
    ctx.on('tools/pre-execute', async (exec, next) =>
      exec.name === 'demo-ask' ? { kind: 'ask', reason: 'demo gate' } : await next())

    // Scripted agent driver (headless-bundle pattern): the real registries
    // run; only loop creation/driving is scripted so durable tool/approval
    // flows execute through the REAL tool and approval services.
    let scriptIndex = 0
    let busy = false
    const sessions: import('@deepseek-ai/dsh-session').Session[] = []
    const idleWaiters = new Set<() => void>()
    const settled = (): void => { busy = false; for (const wake of [...idleWaiters]) wake(); idleWaiters.clear() }
    const whenIdle = (): Promise<void> => busy
      ? new Promise<void>((resolve) => { idleWaiters.add(resolve) })
      : Promise.resolve()
    const makeAgent = async (ownerCtx: Context, options: {
      sessionId: SessionId
      meta?: { cwd?: string }
      agentOptions?: object
      setup?: (c: Context) => unknown
    }) => {
      const session = ownerCtx.sessions.create(options.sessionId, options.meta === undefined ? undefined : { meta: options.meta })
      sessions.push(session)
      const agent = {} as import('@deepseek-ai/dsh-agent').Agent
      const agentCtx = ownerCtx.extend({ agent })
      const state = {
        attempt: 0, revision: 0, index: 0, lastAssistantSeq: 0,
        emit: (frame: AssistantStreamFrame): void => { agentCtx.emit('agent/assistant-stream', { agent, frame }) },
        appendAssistant(text: string): void {
          const event = session.append('assistant/message', {
            stream: [], turn: 1, step: 1,
            message: { id: MessageId(`m-${Date.now()}-${state.attempt}`), role: 'assistant', content: [{ type: 'text', text }], source: { kind: 'model', provider: 'mock', model: 'mock' } },
          }, { surfaceOp: 'append' })
          state.lastAssistantSeq = event.seq
        },
      }
      const nextScript = (): StreamChunk[] => script[scriptIndex++] ?? []
      const startAttempt = (): void => {
        state.attempt += 1; state.revision = 0; state.index = 0
        state.emit({ type: 'start', attemptId: LlmAttemptId(`a-${state.attempt}`), revision: 1, turn: 1, step: 1 })
      }
      const play = (chunk: StreamChunk): void => {
        state.revision += 1
        state.emit({ type: 'chunk', attemptId: LlmAttemptId(`a-${state.attempt}`), revision: state.revision, index: state.index++, time: Date.now(), chunk })
      }
      const closeAttempt = (): void => {
        session.append('step/end', { turn: 1, step: 1 })
        session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
        state.emit({ type: 'end', attemptId: LlmAttemptId(`a-${state.attempt}`), revision: state.revision, index: state.index, outcome: { kind: 'committed', eventType: 'assistant/message', seq: SessionSeq(state.lastAssistantSeq) } })
        settled()
      }
      const drive = async (): Promise<void> => {
        busy = true
        agentCtx.emit('agent/status', { agent, status: 'running' })
        const response = nextScript()
        if (response.length === 0) { settled(); return }
        const hasTool = response.some(chunk => chunk.type === 'tool-call-delta')
        // The real loop logs the resolved route metadata; the scripted driver
        // states it so the context ring receives its capacity.
        session.append('request/context', { provider: 'mock', model: 'mock', contextWindow: 128_000 })
        session.append('turn/start', { turn: 1 })
        session.append('step/start', { turn: 1, step: 1 })
        startAttempt()
        for (const chunk of response) play(chunk)
        if (hasTool) {
          const callChunk = response.find(chunk => chunk.type === 'tool-call-delta')
          if (callChunk !== undefined && callChunk.type === 'tool-call-delta') {
            const callId = callChunk.id
            const toolName = callChunk.name ?? 'demo-ask'
            session.append('tool/call', { turn: 1, step: 1, callId, name: toolName, arguments: '{}' })
            let resultText = ''
            let isError = false
            try {
              // REAL tool execution: pre-execute ask -> ApprovalService ->
              // the cli-app answerer -> UI modal -> user outcome.
              const result = await ctx.tools.execute({ callId, name: toolName, arguments: {}, agent, signal: new AbortController().signal })
              resultText = result.content[0]?.type === 'text' ? result.content[0].text : ''
              isError = result.isError ?? false
            } catch (error: unknown) {
              resultText = error instanceof Error ? error.message : String(error)
              isError = true
            }
            session.append('tool/result', {
              turn: 1, step: 1,
              message: { id: MessageId(`r-${Date.now()}`), role: 'user', content: [{ type: 'tool-result', toolCallId: callId, content: [{ type: 'text', text: resultText }], isError }], source: { kind: 'tool', callId } },
            }, { surfaceOp: 'append' })
            const followUp = nextScript()
            startAttempt()
            for (const chunk of followUp) play(chunk)
            state.appendAssistant(followUp.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' ? c.text : '').join(''))
          }
        } else {
          state.appendAssistant(response.filter(c => c.type === 'text-delta').map(c => c.type === 'text-delta' ? c.text : '').join(''))
        }
        closeAttempt()
        agentCtx.emit('agent/status', { agent, status: 'idle' })
      }
      Object.assign(agent, {
        id: session.id, options: options.agentOptions ?? { provider: 'mock', model: 'mock' }, session, status: 'idle', ctx: agentCtx,
        cancel: () => {},
        send: () => {}, steer: () => {}, inject: () => {},
        followup: () => { void drive().catch((failure: unknown) => { settled(); process.stderr.write(`[drive-error] ${failure instanceof Error ? failure.stack ?? failure.message : String(failure)}\n`) }) },
        whenIdle,
      } satisfies Partial<import('@deepseek-ai/dsh-agent').Agent>)
      await options.setup?.(agentCtx)
      ownerCtx.agents.register(agent)
      return { agent, dispose: async () => {} }
    }
    ctx.agents.setFactory({
      createAgent: (ownerCtx: Context, options: import('@deepseek-ai/dsh-agent').CreateAgentOptions) =>
        makeAgent(ownerCtx, options),
      resume: () => { throw new Error('resume not used in composition tests') },
    })

    // Mount the glue exactly as a profile row would.
    CliApp.apply(ctx, { resumeSessionId: '', cwd: workspace, model: '', theme: 'cream-forest', ui: 'classic' })

    const composition: Composition = { ctx, instance, exited, workspace, sessions, exitCode }
    compositions.push(composition)
    return composition
  } catch (failure) {
    CliApp.internals.render = originalRender
    throw failure
  }
}

/** Wait until the controller has a live view model to drive. */
async function vmOf(timeoutMs = 15000): Promise<ViewModel> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const vm = CliApp.testHooks.currentVm
    if (vm !== null) return vm
    if (Date.now() > deadline) throw new Error('vmOf timed out; controller never mounted a view model')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

/** Poll the live frame until the predicate holds. */
async function waitForFrame(
  composition: Composition,
  holds: (frame: string) => boolean,
  timeoutMs = 15000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    // A boot/startup failure exits nonzero; surface it immediately instead of
    // polling to the deadline. The glue writes its fail() message to stderr,
    // which vitest prints alongside this error.
    if (composition.exitCode.value !== undefined && composition.exitCode.value !== 0) {
      throw new Error(`cli-app exited early with code ${composition.exitCode.value}; see stderr above`)
    }
    const frame = composition.instance.lastFrame === undefined ? '' : composition.instance.lastFrame() ?? ''
    if (holds(frame)) return
    if (Date.now() > deadline) {
      const tail = composition.instance.frames === undefined ? [] : composition.instance.frames.slice(-4)
      throw new Error(`waitForFrame timed out; last frame:\n${frame}\n--- recent frames ---\n${tail.join('\n====\n')}`)
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

/** Collect every appended event across sessions created by this composition. */
function collectLogEvents(composition: Composition): { type: string; data: unknown }[] {
  const events: { type: string; data: unknown }[] = []
  for (const session of composition.sessions) {
    for (const event of session.snapshotEvents()) {
      events.push({ type: event.type, data: event.data })
    }
  }
  return events
}


describe('cli-app through a real composition', () => {
  it('asks approval through the modal, allows, and lands the durable audit pair', async () => {
    const composition = await bootComposition([
      toolCallResponse('call-allow', 'demo-ask'),
      textResponse('all done'),
    ])
    const vm = await vmOf()
    await waitForFrame(composition, frame => frame.includes(COPY.statusIdle))

    // Send the tool-driving request through the live view model, then the
    // REAL tool execution parks on the REAL approval service; the modal must
    // surface on the rendered frame.
    vm.send('run demo')
    await waitForFrame(composition, frame =>
      frame.includes(COPY.approvalTitle) && frame.includes('demo-ask'))
    vm.resolveApproval('allowed-once')
    await waitForFrame(composition, frame =>
      frame.includes('demo-ok') && frame.includes('all done'))
    // The real token meter feeds the composer's measurement line: cumulative
    // usage plus the context ring against the logged route capacity.
    await waitForFrame(composition, frame =>
      frame.includes(COPY.tokenUsageLabel) && frame.includes(`${COPY.contextLabel} ○ 0%`))
    vm.send('/quit')
    await expect(composition.exited).resolves.toBe(0)

    const events = collectLogEvents(composition)
    const decided = events.filter(event => event.type === 'approval/decided')
    expect(decided).toHaveLength(1)
    expect(decided[0]?.data).toMatchObject({ outcome: 'allowed-once' })
    expect(events.some(event => event.type === 'approval/asked')).toBe(true)
    expect(events.some(event => event.type === 'tool/call' && (event.data as { name: string }).name === 'demo-ask')).toBe(true)
  }, 45000)

  it('rejects with a denial: the tool card reports it and the audit records it', async () => {
    const composition = await bootComposition([
      toolCallResponse('call-reject', 'demo-ask'),
      textResponse('recovered'),
    ])
    const vm = await vmOf()
    await waitForFrame(composition, frame => frame.includes(COPY.statusIdle))

    vm.send('run demo')
    await waitForFrame(composition, frame =>
      frame.includes(COPY.approvalTitle) && frame.includes('demo-ask'))
    vm.resolveApproval('rejected')
    await waitForFrame(composition, frame => frame.includes('recovered'))
    vm.send('/quit')
    await expect(composition.exited).resolves.toBe(0)

    const events = collectLogEvents(composition)
    expect(events.some(event =>
      event.type === 'approval/decided' && (event.data as { outcome: string }).outcome === 'rejected')).toBe(true)
  }, 45000)

  it('/perm never auto-denies without a modal and routes registry commands', async () => {
    const composition = await bootComposition([
      toolCallResponse('call-never', 'demo-ask'),
      textResponse('denied seen'),
    ])
    const vm = await vmOf()
    await waitForFrame(composition, frame => frame.includes(COPY.statusIdle))
    composition.ctx.commands.register({
      name: 'demo-cmd',
      description: 'composition test command',
      handler: () => ({ kind: 'success', text: 'echo:from-registry' }),
    })

    vm.send('/perm never')
    vm.send('run demo')
    await waitForFrame(composition, frame => frame.includes('denied'))
    // The modal must never appear under the never policy.
    expect(composition.instance.frames.some(frame => frame.includes(COPY.approvalTitle))).toBe(false)
    // A registry command routes through ctx.commands and lands as a system row.
    vm.send('/demo-cmd hi')
    await waitForFrame(composition, frame => frame.includes('echo:from-registry'))
    vm.send('/quit')
    await expect(composition.exited).resolves.toBe(0)

    const events = collectLogEvents(composition)
    expect(events.some(event =>
      event.type === 'approval/policy' && (event.data as { policy: string }).policy === 'never')).toBe(true)
    expect(events.some(event =>
      event.type === 'approval/decided' && (event.data as { outcome: string }).outcome === 'rejected')).toBe(true)
    expect(events.some(event => event.type === 'command/run')).toBe(true)
  }, 45000)
})
