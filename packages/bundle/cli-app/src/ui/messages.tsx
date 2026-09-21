/**
 * Transcript row components shared by both layouts. The chrome only changes
 * the role labels: the opencode frame drops the `你`/`助手` prefixes and lets
 * the row spacing separate speakers.
 * @module @dsh-external/dsh-cli-app/ui/messages
 */

import React from 'react'
import { Box, Text } from 'ink'
import { COPY } from './copy.ts'
import type { UiMessage } from './model.ts'
import { MarkdownText } from './markdown-view.tsx'
import type { ThemeTokens } from './theme.ts'
import type { UiChrome } from './chrome.ts'

/** Longest tool result a card renders inline; the full result stays in the log. */
const TOOL_RESULT_PREVIEW_LIMIT = 1600

/** Reasoner preview length while a reasoning fold is collapsed. */
const REASONING_PREVIEW_LIMIT = 70

const TOOL_BADGES: Record<string, string> = {
  bash: '🐚 bash',
  pwsh: '🖥 pwsh',
  str_replace_editor: '📝 edit',
  web_search: '🌐 search',
  web_fetch: '🌐 fetch',
  'tool-fs': '📁 fs',
}

/**
 * Icon + short name for a tool card.
 * @param toolName - the tool's registered name.
 * @returns the badge text.
 */
export function toolBadge(toolName: string): string {
  return TOOL_BADGES[toolName] ?? `${COPY.defaultToolGlyph} ${toolName}`
}

/**
 * Collapse a tool result to the card's readable budget.
 * @param value - the full result text.
 * @returns the text as rendered, with a truncation footer when clipped.
 */
export function previewToolResult(value: string): string {
  if (value.length <= TOOL_RESULT_PREVIEW_LIMIT) return value
  return `${value.slice(0, TOOL_RESULT_PREVIEW_LIMIT)}\n… ${COPY.toolResultTruncated}`
}

/** First non-empty reasoning line, trimmed to the collapsed preview budget. */
function reasoningPreview(reasoning: string): string {
  const line = reasoning.split('\n').find(candidate => candidate.trim() !== '')?.trim() ?? ''
  return line.slice(0, REASONING_PREVIEW_LIMIT)
}

/**
 * Gutter glyph drawn in front of every user row so typed input stays visually
 * distinct from assistant output at a glance (a vertical rule, Claude Code style).
 */
const USER_GUTTER = '▎'

/** One tool card: state badge, argument preview, and the settled result. */
function ToolRow(props: {
  message: UiMessage
  theme: ThemeTokens
}): React.JSX.Element {
  const { message, theme } = props
  const failed = message.toolStatus === 'error'
  const settled = failed || message.toolStatus === 'done'
  const stateColor = failed ? theme.error : settled ? theme.ok : theme.warn
  const stateMark = failed ? 'x' : settled ? '✓' : '…'
  const args = message.argsSummary !== undefined && message.argsSummary !== '' ? `  ${message.argsSummary}` : ''
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={stateColor} bold>{stateMark} {toolBadge(message.toolName ?? 'tool')}{args}</Text>
      {settled && message.toolResult !== undefined && message.toolResult !== '' && (
        <Text color={failed ? theme.error : theme.muted} dimColor wrap="wrap">
          {previewToolResult(message.toolResult)}
        </Text>
      )}
    </Box>
  )
}

/** One assistant row: optional reasoning fold, live tool preview, and text. */
function AssistantRow(props: {
  message: UiMessage
  theme: ThemeTokens
  reasoningExpanded: boolean
  chrome: UiChrome
}): React.JSX.Element {
  const { message, theme, reasoningExpanded, chrome } = props
  const streaming = message.status === 'streaming'
  return (
    <Box flexDirection="column" marginBottom={1}>
      {chrome === 'classic' && <Text color={theme.brand} bold>{COPY.assistantLabel}</Text>}
      {message.reasoning !== '' && !streaming && (
        reasoningExpanded
          ? <Text color={theme.reasoning} dimColor wrap="wrap">{message.reasoning}</Text>
          : <Text color={theme.reasoning} dimColor>💭 {reasoningPreview(message.reasoning)}…</Text>
      )}
      {message.toolPreview !== undefined && message.toolPreview !== '' && (
        <Text color={theme.warn} dimColor>⚙ {message.toolPreview.slice(0, 100)}</Text>
      )}
      {message.text !== ''
        ? <MarkdownText text={message.text} theme={theme} />
        : streaming && <Text color={theme.muted}>…</Text>}
    </Box>
  )
}

/** One transcript row: user, assistant, or tool card. */
export function MessageRow(props: {
  message: UiMessage
  theme: ThemeTokens
  /** Assistant reasoning expanded for this row? */
  reasoningExpanded: boolean
  /** Layout chrome the row renders in. */
  chrome: UiChrome
}): React.JSX.Element {
  const { message, theme, reasoningExpanded, chrome } = props
  if (message.role === 'tool') return <ToolRow message={message} theme={theme} />
  if (message.role === 'assistant') {
    return <AssistantRow message={message} theme={theme} reasoningExpanded={reasoningExpanded} chrome={chrome} />
  }
  return (
    <Box flexDirection="column" marginBottom={1}>
      {chrome === 'classic' && <Text color={theme.brand} bold>{COPY.userLabel}</Text>}
      <Box flexDirection="row">
        <Text color={theme.brand} bold>{USER_GUTTER} </Text>
        <Box flexDirection="column" flexGrow={1}>
          <MarkdownText text={message.text} theme={theme} />
        </Box>
      </Box>
    </Box>
  )
}
