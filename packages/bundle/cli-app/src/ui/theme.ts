/**
 * Terminal theme tokens — Luoxiaohei-inspired dual palettes carried from the
 * browser skin (dsh-skin-luoxiaohei) into the terminal. M1 carries the core
 * surfaces; M4 completes the full token set and auto-detection.
 * @module @dsh-external/dsh-cli-app/ui/theme
 */

export interface ThemeTokens {
  /** Brand accent: user rows / prompt / status highlights. */
  brand: string
  /** Primary foreground. */
  text: string
  /** Secondary / timestamps / hints. */
  muted: string
  /** Reasoning text (thinking). */
  reasoning: string
  /** Success states. */
  ok: string
  /** Warning states. */
  warn: string
  /** Errors. */
  error: string
  /** Inline code / code-block text. */
  codeText: string
  /** Code-block background chip. */
  codeBg: string
}

/** Shipped theme names plus `auto`; startup validates against this list. */
export type ThemeName = 'auto' | 'cream-forest' | 'deep-forest'

/** Every accepted theme name, for startup validation and help text. */
export const THEME_NAMES: readonly ThemeName[] = ['auto', 'cream-forest', 'deep-forest']

/** Shipped palettes; values mirror the skin tokens where meaningful. */
export const THEMES: Record<'cream-forest' | 'deep-forest', ThemeTokens> = {
  'cream-forest': {
    brand: '#2E7D5B',
    text: '#20352B',
    muted: '#5C6E62',
    reasoning: '#7A8B80',
    ok: '#4C9A3E',
    warn: '#C98A1B',
    error: '#C94F4F',
    codeText: '#3A5A44',
    codeBg: '#EDEDE4',
  },
  'deep-forest': {
    brand: '#A8E10C',
    text: '#E9E4D0',
    muted: '#A9B4A4',
    reasoning: '#6E8378',
    ok: '#8FCF5A',
    warn: '#E0A93C',
    error: '#E0705F',
    codeText: '#CDE8C0',
    codeBg: '#101D16',
  },
}

/**
 * Resolve the effective palette for this invocation.
 * @param name - validated theme name from the startup provider; typed `string`
 *   so a bypassed-validation config still fails loud here instead of reaching
 *   the renderer as `undefined`.
 * @returns the palette.
 * @throws when `name` is not a shipped theme.
 */
export function resolveTheme(name: string): ThemeTokens {
  if (name === 'auto') {
    // M1: auto defaults to the dark forest; M4 probes the terminal background
    // (COLORTERM / OSC 11) to pick a side.
    return THEMES['deep-forest']
  }
  // `in` keeps the runtime check meaningful where an index-read would let
  // TypeScript narrow the result to never-undefined.
  if (!(name in THEMES)) {
    throw new TypeError(`unknown theme ${JSON.stringify(name)}; expected one of ${THEME_NAMES.join(', ')}`)
  }
  return THEMES[name as keyof typeof THEMES]
}
