import type { Note } from './types'

/**
 * Strip markdown syntax for plain-text excerpts (list rows, previews).
 * Intentionally rough — good enough for a one-line preview, not a parser.
 */
export const stripMarkdown = (source: string): string =>
  source
    // fenced code blocks → keep inner text
    .replace(/```[^\n]*\n?/g, '')
    // images: drop entirely
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    // links: keep label
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    // headings, blockquotes, list markers at line starts
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/gm, '')
    // emphasis / code spans / strikethrough
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    // horizontal rules
    .replace(/^\s*([-*_]\s*){3,}$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()

export const markdownExcerpt = (source: string, maxLength = 140): string => {
  const stripped = stripMarkdown(source)
  if (stripped.length <= maxLength) {
    return stripped
  }
  return `${stripped.slice(0, maxLength).trimEnd()}…`
}

/** Display title: explicit title, else first meaningful line of the body. */
export const noteDisplayTitle = (note: Pick<Note, 'title' | 'body'>): string => {
  const explicit = note.title?.trim()
  if (explicit) {
    return explicit
  }
  const firstLine = note.body
    .split('\n')
    .map((line) => stripMarkdown(line))
    .find((line) => line.length > 0)
  return firstLine || 'Untitled note'
}
