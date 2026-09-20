/**
 * Terminal theme tokens — Luoxiaohei-inspired dual palettes carried from the
 * browser skin (dsh-skin-luoxiaohei) into the terminal. M1 carries the core
 * surfaces; M4 completes the full token set and auto-detection.
 * @module @dsh-external/dsh-cli-app/ui/theme
 */
export interface ThemeTokens {
    /** Brand accent: user rows / prompt / status highlights. */
    brand: string;
    /** Primary foreground. */
    text: string;
    /** Secondary / timestamps / hints. */
    muted: string;
    /** Reasoning text (thinking). */
    reasoning: string;
    /** Success states. */
    ok: string;
    /** Warning states. */
    warn: string;
    /** Errors. */
    error: string;
    /** Inline code / code-block text. */
    codeText: string;
    /** Code-block background chip. */
    codeBg: string;
}
/** Shipped theme names plus `auto`; startup validates against this list. */
export type ThemeName = 'auto' | 'cream-forest' | 'deep-forest';
/** Every accepted theme name, for startup validation and help text. */
export declare const THEME_NAMES: readonly ThemeName[];
/** Shipped palettes; values mirror the skin tokens where meaningful. */
export declare const THEMES: Record<'cream-forest' | 'deep-forest', ThemeTokens>;
/**
 * Resolve the effective palette for this invocation.
 * @param name - validated theme name from the startup provider; typed `string`
 *   so a bypassed-validation config still fails loud here instead of reaching
 *   the renderer as `undefined`.
 * @returns the palette.
 * @throws when `name` is not a shipped theme.
 */
export declare function resolveTheme(name: string): ThemeTokens;
//# sourceMappingURL=theme.d.ts.map