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

/**
 * Returns a function that yields DOM-safe, unique slugs for a sequence of
 * heading texts. The first occurrence of a text keeps its base slug; later
 * duplicates get a `-2`, `-3`, … suffix so every id is unique (valid HTML,
 * stable React keys, and working anchor links). Deterministic for a given
 * input order, so it can be used independently by the TOC and the markdown
 * renderer and still produce matching ids.
 */
export function makeSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text: string): string => {
    const base = slugify(text) || 'section'
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

/** Extracts h2/h3 entries with DOM-safe ids for anchor scrolling. */
export function extractToc(markdown: string): TocEntry[] {
  const lines = markdown.split('\n')
  const entries: TocEntry[] = []
  let inFence = false
  const slugger = makeSlugger()

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

    entries.push({ id: slugger(text), text, depth })
  }

  return entries
}
