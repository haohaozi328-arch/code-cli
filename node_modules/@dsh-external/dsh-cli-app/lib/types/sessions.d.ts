/**
 * Session-surface helpers for the terminal app: persisted-session catalog
 * (id/title/cwd/time/event count), fork-seed collection over a live session
 * log, and display formatting. Pure reads: catalog rows come from the
 * projection cache when available, with one read-only handle per uncached
 * session as the fallback; titles come from the persisted projection cache.
 * @module @dsh-external/dsh-cli-app/sessions
 */
import type { Context } from '@deepseek-ai/cordis';
import { type Session, type SessionEvent } from '@deepseek-ai/dsh-session';
/** One row of the resume picker. */
export interface SessionSummary {
    readonly sessionId: string;
    /** Best-effort title from the projection cache; null when unavailable. */
    readonly title: string | null;
    /** Absolute working directory the session was created in, when recorded. */
    readonly cwd: string | null;
    /** Creation time, Unix epoch milliseconds. */
    readonly createdAt: number;
    /** Last user-prompt activity time; used for newest-first ordering. */
    readonly updatedAt: number;
    /** True when the session has no user-authored conversation yet. */
    readonly blank: boolean;
    /** The session this one was forked from, when seeded. */
    readonly parentSession: string | null;
}
/**
 * Read the persisted-session catalog through official seams only.
 * @param ctx - process context carrying the persistence and title-cache services.
 * @returns the newest sessions, capped at one picker page.
 */
export declare function listPersistedSessions(ctx: Context): Promise<SessionSummary[]>;
/**
 * The balanced completed-turn prefix of a live session log: every event up to
 * and including the last `turn/end`. The in-flight turn is excluded (it cannot
 * be replayed as a valid child session); before any completed turn the child
 * starts fresh, so the caller omits the seed entirely. Mirrors the in-process
 * fork provider's slice semantics.
 * @param session - the session to slice.
 * @returns the seed events, contiguous from seq 0; empty when no turn has completed.
 */
export declare function collectForkSeed(session: Session): SessionEvent[];
/**
 * Short terminal-friendly relative time for a picker row.
 * @param epochMs - creation time, Unix epoch milliseconds.
 * @param now - reference time, injectable for tests.
 * @returns the relative-time label.
 */
export declare function formatWhen(epochMs: number, now?: number): string;
/**
 * Terminal-friendly tail of a workspace path for picker rows and the label.
 * @param cwd - absolute workspace path, or null when unrecorded.
 * @returns the last two path segments, or an empty string.
 */
export declare function shortCwd(cwd: string | null): string;
/**
 * Display label for the current session in the status bar.
 * @param summary - the session's title, id, and workspace.
 * @returns the label text.
 */
export declare function sessionLabel(summary: Pick<SessionSummary, 'title' | 'sessionId' | 'cwd'>): string;
//# sourceMappingURL=sessions.d.ts.map