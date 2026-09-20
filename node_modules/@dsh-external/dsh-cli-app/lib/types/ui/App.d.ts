/**
 * Ink application root for the dsh terminal session.
 *
 * Two layout chromes share one view model and one keyboard contract:
 *   - `classic`   the original single-column terminal look.
 *   - `opencode`  an opencode-style frame: a centered welcome page for an empty
 *     session, then a left-aligned transcript once a conversation begins.
 *
 * The transcript is split between Ink's `<Static>` output and the live region.
 * Committed rows are written once and stay in the terminal's own scrollback, so
 * resizing or scrolling never repaints them; only the streaming row, the modal
 * overlays, and the input line are redrawn. That split is what keeps the app
 * correct on resize and gives the terminal native mouse-wheel scrolling.
 * @module @dsh-external/dsh-cli-app/ui/App
 */
import React from 'react';
import type { ViewModel } from './model.ts';
import type { ThemeTokens } from './theme.ts';
import type { UiChrome } from './chrome.ts';
/** App root: static transcript, live region, modals, and the input line. */
export declare function App(props: {
    vm: ViewModel;
    theme: ThemeTokens;
    ui?: UiChrome;
}): React.JSX.Element;
//# sourceMappingURL=App.d.ts.map