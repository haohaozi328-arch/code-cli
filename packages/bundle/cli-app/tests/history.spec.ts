/**
 * The composer's prompt history: seeding, dedupe, cap, and the ↑/↓ cursor with
 * its preserved draft.
 * @module tests/history.spec
 */

import { describe, expect, it } from 'vitest'
import { PROMPT_HISTORY_LIMIT, createPromptHistory } from '../src/ui/history.ts'

describe('createPromptHistory', () => {
  it('seeds chronologically, newest first, deduping consecutive repeats', () => {
    const history = createPromptHistory(['第一问', '第二问', '第二问', '第三问', ''])
    expect(history.entries()).toEqual(['第三问', '第二问', '第一问'])
  })

  it('caps the store and keeps the newest entries', () => {
    const history = createPromptHistory(Array.from({ length: PROMPT_HISTORY_LIMIT + 20 }, (_, i) => `问 ${i}`))
    expect(history.entries()).toHaveLength(PROMPT_HISTORY_LIMIT)
    expect(history.entries()[0]).toBe(`问 ${PROMPT_HISTORY_LIMIT + 19}`)
  })

  it('steps back through entries and restores the draft past the newest', () => {
    const history = createPromptHistory(['第一问', '第二问'])
    expect(history.step(1, '草稿')).toBe('第二问')
    expect(history.step(1, '草稿')).toBe('第一问')
    expect(history.step(1, '草稿')).toBe('第一问')
    expect(history.step(-1, '草稿')).toBe('第二问')
    expect(history.step(-1, '草稿')).toBe('草稿')
    expect(history.step(-1, '草稿')).toBeNull()
  })

  it('returns null when empty and dedupes a resubmitted newest prompt', () => {
    const history = createPromptHistory()
    expect(history.step(1, '')).toBeNull()
    history.remember('只有一条')
    history.remember('只有一条')
    expect(history.entries()).toEqual(['只有一条'])
    expect(history.step(1, '')).toBe('只有一条')
  })

  it('reset returns the cursor to live so the next step starts from the newest', () => {
    const history = createPromptHistory(['第一问', '第二问'])
    expect(history.step(1, '')).toBe('第二问')
    history.reset()
    history.remember('第三问')
    expect(history.step(1, '')).toBe('第三问')
  })
})
