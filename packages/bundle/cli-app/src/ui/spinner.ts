/**
 * The running indicator's animation arithmetic: opencode's braille dot cycle
 * stepped on a fixed interval, plus the elapsed label. Pure so tests pin the
 * cadence without timers; the App owns the clock.
 * @module @dsh-external/dsh-cli-app/ui/spinner
 */

/** Braille frames cycled while the agent runs. */
export const SPINNER_FRAMES: readonly string[] = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Milliseconds one frame holds. */
export const SPINNER_INTERVAL_MS = 80

/**
 * Frame glyph for one point in the cycle.
 * @param elapsedMs - milliseconds since the turn started; negative reads as zero.
 * @returns the frame glyph.
 */
export function spinnerFrame(elapsedMs: number): string {
  const step = Math.floor(Math.max(0, elapsedMs) / SPINNER_INTERVAL_MS)
  return SPINNER_FRAMES[step % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0] ?? '⠋'
}

/**
 * Compact elapsed label for the running indicator.
 * @param elapsedMs - milliseconds since the turn started; negative reads as zero.
 * @returns `Ns` below a minute, then `MmSs`.
 */
export function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  return `${Math.floor(totalSeconds / 60)}m${totalSeconds % 60}s`
}
