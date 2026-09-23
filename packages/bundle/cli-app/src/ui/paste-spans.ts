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

import { COPY } from './copy.ts'

/** One pasted region inside the input buffer, in code-unit coordinates. */
export interface PasteSpan {
  readonly start: number
  readonly length: number
}

/** Shortest single chunk still treated as a paste rather than typing. */
export const PASTE_FOLD_MIN = 80
/** Leading characters kept in the placeholder. */
export const PASTE_HEAD = 20
/** Trailing characters kept in the placeholder. */
export const PASTE_TAIL = 10

/**
 * Whether one input chunk is a paste (a burst no keyboard produces).
 * @param chunk - the raw chunk Ink delivered.
 * @returns true when the chunk should fold.
 */
export function isPasteChunk(chunk: string): boolean {
  return chunk.length >= PASTE_FOLD_MIN || /\r|\n/.test(chunk)
}

/**
 * The placeholder shown in place of one pasted region.
 * @param text - the pasted text, verbatim.
 * @returns `【head...tail，N字符】`, or the whole flattened text when it is
 * already shorter than the head+tail budget.
 */
export function summarizePaste(text: string): string {
  const flat = Array.from(text.replace(/\s+/gu, ' ').trim())
  const count = Array.from(text).length
  const body = flat.length <= PASTE_HEAD + PASTE_TAIL
    ? flat.join('')
    : `${flat.slice(0, PASTE_HEAD).join('')}${COPY.pasteEllipsis}${flat.slice(-PASTE_TAIL).join('')}`
  return `${COPY.pasteOpen}${body}${COPY.pasteCountSeparator}${count}${COPY.pasteCountSuffix}${COPY.pasteClose}`
}

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
export function spansAfterInsert(
  spans: readonly PasteSpan[],
  at: number,
  length: number,
  folded: boolean,
): readonly PasteSpan[] {
  const next: PasteSpan[] = []
  for (const span of spans) {
    const end = span.start + span.length
    if (at <= span.start) {
      next.push({ start: span.start + length, length: span.length })
      continue
    }
    if (at >= end) {
      next.push(span)
      continue
    }
    // Typing inside a pasted region unfolds it.
  }
  if (folded && length > 0) next.push({ start: at, length })
  return next.sort((a, b) => a.start - b.start)
}

/**
 * Re-base every span after a deletion. A deletion overlapping a span unfolds
 * it (the remaining text is shown verbatim), which keeps the placeholder
 * honest: it always stands for exactly the bytes that were pasted.
 * @param spans - current spans.
 * @param at - first deleted offset.
 * @param length - deleted length.
 * @returns the next span list.
 */
export function spansAfterDelete(
  spans: readonly PasteSpan[],
  at: number,
  length: number,
): readonly PasteSpan[] {
  const removeEnd = at + length
  const next: PasteSpan[] = []
  for (const span of spans) {
    const end = span.start + span.length
    if (removeEnd <= span.start) {
      next.push({ start: span.start - length, length: span.length })
      continue
    }
    if (at >= end) {
      next.push(span)
      continue
    }
    // Overlap: the fold is dropped.
  }
  return next
}

/** A folded view of the buffer plus the caret mapping the renderer needs. */
export interface FoldedInput {
  /** What the prompt renders (placeholders substituted). */
  readonly display: string
  /** Buffer offset → display offset (inside a fold: its trailing edge). */
  mapCursor(cursor: number): number
}

/**
 * Fold every pasted region of the buffer into its placeholder.
 * @param text - the full buffer.
 * @param spans - folded regions (ordered, non-overlapping, in range).
 * @returns the display text and the caret mapping.
 */
export function foldInput(text: string, spans: readonly PasteSpan[]): FoldedInput {
  const usable = [...spans]
    .filter(span => span.length > 0 && span.start >= 0 && span.start + span.length <= text.length)
    .sort((a, b) => a.start - b.start)
  if (usable.length === 0) return { display: text, mapCursor: cursor => cursor }
  let display = ''
  let cut = 0
  // Parallel pieces: [bufferStart, bufferEnd) → [displayStart, displayEnd).
  const pieces: { bufferStart: number; bufferEnd: number; displayStart: number; displayEnd: number; fold: boolean }[] = []
  for (const span of usable) {
    if (span.start < cut) continue
    if (span.start > cut) {
      const plain = text.slice(cut, span.start)
      pieces.push({
        bufferStart: cut,
        bufferEnd: span.start,
        displayStart: display.length,
        displayEnd: display.length + plain.length,
        fold: false,
      })
      display += plain
    }
    const summary = summarizePaste(text.slice(span.start, span.start + span.length))
    pieces.push({
      bufferStart: span.start,
      bufferEnd: span.start + span.length,
      displayStart: display.length,
      displayEnd: display.length + summary.length,
      fold: true,
    })
    display += summary
    cut = span.start + span.length
  }
  if (cut < text.length) {
    const plain = text.slice(cut)
    pieces.push({
      bufferStart: cut,
      bufferEnd: text.length,
      displayStart: display.length,
      displayEnd: display.length + plain.length,
      fold: false,
    })
    display += plain
  }
  const mapCursor = (cursor: number): number => {
    const clamped = Math.min(Math.max(0, cursor), text.length)
    for (const piece of pieces) {
      if (clamped >= piece.bufferEnd) continue
      if (piece.fold) return clamped <= piece.bufferStart ? piece.displayStart : piece.displayEnd
      return piece.displayStart + (clamped - piece.bufferStart)
    }
    return display.length
  }
  return { display, mapCursor }
}
