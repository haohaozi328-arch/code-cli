/**
 * Spinner arithmetic: the braille cycle steps on a fixed interval and the
 * elapsed label stays compact. Pure — no timers.
 */

import { describe, expect, it } from 'vitest'
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, formatElapsed, spinnerFrame } from '../src/ui/spinner.ts'

describe('spinner arithmetic', () => {
  it('cycles the braille frames on the fixed interval', () => {
    expect(spinnerFrame(0)).toBe(SPINNER_FRAMES[0])
    expect(spinnerFrame(SPINNER_INTERVAL_MS)).toBe(SPINNER_FRAMES[1])
    expect(spinnerFrame(SPINNER_INTERVAL_MS * SPINNER_FRAMES.length)).toBe(SPINNER_FRAMES[0])
    // Negative time clamps to the first frame instead of walking backwards.
    expect(spinnerFrame(-5)).toBe(SPINNER_FRAMES[0])
  })

  it('formats the elapsed label compactly', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(59_000)).toBe('59s')
    expect(formatElapsed(61_000)).toBe('1m1s')
    expect(formatElapsed(-1)).toBe('0s')
  })
})
