/**
 * Lightweight markdown projection: inline span parsing and block-aware line
 * projection are pure and unit-tested here.
 */

import { describe, expect, it } from 'vitest'
import { parseInline, projectMarkdown } from '../src/ui/markdown.ts'

describe('parseInline', () => {
  it('keeps plain text as one span', () => {
    expect(parseInline('hello world')).toEqual([{ kind: 'text', text: 'hello world' }])
  })

  it('splits inline code, bold and italic markers', () => {
    expect(parseInline('run `pnpm test` now')).toEqual([
      { kind: 'text', text: 'run ' },
      { kind: 'code', text: 'pnpm test' },
      { kind: 'text', text: ' now' },
    ])
    expect(parseInline('a **bold** and *italic* end')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'bold', text: 'bold' },
      { kind: 'text', text: ' and ' },
      { kind: 'italic', text: 'italic' },
      { kind: 'text', text: ' end' },
    ])
  })

  it('treats an unclosed marker as plain text', () => {
    expect(parseInline('stray * marker')).toEqual([{ kind: 'text', text: 'stray * marker' }])
  })
})

describe('projectMarkdown', () => {
  it('projects headings, lists, quotes and empty lines', () => {
    const lines = projectMarkdown('# Title\n\n- one\n- two\n\n> cited\n\nplain')
    expect(lines.map(l => l.kind)).toEqual(['heading', 'plain', 'list', 'list', 'plain', 'quote', 'plain', 'plain'])
    expect(lines[0]).toMatchObject({ kind: 'heading', text: 'Title' })
    expect(lines[2]).toMatchObject({ kind: 'list', text: 'one' })
  })

  it('collects fenced code blocks with their language hint', () => {
    const lines = projectMarkdown('before\n```ts\nconst x = 1\n```\nafter')
    expect(lines).toEqual([
      { kind: 'plain', text: 'before' },
      { kind: 'code', text: '', lang: 'ts' },
      { kind: 'code', text: 'const x = 1' },
      { kind: 'plain', text: 'after' },
    ])
  })
})
