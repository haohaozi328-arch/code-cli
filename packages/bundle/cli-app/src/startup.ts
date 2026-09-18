/**
 * The terminal app's command-line provider: parses `--resume`, `--model`,
 * `--cwd`, `--theme`, and `--help`, then publishes {@link CLI_STARTUP_SERVICE}.
 * The glue plugin is an ordinary consumer whose lazy config waits for it.
 * @module @dsh-external/dsh-cli-app/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'
import { UI_CHROME_NAMES } from './ui/chrome.ts'
import { THEME_NAMES, type ThemeName } from './ui/theme.ts'

/** Stable Cordis plugin name. */
export const name = 'cli-startup'

/** Services required before the invocation values can be resolved. */
export const inject = ['cmdlineArgs']

/** Service provided by this plugin and injected by the terminal glue. */
export const CLI_STARTUP_SERVICE = 'cliStartup'

/** What the glue row reads from {@link CLI_STARTUP_SERVICE}. */
export interface CliStartupValues {
  /** Persisted session id to resume; empty string starts a fresh session. */
  resumeSessionId: string
  /** Workspace root for the fresh session's sandbox; empty string = process.cwd(). */
  cwd: string
  /** `provider/model` override; empty string = the agent-default-model row. */
  model: string
  /** Terminal theme: `cream-forest` | `deep-forest` | `auto`. */
  theme: ThemeName
  /** Layout chrome: `classic` | `opencode` (the `code` profile defaults it). */
  ui: string
}

/** This app's command: options, description, and help text. */
function cliCommand(): Command {
  return new Command()
    .name('dsh --profile cli')
    .description('Start an interactive terminal session with the dsh agent.')
    .helpOption('-h, --help', 'show this help')
    .option('--resume <sessionId>', 'resume an existing persisted session')
    .option('--model <provider/model>', 'model route override, e.g. deepseek-official/deepseek-v4-flash')
    .option('--cwd <path>', 'workspace root for a fresh session (default: current directory)')
    .option('--theme <name>', `terminal theme: ${THEME_NAMES.join(' | ')}`, 'auto')
    .option('--ui <name>', `layout chrome: ${UI_CHROME_NAMES.join(' | ')} (default: the profile's own)`)
    .addHelpText('after', `
Examples:
  dsh --profile cli                        start a fresh interactive session
  dsh --profile cli --resume session-abc   resume a persisted session
  dsh --profile cli --theme deep-forest    start with the dark forest theme
  dsh --profile code                       opencode-style layout (centered)
`)
}

/** Parse and provide the invocation values as an ordinary Cordis service. */
export function apply(ctx: Context): void {
  const program = cliCommand()
  program.action(() => {
    const opts = program.opts<{
      resume?: string
      model?: string
      cwd?: string
      theme?: string
      ui?: string
    }>()
    const theme = opts.theme ?? 'auto'
    // Fail loud at parse time: an unknown theme must never reach the renderer.
    if (!(THEME_NAMES as readonly string[]).includes(theme)) {
      program.error(`error: --theme must be one of ${THEME_NAMES.join(', ')}, got ${JSON.stringify(theme)}`)
    }
    const ui = opts.ui ?? ''
    // Same gate for the chrome variant (an explicit value only).
    if (ui !== '' && !(UI_CHROME_NAMES as readonly string[]).includes(ui)) {
      program.error(`error: --ui must be one of ${UI_CHROME_NAMES.join(', ')}, got ${JSON.stringify(ui)}`)
    }
    ctx.provide(CLI_STARTUP_SERVICE, {
      resumeSessionId: opts.resume ?? '',
      cwd: opts.cwd ?? '',
      model: opts.model ?? '',
      theme: theme as ThemeName,
      ui,
    } satisfies CliStartupValues)
  })
  parseCmdline(ctx, program)
}
