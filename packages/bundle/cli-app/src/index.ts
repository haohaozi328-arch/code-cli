/**
 * `@dsh-external/dsh-cli-app` — interactive terminal frontend for dsh. The
 * bundle patch rides over dsh-base without Host, HTTP, or browser plugins;
 * this glue waits for the Loader tree, creates or resumes the single Agent
 * through the core registry, mounts the Ink UI, and exits through the
 * launcher's bounded shutdown when the UI asks to leave.
 * @module @dsh-external/dsh-cli-app
 */

import { randomUUID } from 'node:crypto'
import React from 'react'
import { render as inkRender } from 'ink'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { AgentHandle, ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import { assertNever } from '@deepseek-ai/dsh-util-values'
// Empty type imports carry the loader Context merge for the settlement await
// and the cmdline Context merge for the appExit host value.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-cmdline'
import { createApprovalBus, createViewModel } from './ui/state.ts'
import type { ApprovalBus, ViewModel } from './ui/model.ts'
import { App } from './ui/index.ts'
import { resolveChrome } from './ui/chrome.ts'
import { resolveTheme } from './ui/theme.ts'
import { installResizeReflow } from './ui/resize.ts'
import { CLEAR_SCREEN, CLEAR_VIEWPORT } from './ui/terminal.ts'
import { registerSessionListProjection } from './list-projection.ts'
import { collectForkSeed, listPersistedSessions, sessionLabel } from './sessions.ts'
import type { ApprovalRequest } from '@deepseek-ai/dsh-user-approval'

/** Stable Cordis plugin name. */
export const name = 'cli-app'

/** The surface an Ink render returns, narrowed to what the glue consumes. */
export interface InkSurface {
  /** Replace the previous root node with a new one (new view model). */
  rerender(element: React.ReactElement): void
  /** Manually unmount the whole Ink app. */
  unmount(): void
  /** Erase Ink's dynamic output and clear the visible viewport; absent on test doubles. */
  clearViewport?(): void
  /** Clear the visible viewport AND the terminal scrollback; absent on test doubles. */
  clearScreen?(): void
}

/** The terminal streams one Ink surface renders on. */
export interface RenderStreams {
  /** The stream Ink renders to; the reflow correction is installed on it. */
  stdout: NodeJS.WriteStream
  /** The input stream Ink reads keys from; defaults to `process.stdin`. */
  stdin?: NodeJS.ReadStream
}

/**
 * Render the terminal app on one stream pair, with the resize reflow correction
 * installed around it. The correction goes in before Ink so its `resize`
 * listener runs ahead of Ink's own: that ordering is what lets it measure the
 * shrink before Ink erases with the count computed at the previous width.
 * @param element - the Ink element tree to mount.
 * @param streams - the terminal streams Ink renders on and reads keys from.
 * @returns the mounted surface the session loop drives.
 */
export function renderApp(element: React.ReactElement, streams: RenderStreams): InkSurface {
  const reflow = installResizeReflow(streams.stdout)
  const instance = inkRender(element, {
    stdout: streams.stdout,
    ...streams.stdin === undefined ? {} : { stdin: streams.stdin },
  })
  return {
    rerender: (next) => { instance.rerender(next) },
    unmount: () => {
      reflow.restore()
      instance.unmount()
    },
    clearViewport: () => {
      // Drop Ink's log-update bookkeeping first, then erase the viewport, so
      // the next render repaints from a clean cursor. Scrollback is kept.
      instance.clear()
      streams.stdout.write(CLEAR_VIEWPORT)
    },
    clearScreen: () => {
      // The session-boundary wipe: also erase the scrollback, so the retired
      // conversation cannot be scrolled back into view above the new session.
      instance.clear()
      streams.stdout.write(CLEAR_SCREEN)
    },
  }
}

/**
 * Process render slot tests substitute: {@link renderApp} on the process
 * streams, or a capture that drives {@link ViewModel.done} through the
 * element's `vm` prop.
 */
export const internals: { render: (element: React.ReactElement) => InkSurface } = {
  render: element => renderApp(element, { stdout: process.stdout }),
}

/**
 * Test-only handle to the live view model. Composition tests drive session
 * actions through the same surface the key handlers use, because the Ink
 * testing library's fake stdin does not reach ink 5's hard-wired
 * `process.stdin`.
 */
export const testHooks: { currentVm: ViewModel | null } = { currentVm: null }

/** Core services required before the terminal session can start. */
export const inject = ['cliStartup', 'agentDefaultModel', 'agents', 'sessions', 'sessionProjections']

/** Plugin config: invocation values resolved from the startup provider. */
export interface Config {
  /** Persisted session id to resume; empty string starts a fresh session. */
  resumeSessionId: string
  /** Workspace root for a fresh session; empty string = process.cwd(). */
  cwd: string
  /** `provider/model` override; empty string = agent-default-model. */
  model: string
  /** Terminal theme name. */
  theme: string
  /** Layout chrome: `classic` | `opencode` (defaults to `classic`). */
  ui: string
}

export const Config: z<Config> = z.object({
  resumeSessionId: z.string(),
  cwd: z.string(),
  model: z.string(),
  theme: z.string(),
  ui: z.string().default('classic'),
})

/** Split `provider/model`; an empty override falls back to the default selection. */
function resolveSelection(
  override: string,
  current: { provider?: string; model?: string },
): { provider: string; model: string } {
  if (override === '') {
    if (current.provider === undefined || current.model === undefined) {
      throw new Error(`cli-app: no default model selection is available (provider=${String(current.provider)}, model=${String(current.model)})`)
    }
    return { provider: current.provider, model: current.model }
  }
  const slash = override.indexOf('/')
  if (slash <= 0 || slash === override.length - 1) {
    throw new Error(`cli-app: --model expects provider/model, got ${JSON.stringify(override)}`)
  }
  return { provider: override.slice(0, slash), model: override.slice(slash + 1) }
}

/** Report an unexpected terminal failure and request a failing exit. */
function fail(ctx: Context, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  // stderr is outside the Ink surface, so a crash during startup stays visible.
  process.stderr.write(`dsh: ${message}\n`)
  const exit = ctx.get('appExit')
  if (exit !== undefined) exit(1)
}

/** One opened session plus the view model bound to it. */
interface LiveSession {
  handle: AgentHandle
  vm: ViewModel
}

/** Shared session-creation inputs for the controller loop. */
interface OpenSession {
  agents: AgentRegistry
  selection: { provider: string; model: string }
  /** Fresh-session workspace root. */
  freshCwd: string
}

/** What one loop turn wants next. */
type SessionRequest =
  | { readonly kind: 'fresh' }
  | { readonly kind: 'resume'; readonly sessionId: string; readonly model?: { provider: string; model: string } }
  | {
    readonly kind: 'fork' | 'model-fork'
    /** Balanced completed-turn prefix captured before the parent handle retired. */
    readonly seed: ReturnType<typeof collectForkSeed>
    readonly parentId: SessionId
    readonly parentCwd: string | undefined
    /** Present only for `model-fork`: the new route. */
    readonly model?: { provider: string; model: string }
  }

/**
 * Open (create / resume / fork) one agent handle. A fork seeds the child with
 * the parent's balanced completed-turn prefix, so it carries the same world up
 * to the last finished turn and starts fresh afterwards. A resume may carry a
 * model override (`/model` resumes the same session under a new route).
 * @param services - registry, model selection, and fresh workspace root.
 * @param request - what to open.
 * @param approvalBus - approval bridge the agent-scope answerer resolves through.
 * @returns the opened live handle.
 */
async function openSession(services: OpenSession, request: SessionRequest, approvalBus: ApprovalBus): Promise<AgentHandle> {
  const { agents, selection, freshCwd } = services
  const setup: NonNullable<Parameters<typeof agents.create>[0]['setup']> = (agentCtx) => {
    const selected: ModelSelectionRef = { current: selection, assembled: undefined }
    installModelSelection(agentCtx, selected)
    // Interactive approval: the scope-filtered answerer suspends on the UI.
    agentCtx.on('approval/request', (req: ApprovalRequest) =>
      approvalBus.request({
        toolName: req.toolName,
        ...(req.reason !== undefined ? { reason: req.reason } : {}),
      }))
  }
  switch (request.kind) {
    case 'resume':
      return await agents.resume({
        resumeSessionId: brandString<SessionId>(request.sessionId),
        agentOptions: request.model ?? selection,
        setup,
      })
    case 'fork':
    case 'model-fork': {
      const sessionId = brandString<SessionId>(`session-${randomUUID()}`)
      const meta = { cwd: request.parentCwd ?? freshCwd, parentSession: request.parentId }
      const agentOptions = request.model ?? selection
      if (request.seed.length === 0) {
        return await agents.create({ sessionId, meta, agentOptions, setup })
      }
      return await agents.create({
        sessionId,
        seed: request.seed,
        inheritedEventCount: SessionLogOffset(request.seed.length),
        meta: { ...meta, isSeeded: true },
        agentOptions,
        setup,
      })
    }
    case 'fresh':
      return await agents.create({
        sessionId: brandString<SessionId>(`session-${randomUUID()}`),
        meta: { cwd: freshCwd },
        agentOptions: selection,
        setup,
      })
    default:
      return assertNever(request)
  }
}

/** Resolve the display label for one opened session (best-effort title). */
function labelFor(session: Session, catalog: { title: string | null; sessionId: string }[]): string {
  const row = catalog.find(item => item.sessionId === session.id)
  const title = row?.title ?? null
  return sessionLabel({ title, sessionId: session.id, cwd: session.header.cwd ?? null })
}

/** Run the interactive session controller and request process exit when it ends. */
async function run(ctx: Context, config: Config): Promise<void> {
  // Loader siblings mount concurrently. Await the complete application before
  // creating an Agent so its scoped tools and adapters are not half-composed.
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const defaultModel = ctx.get('agentDefaultModel')
  const sessions = ctx.get('sessions')
  if (agents === undefined || defaultModel === undefined || sessions === undefined) return

  const exit = ctx.get('appExit')
  if (exit === undefined) {
    throw new Error('cli-app: the launcher must provide ctx.appExit before the tree mounts')
  }

  const selection = resolveSelection(config.model, defaultModel.currentSelection())
  const theme = resolveTheme(config.theme)
  const chrome = resolveChrome(config.ui)
  const services: OpenSession = {
    agents,
    selection,
    freshCwd: config.cwd === '' ? process.cwd() : config.cwd,
  }
  const flush = async (session: Session): Promise<void> => { await sessions.flush(session) }

  // The session lifecycle loop: each vm.done carries what the user asked next.
  let request: SessionRequest = config.resumeSessionId !== ''
    ? { kind: 'resume', sessionId: config.resumeSessionId }
    : { kind: 'fresh' }
  let live: LiveSession | null = null
  let ink: InkSurface | null = null
  try {
    for (;;) {
      const approvalBus = createApprovalBus()
      const handle = await openSession(services, request, approvalBus)
      const { agent } = handle
      await agent.whenIdle()
      const catalog = await listPersistedSessions(ctx)
      const vm = createViewModel({
        ctx,
        agent,
        session: agent.session,
        sessionLabel: labelFor(agent.session, catalog),
        catalog,
        approvalBus,
        flush,
        requestScreenClear: () => { ink?.clearViewport?.() },
      })
      live = { handle, vm }
      testHooks.currentVm = vm
      // One Ink instance serves the whole process: a session change is a
      // rerender whose new root key rebuilds the transcript, not a second app.
      const element = React.createElement(App, { key: agent.id, vm, theme, ui: chrome })
      if (ink === null) {
        ink = internals.render(element)
      } else {
        ink.rerender(element)
      }

      const requested = await vm.done
      testHooks.currentVm = null
      // Capture what a fork needs BEFORE the parent handle retires: the
      // balanced completed-turn prefix is a pure read of the live log.
      const forkSeed = requested.type === 'fork' || requested.type === 'model-switch'
        ? collectForkSeed(agent.session)
        : []
      const parentId = agent.id
      const parentCwd = agent.session.header.cwd
      vm.dispose()
      await handle.dispose()
      live = null
      switch (requested.type) {
        case 'quit':
          // Unmount erases Ink's own output and no session follows, so a
          // viewport clear here would only flash a blank frame before exit.
          ink.unmount()
          exit(0)
          return
        case 'new':
          request = { kind: 'fresh' }
          break
        case 'fork':
          request = { kind: 'fork', seed: forkSeed, parentId, parentCwd }
          break
        case 'switch':
          request = { kind: 'resume', sessionId: requested.sessionId }
          break
        case 'model-switch':
          request = {
            kind: 'model-fork',
            seed: forkSeed,
            parentId,
            parentCwd,
            model: resolveSelection(requested.spec, selection),
          }
          break
      }
      // Session boundary: wipe the retired viewport AND its scrollback AFTER
      // disposal so any final React renders triggered by dispose are also
      // cleared, and the old conversation can no longer be scrolled back into
      // view. Falls back to the viewport-only clear on surfaces without the
      // scrollback erase (test doubles).
      if (ink.clearScreen !== undefined) ink.clearScreen()
      else ink.clearViewport?.()
    }
  } finally {
    if (live !== null) {
      live.vm.dispose()
      await live.handle.dispose()
    }
  }
}

/** Mount the terminal glue. */
export function apply(ctx: Context, config: Config): void {
  // The terminal profile mounts no session-controller, so the picker's
  // sessionListMetadata unit is registered here, before any session runs.
  registerSessionListProjection(ctx)
  void run(ctx, config).catch((error: unknown) => { fail(ctx, error) })
}
