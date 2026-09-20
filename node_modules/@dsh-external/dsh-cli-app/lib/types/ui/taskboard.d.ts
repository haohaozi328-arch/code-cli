/**
 * The dsh-taskboard: a full-screen task-progress-and-time board. Ctrl+B
 * swaps the whole chrome for this surface; the same chord returns. The board
 * is a two-pane scrubber: the timeline pane lists the session's turns (one
 * row per `turn/start`..`turn/end` span), and the arrow keys drag a cursor
 * through history while the content pane renders the selected turn's full
 * conversation — prompts, replies, and tool calls folded from the durable
 * log, so the board can never disagree with the transcript and a resumed
 * session replays its whole board from the log.
 * @module @dsh-external/dsh-cli-app/ui/taskboard
 */
import React from 'react';
import type { TurnEntry, TurnMessage, ViewModel } from './model.ts';
import type { ThemeTokens } from './theme.ts';
/** How many recent turns the board keeps; older entries fall off the tail. */
export declare const TURN_TIMELINE_LIMIT = 12;
/** How many conversation messages one turn entry retains. */
export declare const TURN_MESSAGE_LIMIT = 40;
/** How many rendered lines one conversation message gets before truncation. */
export declare const MESSAGE_LINE_LIMIT = 8;
/** How many entries PageUp/PageDown move the timeline cursor. */
export declare const TIMELINE_PAGE = 5;
/** The minimal key facts the board renders; `ReturnType<ViewModel['getState']>`. */
type BoardState = ReturnType<ViewModel['getState']>;
/** The keyboard chord that swaps the board in and out: Ctrl+B. A plain control
 * character by design — Windows Terminal encodes Alt+letter as `ESC letter`,
 * so a Ctrl+Alt+letter chord reaches ink as plain Ctrl+letter (its keypress
 * parser never sets `meta` for that shape) and the chord is unreachable.
 * @param name - the parsed key name the useInput callback received.
 * @param key - the ink modifier flags for the same event.
 */
export declare function isBoardToggle(name: string, key: {
    ctrl: boolean;
    meta: boolean;
}): boolean;
/** `HH:MM` local clock label for a durable event timestamp. */
export declare function formatClock(ms: number): string;
/**
 * Move the timeline cursor one step from an ink key event. The cursor is an
 * index into the entry list, with `-1` meaning "live" (the newest entry,
 * following new events as they land).
 * @param index - current cursor (`-1` for live).
 * @param length - entry count; zero disables all movement.
 * @param key - the parsed ink key flags of the navigation event.
 * @returns the next cursor value.
 */
export declare function stepTimelineCursor(index: number, length: number, key: {
    upArrow: boolean;
    downArrow: boolean;
}): number;
/** One content-pane page: the half-open message index range it shows. */
export interface PanePage {
    start: number;
    end: number;
}
/**
 * Pack one turn's conversation into pane-sized pages, newest page first. Each
 * page costs at most `budget` rendered rows; a message taller than the budget
 * still gets a page of its own so packing always makes progress.
 */
export declare function packPanePages(messages: readonly TurnMessage[], budget: number): readonly PanePage[];
/**
 * Fold one committed session event into the conversation timeline. Pure and
 * reference-stable: unchanged input returns the same array, a turn event or
 * conversation content returns a fresh one.
 * @param entries - entries folded so far.
 * @param event - the committed session event (`type`/`time`/`data`).
 * @returns the original array or the advanced one.
 */
export declare function reduceTurnEntries(entries: readonly TurnEntry[], event: {
    type: string;
    time: number;
    data: unknown;
}): readonly TurnEntry[];
/**
 * Fold a durable event slice into the board's conversation timeline (the
 * resume path: history recorded before this process started).
 * @param events - the durable events to fold, in seq order.
 * @returns the final entries, oldest last.
 */
export declare function collectTurnEntries(events: readonly {
    type: string;
    time: number;
    data: unknown;
}[]): readonly TurnEntry[];
/** The full-screen task-progress-and-time board with a draggable timeline. */
export declare function TaskBoard(props: {
    state: BoardState;
    theme: ThemeTokens;
    /** Live elapsed of the running turn, ticking from the App's clock. */
    elapsedMs: number;
    /** Timeline cursor into `state.turnTimeline`; `-1` follows the live turn. */
    cursor: number;
    /** Terminal height in rows; the board clamps itself below it. */
    rows: number;
    /** Terminal width in columns; pane lines truncate to stay one row each. */
    columns: number;
    /** Page index into the turn's conversation pages; 0 shows the newest. */
    panePage?: number;
}): React.JSX.Element;
export {};
//# sourceMappingURL=taskboard.d.ts.map