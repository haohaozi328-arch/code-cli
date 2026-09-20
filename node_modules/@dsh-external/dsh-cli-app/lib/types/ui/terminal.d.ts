/**
 * Terminal control sequences the app emits directly. Ink owns layout and cursor
 * movement everywhere else; these live here so no call site can hand-write an
 * escaped literal and print it as visible text.
 * @module @dsh-external/dsh-cli-app/ui/terminal
 */
/** Erase everything in the visible viewport without moving the cursor. */
export declare const ERASE_SCREEN = "\u001B[2J";
/** Clear the visible viewport and home the cursor, keeping terminal scrollback. */
export declare const CLEAR_VIEWPORT = "\u001B[2J\u001B[H";
/** Erase the terminal's saved lines (scrollback), xterm ED 3. */
export declare const ERASE_SCROLLBACK = "\u001B[3J";
/** Clear the viewport AND the scrollback: the session-boundary wipe, so a retired conversation cannot be scrolled back into view. */
export declare const CLEAR_SCREEN = "\u001B[2J\u001B[3J\u001B[H";
//# sourceMappingURL=terminal.d.ts.map