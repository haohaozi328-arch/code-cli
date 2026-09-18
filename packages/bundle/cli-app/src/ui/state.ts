/**
 * Terminal UI view model: owns the durable-log replay, the live event wiring
 * (assistant-stream increments + session/event settlements), and the user
 * actions (send / stop / quit / commands). It is the single boundary between
 * the dsh process world and the Ink React world.
 *
 * Consistency rule: the durable session log is the source of truth. Live
 * assistant-stream frames only paint the in-flight message incrementally; a
 * committed end frame rebuilds that message from the log event (seq), so the
 * UI never diverges from what a later replay would render.
 * @module @dsh-external/dsh-cli-app/ui/state
 */

import type { Agent } from '@deepseek-ai/dsh-agent'
// Empty type import carries the Context merge for the permission-presets service.
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-settings'
// Empty type import carries the Context merge for the token-meter service.
import type {} from '@deepseek-ai/dsh-token-meter'
import { SessionSeq, type Session } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { ConnectController } from './connect.ts'
import { COPY, HELP_TEXT } from './copy.ts'
import type {
  ApprovalBus,
  ApprovalPrompt,
  ChoicePickerState,
  ChoiceItem,
  CommandHint,
  ContextOccupancy,
  ExitRequest,
  TodoList,
  UiMessage,
  UiState,
  ViewModel,
  ViewModelOptions,
} from './model.ts'
import { renderError } from './render-error.ts'
import { contextOccupancy, estimateLiveTokens, tokensPerSecond } from './status.ts'
import { blocksToText, countDurableTokens, hasConversation, projectEvent, projectTodos, replaySession, replayTodos } from './transcript.ts'
import { collectTurnEntries, reduceTurnEntries } from './taskboard.tsx'

/** The most recent approval policy recorded in the log, or the default. */
function lastApprovalPolicy(session: Session): 'ask' | 'never' {
  for (let seq = session.seq - 1; seq >= 0; seq -= 1) {
    const event = session.eventAt(SessionSeq(seq))
    if (event?.type === 'approval/policy') return event.data.policy
  }
  return 'ask'
}

