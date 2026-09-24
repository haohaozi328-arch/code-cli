/**
 * Modal surfaces drawn over the transcript: the session picker, the generic
 * choice list, the tool-approval question, the slash-command palette, and the
 * `/connect` prompt. Each is a pure function of the state it is handed.
 * @module @dsh-external/dsh-cli-app/ui/overlays
 */

import React from 'react'
import { Box, Text } from 'ink'
import { COPY, connectPrompt } from './copy.ts'
import type { ApprovalPrompt, ChoiceItem, CommandHint, ConnectWizardState } from './model.ts'
import type { SessionSummary } from '../sessions.ts'
import { formatWhen, shortCwd } from '../sessions.ts'
import type { ThemeTokens } from './theme.ts'

/** Marker preceding the highlighted row of a list. */
const SELECT_MARKER = '›'

/** Cap the picker's label column so a long name cannot starve its description. */
const MAX_CHOICE_LABEL_COLUMN = 24

/** Rows a picker shows before it scrolls its viewport. */
const SESSION_PICKER_ROWS = 5
/** Rows a choice list shows before it scrolls its viewport. */
const CHOICE_PICKER_ROWS = 8

/** Scroll window for a bounded list, centered on the selection. */
function windowStart(length: number, selected: number, visible: number): number {
  if (length <= visible) return 0
  return Math.max(0, Math.min(selected - Math.floor(visible / 2), length - visible))
}

/** One row of the resume picker. */
function SessionRow(props: {
  item: SessionSummary
  selected: boolean
  theme: ThemeTokens
}): React.JSX.Element {
  const { item, selected, theme } = props
  const stem = item.title ?? item.sessionId
  const where = shortCwd(item.cwd)
  const time = formatWhen(item.updatedAt)
  return (
    <Text color={selected ? theme.brand : theme.muted} bold={selected}>
      {selected ? `${SELECT_MARKER} ` : '  '}
      {stem}
      {where !== '' ? `  ·  ${where}` : ''}
      <Text dimColor>  ·  {time}{item.parentSession !== null ? '  ·  fork' : ''}</Text>
    </Text>
  )
}

/** Compact modal session picker with an inline search field. */
export function SessionPicker(props: {
  items: SessionSummary[]
  selected: number
  search: string
  theme: ThemeTokens
}): React.JSX.Element {
  const { items, selected, search, theme } = props
  const start = windowStart(items.length, selected, SESSION_PICKER_ROWS)
  const visible = items.slice(start, start + SESSION_PICKER_ROWS)
  return (
    <Box flexDirection="column" width="100%" borderStyle="round" borderColor={theme.brand} paddingX={1}>
      <Box>
        <Text color={theme.brand} bold>{COPY.sessionsTitle}</Text>
        <Text color={theme.muted} dimColor>  {COPY.sessionsHint}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.brand}>{'/ '}</Text>
        <Text color={search === '' ? theme.muted : theme.text} dimColor={search === ''}>
          {search === '' ? COPY.sessionsSearchPlaceholder : search}
        </Text>
        <Text color={theme.brand}>▌</Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {visible.length === 0 && <Text color={theme.muted} dimColor>{COPY.sessionsEmpty}</Text>}
        {visible.map((item, index) => (
          <SessionRow key={item.sessionId} item={item} selected={start + index === selected} theme={theme} />
        ))}
      </Box>
      {items.length > SESSION_PICKER_ROWS && (
        <Box marginTop={1} justifyContent="space-between">
          <Text color={theme.muted} dimColor>
            {start + 1}-{Math.min(start + SESSION_PICKER_ROWS, items.length)} / {items.length}
          </Text>
          <Text color={theme.muted} dimColor>{COPY.sessionsSearchNote}</Text>
        </Box>
      )}
    </Box>
  )
}

