/**
 * Live-region row budget: the ceiling that keeps a streaming answer out of Ink's
 * whole-screen reset.
 *
 * Before painting, Ink compares the frame's height with the viewport
 * (`ink/build/ink.js`: `if (outputHeight >= stdout.rows)`), and a frame that
 * reaches the viewport is not erased and repainted row for row: the screen is
 * cleared, the terminal's scrollback is erased, and every committed row
 * replays. While an answer streams, the live region crosses that line on one
 * chunk and falls back under it on the next, which is the flash a fast output
 * produces.
 *
 * The correction stays on this side of Ink: the live region is measured here
 * and clipped to the rows the mounted chrome leaves it, so the threshold is
 * never reached and every repaint stays a frame diff. Clipping is paint-time
 * only — the row's full text prints once when it settles into `<Static>`, and
 * the durable log never sees the shortened copy.
 * @module @dsh-external/dsh-cli-app/ui/live-budget
 */
import type { UiMessage } from './model.ts';
/**
 * Rows the pieces mounted outside the live region occupy, counted from each
 * component's own markup. A bounded list counts its maximum, because that is
 * the height the frame can reach. An under-estimate lets one frame trip Ink's
 * reset; an over-estimate clips a row of answer early.
 */
export declare const LIVE_CHROME: {
    /** The classic input line and the margin above it. */
    readonly classicInput: 2;
    /** The classic bottom status line. */
    readonly statusLine: 1;
    /** The framed opencode composer with its status row and margins, plus the token line. */
    readonly opencodeComposer: 8;
    /** An error row and its margin. */
    readonly error: 2;
    /** The tool-approval modal. */
    readonly approval: 5;
    /** `SessionPicker`: heading, search field, five rows, and a footer. */
    readonly sessionPicker: 10;
    /** `ChoiceList`: heading, eight rows, and a footer. */
    readonly choicePicker: 11;
    /** `CommandMenu`: hint line and up to eight matches. */
    readonly commandMenu: 9;
    /** The `/connect` and `/title` frames. */
    readonly prompt: 4;
    /** The task panel frame, title, and hint; each todo adds one row. */
    readonly todoPanel: 4;
    /** The queued-prompts note and its margin. */
    readonly queued: 2;
};
/** What a row's height depends on beyond its own text. */
export interface LiveRowShape {
    /** Terminal width in display cells; a width that is not a positive number counts lines instead of wrapped rows. */
    columns: number;
    /** Whether the chrome prints a role label above a user or assistant row. */
    labeled: boolean;
    /** Key of the row whose reasoning is expanded, or `null` when none is. */
    expandedKey: string | null;
}
/** The live rows to paint, plus what the clip left out. */
export interface LiveFit {
    /** Rows to paint in transcript order; the newest row's text may be tail-clipped. */
    readonly messages: readonly UiMessage[];
    /** Viewport rows the clip left out, 0 when the live region fits whole. */
    readonly hiddenRows: number;
    /** Whether the frame has room for the row that names the clip. */
    readonly notice: boolean;
}
/**
 * Rows the live region may occupy.
 * @param rows - viewport height in rows; non-finite when the stream reports none.
 * @param chromeRows - rows the pieces mounted outside the live region take.
 * @returns the row budget, or 0 when the live region must paint everything.
 */
export declare function liveRowBudget(rows: number, chromeRows: number): number;
/**
 * Physical rows one live transcript row paints.
 * @param message - the row, settled or unsettled.
 * @param shape - width, label, and reasoning-fold inputs.
 * @returns the row's height in viewport rows.
 */
export declare function liveRowHeight(message: UiMessage, shape: LiveRowShape): number;
/**
 * Clip the live region to `budget` rows, keeping the newest tail. The newest
 * row's text gives up its leading lines first, because dropping a whole row is
 * the more visible loss; head rows go only when one answer line no longer fits
 * beside them.
 * @param messages - the live rows, transcript order.
 * @param budget - rows the live region may occupy, 0 to paint everything.
 * @param shape - width, label, and reasoning-fold inputs.
 * @returns the rows to paint, the rows left out, and whether the notice fits.
 */
export declare function fitLiveMessages(messages: readonly UiMessage[], budget: number, shape: LiveRowShape): LiveFit;
//# sourceMappingURL=live-budget.d.ts.map