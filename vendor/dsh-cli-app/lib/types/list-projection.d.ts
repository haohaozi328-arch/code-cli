/**
 * The Session-list metadata projection (`sessionListMetadata`): the
 * blank/lastPromptAt fold the session picker reads from the projection
 * cache. The official registration lives in the web surface's
 * session-controller row; a terminal-only profile mounts no
 * session-controller, so this bundle registers the same unit itself — same
 * key, same state shape, same stateVersion — keeping checkpoint rows
 * compatible in both directions: rows written under the web surface load
 * here, and rows written here load under the web surface.
 * @module @dsh-external/dsh-cli-app/list-projection
 */
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** Persisted facts used to summarize a Session without activating it. */
export interface SessionListMetadata {
    /** Whether the folded prefix contains no turn. */
    readonly blank: boolean;
    /** Latest human-authored prompt time in the folded prefix. */
    readonly lastPromptAt: number | null;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        /** Host state persisted for cold Session list summaries. */
        sessionListMetadata: SessionListMetadata;
    }
    interface SessionProjectionMap {
        /** Persisted facts used to summarize a Session without activating it. */
        sessionListMetadata: SessionListMetadata;
    }
}
/**
 * Advance the Session-list metadata projection by one committed event.
 * @param state - metadata before the event.
 * @param event - next committed Session event.
 * @returns the original or advanced metadata value.
 */
export declare function applySessionListMetadata(state: SessionListMetadata, event: SessionEvent): SessionListMetadata;
/**
 * Register the projection into the process registry. The registration is an
 * effect on the calling context's fiber, so it lives exactly as long as the
 * terminal app.
 * @param ctx - context carrying the session-projection registry service.
 */
export declare function registerSessionListProjection(ctx: Context): void;
//# sourceMappingURL=list-projection.d.ts.map