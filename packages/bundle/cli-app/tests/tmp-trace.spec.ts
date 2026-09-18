import { describe, it, expect } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime, { defineTool } from '@deepseek-ai/dsh-tools'
import UserApproval from '@deepseek-ai/dsh-user-approval'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

describe('trace approval path', () => {
  it('traces pre-execute and approval waterfalls', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(UserApproval)
    const tool = defineTool({
      name: 'demo-ask', description: 'gated', parameters: {},
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      execute: async () => 'ok',
    })
    ctx.tools.register(tool)
    ctx.on('tools/pre-execute', async (exec, next) => {
      console.error('[trace] pre-execute fired for', exec.name)
      return exec.name === 'demo-ask' ? { kind: 'ask', reason: 'demo gate' } : await next()
    })
    const session = ctx.sessions.create('session-trace')
    const agent = {} as never
    const agentCtx = ctx.extend({ agent })
    Object.assign(agent, { id: session.id, session, ctx: agentCtx })
    agentCtx.on('approval/request', (req: unknown) => {
      console.error('[trace] approval/request reached answerer:', JSON.stringify(req))
      return Promise.resolve('allowed-once' as const)
    })
    session.append('turn/start', { turn: 1 })
    const result = await ctx.tools.execute({ callId: 'c1', name: 'demo-ask', arguments: {}, agent, signal: new AbortController().signal })
    console.error('[trace] result isError =', result.isError, '| text =', JSON.stringify(result.content))
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    expect.fail('force-fail to dump trace output')
  }, 20000)
})
