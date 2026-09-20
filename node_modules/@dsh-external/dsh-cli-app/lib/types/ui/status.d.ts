/**
 * Status-line arithmetic and formatting: generation throughput, cumulative
 * usage, and context-window occupancy. The view model owns the live inputs and
 * this module owns every number-to-text decision, so the classic status bar and
 * the opencode composer cannot format the same fact two ways.
 * @module @dsh-external/dsh-cli-app/ui/status
 */
import type { ContextOccupancy } from './model.ts';
/**
 * Heuristic tokens of text streamed so far in one attempt.
 * @param chars - characters of text and reasoning streamed in this attempt.
 * @returns the estimated token count.
 */
export declare function estimateLiveTokens(chars: number): number;
/**
 * Derive a throughput over one observation window.
 * @param tokens - tokens credited to the window.
 * @param elapsedMs - window length in milliseconds.
 * @returns tokens per second, or null when the window is too short to divide by.
 */
export declare function tokensPerSecond(tokens: number, elapsedMs: number): number | null;
/**
 * Format a throughput for the status line.
 * @param rate - tokens per second, or null before any sample.
 * @returns the display text, using a dash before the first sample.
 */
export declare function formatTokenRate(rate: number | null): string;
/**
 * Format a token count compactly for the status line.
 * @param tokens - token count.
 * @returns the count, abbreviated with `K`/`M` above 1000.
 */
export declare function formatTokenCount(tokens: number): string;
/**
 * Resolve occupancy from independently updated tokens and capacity.
 * @param usedTokens - tokens the next request's prompt would carry, or undefined before any measurement.
 * @param contextWindow - newest recorded route capacity, or undefined when the adapter advertises none.
 * @returns the bounded occupancy, or null while either input is unknown.
 */
export declare function contextOccupancy(usedTokens: number | undefined, contextWindow: number | undefined): ContextOccupancy | null;
/**
 * Ring glyph for one occupancy.
 * @param percent - occupancy percentage, 0–100.
 * @returns the fraction glyph nearest above the occupancy.
 */
export declare function contextRing(percent: number): string;
/**
 * Pressure band a renderer maps to a theme colour.
 * @param percent - occupancy percentage, 0–100.
 * @returns `ok` below 60, `warn` below 85, `high` otherwise.
 */
export declare function contextBand(percent: number): 'ok' | 'warn' | 'high';
//# sourceMappingURL=status.d.ts.map