/**
 * Terminal layout chrome: the surrounding frame and message-row treatment the
 * app renders in. `classic` is the original M1–M5 single-column look;
 * `opencode` adds a top info bar, centers the message column, and uses the
 * opencode-style prompt and status treatments. The active chrome comes from
 * the `ui` plugin config (`cli` profile stays classic by default; the `code`
 * profile sets `opencode`).
 * @module @dsh-external/dsh-cli-app/ui/chrome
 */
/** Named chrome variants the renderer understands. */
export type UiChrome = 'classic' | 'opencode';
/** Every accepted chrome name, for startup validation and help text. */
export declare const UI_CHROME_NAMES: readonly UiChrome[];
/**
 * Resolve a chrome name to the union it belongs to.
 * @param name - value from config or the `--ui` flag; typed `string` so a
 *   bypassed-validation config still fails loud before the renderer.
 * @returns the matching chrome.
 * @throws when `name` is not a shipped chrome.
 */
export declare function resolveChrome(name: string): UiChrome;
//# sourceMappingURL=chrome.d.ts.map