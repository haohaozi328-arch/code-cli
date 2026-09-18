/**
 * Status-line arithmetic and formatting: generation throughput, cumulative
 * usage, and context-window occupancy. The view model owns the live inputs and
 * this module owns every number-to-text decision, so the classic status bar and
 * the opencode composer cannot format the same fact two ways.
 * @module @dsh-external/dsh-cli-app/ui/status
 */

import { COPY } from './copy.ts'
import type { ContextOccupancy } from './model.ts'

/**
 * Fixed text density for the live throughput estimate. It matches the token
 * meter's own heuristic, so a streaming estimate and the provider sample that
 * replaces it read on one scale.
 */
const CHARS_PER_TOKEN = 4

/** Shortest window a rate may be derived from, so one burst cannot divide by ~0 ms. */
const MIN_RATE_WINDOW_MS = 100

/** Ring fractions, low to full; five steps are the resolution the glyph set offers. */
const RING_GLYPHS: readonly string[] = ['○', '◔', '◑', '◕', '●']

/**
 * Heuristic tokens of text streamed so far in one attempt.
 * @param chars - characters of text and reasoning streamed in this attempt.
 * @returns the estimated token count.
 */
export function estimateLiveTokens(chars: number): number {
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

/**
 * Derive a throughput over one observation window.
 * @param tokens - tokens credited to the window.
 * @param elapsedMs - window length in milliseconds.
 * @returns tokens per second, or null when the window is too short to divide by.
 */
export function tokensPerSecond(tokens: number, elapsedMs: number): number | null {
  if (elapsedMs < MIN_RATE_WINDOW_MS) return null
  return tokens / (elapsedMs / 1000)
}

/**
 * Format a throughput for the status line.
 * @param rate - tokens per second, or null before any sample.
 * @returns the display text, using a dash before the first sample.
 */
export function formatTokenRate(rate: number | null): string {
  if (rate === null) return COPY.measurementUnavailable
  return rate >= 100 ? String(Math.round(rate)) : rate.toFixed(1)
}

/**
 * Format a token count compactly for the status line.
 * @param tokens - token count.
 * @returns the count, abbreviated with `K`/`M` above 1000.
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return String(tokens)
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`
  return `${(tokens / 1_000_000).toFixed(1)}M`
}

/**
 * Resolve occupancy from independently updated tokens and capacity.
 * @param usedTokens - tokens the next request's prompt would carry, or undefined before any measurement.
 * @param contextWindow - newest recorded route capacity, or undefined when the adapter advertises none.
 * @returns the bounded occupancy, or null while either input is unknown.
 */
export function contextOccupancy(
  usedTokens: number | undefined,
  contextWindow: number | undefined,
): ContextOccupancy | null {
  if (usedTokens === undefined || contextWindow === undefined) return null
  return {
    percent: Math.min(100, Math.round(usedTokens / contextWindow * 100)),
    usedTokens,
    contextWindow,
  }
}

/**
 * Ring glyph for one occupancy.
 * @param percent - occupancy percentage, 0–100.
 * @returns the fraction glyph nearest above the occupancy.
 */
export function contextRing(percent: number): string {
  const step = Math.ceil(Math.min(100, Math.max(0, percent)) / 25)
  return RING_GLYPHS[Math.min(step, RING_GLYPHS.length - 1)] ?? '○'
}

/**
 * Pressure band a renderer maps to a theme colour.
 * @param percent - occupancy percentage, 0–100.
 * @returns `ok` below 60, `warn` below 85, `high` otherwise.
 */
export function contextBand(percent: number): 'ok' | 'warn' | 'high' {
  if (percent < 60) return 'ok'
  if (percent < 85) return 'warn'
  return 'high'
}
