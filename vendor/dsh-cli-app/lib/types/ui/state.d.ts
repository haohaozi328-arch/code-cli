/**
 * Terminal UI view model: owns the durable-log replay, the live event wiring
 * (assistant-stream increments + session/event settlements), and the user
 * actions (send / stop / quit / commands). It is the single boundary between
 * the dsh process world and the Ink React world.
 *
 * Consistency rule: the durable session log is the source of truth. Live
 * assistant-stream frames only paint the in-flight message incrementally; a
 * committed end frame rebuilds that message from the log event (seq), so the
 * UI never diverges from what a later replay would render.
 * @module @dsh-external/dsh-cli-app/ui/state
 */
import type { ApprovalBus, CommandHint, ViewModel, ViewModelOptions } from './model.ts';
/**
 * In-process approval bridge: the agent-scope answerer calls {@link
 * ApprovalBus.request} (which suspends until the UI answers), the UI observes
 * the prompt and calls {@link ApprovalBus.answer}.
 * @returns a fresh bridge for one session.
 */
export declare function createApprovalBus(): ApprovalBus;
/**
 * Build the view model for one live agent.
 * @param options - the process context (event source), the live agent, its session, and its host hooks.
 * @returns the view model the Ink app renders and drives.
 */
export declare function createViewModel(options: ViewModelOptions): ViewModel;
/**
 * Command menu metadata, kept beside the dispatch switch so the menu and the
 * router cannot drift. `arg` renders as a usage hint after the name.
 */
export declare const COMMAND_HINTS: readonly CommandHint[];
//# sourceMappingURL=state.d.ts.map