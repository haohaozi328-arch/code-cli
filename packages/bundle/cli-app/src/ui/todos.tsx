/**
 * The agent task panel: the `todo_write` checklist projected from the durable
 * log, docked above the composer. Mirrors opencode's todo rows — a check for
 * completed work, a bullet for the active task, muted squares for the rest.
 * @module @dsh-external/dsh-cli-app/ui/todos
 */

import React from 'react'
import { Box, Text } from 'ink'
import { COPY } from './copy.ts'
import type { TodoItem } from './model.ts'
import type { ThemeTokens } from './theme.ts'

/** Marker and emphasis for one status. */
function todoMark(status: TodoItem['status']): { mark: string; active: boolean; done: boolean } {
  if (status === 'completed') return { mark: '[✓]', active: false, done: true }
  if (status === 'in_progress') return { mark: '[•]', active: true, done: false }
  return { mark: '[ ]', active: false, done: false }
}

/** One checklist row. */
export function TodoRow(props: { todo: TodoItem; theme: ThemeTokens }): React.JSX.Element {
  const { todo, theme } = props
  const { mark, active, done } = todoMark(todo.status)
  const color = done ? theme.ok : active ? theme.warn : theme.muted
  return (
    <Text color={color} dimColor={!active}>
      {mark} {todo.content}
    </Text>
  )
}

/** The docked checklist the composer renders while the agent has open tasks. */
export function TaskPanel(props: { todos: readonly TodoItem[]; theme: ThemeTokens }): React.JSX.Element {
  const { todos, theme } = props
  const done = todos.filter(todo => todo.status === 'completed').length
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} paddingX={1} marginBottom={1}>
      <Text>
        <Text color={theme.brand} bold>{COPY.todoTitle}</Text>
        <Text color={theme.muted} dimColor>  {done}/{todos.length}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {todos.map(todo => <TodoRow key={todo.content} todo={todo} theme={theme} />)}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted} dimColor>{COPY.todoPanelHint}</Text>
      </Box>
    </Box>
  )
}
