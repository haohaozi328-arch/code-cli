//#region lib/types/ui/chrome.js
/**
* Terminal layout chrome: the surrounding frame and message-row treatment the
* app renders in. `classic` is the original M1–M5 single-column look;
* `opencode` adds a top info bar, centers the message column, and uses the
* opencode-style prompt and status treatments. The active chrome comes from
* the `ui` plugin config (`cli` profile stays classic by default; the `code`
* profile sets `opencode`).
* @module @dsh-external/dsh-cli-app/ui/chrome
*/
/** Every accepted chrome name, for startup validation and help text. */
const UI_CHROME_NAMES = ["classic", "opencode"];
/**
* Resolve a chrome name to the union it belongs to.
* @param name - value from config or the `--ui` flag; typed `string` so a
*   bypassed-validation config still fails loud before the renderer.
* @returns the matching chrome.
* @throws when `name` is not a shipped chrome.
*/
function resolveChrome(name) {
	if (UI_CHROME_NAMES.includes(name)) return name;
	throw new TypeError(`unknown ui ${JSON.stringify(name)}; expected one of ${UI_CHROME_NAMES.join(", ")}`);
}
//#endregion
//#region lib/types/ui/theme.js
/**
* Terminal theme tokens — Luoxiaohei-inspired dual palettes carried from the
* browser skin (dsh-skin-luoxiaohei) into the terminal. M1 carries the core
* surfaces; M4 completes the full token set and auto-detection.
* @module @dsh-external/dsh-cli-app/ui/theme
*/
/** Every accepted theme name, for startup validation and help text. */
const THEME_NAMES = [
	"auto",
	"cream-forest",
	"deep-forest"
];
/** Shipped palettes; values mirror the skin tokens where meaningful. */
const THEMES = {
	"cream-forest": {
		brand: "#2E7D5B",
		text: "#20352B",
		muted: "#5C6E62",
		reasoning: "#7A8B80",
		ok: "#4C9A3E",
		warn: "#C98A1B",
		error: "#C94F4F",
		codeText: "#3A5A44",
		codeBg: "#EDEDE4"
	},
	"deep-forest": {
		brand: "#A8E10C",
		text: "#E9E4D0",
		muted: "#A9B4A4",
		reasoning: "#6E8378",
		ok: "#8FCF5A",
		warn: "#E0A93C",
		error: "#E0705F",
		codeText: "#CDE8C0",
		codeBg: "#101D16"
	}
};
/**
* Resolve the effective palette for this invocation.
* @param name - validated theme name from the startup provider; typed `string`
*   so a bypassed-validation config still fails loud here instead of reaching
*   the renderer as `undefined`.
* @returns the palette.
* @throws when `name` is not a shipped theme.
*/
function resolveTheme(name) {
	if (name === "auto") return THEMES["deep-forest"];
	if (!(name in THEMES)) throw new TypeError(`unknown theme ${JSON.stringify(name)}; expected one of ${THEME_NAMES.join(", ")}`);
	return THEMES[name];
}
//#endregion
export { resolveChrome as i, resolveTheme as n, UI_CHROME_NAMES as r, THEME_NAMES as t };
