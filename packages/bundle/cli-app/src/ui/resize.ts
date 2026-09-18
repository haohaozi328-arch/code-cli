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

import stringWidth from 'string-width'
import { ERASE_SCREEN } from './terminal.ts'

/** Erase one line, the unit `ansi-escapes`' `eraseLines` repeats. */
const ERASE_LINE = '\u001b[2K'

/** Move up one row, the separator between erased rows. */
const CURSOR_UP_ONE = '\u001b[1A'

/** Move to the start of the row, the tail of every `eraseLines` sequence. */
const CURSOR_LEFT = '\u001b[G'

/** Ink's erase prefix as `log-update` writes it: `(erase+up)* erase+left`. */
const ERASE_PREFIX = new RegExp(
  `^(?:${escapeForRegExp(ERASE_LINE + CURSOR_UP_ONE)})*${escapeForRegExp(ERASE_LINE + CURSOR_LEFT)}`,
)

/** Grapheme segmentation: one display cell block per terminal character. */
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * Escape one literal for the erase-prefix pattern.
 * @param value - the literal escape sequence.
 * @returns the pattern-safe form.
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The erase sequence for a row count, byte-identical to the one Ink emits.
 * @param count - rows to erase, including the cursor row below the frame.
 * @returns the erase sequence.
 */
function eraseLines(count: number): string {
  let clear = ''
  for (let index = 0; index < count; index += 1) {
    clear += ERASE_LINE + (index < count - 1 ? CURSOR_UP_ONE : '')
  }
  return count === 0 ? clear : clear + CURSOR_LEFT
}

/**
 * Rows the terminal shows for one rendered line once it re-wraps at `columns`.
 * @param line - one rendered line, ANSI styling included.
 * @param columns - terminal width in display cells.
 * @returns the physical row count.
 */
export function wrappedRows(line: string, columns: number): number {
  if (stringWidth(line) <= columns) return 1
  // Past the terminal width, pack cell by cell: a wide character that does not
  // fit the remaining cells wraps and wastes them, so dividing the total by the
  // width would under-count.
  let rows = 1
  let used = 0
  for (const { segment } of GRAPHEMES.segment(line)) {
    const width = stringWidth(segment)
    if (width <= 0) continue
    if (used > 0 && used + width > columns) {
      rows += 1
      used = 0
    }
    used += width
  }
  return rows
}

/**
 * Physical rows of an Ink frame once the terminal re-wraps it at `columns`.
 * @param frame - the frame exactly as Ink wrote it, trailing newline included.
 * @param columns - new terminal width in display cells.
 * @returns the row count Ink's erase must cover, cursor row included.
 */
export function reflowedRows(frame: string, columns: number): number {
  const lines = frame.split('\n')
  const cursorRow = lines.at(-1) === '' ? 1 : 0
  if (cursorRow === 1) lines.pop()
  let rows = cursorRow
  for (const line of lines) rows += wrappedRows(line, columns)
  return rows
}

/**
 * Count the rows one erase prefix covers.
 * @param prefix - the erase sequence Ink wrote.
 * @returns the erased row count.
 */
function erasedRows(prefix: string): number {
  return prefix.split(ERASE_LINE).length - 1
}

/** Handle for {@link installResizeReflow}. */
export interface ResizeReflowHandle {
  /** Remove the resize listener and unwrap the stream's write. */
  readonly restore: () => void
}

/**
 * Terminal width the stream reports.
 * @param stream - the output stream.
 * @returns the width in display cells, 0 when the stream reports none.
 */
function columnsOf(stream: NodeJS.WriteStream): number {
  return (stream as { columns?: number }).columns ?? 0
}

/**
 * Install the reflow correction on one output stream.
 *
 * The returned handle must be released with the Ink instance that owns the
 * stream; it is the only installed listener.
 * @param stdout - the stream Ink renders to and whose `resize` events report width changes.
 * @returns the handle that unwraps the stream.
 */
export function installResizeReflow(stdout: NodeJS.WriteStream): ResizeReflowHandle {
  let lastColumns = columnsOf(stdout)
  /** Last frame Ink sent, or null while the screen holds no model of it. */
  let frame: string | null = null
  /** Erase rows the next erase-prefixed write must cover, 0 when none is pending. */
  let pending = 0
  /**
   * Whether the write being processed belongs to a render burst that followed
   * an erase-only clear. Ink renders a burst synchronously, so the flag is
   * disarmed on a microtask, which is the burst's exact end.
   */
  let inBurst = false
  let burstToken = 0

  const onResize = (): void => {
    const columns = columnsOf(stdout)
    if (columns > 0 && columns < lastColumns && frame !== null) {
      // The terminal re-wrapped the printed frame into more rows than Ink's
      // count covers; erase to the reflowed height instead.
      pending = reflowedRows(frame, columns)
    } else if (columns > lastColumns) {
      // A grow invalidates a pending count: it was measured for a narrower
      // width and would erase past the frame into committed scrollback.
      pending = 0
    }
    lastColumns = columns
  }
  stdout.on('resize', onResize)

  /**
   * Record that a render burst is open and close it at the end of the current
   * task, when every write of that burst has been seen.
   */
  const armBurst = (): void => {
    burstToken += 1
    const token = burstToken
    inBurst = true
    queueMicrotask(() => { if (token === burstToken) inBurst = false })
  }

  /** Track one outgoing write and return the bytes to send in its place. */
  const rewrite = (chunk: string): string => {
    if (chunk.startsWith(ERASE_SCREEN)) {
      // Ink's overflow reset erases the screen and replays every static row in
      // one write; it is not a frame, so no model survives it.
      frame = null
      pending = 0
      return chunk
    }
    const match = ERASE_PREFIX.exec(chunk)
    if (match === null) {
      // A frame written without an erase prefix: Ink's first render, or a
      // `log.clear()` that reset its count so the burst's rows arrive bare.
      // The live frame is the burst's last write, which is why each one
      // replaces the model; outside a burst only the first frame is adopted.
      if (chunk !== '' && (inBurst || frame === null)) frame = chunk
      return chunk
    }
    const content = chunk.slice(match[0].length)
    if (content === '') {
      // Erase only (`log.clear()`): the redraw that follows arrives bare.
      armBurst()
    } else {
      frame = content
      inBurst = false
    }
    if (pending === 0) return chunk
    const target = pending
    pending = 0
    // Never shorten an erase: a terminal that re-wrapped fewer rows than the
    // model predicts would strand nothing, while a shorter erase could leave
    // the model's rows behind.
    return erasedRows(match[0]) < target ? eraseLines(target) + content : chunk
  }

  // Read as a property, not a method: the reference is re-installed verbatim on
  // restore, so the stream's identity must survive the round trip.
  const originalWrite = (stdout as { write: (...args: unknown[]) => boolean }).write
  const reflowWrite = (chunk: unknown, ...rest: unknown[]): boolean => {
    const next = typeof chunk === 'string' ? rewrite(chunk) : chunk
    return originalWrite.call(stdout, next, ...rest)
  }
  const installed = reflowWrite as typeof stdout.write
  stdout.write = installed

  return {
    restore: () => {
      if (stdout.write === installed) stdout.write = originalWrite
      stdout.off('resize', onResize)
    },
  }
}
