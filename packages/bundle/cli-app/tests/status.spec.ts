/**
 * Status-line arithmetic and formatting: throughput windows, compact counts,
 * and the context ring's glyph/band mapping. Pure — no Ink, no session.
 */

import { describe, expect, it } from 'vitest'
import { COPY } from '../src/ui/copy.ts'
import {
  contextBand,
  contextOccupancy,
  contextRing,
  estimateLiveTokens,
  formatTokenCount,
  formatTokenRate,
  tokensPerSecond,
} from '../src/ui/status.ts'

describe('status measurements', () => {
  it('prices streamed characters at the meter density', () => {
    expect(estimateLiveTokens(0)).toBe(0)
    expect(estimateLiveTokens(4)).toBe(1)
    expect(estimateLiveTokens(5)).toBe(2)
  })

  it('refuses a rate below the minimum window and otherwise divides over seconds', () => {
    expect(tokensPerSecond(100, 99)).toBeNull()
    expect(tokensPerSecond(100, 100)).toBe(1_000)
    expect(tokensPerSecond(200, 2_000)).toBe(100)
  })

  it('resolves bounded occupancy only when both inputs are known', () => {
    expect(contextOccupancy(undefined, 128_000)).toBeNull()
    expect(contextOccupancy(1_000, undefined)).toBeNull()
    expect(contextOccupancy(64_000, 128_000)).toEqual({
      percent: 50, usedTokens: 64_000, contextWindow: 128_000,
    })
    // Overflow clamps instead of reporting over 100.
    expect(contextOccupancy(200_000, 128_000)?.percent).toBe(100)
  })
})

describe('status formatting', () => {
  it('formats a rate with one decimal below 100/s and rounds above', () => {
    expect(formatTokenRate(null)).toBe(COPY.measurementUnavailable)
    expect(formatTokenRate(0.5)).toBe('0.5')
    expect(formatTokenRate(42.5)).toBe('42.5')
    expect(formatTokenRate(102.4)).toBe('102')
  })

  it('abbreviates large counts', () => {
    expect(formatTokenCount(0)).toBe('0')
    expect(formatTokenCount(999)).toBe('999')
    expect(formatTokenCount(3_345)).toBe('3.3K')
    expect(formatTokenCount(1_200_000)).toBe('1.2M')
  })

  it('maps occupancy onto the ring glyph and pressure band', () => {
    expect([0, 1, 25, 26, 50, 51, 75, 76, 100].map(contextRing))
      .toEqual(['○', '◔', '◔', '◑', '◑', '◕', '◕', '●', '●'])
    expect([0, 59, 60, 84, 85, 100].map(contextBand))
      .toEqual(['ok', 'ok', 'warn', 'warn', 'high', 'high'])
  })
})
