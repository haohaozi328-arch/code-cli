/**
 * Terminal glue: the session controller loop (fresh / resume / fork / switch),
 * model selection resolution, the Ink render slot, clean exit, and fail
 * paths. Keyless — the agent factory is scripted and records every open.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent, AgentHandle, CreateAgentOptions, ResumeAgentOptions } from '@deepseek-ai/dsh-agent'
import AgentDefaultModelConfig from '@deepseek-ai/dsh-agent-default-model'
import SessionStore from '@deepseek-ai/dsh-session'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import { apply, Config, internals } from '../src/index.ts'
import type { ViewModel } from '../src/ui/model.ts'

const originalInternals = { render: internals.render }
afterEach(() => { internals.render = originalInternals.render })

/** Recorded factory calls let tests assert what the loop opened. */
export interface FactoryCalls {
  create: CreateAgentOptions[]
  resume: ResumeAgentOptions[]
}

/** Scriptable agent behaviors: followup text echo is enough for glue tests. */
function makeFactory(
  echo: (message: UserMessage) => void = () => {},
  calls: FactoryCalls = { create: [], resume: [] },
): {
  createAgent(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>
  resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
} {
  return {
    createAgent: (ownerCtx, options) => createAgent(ownerCtx, options, echo, calls),
    resume: (ownerCtx, options) => resume(ownerCtx, options, echo, calls),
  }
}

async function createAgent(
  ownerCtx: Context,
  options: CreateAgentOptions,
  echo: (message: UserMessage) => void,
  calls: FactoryCalls,
): Promise<AgentHandle> {
  calls.create.push(options)
  const session = ownerCtx.sessions.create(options.sessionId, options.meta === undefined ? undefined : { meta: options.meta })
  const agent = {} as Agent
  const agentCtx = ownerCtx.extend({ agent })
  Object.assign(agent, {
    id: session.id,
    options: options.agentOptions ?? {},
    session,
    status: 'idle',
    ctx: agentCtx,
    cancel: () => {},
    followup: (message: UserMessage) => { echo(message) },
    whenIdle: () => Promise.resolve(),
  } satisfies Partial<Agent>)
  await options.setup?.(agentCtx)
  ownerCtx.agents.register(agent)
  return { agent, dispose: async () => {} }
}

async function resume(
  ownerCtx: Context,
  options: ResumeAgentOptions,
  echo: (message: UserMessage) => void,
  calls: FactoryCalls,
): Promise<AgentHandle> {
  calls.resume.push(options)
  return createAgent(ownerCtx, {
    sessionId: options.resumeSessionId,
    agentOptions: options.agentOptions,
    setup: options.setup,
  } as CreateAgentOptions, echo, calls)
}

/** One scripted registry tree around the glue plugin. */
async function bench(
  config: Partial<Config> = {},
  driver?: (vm: ViewModel, nth: number) => void,
): Promise<{
  ctx: Context
  order: string[]
  calls: FactoryCalls
  apply(): void
  exited: Promise<number>
}> {
  const ctx = new Context()
  const order: string[] = []
  const calls: FactoryCalls = { create: [], resume: [] }
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentDefaultModelConfig, { provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  const echo = () => {}
  ctx.agents.setFactory(makeFactory(echo, calls))
  const exited = new Promise<number>((resolve) => {
    ctx.provide('appExit', (code: number) => { order.push(`exit:${code}`); resolve(code) })
  })
  let renders = 0
  return {
    ctx,
    order,
    calls,
    apply: () => {
      internals.render = (element: ReactElement) => {
        order.push('render')
        // Drive every mounted view model: the first mount covers the opening
        // session and each rerender covers the next session in the controller
        // loop — the mock surface must simulate the user acting on it.
        const drive = (next: ReactElement, nth: number): void => {
          const vm = (next.props as { vm: ViewModel }).vm
          queueMicrotask(() => {
            if (driver === undefined) vm.quit()
            else driver(vm, nth)
          })
        }
        const nth = renders++
        drive(element, nth)
        return {
          unmount: () => { order.push('unmount') },
          clearViewport: () => { order.push('clearViewport') },
          rerender: (next: ReactElement) => {
            order.push('rerender')
            drive(next, renders++)
          },
        }
      }
      apply(ctx, {
        resumeSessionId: '', cwd: '', model: '', theme: 'deep-forest', ui: 'classic',
        ...config,
      })
    },
    exited,
  }
}

describe('cli-app glue', () => {
  it('creates a fresh agent, renders once, disposes, and exits 0', async () => {
    const test = await bench()
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.order).toEqual(['render', 'unmount', 'exit:0'])
    expect(test.calls.create).toHaveLength(1)
    await test.ctx.fiber.dispose()
  })

  it('resumes the requested persisted session id', async () => {
    const test = await bench({ resumeSessionId: 'session-restored' })
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.calls.resume).toHaveLength(1)
    expect(test.calls.resume[0]?.resumeSessionId).toBe('session-restored')
    await test.ctx.fiber.dispose()
  })

  it('/new resets the view in place (no second session)', async () => {
    const test = await bench(undefined, (vm) => {
      vm.send('hello')
      vm.send('/new')
      vm.quit()
    })
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.calls.create).toHaveLength(1)
    // /new resets the view; no second session is opened.
    expect(test.order).toEqual(['render', 'clearViewport', 'unmount', 'exit:0'])
    await test.ctx.fiber.dispose()
  })

  it('/new on an untouched session resets the view without opening another one', async () => {
    let resetEpoch = 0
    const test = await bench(undefined, (vm) => {
      vm.send('/new')
      resetEpoch = vm.getState().transcriptEpoch
      vm.quit()
    })
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.calls.create).toHaveLength(1)
    // The reset clears the viewport in place; no second session is opened.
    expect(test.order).toEqual(['render', 'clearViewport', 'unmount', 'exit:0'])
    // The reset happened in place on the original view model.
    expect(resetEpoch).toBe(1)
    await test.ctx.fiber.dispose()
  })

  it('/fork branches from the parent id and workspace', async () => {
    const test = await bench(undefined, (vm, nth) => {
      if (nth === 0) {
        vm.send('/fork')
      } else {
        vm.quit()
      }
    })
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.calls.create).toHaveLength(2)
    const first = test.calls.create[0]
    const second = test.calls.create[1]
    expect(first).toBeDefined()
    expect(second?.meta?.parentSession).toBe(first?.sessionId)
    expect(second?.meta?.isSeeded).toBeUndefined() // empty parent log → unseeded fork
    await test.ctx.fiber.dispose()
  })

  it('requestSwitch resumes the picked session id', async () => {
    const test = await bench(undefined, (vm, nth) => {
      if (nth === 0) {
        vm.requestSwitch('session-picked')
      } else {
        vm.quit()
      }
    })
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.calls.resume).toHaveLength(1)
    expect(test.calls.resume[0]?.resumeSessionId).toBe('session-picked')
    await test.ctx.fiber.dispose()
  })

  it('model-switch forks the session under the new route', async () => {
    const test = await bench(undefined, (vm, nth) => {
      if (nth === 0) {
        vm.pickModel('deepseek-official/other-v2')
      } else {
        vm.quit()
      }
    })
    test.apply()
    expect(await test.exited).toBe(0)
    expect(test.calls.resume).toHaveLength(0)
    expect(test.calls.create).toHaveLength(2)
    expect(test.calls.create[1]?.meta?.parentSession).toBe(test.calls.create[0]?.sessionId)
    expect(test.calls.create[1]?.agentOptions).toMatchObject({ provider: 'deepseek-official', model: 'other-v2' })
    await test.ctx.fiber.dispose()
  })

  it('fails loud with exit 1 on a malformed model override', async () => {
    const test = await bench({ model: 'no-slash-here' })
    test.apply()
    expect(await test.exited).toBe(1)
    await test.ctx.fiber.dispose()
  })
})
