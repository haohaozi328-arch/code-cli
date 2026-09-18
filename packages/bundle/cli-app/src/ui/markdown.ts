/**
 * Terminal markdown projection: inline span parsing and block-aware line
 * projection. Both are pure and unit-tested; {@link MarkdownText} in
 * `markdown.tsx` maps the result onto Ink nodes.
 * @module @dsh-external/dsh-cli-app/ui/markdown
 */

/** One inline text span with a display style. */
export interface InlineSpan {
  kind: 'text' | 'code' | 'bold' | 'italic'
  text: string
}

/**
 * Parse one line into inline spans. Markers nest one level only.
 * @param line - the raw line.
 * @returns the spans in display order.
 */
export function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = []
  let buffer = ''
  const flush = (): void => {
    if (buffer !== '') {
      spans.push({ kind: 'text', text: buffer })
      buffer = ''
    }
  }
  let i = 0
  while (i < line.length) {
    const rest = line.slice(i)
    // Inline code first: `...` (no nesting inside).
    if (rest.startsWith('`')) {
      const end = rest.indexOf('`', 1)
      if (end > 0) {
        flush()
        spans.push({ kind: 'code', text: rest.slice(1, end) })
        i += end + 1
        continue
      }
    }
    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2)
      if (end > 1) {
        flush()
        spans.push({ kind: 'bold', text: rest.slice(2, end) })
        i += end + 2
        continue
      }
    }
    if (rest.startsWith('*') && !rest.startsWith('**')) {
      const end = rest.indexOf('*', 1)
      if (end > 0) {
        flush()
        spans.push({ kind: 'italic', text: rest.slice(1, end) })
        i += end + 1
        continue
      }
    }
    buffer += line[i] ?? ''
    i += 1
  }
  flush()
  return spans
}

/** One projected display line. */
export interface MarkdownLine {
  kind: 'code' | 'heading' | 'list' | 'quote' | 'plain'
  /** Code-block body (kind code) or the display line text. */
  text: string
  /** Language hint after the opening fence, when present. */
  lang?: string
  /** Block-quote level, when > 0. */
  quoteLevel?: number
}

/**
 * Project raw markdown text into typed display lines.
 * @param text - the raw markdown body.
 * @returns one entry per rendered line.
 */
export function projectMarkdown(text: string): MarkdownLine[] {
  const lines: MarkdownLine[] = []
  let inFence: string | null = null
  const push = (line: string): void => {
    if (inFence !== null) {
      const fence = line.trim().startsWith('```')
      if (fence) {
        inFence = null
        return
      }
      lines.push({ kind: 'code', text: line })
      return
    }
    if (line.trimStart().startsWith('```')) {
      inFence = line.trim().slice(3).trim() || 'code'
      lines.push({ kind: 'code', text: '', lang: inFence })
      return
    }
    const trimmed = line.trim()
    if (trimmed.startsWith('### ')) {
      lines.push({ kind: 'heading', text: trimmed.slice(4) })
    } else if (trimmed.startsWith('## ')) {
      lines.push({ kind: 'heading', text: trimmed.slice(3) })
    } else if (trimmed.startsWith('# ')) {
      lines.push({ kind: 'heading', text: trimmed.slice(2) })
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      lines.push({ kind: 'list', text: trimmed.slice(2) })
    } else if (/^\d+[.)] /.test(trimmed)) {
      lines.push({ kind: 'list', text: trimmed.replace(/^\d+[.)] /, '') })
    } else if (trimmed.startsWith('> ')) {
      lines.push({ kind: 'quote', text: trimmed.slice(2), quoteLevel: 1 })
    } else if (trimmed !== '') {
      lines.push({ kind: 'plain', text: line })
    } else {
      lines.push({ kind: 'plain', text: '' })
    }
  }
  for (const line of text.split('\n')) push(line)
  return lines
}
