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

import { previewToolResult } from './messages.tsx'
import type { UiMessage } from './model.ts'
import { wrappedRows } from './resize.ts'

/** Viewport rows below which clipping cannot help: the chrome fills the screen by itself. */
const MIN_VIEWPORT_ROWS = 12
/** Rows the live region keeps even when the chrome claims more than the viewport holds. */
const LIVE_MIN_ROWS = 3
/** Ink resets at `outputHeight >= rows`, so a safe frame stops one row short of the viewport. */
const SPARE_ROWS = 1
/** Rows a transcript row adds around its text: its blank row below, and one row of slack for a fenced block's language header and the indent the text wraps inside. */
const ROW_OVERHEAD = 2
/** Row the classic chrome prints above a user or assistant row. */
const ROLE_LABEL_ROWS = 1
/** Row the clip notice adds. */
const NOTICE_ROWS = 1
/** Rows of the newest answer the clip never takes away, so the frame always shows a line of it. */
const MIN_TEXT_ROWS = 1

/**
 * Rows the pieces mounted outside the live region occupy, counted from each
 * component's own markup. A bounded list counts its maximum, because that is
 * the height the frame can reach. An under-estimate lets one frame trip Ink's
 * reset; an over-estimate clips a row of answer early.
 */
export const LIVE_CHROME = {
  /** The classic input line and the margin above it. */
  classicInput: 2,
  /** The classic bottom status line. */
  statusLine: 1,
  /** The framed opencode composer with its status row and margins, plus the token line. */
  opencodeComposer: 8,
  /** An error row and its margin. */
  error: 2,
  /** The tool-approval modal. */
  approval: 5,
  /** `SessionPicker`: heading, search field, five rows, and a footer. */
  sessionPicker: 10,
  /** `ChoiceList`: heading, eight rows, and a footer. */
  choicePicker: 11,
  /** `CommandMenu`: hint line and up to eight matches. */
  commandMenu: 9,
  /** The `/connect` and `/title` frames. */
  prompt: 4,
  /** The task panel frame, title, and hint; each todo adds one row. */
  todoPanel: 4,
  /** The queued-prompts note and its margin. */
  queued: 2,
} as const

/** What a row's height depends on beyond its own text. */
export interface LiveRowShape {
  /** Terminal width in display cells; a width that is not a positive number counts lines instead of wrapped rows. */
  columns: number
  /** Whether the chrome prints a role label above a user or assistant row. */
  labeled: boolean
  /** Key of the row whose reasoning is expanded, or `null` when none is. */
  expandedKey: string | null
}

/** The live rows to paint, plus what the clip left out. */
export interface LiveFit {
  /** Rows to paint in transcript order; the newest row's text may be tail-clipped. */
  readonly messages: readonly UiMessage[]
  /** Viewport rows the clip left out, 0 when the live region fits whole. */
  readonly hiddenRows: number
  /** Whether the frame has room for the row that names the clip. */
  readonly notice: boolean
}

/** One measured row: its height and the part of it the clip can trade away. */
interface RowMeasure {
  readonly message: UiMessage
  readonly height: number
  readonly text: number
}

/**
 * Rows the live region may occupy.
 * @param rows - viewport height in rows; non-finite when the stream reports none.
 * @param chromeRows - rows the pieces mounted outside the live region take.
 * @returns the row budget, or 0 when the live region must paint everything.
 */
export function liveRowBudget(rows: number, chromeRows: number): number {
  // A stream with no reported height — a pipe, or a test double — has no
  // viewport to stay inside, so there is nothing to clip to.
  if (!Number.isFinite(rows) || rows < MIN_VIEWPORT_ROWS) return 0
  return Math.max(LIVE_MIN_ROWS, rows - chromeRows - SPARE_ROWS)
}

