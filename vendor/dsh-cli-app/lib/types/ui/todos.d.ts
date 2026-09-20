/**
 * The agent task panel: the `todo_write` checklist projected from the durable
 * log, docked above the composer. Mirrors opencode's todo rows — a check for
 * completed work, a bullet for the active task, muted squares for the rest.
 * @module @dsh-external/dsh-cli-app/ui/todos
 */
import React from 'react';
import type { TodoItem } from './model.ts';
import type { ThemeTokens } from './theme.ts';
/** One checklist row. */
export declare function TodoRow(props: {
    todo: TodoItem;
    theme: ThemeTokens;
}): React.JSX.Element;
/** The docked checklist the composer renders while the agent has open tasks. */
export declare function TaskPanel(props: {
    todos: readonly TodoItem[];
    theme: ThemeTokens;
}): React.JSX.Element;
//# sourceMappingURL=todos.d.ts.map