/** Generic bounded choice list used by `/model`, `/perm`, `/connect`, and `/skills`. */
export function ChoiceList(props: {
  title: string
  items: readonly ChoiceItem[]
  selected: number
  theme: ThemeTokens
  /** Placeholder shown while the item list is still loading. */
  note: string | undefined
  /** Live filter text owned by the App; drives the footer and the empty row. */
  search: string
}): React.JSX.Element {
  const { title, items, selected, theme, note, search } = props
  const start = windowStart(items.length, selected, CHOICE_PICKER_ROWS)
  const visible = items.slice(start, start + CHOICE_PICKER_ROWS)
  const described = visible.filter(item => item.description !== undefined)
  const labelWidth = described.length === 0 ? 0 : Math.min(MAX_CHOICE_LABEL_COLUMN, Math.max(...described.map(item => item.label.length)))
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} marginBottom={1}>
      <Box marginLeft={1} marginTop={1}>
        <Text color={theme.brand} bold>{title}</Text>
        <Text color={theme.muted}>  ·  {COPY.choiceHint}</Text>
      </Box>
      {items.length === 0 && <Text color={theme.muted} dimColor>  {note ?? (search === '' ? COPY.choiceEmpty : COPY.choiceSearchEmpty)}</Text>}
      {visible.map((item, index) => {
        const actual = start + index
        // One physical row per choice: the label, a column-aligned gap, then
        // the simple description clipped at the terminal edge — long skill
        // summaries never wrap into a dense wall of text.
        return (
          <Text key={item.value} wrap="truncate-end" color={selected === actual ? theme.brand : theme.muted} bold={selected === actual}>
            {selected === actual ? `${SELECT_MARKER} ` : '  '}{(item.description === undefined ? item.label : item.label.padEnd(labelWidth))}{item.description !== undefined && <Text dimColor>{'  '}{item.description}</Text>}
          </Text>
        )
      })}
      {(items.length > CHOICE_PICKER_ROWS || search !== '') && (
        <Text color={theme.muted} dimColor>
          {'  '}{items.length === 0 ? 0 : start + 1}-{Math.min(start + CHOICE_PICKER_ROWS, items.length)} / {items.length}{'  ·  '}{search === '' ? COPY.choiceSearchNote : `${COPY.choiceFilterPrefix}${search}`}
        </Text>
      )}
    </Box>
  )
}

/** Tool-approval question: the pending tool and its key choices. */
export function ApprovalModal(props: {
  prompt: ApprovalPrompt | null
  theme: ThemeTokens
}): React.JSX.Element {
  const { prompt, theme } = props
  if (prompt === null) return <Box />
  return (
    // Fixed height, by construction: three single rows inside one frame, each
    // truncated instead of wrapped. The height this paints is what
    // `LIVE_CHROME.approval` reserves, and the reservation is what keeps the
    // frame under Ink's viewport threshold. An unmeasured row (a long reason,
    // a long tool name, the old stack of margins) pushes the frame to the
    // viewport height, and Ink answers that by clearing the screen and
    // replaying every committed row — which reads on screen as the tool call
    // rendering itself again on every approval.
    <Box flexDirection="column" borderStyle="double" borderColor={theme.warn} marginBottom={1} paddingX={1}>
      <Text wrap="truncate-end" color={theme.warn} bold>
        {COPY.approvalTitle}
        {prompt.reason !== undefined && <Text color={theme.muted}>{'  ·  '}{prompt.reason}</Text>}
      </Text>
      <Text wrap="truncate-end" color={theme.text}>{prompt.toolName}</Text>
      <Text wrap="truncate-end" color={theme.muted} dimColor>{COPY.approvalHint}</Text>
    </Box>
  )
}

/** Slash-command palette shown while the input starts with `/`. */
export function CommandMenu(props: {
  matches: readonly CommandHint[]
  selected: number
  theme: ThemeTokens
}): React.JSX.Element {
  const { matches, selected, theme } = props
  const maxVisible = 8
  let start = 0
  if (matches.length > maxVisible) {
    start = Math.max(0, Math.min(selected - Math.floor(maxVisible / 2), matches.length - maxVisible))
  }
  const visibleMatches = matches.slice(start, start + maxVisible)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color={theme.muted} dimColor>{COPY.commandsHint}</Text>
      {visibleMatches.map((candidate, i) => {
        const actualIndex = start + i
        const isSelected = actualIndex === selected
        return (
          <Text key={candidate.name} color={isSelected ? theme.brand : theme.muted} bold={isSelected}>
            {isSelected ? `${SELECT_MARKER} ` : '  '}
            {candidate.name}
            <Text dimColor>  {candidate.hint}{candidate.arg !== undefined ? `  ·  ${candidate.arg}` : ''}</Text>
          </Text>
        )
      })}
    </Box>
  )
}

/** Prompt panel for the `/connect` wizard. */
export function ConnectPrompt(props: {
  wizard: ConnectWizardState
  theme: ThemeTokens
}): React.JSX.Element {
  const { wizard, theme } = props
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} marginBottom={1} paddingX={1}>
      <Text color={theme.brand} bold>/connect</Text>
      <Text color={theme.text}>{connectPrompt(wizard.step, wizard.provider)}</Text>
      <Text color={theme.muted} dimColor>Enter 确认 · Esc 取消</Text>
    </Box>
  )
}

/** The /title editor: one text field over the shared composer buffer. */
export function TitlePrompt(props: {
  current: string | null
  theme: ThemeTokens
}): React.JSX.Element {
  const { current, theme } = props
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={theme.brand} marginBottom={1} paddingX={1}>
      <Text color={theme.brand} bold>/title</Text>
      <Text color={theme.text}>{COPY.titleCurrent}：{current ?? '（未命名）'}</Text>
      <Text color={theme.muted} dimColor>{COPY.titleEditorHint}</Text>
    </Box>
  )
}

