/**
 * Ink rendering of the projected markdown lines: nested `Text` nodes for inline
 * spans and one node per display line. The parsing itself lives in
 * `markdown.ts`.
 * @module @dsh-external/dsh-cli-app/ui/markdown-view
 */
import React from 'react';
import type { ThemeTokens } from './theme.ts';
import { type InlineSpan } from './markdown.ts';
/**
 * Render one line's spans as nested Ink Text nodes.
 * @param spans - inline spans from `parseInline`.
 * @param theme - active palette.
 * @returns the styled line node.
 */
export declare function renderSpans(spans: readonly InlineSpan[], theme: ThemeTokens): React.JSX.Element;
/**
 * Render a full markdown text as a column of styled lines.
 * @param props - the markdown body and the active palette.
 * @returns the rendered column.
 */
export declare function MarkdownText(props: {
    text: string;
    theme: ThemeTokens;
}): React.JSX.Element;
//# sourceMappingURL=markdown-view.d.ts.map