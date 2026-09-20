/**
 * Reflow correction for Ink's frame diffing.
 *
 * Ink erases its previous frame with `eraseLines(previousLineCount)`, a count it
 * computed at the width in effect when that frame was written. A terminal
 * re-wraps the printed frame when its width shrinks, so the frame then occupies
 * MORE physical rows than that count: the erase stops short and leaves the top
 * of the live region stranded on screen, one more copy per shrink — the
 * composer box, status line, and any overlay repeat down the screen.
 *
 * This module wraps the stream's `write`, remembers the last frame Ink sent, and
 * on a shrink replaces the erase repeat count of the next erase with the
 * reflowed height of that frame. Nothing else changes: no viewport clear, no
 * scrollback loss, no extra repaint — only a repeat count Ink already emits.
 * @module @dsh-external/dsh-cli-app/ui/resize
 */
/**
 * Rows the terminal shows for one rendered line once it re-wraps at `columns`.
 * @param line - one rendered line, ANSI styling included.
 * @param columns - terminal width in display cells.
 * @returns the physical row count.
 */
export declare function wrappedRows(line: string, columns: number): number;
/**
 * Physical rows of an Ink frame once the terminal re-wraps it at `columns`.
 * @param frame - the frame exactly as Ink wrote it, trailing newline included.
 * @param columns - new terminal width in display cells.
 * @returns the row count Ink's erase must cover, cursor row included.
 */
export declare function reflowedRows(frame: string, columns: number): number;
/** Handle for {@link installResizeReflow}. */
export interface ResizeReflowHandle {
    /** Remove the resize listener and unwrap the stream's write. */
    readonly restore: () => void;
}
/**
 * Install the reflow correction on one output stream.
 *
 * The returned handle must be released with the Ink instance that owns the
 * stream; it is the only installed listener.
 * @param stdout - the stream Ink renders to and whose `resize` events report width changes.
 * @returns the handle that unwraps the stream.
 */
export declare function installResizeReflow(stdout: NodeJS.WriteStream): ResizeReflowHandle;
//# sourceMappingURL=resize.d.ts.map