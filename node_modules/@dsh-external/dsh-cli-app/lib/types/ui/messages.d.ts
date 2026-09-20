/**
 * Transcript row components shared by both layouts. The chrome only changes
 * the role labels: the opencode frame drops the `你`/`助手` prefixes and lets
 * the row spacing separate speakers.
 * @module @dsh-external/dsh-cli-app/ui/messages
 */
import React from 'react';
import type { UiMessage } from './model.ts';
import type { ThemeTokens } from './theme.ts';
import type { UiChrome } from './chrome.ts';
/**
 * Icon + short name for a tool card.
 * @param toolName - the tool's registered name.
 * @returns the badge text.
 */
export declare function toolBadge(toolName: string): string;
/**
 * Collapse a tool result to the card's readable budget.
 * @param value - the full result text.
 * @returns the text as rendered, with a truncation footer when clipped.
 */
export declare function previewToolResult(value: string): string;
/** One transcript row: user, assistant, or tool card. */
export declare function MessageRow(props: {
    message: UiMessage;
    theme: ThemeTokens;
    /** Assistant reasoning expanded for this row? */
    reasoningExpanded: boolean;
    /** Layout chrome the row renders in. */
    chrome: UiChrome;
}): React.JSX.Element;
//# sourceMappingURL=messages.d.ts.map