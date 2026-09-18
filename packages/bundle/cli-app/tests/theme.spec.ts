/** Theme token resolution: shipped palettes, auto default, loud unknown-name failure. */

import { describe, expect, it } from 'vitest'
import { THEME_NAMES, THEMES, resolveTheme } from '../src/ui/theme.ts'

describe('theme tokens', () => {
  it('auto resolves to the dark forest palette', () => {
    expect(resolveTheme('auto')).toBe(THEMES['deep-forest'])
  })

  it('resolves each shipped palette by name', () => {
    expect(resolveTheme('cream-forest')).toBe(THEMES['cream-forest'])
    expect(resolveTheme('deep-forest')).toBe(THEMES['deep-forest'])
  })

  it('advertises every accepted name for startup validation', () => {
    expect(THEME_NAMES).toEqual(['auto', 'cream-forest', 'deep-forest'])
  })

  it('throws on an unknown theme instead of reaching the renderer as undefined', () => {
    expect(() => resolveTheme('bogus')).toThrow(/unknown theme "bogus"/)
    expect(() => resolveTheme('')).toThrow(/expected one of auto, cream-forest, deep-forest/)
  })
})
