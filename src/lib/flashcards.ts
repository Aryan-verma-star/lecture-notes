/**
 * Flashcard generation from lecture notes.
 *
 * Cards are derived client-side from a completed lecture's markdown:
 *  - concept cards: bold key terms (front "Define: term", back = its line)
 *  - checklist cards: Study Checklist items (front = task, back = the
 *    best-matching paragraph in the notes by keyword overlap)
 *  - fallback section cards when the notes have neither
 */

export interface Flashcard {
  id: string
  front: string
  back: string
  origin: 'concept' | 'checklist' | 'section'
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'is', 'are', 'was', 'were',
  'for', 'on', 'with', 'as', 'by', 'that', 'this', 'it', 'its', 'be', 'been',
  'from', 'at', 'into', 'about', 'your', 'you', 'we', 'they', 'he', 'she',
  'what', 'which', 'who', 'how', 'when', 'where', 'why', 'can', 'could',
  'will', 'would', 'should', 'shall', 'may', 'might', 'must', 'do', 'does',
  'did', 'done', 'have', 'has', 'had', 'not', 'no', 'but', 'if', 'then',
  'than', 'so', 'such', 'these', 'those', 'there', 'here', 'one', 'two',
  'new', 'next', 'week', 'lecture', 'section', 'using', 'use', 'used',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
}

function stripInline(md: string): string {
  return md
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*?([^*]*)\*\*?/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*]\s+/, '')
    .trim()
}

/** Splits markdown into text blocks separated by blank lines, keeping fences intact. */
function splitBlocks(markdown: string): string[] {
  const blocks: string[] = []
  let current: string[] = []
  let inFence = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    if (!inFence && line.trim() === '') {
      if (current.length) blocks.push(current.join('\n'))
      current = []
      continue
    }
    current.push(line)
  }
  if (current.length) blocks.push(current.join('\n'))
  return blocks
}

function bestMatchFor(prompt: string, blocks: string[]): string {
  const promptTokens = new Set(tokenize(prompt))
  if (promptTokens.size === 0) return 'Review your notes for this item.'
  let best = ''
  let bestScore = 0
  for (const block of blocks) {
    const plain = stripInline(block)
    // Heading-only blocks make poor answers
    if (/^#{1,6}\s/.test(plain) && !plain.includes('\n')) continue
    // The checklist itself restates the prompt verbatim — never a useful
    // answer for a checklist card (it would just echo the question back)
    if (/\[ \]/.test(block) || /study checklist/i.test(plain)) continue
    const tokens = tokenize(plain)
    let score = 0
    for (const t of tokens) if (promptTokens.has(t)) score += 1
    // Slight normalization by length so short blocks don't dominate
    const normalized = score / Math.sqrt(tokens.length + 4)
    if (normalized > bestScore) {
      bestScore = normalized
      best = plain
    }
  }
  return best || 'Review your notes for this item.'
}

export function buildFlashcards(markdown: string): Flashcard[] {
  const cards: Flashcard[] = []
  const lines = markdown.split('\n')
  let inFence = false
  let n = 0

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    // Bold key terms inside list items: "- **Term**: definition…"
    const concept = line.match(/^\s*[-*]\s+\*\*(.+?)\*\*\s*[:—-]?\s*(.+)$/)
    if (concept) {
      const term = stripInline(concept[1])
      const def = stripInline(concept[2])
      if (term && def && def.length > 3) {
        n += 1
        cards.push({
          id: `concept-${n}`,
          front: `Define: ${term}`,
          back: def,
          origin: 'concept',
        })
        continue
      }
    }

    // Checklist items: "- [ ] Task…"
    const task = line.match(/^\s*[-*]\s+\[ \]\s+(.+)$/)
    if (task) {
      const prompt = stripInline(task[1])
      if (prompt) {
        n += 1
        cards.push({
          id: `checklist-${n}`,
          front: prompt,
          back: '', // resolved below (needs all blocks)
          origin: 'checklist',
        })
      }
    }
  }

  // Attach best-matching note paragraphs to checklist cards
  if (cards.some((c) => c.origin === 'checklist')) {
    const blocks = splitBlocks(markdown)
    for (const card of cards) {
      if (card.origin === 'checklist') {
        card.back = bestMatchFor(card.front, blocks)
      }
    }
  }

  // Fallback: derive one card per H2 section
  if (cards.length === 0) {
    const blocks = splitBlocks(markdown)
    for (const block of blocks) {
      const m = block.match(/^##\s+(.+)$/)
      if (!m) continue
      const title = stripInline(m[1])
      const rest = stripInline(block.split('\n').slice(1).join(' '))
      if (!title || !rest) continue
      n += 1
      cards.push({
        id: `section-${n}`,
        front: `Summarize: ${title}`,
        back: rest.slice(0, 400),
        origin: 'section',
      })
    }
  }

  return cards.slice(0, 24)
}
