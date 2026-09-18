/**
 * Ink rendering of the projected markdown lines: nested `Text` nodes for inline
 * spans and one node per display line. The parsing itself lives in
 * `markdown.ts`.
 * @module @dsh-external/dsh-cli-app/ui/markdown-view
 */

import React from 'react'
import { Box, Text } from 'ink'
import type { ThemeTokens } from './theme.ts'
import { parseInline, projectMarkdown, type InlineSpan } from './markdown.ts'

/**
 * Render one line's spans as nested Ink Text nodes.
 * @param spans - inline spans from `parseInline`.
 * @param theme - active palette.
 * @returns the styled line node.
 */
export function renderSpans(spans: readonly InlineSpan[], theme: ThemeTokens): React.JSX.Element {
  return (
    <Text>
      {spans.map((span, index) => {
        const key = `${span.kind}-${index}`
        switch (span.kind) {
          case 'code':
            return <Text key={key} color={theme.codeText}>{span.text}</Text>
          case 'bold':
            return <Text key={key} bold>{span.text}</Text>
          case 'italic':
            return <Text key={key} italic>{span.text}</Text>
          default:
            return <Text key={key}>{span.text}</Text>
        }
      })}
    </Text>
  )
}

/**
 * Render a full markdown text as a column of styled lines.
 * @param props - the markdown body and the active palette.
 * @returns the rendered column.
 */
export function MarkdownText(props: { text: string; theme: ThemeTokens }): React.JSX.Element {
  const { text, theme } = props
  const lines = projectMarkdown(text)
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => {
        const key = `${line.kind}-${index}`
        switch (line.kind) {
          case 'code':
            if (line.lang !== undefined) {
              return (
                <Text key={key} color={theme.muted} dimColor>{`┌─ ${line.lang} ─`.padEnd(16, '─')}</Text>
              )
            }
            return <Text key={key} color={theme.codeText} backgroundColor={theme.codeBg}>{line.text}</Text>
          case 'heading':
            return <Text key={key} bold color={theme.brand}>{line.text}</Text>
          case 'list':
            return (
              <Text key={key}>
                <Text color={theme.muted}>• </Text>
                {renderSpans(parseInline(line.text), theme)}
              </Text>
            )
          case 'quote':
            return (
              <Text key={key} color={theme.muted} italic>{renderSpans(parseInline(line.text), theme)}</Text>
            )
          default:
            return <Text key={key} wrap="wrap">{renderSpans(parseInline(line.text), theme)}</Text>
        }
      })}
    </Box>
  )
}
