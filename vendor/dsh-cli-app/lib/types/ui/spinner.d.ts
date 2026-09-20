/**
 * The running indicator's animation arithmetic: opencode's braille dot cycle
 * stepped on a fixed interval, plus the elapsed label. Pure so tests pin the
 * cadence without timers; the App owns the clock.
 * @module @dsh-external/dsh-cli-app/ui/spinner
 */
/** Braille frames cycled while the agent runs. */
export declare const SPINNER_FRAMES: readonly string[];
/** Milliseconds one frame holds. */
export declare const SPINNER_INTERVAL_MS = 80;
/**
 * Frame glyph for one point in the cycle.
 * @param elapsedMs - milliseconds since the turn started; negative reads as zero.
 * @returns the frame glyph.
 */
export declare function spinnerFrame(elapsedMs: number): string;
/**
 * Compact elapsed label for the running indicator.
 * @param elapsedMs - milliseconds since the turn started; negative reads as zero.
 * @returns `Ns` below a minute, then `MmSs`.
 */
export declare function formatElapsed(elapsedMs: number): string;
//# sourceMappingURL=spinner.d.ts.map