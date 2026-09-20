import { r as UI_CHROME_NAMES, t as THEME_NAMES } from "./theme-S3yRhDT9.js";
import { Command } from "commander";
import { parseCmdline } from "@deepseek-ai/dsh-cmdline";
//#region lib/types/startup.js
/**
* The terminal app's command-line provider: parses `--resume`, `--model`,
* `--cwd`, `--theme`, and `--help`, then publishes {@link CLI_STARTUP_SERVICE}.
* The glue plugin is an ordinary consumer whose lazy config waits for it.
* @module @dsh-external/dsh-cli-app/startup
*/
/** Stable Cordis plugin name. */
const name = "cli-startup";
/** Services required before the invocation values can be resolved. */
const inject = ["cmdlineArgs"];
/** Service provided by this plugin and injected by the terminal glue. */
const CLI_STARTUP_SERVICE = "cliStartup";
/** This app's command: options, description, and help text. */
function cliCommand() {
	return new Command().name("dsh --profile cli").description("Start an interactive terminal session with the dsh agent.").helpOption("-h, --help", "show this help").option("--resume <sessionId>", "resume an existing persisted session").option("--model <provider/model>", "model route override, e.g. deepseek-official/deepseek-v4-flash").option("--cwd <path>", "workspace root for a fresh session (default: current directory)").option("--theme <name>", `terminal theme: ${THEME_NAMES.join(" | ")}`, "auto").option("--ui <name>", `layout chrome: ${UI_CHROME_NAMES.join(" | ")} (default: the profile's own)`).addHelpText("after", `
Examples:
  dsh --profile cli                        start a fresh interactive session
  dsh --profile cli --resume session-abc   resume a persisted session
  dsh --profile cli --theme deep-forest    start with the dark forest theme
  dsh --profile code                       opencode-style layout (centered)
`);
}
/** Parse and provide the invocation values as an ordinary Cordis service. */
function apply(ctx) {
	const program = cliCommand();
	program.action(() => {
		const opts = program.opts();
		const theme = opts.theme ?? "auto";
		if (!THEME_NAMES.includes(theme)) program.error(`error: --theme must be one of ${THEME_NAMES.join(", ")}, got ${JSON.stringify(theme)}`);
		const ui = opts.ui ?? "";
		if (ui !== "" && !UI_CHROME_NAMES.includes(ui)) program.error(`error: --ui must be one of ${UI_CHROME_NAMES.join(", ")}, got ${JSON.stringify(ui)}`);
		ctx.provide(CLI_STARTUP_SERVICE, {
			resumeSessionId: opts.resume ?? "",
			cwd: opts.cwd ?? "",
			model: opts.model ?? "",
			theme,
			ui
		});
	});
	parseCmdline(ctx, program);
}
//#endregion
export { CLI_STARTUP_SERVICE, apply, inject, name };