/** Physical rows a text block occupies once the terminal wraps it. */
function textRows(text: string, shape: LiveRowShape): number {
  if (text === '') return 0
  if (!Number.isFinite(shape.columns) || shape.columns <= 0) return text.split('\n').length
  let rows = 0
  for (const line of text.split('\n')) rows += wrappedRows(line, shape.columns)
  return rows
}

/**
 * Physical rows one live transcript row paints.
 * @param message - the row, settled or unsettled.
 * @param shape - width, label, and reasoning-fold inputs.
 * @returns the row's height in viewport rows.
 */
export function liveRowHeight(message: UiMessage, shape: LiveRowShape): number {
  let rows = ROW_OVERHEAD + textRows(message.text, shape)
  if (shape.labeled && message.role !== 'tool') rows += ROLE_LABEL_ROWS
  // A streaming row hides its reasoning; a settled one shows one preview line,
  // or every line once the reader expands the fold.
  if (message.status !== 'streaming' && message.reasoning !== '') {
    rows += shape.expandedKey === message.key ? textRows(message.reasoning, shape) : 1
  }
  if (message.toolPreview !== undefined && message.toolPreview !== '') rows += 1
  if (message.toolStatus === 'done' || message.toolStatus === 'error') {
    rows += textRows(message.toolResult === undefined ? '' : previewToolResult(message.toolResult), shape)
  }
  return rows
}

/**
 * The tail of `text` that fits `rows` physical rows.
 * @param text - the row's answer text.
 * @param rows - rows the clip left for it, at least one.
 * @param shape - width the terminal wraps at.
 * @returns the kept lines joined; the newest line survives even when it alone is taller.
 */
function tailToFit(text: string, rows: number, shape: LiveRowShape): string {
  const lines = text.split('\n')
  const wraps = Number.isFinite(shape.columns) && shape.columns > 0
  const heightOf = (line: string): number => (wraps ? wrappedRows(line, shape.columns) : 1)
  let start = lines.length - 1
  let used = heightOf(lines[start] ?? '')
  while (start > 0) {
    const above = heightOf(lines[start - 1] ?? '')
    if (used + above > rows) break
    start -= 1
    used += above
  }
  return lines.slice(start).join('\n')
}

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
export function fitLiveMessages(messages: readonly UiMessage[], budget: number, shape: LiveRowShape): LiveFit {
  const rows: RowMeasure[] = messages.map(message => {
    const text = textRows(message.text, shape)
    return { message, text, height: liveRowHeight(message, shape) }
  })
  const total = rows.reduce((sum, row) => sum + row.height, 0)
  const newest = rows.at(-1)
  if (newest === undefined || budget <= 0 || total <= budget) return { messages, hiddenRows: 0, notice: false }
  // The notice paints inside the live region, so the clip pays for it here.
  const usable = Math.max(1, budget - NOTICE_ROWS)
  const overhead = newest.height - newest.text
  const head = rows.slice(0, -1)
  let kept = head
  let headRows = total - newest.height
  if (newest.text - (total - usable) < MIN_TEXT_ROWS) {
    // Even one answer line does not fit alongside the head rows: keep the
    // newest suffix of them that does, and only then clip the answer.
    const limit = usable - overhead - MIN_TEXT_ROWS
    headRows = 0
    kept = []
    for (const row of [...head].reverse()) {
      if (headRows + row.height > limit) break
      headRows += row.height
      kept.push(row)
    }
    kept.reverse()
  }
  const keep = Math.max(MIN_TEXT_ROWS, usable - headRows - overhead)
  const tail = keep >= newest.text ? newest.message.text : tailToFit(newest.message.text, keep, shape)
  const clipped = tail === newest.message.text ? undefined : { ...newest.message, text: tail }
  const painted = headRows + overhead + textRows(clipped === undefined ? newest.message.text : clipped.text, shape)
  const shown = clipped === undefined && kept === head
    ? messages
    : [...kept.map(row => row.message), clipped ?? newest.message]
  return { messages: shown, hiddenRows: total - painted, notice: painted + NOTICE_ROWS <= budget }
}
