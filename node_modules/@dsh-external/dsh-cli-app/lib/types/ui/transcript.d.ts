/**
 * Durable-log projection for the transcript. One projector serves both the
 * initial replay of a session and every live `session/event`, so a resumed
 * conversation and an in-flight one can never render differently. The durable
 * log is the only source of truth; live assistant streaming paints separately
 * and settles back into these rows.
 * @module @dsh-external/dsh-cli-app/ui/transcript
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import { type Session, type SessionEvent } from '@deepseek-ai/dsh-session';
import type { TodoList, UiMessage } from './model.ts';
/**
 * Extract plain text and reasoning from content blocks.
 * @param content - the message content blocks.
 * @returns the concatenated text and reasoning.
 */
export declare function blocksToText(content: readonly ContentBlock[]): {
    text: string;
    reasoning: string;
};
/**
 * Collapse a long text into one readable hint line.
 * @param text - the full text.
 * @param max - longest line to keep before truncating.
 * @returns the first non-empty line, truncated when needed.
 */
export declare function collapseFirstLine(text: string, max?: number): string;
/**
 * Short one-line argument preview from a raw tool-arguments JSON string.
 * @param argumentsJson - the tool call's raw arguments.
 * @returns the preview text, or an empty string for empty/`{}` arguments.
 */
export declare function argsSummaryOf(argumentsJson: string): string;
/**
 * One-line result preview from a tool result block's content.
 * @param content - the result message's content blocks.
 * @returns the preview text, or an empty string when no text block has content.
 */
export declare function resultSummaryOf(content: readonly ContentBlock[]): string;
/**
 * Cumulative durable token usage across the log (a resumed session shows history, not zero).
 * @param session - the live session.
 * @returns the summed input, output, and reasoning tokens.
 */
export declare function countDurableTokens(session: Session): {
    input: number;
    output: number;
    reasoning: number;
};
/**
 * Apply one durable session event to the transcript rows.
 * @param rows - current rows, treated as immutable.
 * @param event - the durable event to fold in.
 * @returns a new row list, or `rows` itself when the event adds nothing.
 */
export declare function projectEvent(rows: UiMessage[], event: SessionEvent): UiMessage[];
/**
 * Scan the durable log once and project it into transcript rows.
 * @param session - the session to replay.
 * @returns the projected rows.
 */
export declare function replaySession(session: Session): UiMessage[];
/**
 * True once the session holds real conversation content: a user-originated
 * message or an assistant reply. Injected context alone does not count, so a
 * launched-but-untouched session reads as empty.
 * @param session - the session to inspect.
 * @returns whether the durable log contains a conversation.
 */
export declare function hasConversation(session: Session): boolean;
/**
 * True once a row can never change again, so the static transcript may own it.
 * @param row - the transcript row.
 * @returns whether the row is settled.
 */
export declare function isSettledRow(row: UiMessage): boolean;
/**
 * Split the transcript into the stable prefix Ink writes once and the still-live
 * suffix it repaints. The boundary is the first unsettled row, so an append that
 * settles out of order can never print above live content.
 * @param messages - the full row list, including hidden injected-context rows.
 * @returns the static prefix and the live suffix.
 */
export declare function splitTranscript(messages: readonly UiMessage[]): {
    committed: UiMessage[];
    live: UiMessage[];
};
/**
 * Fold one durable event into the task-checklist state, mirroring the official
 * `todos` projection (tool-todo): the latest whole-list `todo/write` snapshot
 * wins, a new turn clears the checklist while `turn/end` keeps it visible, and
 * every other event returns the same state reference.
 * @param todos - current checklist state, treated as immutable.
 * @param event - the durable event to fold in.
 * @returns the next checklist state.
 */
export declare function projectTodos(todos: TodoList | null, event: SessionEvent): TodoList | null;
/**
 * Scan the durable log once and project the task-checklist state.
 * @param session - the session to replay.
 * @returns the checklist, or null before the first write.
 */
export declare function replayTodos(session: Session): TodoList | null;
//# sourceMappingURL=transcript.d.ts.map