/**
 * In-process prompt history for the terminal composer. One store lives for the
 * whole process and is shared by every session it serves, so `/new`, `/fork`,
 * and `/sessions` switches keep the recalled context; each view model seeds it
 * with its own session's durable prompts, which is how a resumed session
 * brings its history back.
 * @module @dsh-external/dsh-cli-app/ui/history
 */
/** Retained prompts; the oldest falls off as new ones arrive. */
export declare const PROMPT_HISTORY_LIMIT = 100;
/** The composer's prompt history: newest-first recall with a live-edit draft. */
export interface PromptHistory {
    /** Record one submitted prompt; empty text and a repeat of the newest are no-ops. */
    remember(text: string): void;
    /** Step to an older (1) or newer (-1) entry; `draft` is preserved for the return to live. */
    step(delta: 1 | -1, draft: string): string | null;
    /** Drop the cursor back to live editing. */
    reset(): void;
    /** Newest-first snapshot (tests and seeding). */
    entries(): readonly string[];
}
/** Create one history store, optionally seeded chronologically (oldest first). */
export declare function createPromptHistory(seed?: readonly string[]): PromptHistory;
//# sourceMappingURL=history.d.ts.map