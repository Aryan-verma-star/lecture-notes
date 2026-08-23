/**
 * Heading extraction + slugification for lecture-note TOCs.
 * Matches ATX headings (# … ######) outside fenced code blocks.
 */

export interface TocEntry {
  id: string
  text: string
  depth: 2 | 3
}

/** Strips markdown inline formatting (emphasis, code, links) from heading text. */
function stripInline(md: string): string {
  return md
    .replace(/`([^`]*)`/g, '$1') // inline code
    .replace(/\*\*?([^*]*)\*\*?/g, '$1') // bold/italic
    .replace(/~~([^~]*)~~/g, '$1') // strikethrough
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .trim()
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Extracts h2/h3 entries with DOM-safe ids for anchor scrolling.
 *  Ids are derived purely from heading text (no per-render counters) so the
 *  renderer and the TOC stay in sync across re-renders. Duplicate heading
 *  texts intentionally share an id (both link to the first occurrence). */
export function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n')
  const entries: TocEntry[] = []
  let inFence = false

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```|~~~)/)
    if (fenceMatch) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = line.match(/^(#{2,3})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const depth = match[1].length as 2 | 3
    const text = stripInline(match[2])
    if (!text) continue

    entries.push({ id: slugify(text) || 'section', text, depth })
  }

  return entries
}
