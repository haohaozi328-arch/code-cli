/**
 * Terminal control sequences: `/clear` must emit real escape bytes. The
 * regression this guards is a hand-written literal (`\x1b[2J`) reaching the
 * terminal as visible text.
 */

import { describe, expect, it } from 'vitest'
import { CLEAR_VIEWPORT } from '../src/ui/terminal.ts'

describe('terminal control sequences', () => {
  it('clears the viewport with escape bytes, never an escaped literal', () => {
    expect(CLEAR_VIEWPORT).toBe('\u001b[2J\u001b[H')
    expect(CLEAR_VIEWPORT).not.toContain('\\x1b')
    expect(CLEAR_VIEWPORT).not.toContain('\\u001b')
  })
})
