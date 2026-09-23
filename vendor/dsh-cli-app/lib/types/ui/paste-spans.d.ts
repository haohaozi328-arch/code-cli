/**
 * Pasted-chunk folding for the prompt line.
 *
 * A paste arrives as ONE `useInput` chunk. Rendering it verbatim turns the
 * composer into a multi-screen repaint and hides the rest of the chrome, so
 * the buffer keeps the full text while the prompt shows a placeholder —
 * `【head...tail，N字符】` — for every pasted region. The spans below are the
 * bookkeeping that keeps those regions pinned to the buffer as the caret
 * edits around them; a paste region is atomic (any edit touching it drops the
 * fold and the text becomes ordinary characters).
 * @module @dsh-external/dsh-cli-app/ui/paste-spans
 */
/** One pasted region inside the input buffer, in code-unit coordinates. */
export interface PasteSpan {
    readonly start: number;
    readonly length: number;
}
/** Shortest single chunk still treated as a paste rather than typing. */
export declare const PASTE_FOLD_MIN = 80;
/** Leading characters kept in the placeholder. */
export declare const PASTE_HEAD = 20;
/** Trailing characters kept in the placeholder. */
export declare const PASTE_TAIL = 10;
/**
 * Whether one input chunk is a paste (a burst no keyboard produces).
 * @param chunk - the raw chunk Ink delivered.
 * @returns true when the chunk should fold.
 */
export declare function isPasteChunk(chunk: string): boolean;
/**
 * The placeholder shown in place of one pasted region.
 * @param text - the pasted text, verbatim.
 * @returns `【head...tail，N字符】`, or the whole flattened text when it is
 * already shorter than the head+tail budget.
 */
export declare function summarizePaste(text: string): string;
/**
 * Re-base every span after an insertion, optionally recording the insertion
 * itself as a new folded region. An insertion landing strictly inside a span
 * breaks that fold: the region is no longer the verbatim paste it summarized.
 * @param spans - current spans (ordered, non-overlapping).
 * @param at - insertion offset.
 * @param length - inserted length.
 * @param folded - whether the inserted chunk is itself a paste.
 * @returns the next span list.
 */
export declare function spansAfterInsert(spans: readonly PasteSpan[], at: number, length: number, folded: boolean): readonly PasteSpan[];
/**
 * Re-base every span after a deletion. A deletion overlapping a span unfolds
 * it (the remaining text is shown verbatim), which keeps the placeholder
 * honest: it always stands for exactly the bytes that were pasted.
 * @param spans - current spans.
 * @param at - first deleted offset.
 * @param length - deleted length.
 * @returns the next span list.
 */
export declare function spansAfterDelete(spans: readonly PasteSpan[], at: number, length: number): readonly PasteSpan[];
/**
 * The folded region covering one buffer offset.
 * @param spans - current spans.
 * @param offset - buffer offset of a character (not a caret gap).
 * @returns the covering span, or undefined outside every fold.
 */
export declare function spanCovering(spans: readonly PasteSpan[], offset: number): PasteSpan | undefined;
/**
 * The range one deletion keystroke removes. A placeholder is ONE thing on the
 * prompt, so it deletes as one thing: Backspace at its trailing edge (or
 * Delete at its leading edge) removes the whole pasted region rather than
 * peeling a character the user cannot see off its end.
 * @param spans - current spans.
 * @param cursor - caret offset in the buffer.
 * @param direction - 'backward' for Backspace, 'forward' for Delete.
 * @param length - buffer length (bounds the forward case).
 * @returns the range to remove, or null when the keystroke is a no-op.
 */
export declare function deletionRange(spans: readonly PasteSpan[], cursor: number, direction: 'backward' | 'forward', length: number): {
    readonly start: number;
    readonly length: number;
} | null;
/**
 * Step the caret one position, treating a folded region as a single stop: the
 * caret never lands inside a placeholder, where it would be invisible.
 * @param spans - current spans.
 * @param cursor - caret offset in the buffer.
 * @param delta - -1 for Left, +1 for Right.
 * @param length - buffer length.
 * @returns the next caret offset.
 */
export declare function stepCursor(spans: readonly PasteSpan[], cursor: number, delta: -1 | 1, length: number): number;
/** A folded view of the buffer plus the caret mapping the renderer needs. */
export interface FoldedInput {
    /** What the prompt renders (placeholders substituted). */
    readonly display: string;
    /** Buffer offset → display offset (inside a fold: its trailing edge). */
    mapCursor(cursor: number): number;
}
/**
 * Fold every pasted region of the buffer into its placeholder.
 * @param text - the full buffer.
 * @param spans - folded regions (ordered, non-overlapping, in range).
 * @returns the display text and the caret mapping.
 */
export declare function foldInput(text: string, spans: readonly PasteSpan[]): FoldedInput;
//# sourceMappingURL=paste-spans.d.ts.map