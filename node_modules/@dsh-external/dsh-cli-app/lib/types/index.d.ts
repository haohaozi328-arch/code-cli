/**
 * `@dsh-external/dsh-cli-app` — interactive terminal frontend for dsh. The
 * bundle patch rides over dsh-base without Host, HTTP, or browser plugins;
 * this glue waits for the Loader tree, creates or resumes the single Agent
 * through the core registry, mounts the Ink UI, and exits through the
 * launcher's bounded shutdown when the UI asks to leave.
 * @module @dsh-external/dsh-cli-app
 */
import React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ViewModel } from './ui/model.ts';
/** Stable Cordis plugin name. */
export declare const name = "cli-app";
/** The surface an Ink render returns, narrowed to what the glue consumes. */
export interface InkSurface {
    /** Replace the previous root node with a new one (new view model). */
    rerender(element: React.ReactElement): void;
    /** Manually unmount the whole Ink app. */
    unmount(): void;
    /** Erase Ink's dynamic output and clear the visible viewport; absent on test doubles. */
    clearViewport?(): void;
    /** Clear the visible viewport AND the terminal scrollback; absent on test doubles. */
    clearScreen?(): void;
}
/** The terminal streams one Ink surface renders on. */
export interface RenderStreams {
    /** The stream Ink renders to; the reflow correction is installed on it. */
    stdout: NodeJS.WriteStream;
    /** The input stream Ink reads keys from; defaults to `process.stdin`. */
    stdin?: NodeJS.ReadStream;
}
/**
 * Render the terminal app on one stream pair, with the resize reflow correction
 * installed around it. The correction goes in before Ink so its `resize`
 * listener runs ahead of Ink's own: that ordering is what lets it measure the
 * shrink before Ink erases with the count computed at the previous width.
 * @param element - the Ink element tree to mount.
 * @param streams - the terminal streams Ink renders on and reads keys from.
 * @returns the mounted surface the session loop drives.
 */
export declare function renderApp(element: React.ReactElement, streams: RenderStreams): InkSurface;
/**
 * Process render slot tests substitute: {@link renderApp} on the process
 * streams, or a capture that drives {@link ViewModel.done} through the
 * element's `vm` prop.
 */
export declare const internals: {
    render: (element: React.ReactElement) => InkSurface;
};
/**
 * Test-only handle to the live view model. Composition tests drive session
 * actions through the same surface the key handlers use, because the Ink
 * testing library's fake stdin does not reach ink 5's hard-wired
 * `process.stdin`.
 */
export declare const testHooks: {
    currentVm: ViewModel | null;
};
/** Core services required before the terminal session can start. */
export declare const inject: string[];
/** Plugin config: invocation values resolved from the startup provider. */
export interface Config {
    /** Persisted session id to resume; empty string starts a fresh session. */
    resumeSessionId: string;
    /** Workspace root for a fresh session; empty string = process.cwd(). */
    cwd: string;
    /** `provider/model` override; empty string = agent-default-model. */
    model: string;
    /** Terminal theme name. */
    theme: string;
    /** Layout chrome: `classic` | `opencode` (defaults to `classic`). */
    ui: string;
}
export declare const Config: z<Config>;
/** Mount the terminal glue. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map