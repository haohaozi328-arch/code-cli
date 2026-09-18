/**
 * Terminal control sequences the app emits directly. Ink owns layout and cursor
 * movement everywhere else; these live here so no call site can hand-write an
 * escaped literal and print it as visible text.
 * @module @dsh-external/dsh-cli-app/ui/terminal
 */

/** Erase everything in the visible viewport without moving the cursor. */
export const ERASE_SCREEN = '\u001b[2J'

/** Clear the visible viewport and home the cursor, keeping terminal scrollback. */
export const CLEAR_VIEWPORT = `${ERASE_SCREEN}\u001b[H`
