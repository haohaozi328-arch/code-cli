/**
 * The terminal app's command-line provider: parses `--resume`, `--model`,
 * `--cwd`, `--theme`, and `--help`, then publishes {@link CLI_STARTUP_SERVICE}.
 * The glue plugin is an ordinary consumer whose lazy config waits for it.
 * @module @dsh-external/dsh-cli-app/startup
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ThemeName } from './ui/theme.ts';
/** Stable Cordis plugin name. */
export declare const name = "cli-startup";
/** Services required before the invocation values can be resolved. */
export declare const inject: string[];
/** Service provided by this plugin and injected by the terminal glue. */
export declare const CLI_STARTUP_SERVICE = "cliStartup";
/** What the glue row reads from {@link CLI_STARTUP_SERVICE}. */
export interface CliStartupValues {
    /** Persisted session id to resume; empty string starts a fresh session. */
    resumeSessionId: string;
    /** Workspace root for the fresh session's sandbox; empty string = process.cwd(). */
    cwd: string;
    /** `provider/model` override; empty string = the agent-default-model row. */
    model: string;
    /** Terminal theme: `cream-forest` | `deep-forest` | `auto`. */
    theme: ThemeName;
    /** Layout chrome: `classic` | `opencode` (the `code` profile defaults it). */
    ui: string;
}
/** Parse and provide the invocation values as an ordinary Cordis service. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=startup.d.ts.map