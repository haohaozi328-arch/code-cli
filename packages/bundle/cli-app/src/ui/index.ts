/**
 * Public UI surface of the terminal frontend: the Ink root the glue mounts.
 * Renderer-internal modules stay reachable by relative path inside the bundle;
 * this entry exists so the glue (and tests) depend on one stable module.
 * @module @dsh-external/dsh-cli-app/ui
 */

export { App } from './App.tsx'
export { TaskBoard, collectTurnEntries, formatClock, isBoardToggle, packPanePages, reduceTurnEntries, stepTimelineCursor, TURN_TIMELINE_LIMIT } from './taskboard.tsx'
export type { TurnEntry } from './model.ts'
