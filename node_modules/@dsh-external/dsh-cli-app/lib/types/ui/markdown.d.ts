/**
 * Terminal markdown projection: inline span parsing and block-aware line
 * projection. Both are pure and unit-tested; {@link MarkdownText} in
 * `markdown.tsx` maps the result onto Ink nodes.
 * @module @dsh-external/dsh-cli-app/ui/markdown
 */
/** One inline text span with a display style. */
export interface InlineSpan {
    kind: 'text' | 'code' | 'bold' | 'italic';
    text: string;
}
/**
 * Parse one line into inline spans. Markers nest one level only.
 * @param line - the raw line.
 * @returns the spans in display order.
 */
export declare function parseInline(line: string): InlineSpan[];
/** One projected display line. */
export interface MarkdownLine {
    kind: 'code' | 'heading' | 'list' | 'quote' | 'plain';
    /** Code-block body (kind code) or the display line text. */
    text: string;
    /** Language hint after the opening fence, when present. */
    lang?: string;
    /** Block-quote level, when > 0. */
    quoteLevel?: number;
}
/**
 * Project raw markdown text into typed display lines.
 * @param text - the raw markdown body.
 * @returns one entry per rendered line.
 */
export declare function projectMarkdown(text: string): MarkdownLine[];
//# sourceMappingURL=markdown.d.ts.map