/**
 * The terminal app's command-line provider over a real Loader tree: invocation
 * values become injected glue config, help leaves the consumer pending, and an
 * unknown theme fails loud at parse time.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { internals as cmdlineInternals, provideCmdline } from '@deepseek-ai/dsh-cmdline'
import { afterEach, describe, expect, it } from 'vitest'
import { apply, CLI_STARTUP_SERVICE, type CliStartupValues } from '../src/startup.ts'

interface Observed {
  exits: number[]
  out: string
  glueConfig?: unknown
}

const disposers: (() => Promise<void>)[] = []
const tempDirs: string[] = []

afterEach(async () => {
  for (const dispose of disposers.splice(0)) await dispose()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** Mount the real provider over a glue stand-in. */
async function bootStartup(args: string[]): Promise<{ values: CliStartupValues | undefined; observed: Observed }> {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cli-app-startup-'))
  tempDirs.push(dir)
  const observed: Observed = { exits: [], out: '' }
  writeFileSync(join(dir, 'glue.mjs'), 'export function apply(_ctx, config) { globalThis.__cliStartupObserved.glueConfig = config }\n')
  writeFileSync(join(dir, 'startup.mjs'), `
export const name = 'cli-startup'
export const inject = ['cmdlineArgs']
export const apply = ctx => globalThis.__cliStartupApply(ctx)
`)
  writeFileSync(join(dir, 'cordis.yml'), [
    '- id: cli-app',
    `  name: ${pathToFileURL(join(dir, 'glue.mjs')).href}`,
    `  inject: [${CLI_STARTUP_SERVICE}]`,
    '  config:',
    '    resumeSessionId: !!js ctx.cliStartup.resumeSessionId',
    '    cwd: !!js ctx.cliStartup.cwd',
    '    model: !!js ctx.cliStartup.model',
    '    theme: !!js ctx.cliStartup.theme',
    '    ui: !!js ctx.cliStartup.ui',
    '- id: cli-startup',
    `  name: ${pathToFileURL(join(dir, 'startup.mjs')).href}`,
    '',
  ].join('\n'))
  const observing = { write: (chunk: string) => { observed.out += chunk; return true } }
  const globals = globalThis as unknown as {
    __cliStartupApply: typeof apply
    __cliStartupObserved: Observed
  }
  globals.__cliStartupApply = apply
  globals.__cliStartupObserved = observed

  const ctx = new Context()
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  // Capture commander's help/error output the way the launcher does: through
  // the cmdline stdout/stderr slot.
  const previousStdout = cmdlineInternals.stdout
  const previousStderr = cmdlineInternals.stderr
  cmdlineInternals.stdout = observing
  cmdlineInternals.stderr = observing
  disposers.push(async () => {
    cmdlineInternals.stdout = previousStdout
    cmdlineInternals.stderr = previousStderr
  })
  provideCmdline(ctx, { args, exit: code => void observed.exits.push(code) })
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(dir, 'cordis.yml')).href } })
  await ctx.loader.await()
  disposers.push(async () => { await ctx.fiber.dispose() })
  return {
    values: ctx.get(CLI_STARTUP_SERVICE) as CliStartupValues | undefined,
    observed,
  }
}

describe('cli command-line provider', () => {
  it('provides startup defaults for a bare invocation', async () => {
    const { values, observed } = await bootStartup([])
    expect(values).toEqual({ resumeSessionId: '', cwd: '', model: '', theme: 'auto', ui: '' })
    expect(observed.glueConfig).toEqual({ resumeSessionId: '', cwd: '', model: '', theme: 'auto', ui: '' })
    expect(observed.exits).toEqual([])
  })

  it('passes every explicit flag through to the glue', async () => {
    const { values, observed } = await bootStartup([
      '--resume', 'session-abc',
      '--model', 'deepseek-official/deepseek-v4-flash',
      '--cwd', 'D:/work',
      '--theme', 'cream-forest',
      '--ui', 'opencode',
    ])
    expect(values).toEqual({
      resumeSessionId: 'session-abc',
      cwd: 'D:/work',
      model: 'deepseek-official/deepseek-v4-flash',
      theme: 'cream-forest',
      ui: 'opencode',
    })
    expect(observed.exits).toEqual([])
  })

  it('rejects an unknown --ui value at parse time', async () => {
    const { values, observed } = await bootStartup(['--ui', 'fancy'])
    expect(observed.out).toContain('--ui must be one of classic, opencode')
    expect(observed.out).toContain('"fancy"')
    expect(values).toBeUndefined()
    expect(observed.glueConfig).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })

  it('rejects an unknown theme at parse time and never provides the service', async () => {
    const { values, observed } = await bootStartup(['--theme', 'bogus'])
    expect(observed.out).toContain('--theme must be one of auto, cream-forest, deep-forest')
    expect(observed.out).toContain('"bogus"')
    expect(values).toBeUndefined()
    expect(observed.glueConfig).toBeUndefined()
    expect(observed.exits).toEqual([1])
  })

  it('prints its own help and leaves the glue pending', async () => {
    const { values, observed } = await bootStartup(['--help'])
    expect(observed.out).toContain('dsh --profile cli')
    expect(observed.out).toContain('resume an existing persisted session')
    expect(values).toBeUndefined()
    expect(observed.glueConfig).toBeUndefined()
    expect(observed.exits).toEqual([0])
  })
})
