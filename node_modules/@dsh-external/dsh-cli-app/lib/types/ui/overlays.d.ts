/**
 * Modal surfaces drawn over the transcript: the session picker, the generic
 * choice list, the tool-approval question, the slash-command palette, and the
 * `/connect` prompt. Each is a pure function of the state it is handed.
 * @module @dsh-external/dsh-cli-app/ui/overlays
 */
import React from 'react';
import type { ApprovalPrompt, ChoiceItem, CommandHint, ConnectWizardState } from './model.ts';
import type { SessionSummary } from '../sessions.ts';
import type { ThemeTokens } from './theme.ts';
/** Compact modal session picker with an inline search field. */
export declare function SessionPicker(props: {
    items: SessionSummary[];
    selected: number;
    search: string;
    theme: ThemeTokens;
}): React.JSX.Element;
/** Generic bounded choice list used by `/model`, `/perm`, `/connect`, and `/skills`. */
export declare function ChoiceList(props: {
    title: string;
    items: readonly ChoiceItem[];
    selected: number;
    theme: ThemeTokens;
    /** Placeholder shown while the item list is still loading. */
    note: string | undefined;
    /** Live filter text owned by the App; drives the footer and the empty row. */
    search: string;
}): React.JSX.Element;
/** Tool-approval question: the pending tool and its key choices. */
export declare function ApprovalModal(props: {
    prompt: ApprovalPrompt | null;
    theme: ThemeTokens;
}): React.JSX.Element;
/** Slash-command palette shown while the input starts with `/`. */
export declare function CommandMenu(props: {
    matches: readonly CommandHint[];
    selected: number;
    theme: ThemeTokens;
}): React.JSX.Element;
/** Prompt panel for the `/connect` wizard. */
export declare function ConnectPrompt(props: {
    wizard: ConnectWizardState;
    theme: ThemeTokens;
}): React.JSX.Element;
/** The /title editor: one text field over the shared composer buffer. */
export declare function TitlePrompt(props: {
    current: string | null;
    theme: ThemeTokens;
}): React.JSX.Element;
//# sourceMappingURL=overlays.d.ts.map