/** Human-readable status-bar label for a `provider/model` route. */
function modelLabelOf(raw: string): string {
  return raw
    .split('-')
    .filter(Boolean)
    .map(part => part.toLowerCase() === 'deepseek' ? 'DeepSeek' : part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * In-process approval bridge: the agent-scope answerer calls {@link
 * ApprovalBus.request} (which suspends until the UI answers), the UI observes
 * the prompt and calls {@link ApprovalBus.answer}.
 * @returns a fresh bridge for one session.
 */
export function createApprovalBus(): ApprovalBus {
  const listeners = new Set<(prompt: ApprovalPrompt | null) => void>()
  let pending: ApprovalPrompt | null = null
  let resolver: ((outcome: 'allowed-once' | 'rejected' | 'cancelled') => void) | null = null
  const emit = (): void => { for (const listener of [...listeners]) listener(pending) }
  return {
    onPrompt(callback) {
      listeners.add(callback)
      callback(pending)
      return () => { listeners.delete(callback) }
    },
    request(prompt) {
      // A second question while one is already open would replace the first
      // resolver and strand it forever; fail closed loudly instead (the
      // approval service normalizes a throwing answerer to `unavailable`).
      if (pending !== null || resolver !== null) {
        throw new Error('cli-app: overlapping approval requests; the first question is still open')
      }
      pending = prompt
      emit()
      return new Promise((resolve) => { resolver = resolve })
    },
    answer(outcome) {
      if (pending === null || resolver === null) return
      pending = null
      const finish = resolver
      resolver = null
      emit()
      finish(outcome)
    },
  }
}

/**
 * Build the view model for one live agent.
 * @param options - the process context (event source), the live agent, its session, and its host hooks.
 * @returns the view model the Ink app renders and drives.
 */
export function createViewModel(options: ViewModelOptions): ViewModel {
  const { ctx, agent, session, flush, sessionLabel, catalog, approvalBus, requestScreenClear } = options

  const listeners = new Set<() => void>()
  let messages = replaySession(session)
  let running = false
  let error: string | null = null
  let pickerOpen = false
  let choicePicker: ChoicePickerState | null = null
  let pendingApproval: ApprovalPrompt | null = null
  let transcriptEpoch = 0
  let noticeSeq = 0
  // Task checklist folded from the durable log; the live session/event path
  // keeps it in step with tool writes.
  let todos: TodoList | null = replayTodos(session)
  // Prompts typed while the agent runs; the idle edge drains them FIFO.
  let queued: readonly string[] = []
  // Board data: the per-turn conversation timeline folded from the durable log,
  // and the Ctrl+Alt board toggle the renderer flips.
  let turnTimeline = collectTurnEntries(session.snapshotEvents())
  let boardOpen = false
  const tokens = countDurableTokens(session)
  const pickerItems = catalog
  const meter = ctx.get('tokenMeter')
  // Throughput of the newest observed window. A provider usage sample replaces
  // the live character estimate; both are reported over the attempt's own
  // frame timestamps, so a resumed session and a live one agree.
  let tokenRate: number | null = null
  let attemptAnchorMs: number | null = null
  let attemptChars = 0
  let context: ContextOccupancy | null = contextOccupancy(
    meter?.measure(session).totalTokens,
    session.requestContext()?.contextWindow,
  )

  // Cached snapshot handed to useSyncExternalStore: React compares getSnapshot
  // results by reference, so a fresh object per call would re-render forever.
  let snapshot: UiState | null = null
  const notify = (): void => {
    snapshot = null
    for (const listener of [...listeners]) listener()
  }

  let streamNotifyTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleStreamNotify = (): void => {
    if (streamNotifyTimer !== null) return
    streamNotifyTimer = setTimeout(() => {
      streamNotifyTimer = null
      notify()
    }, 16)
  }
  const setMessages = (next: UiMessage[], immediate = true): void => {
    if (next === messages) return
    messages = next
    if (immediate) notify()
    else scheduleStreamNotify()
  }
  const appendNotice = (text: string): void => {
    noticeSeq += 1
    setMessages([...messages, { key: `notice-${noticeSeq}`, role: 'assistant', text, reasoning: '', status: 'done' }])
  }
  const setRunning = (value: boolean): void => {
    if (running === value) return
    running = value
    notify()
  }
  const setError = (value: string | null): void => {
    if (error === value) return
    error = value
    notify()
  }
  const setQueued = (next: readonly string[]): void => {
    queued = next
    notify()
  }
  const setPickerOpen = (value: boolean): void => {
    if (pickerOpen === value) return
    pickerOpen = value
    notify()
  }
  const setChoicePicker = (value: ChoicePickerState | null): void => {
    if (choicePicker === value) return
    choicePicker = value
    notify()
  }
  const setTokens = (usage: { input: number; output: number; reasoning?: number }): void => {
    tokens.input += usage.input
    tokens.output += usage.output
    tokens.reasoning += usage.reasoning ?? 0
    notify()
  }
  /**
   * Re-read context occupancy from the token meter and the durable route
   * record. The meter prices the surface, so a compaction that shadows a range
   * lowers this figure as soon as its events land —before the next request
   * reports usage.
   */
  const refreshOccupancy = (): void => {
    const next = contextOccupancy(
      meter?.measure(session).totalTokens,
      session.requestContext()?.contextWindow,
    )
    const unchanged = next === null
      ? context === null
      : context !== null
        && next.percent === context.percent
        && next.usedTokens === context.usedTokens
        && next.contextWindow === context.contextWindow
    if (unchanged) return
    context = next
    notify()
  }

  /**
   * Anchor the attempt window on its first streamed chunk and publish a live
   * throughput estimate from the characters seen so far.
   */
  const sampleLiveRate = (at: number): void => {
    if (attemptAnchorMs === null) {
      attemptAnchorMs = at
      return
    }
    const rate = tokensPerSecond(estimateLiveTokens(attemptChars), at - attemptAnchorMs)
    if (rate !== null) tokenRate = rate
  }

  let resolved = false
  let resolveDone: (request: ExitRequest) => void = () => {}
  const done = new Promise<ExitRequest>((resolve) => { resolveDone = resolve })
  // Every session-lifecycle ask shares one exit path; `exitFn` lives in this
  // scope so send() and the action methods never depend on a bound `this`.
  const exitFn = (request: ExitRequest): void => {
    if (resolved) return
    resolved = true
    resolveDone(request)
  }
  const requestQuit = (): void => { exitFn({ type: 'quit' }) }

  /** Submit one user prompt: paint the row, wake the agent, flush on settle. */
  const submitPrompt = (text: string): void => {
    setError(null)
    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    })
    setMessages([...messages, { key: message.id, role: 'user', text, reasoning: '', status: 'done' }])
    agent.followup(message)
    setRunning(true)
    // Flush after the turn settles; never block the UI on it.
    void agent.whenIdle()
      .then(() => (flush === undefined ? undefined : flush(session)))
      .catch((failure: unknown) => { setError(renderError(failure)) })
  }

  /** Validate and request a model-route switch; shared by /model and the picker. */
  const submitModelSpec = (spec: string): void => {
    const trimmed = spec.trim()
    if (!trimmed.includes('/')) {
      setError('model must be provider/model, e.g. deepseek-official/deepseek-v4-flash')
      return
    }
    exitFn({ type: 'model-switch', spec: trimmed })
  }

  const permissionService = ctx.get('permissionPresets')
  let permissionPolicy = lastApprovalPolicy(session)
  let permissionPreset = permissionService === undefined ? permissionPolicy : permissionService.current(session)

  const openModelPicker = (): void => {
    const currentProvider = agent.options.provider ?? 'deepseek-official'
    const configured = ctx.get('settings')?.get('llm-pi-ai') as { providers?: Record<string, unknown> } | undefined
    const providers = [...new Set([currentProvider, ...Object.keys(configured?.providers ?? {})])].filter(Boolean)
    const fallback: ChoiceItem[] = [{ label: 'deepseek-v4-flash', value: `${currentProvider}/deepseek-v4-flash` }]
    void Promise.all(providers.map(async (provider) => {
      const models = await Promise.resolve(ctx.get('llm')?.listModels(provider))
      return (models ?? []).map(model => ({
        label: model.name !== model.id ? `${model.name} (${provider}/${model.id})` : `${provider}/${model.id}`,
        value: `${provider}/${model.id}`,
      }))
    }))
      .then((groups) => {
        const items = groups.flat()
        setChoicePicker({ kind: 'model', title: COPY.choiceTitleModel, items: items.length > 0 ? items : fallback })
      })
      .catch(() => {
        setChoicePicker({ kind: 'model', title: COPY.choiceTitleModel, items: fallback })
      })
  }

  const openPolicyPicker = (): void => {
    const items: ChoiceItem[] = permissionService === undefined
      ? [
        { label: COPY.policyAsk, value: 'ask' },
        { label: COPY.policyNever, value: 'never' },
      ]
      : permissionService.names.map((name) => {
        const option = permissionService.optionOf(name)
        return { label: option.description === undefined ? option.name : `${option.name} —${option.description}`, value: option.value }
      })
    setChoicePicker({ kind: 'policy', title: COPY.choiceTitlePolicy, items })
  }

  /** Apply one permission preset (sandbox + approval) or a bare approval policy. */
  const applyPolicy = (policy: string): void => {
    if (permissionService !== undefined && permissionService.names.includes(policy)) {
      permissionService.set(session, policy)
      permissionPreset = permissionService.current(session)
      permissionPolicy = permissionService.resolve(policy).approval
    } else if (policy === 'ask' || policy === 'never') {
      ctx.get('approval')?.setPolicy(agent, policy)
      permissionPolicy = policy
      permissionPreset = permissionService?.current(session) ?? policy
    } else {
      setError(permissionService === undefined ? 'usage: /perm ask | never' : `usage: /perm ${permissionService.names.join(' | ')}`)
      return
    }
    setChoicePicker(null)
    notify()
  }

  const connect = new ConnectController(ctx, {
    fail: (message) => { setError(message) },
    notice: (text) => { appendNotice(text) },
    showChoice: (picker) => { setChoicePicker(picker) },
    closeChoice: () => { setChoicePicker(null) },
    changed: () => { notify() },
  })

  /** Hand one non-built-in slash line to the registry commands service. */
  const dispatchRegistryCommand = (name: string, line: string): void => {
    const commandsService = ctx.get('commands') as {
      execute(
        agent: Agent,
        line: string,
        attachments: readonly never[],
        signal: AbortSignal,
      ): Promise<{
        commandId: string
        result: { kind: 'error'; text: string } | { kind: 'success'; text?: string }
      } | undefined>
    } | undefined
    if (commandsService === undefined) {
      setError(`unknown command: ${name}; try /help`)
      return
    }
    void commandsService.execute(agent, line, [], new AbortController().signal)
      .then((execution) => {
        if (execution === undefined) {
          setError(`unknown command: ${name}; try /help`)
          return
        }
        if (execution.result.kind === 'error') {
          setError(execution.result.text)
        } else if (execution.result.text !== undefined && execution.result.text !== '') {
          appendNotice(execution.result.text)
        }
      })
      .catch((failure: unknown) => { setError(renderError(failure)) })
  }

  /**
   * Route one slash command. The command name is the first word, lower-cased
   * (case- and whitespace-tolerant); the remaining text is its argument.
   * Built-ins act locally; anything else goes to the registry commands service,
   * and an unregistered name gets an unknown hint instead of reaching the model.
   * @param line - the trimmed slash line, e.g. `/model deepseek-official/x`.
   */
  /**
   * Reset the on-screen transcript in place: clear the viewport and bump the
   * transcript epoch so the Ink static list rebuilds. Terminal scrollback is
   * deliberately preserved.
   */
  const resetTranscriptView = (): void => {
    requestScreenClear?.()
    transcriptEpoch += 1
    setMessages([])
  }

  const dispatchCommand = (line: string): void => {
    const name = line.split(/\s+/)[0]?.toLowerCase() ?? ''
    const rest = line.slice(name.length).trim()
    switch (name) {
      case '/quit':
      case '/exit':
        requestQuit()
        return
      case '/new':
        // Only create a new session when the current one has real conversation
        // (user message + assistant reply). Otherwise just clear the view.
        if (hasConversation(session)) exitFn({ type: 'new' })
        else resetTranscriptView()
        return
      case '/fork':
        exitFn({ type: 'fork' })
        return
      case '/sessions':
      case '/resume':
        setPickerOpen(true)
        return
      case '/model':
        // `/model provider/model` applies immediately; a bare `/model` opens the
        // model choice list.
        if (rest !== '') submitModelSpec(rest)
        else openModelPicker()
        return
      case '/perm':
        if (rest !== '') applyPolicy(rest)
        else openPolicyPicker()
        return
      case '/connect':
        if (rest !== '') connect.start(rest)
        else connect.openPicker()
        return
      case '/help':
        appendNotice(HELP_TEXT)
        return
      case '/clear':
        resetTranscriptView()
        return
      default:
        dispatchRegistryCommand(name, line)
    }
  }

  // Track the streaming row per model attempt so a new attempt replaces the
  // stale in-flight paint (retry / superseded attempt).
  let streamingKey: string | null = null

  const removeStreaming = (): void => {
    const key = streamingKey
    if (key === null) return
    streamingKey = null
    setMessages(messages.filter(message => message.key !== key))
  }

  const disposeStream = ctx.on('agent/assistant-stream', ({ agent: subject, frame }) => {
    if (subject !== agent) return
    if (frame.type === 'start') {
      // Replace any stale in-flight paint, then open this attempt's row.
      removeStreaming()
      const key = `stream-${frame.attemptId}`
      streamingKey = key
      attemptAnchorMs = null
      attemptChars = 0
      setMessages([...messages, { key, role: 'assistant', text: '', reasoning: '', status: 'streaming' }])
      return
    }
    if (frame.type === 'end') {
      const outcome = frame.outcome
      if (outcome.kind === 'abandoned' || outcome.eventType === 'assistant/attempt') {
        removeStreaming()
        return
      }
      const event = session.eventAt(SessionSeq(outcome.seq))
      if (event?.type === 'assistant/message') {
        const { text, reasoning } = blocksToText(event.data.message.content)
        const key = streamingKey ?? `a:${outcome.seq}`
        streamingKey = null
        if (text === '' && reasoning === '') {
          setMessages(messages.filter(message => message.key !== key))
          return
        }
        setMessages(messages.map(message => message.key === key
          ? { key: `a:${outcome.seq}`, role: 'assistant', text, reasoning, status: 'done', seq: outcome.seq }
          : message))
      }
      return
    }
    const key = streamingKey
    if (key === null) return
    const chunk = frame.chunk
    if (chunk.type === 'text-delta') {
      if (chunk.text === '') return
      attemptChars += chunk.text.length
      sampleLiveRate(frame.time)
      setMessages(messages.map(message => message.key === key ? { ...message, text: message.text + chunk.text } : message), false)
      return
    }
    if (chunk.type === 'reasoning-delta') {
      if (chunk.text === '') return
      attemptChars += chunk.text.length
      sampleLiveRate(frame.time)
      setMessages(messages.map(message => message.key === key ? { ...message, reasoning: message.reasoning + chunk.text } : message), false)
      return
    }
    if (chunk.type === 'usage') {
      // The provider's own output count replaces the character estimate once
      // the attempt reports it, over the same anchored window.
      const sampled = attemptAnchorMs === null
        ? null
        : tokensPerSecond(chunk.usage.outputTokens, frame.time - attemptAnchorMs)
      if (sampled !== null) tokenRate = sampled
      setTokens({
        input: chunk.usage.inputTokens,
        output: chunk.usage.outputTokens,
        ...(chunk.usage.reasoningTokens !== undefined ? { reasoning: chunk.usage.reasoningTokens } : {}),
      })
      return
    }
    if (chunk.type === 'tool-call-delta') {
      // Live argument preview on the streaming row; the durable tool card
      // replaces it once tool/call lands.
      const delta = chunk.argumentsDelta.trim()
      if (delta === '') return
      setMessages(messages.map(message => message.key === key
        ? { ...message, toolPreview: `${chunk.name} ${delta.slice(0, 120)}` }
        : message), false)
    }
    // block-start / block-end / finish carry no incremental paint; the
    // committed end frame rebuilds the whole row from the log.
  })

  // Durable settlements not produced through this UI (injected context,
  // plugin-originated user messages, tool lifecycle) still land on screen.
  const disposeSession = ctx.on('session/event', (subject, event) => {
    if (subject !== session) return
    // Occupancy moves on every committed event (surface growth, compaction
    // shadow price, a new route capacity), so it is re-read before any early
    // return below.
    refreshOccupancy()
    todos = projectTodos(todos, event)
    const nextEntries = reduceTurnEntries(turnTimeline, event)
    if (nextEntries !== turnTimeline) {
      turnTimeline = nextEntries
      snapshot = null
      notify()
    }
    // A committed assistant row settles through the assistant-stream end frame,
    // which maps the attempt identity onto its durable seq; folding the raw
    // assistant/message event here too would paint the same row twice.
    if (event.type === 'assistant/message') return
    setMessages(projectEvent(messages, event))
  })

  const disposeApproval = approvalBus.onPrompt((prompt) => {
    if (pendingApproval === prompt) return
    pendingApproval = prompt
    notify()
  })

  const disposePolicy = ctx.on('session/event', (subject, event) => {
    if (subject !== session || event.type !== 'approval/policy') return
    permissionPolicy = event.data.policy
    permissionPreset = permissionService?.current(session) ?? permissionPolicy
    notify()
  })

  const disposeStatus = ctx.on('agent/status', ({ agent: subject, status }) => {
    if (subject !== agent) return
    setRunning(status === 'running')
    // Drain the queue on the idle edge: one prompt per settled turn, the next
    // one drains when its own turn settles. submitPrompt re-arms `running`
    // synchronously, so a later idle event can never double-drain.
    if (status === 'idle' && !running && queued.length > 0) {
      const [next, ...rest] = queued
      setQueued(rest)
      if (next !== undefined) submitPrompt(next)
    }
  })

  const disposeError = ctx.on('agent/error', ({ agent: subject, error: failure }) => {
    if (subject !== agent) return
    setError(renderError(failure))
  })

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    getState(): UiState {
      if (snapshot === null) {
        snapshot = {
          messages,
          running,
          error,
          modelLabel: modelLabelOf(agent.options.model ?? '?'),
          permissionPreset,
          sessionId: agent.id,
          sessionLabel,
          pickerOpen,
          pickerItems,
          pendingApproval,
          tokens: { ...tokens },
          tokenRate,
          contextOccupancy: context,
          todos,
          queued: [...queued],
          boardOpen,
          turnTimeline,
          choicePicker,
          connectWizard: connect.state,
          transcriptEpoch,
        }
      }
      return snapshot
    },
    send(text) {
      const trimmed = text.trim()
      if (trimmed === '') return
      // Slash commands the UI understands never wait on the agent: lifecycle
      // and navigation must work while a turn is running, and parsing tolerates
      // leading whitespace and case. Plain text is gated by the running check.
      if (trimmed.startsWith('/')) {
        dispatchCommand(trimmed)
        return
      }
      if (running) {
        // opencode-style queue: a prompt typed while the agent runs drains
        // FIFO when the current turn settles, instead of bouncing an error.
        setQueued([...queued, trimmed])
        return
      }
      submitPrompt(text)
    },
    stop() {
      // Ctrl+C stops everything: the running turn AND anything still queued.
      setQueued([])
      if (!running) return
      agent.cancel({ kind: 'user' })
    },
    toggleBoard() {
      boardOpen = !boardOpen
      snapshot = null
      notify()
    },
    quit() {
      requestQuit()
    },
    openPicker() {
      setPickerOpen(true)
    },
    closePicker() {
      setPickerOpen(false)
    },
    requestSwitch(sessionId) {
      // Hide the picker before the async lifecycle switch begins so the old
      // transcript is not repainted while the current Agent is disposed.
      setPickerOpen(false)
      exitFn({ type: 'switch', sessionId })
    },
    openModelPicker,
    pickModel(spec) {
      submitModelSpec(spec)
    },
    openPolicyPicker,
    pickPolicy(policy) {
      applyPolicy(policy)
    },
    openConnectPicker() {
      connect.openPicker()
    },
    pickConnectProvider(provider) {
      connect.start(provider)
    },
    submitConnectInput(value) {
      connect.submit(value)
    },
    pickConnectApi(api) {
      connect.pickApi(api)
    },
    cancelConnect() {
      connect.cancel()
    },
    closeChoicePicker() {
      setChoicePicker(null)
    },
    resolveApproval(outcome) {
      approvalBus.answer(outcome)
    },
    done,
    dispose() {
      if (streamNotifyTimer !== null) {
        clearTimeout(streamNotifyTimer)
        streamNotifyTimer = null
      }
      disposeStream()
      disposeSession()
      disposeStatus()
      disposePolicy()
      disposeError()
      disposeApproval()
      connect.dispose()
      listeners.clear()
    },
  }
}

/**
 * Command menu metadata, kept beside the dispatch switch so the menu and the
 * router cannot drift. `arg` renders as a usage hint after the name.
 */
export const COMMAND_HINTS: readonly CommandHint[] = [
  { name: '/new', hint: 'Create a new session' },
  { name: '/fork', hint: 'Create a fork from the current session' },
  { name: '/sessions', hint: 'Choose a saved session' },
  { name: '/model', hint: 'Switch model', arg: 'provider/model' },
  { name: '/perm', hint: 'Permission preset', arg: 'workspace-write|danger-full-access' },
  { name: '/connect', hint: 'Connect a model provider' },
  { name: '/feedback', hint: 'Record session feedback' },
  { name: '/goal', hint: 'Manage the session goal' },
  { name: '/plan', hint: 'Enter plan mode' },
  { name: '/clear', hint: 'Clear the current display' },
  { name: '/quit', hint: 'Exit the application', arg: 'also /exit' },
]
