// Gemini API client — plain fetch(), no SDK.
// Spec: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.7-flash'

// Fallback chain: if the primary model is overloaded (e.g. 503 "high demand")
// or otherwise unavailable, the request is retried on these in order.
const GEMINI_FALLBACK_MODELS = (
  process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.6-flash,gemini-2.5-flash'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean)

// De-duplicated, primary-first model chain.
const MODEL_CHAIN = Array.from(new Set([GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS]))

const GEMINI_MOCK = process.env.GEMINI_MOCK === '1'
const TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 90_000 // 90s per attempt
const STATUS_RETRY_DELAYS = [2000, 6000] // retry 429/500/503 on the same model
const RETRY_STATUS = new Set([429, 500, 503])

/** Thrown when no fallback model can help (bad request, auth, etc.). */
class NonRetryableError extends Error {}

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

export const TRANSCRIBE_PROMPT =
  'Transcribe this lecture recording. Remove filler words and non-speech noise. Label speakers if multiple are present (e.g. \'Lecturer:\', \'Student:\'). Return plain text only.'

export const SYNTHESIS_PROMPT = `You are an expert academic note-taker. A student
recorded a college lecture and needs comprehensive study notes. You receive
the lecture transcript and produce structured notes as JSON.

GOAL: Write notes that let a student who missed class learn the material
from your notes alone. Be detailed and explanatory, not terse.

IGNORE AND DROP (never include in any field):
- Side conversations, chatter, and social talk
- Filler words ("um," "you know," "like," "right")
- The teacher's personal stories and digressions
- Classroom management ("sit down," "quiet please," "phones away")
- Discipline, yelling at students, or reprimands
- Jokes that carry no academic content
- Off-topic rambling and environmental noise

FOCUS ON:
- Concepts, definitions, and why they matter
- Derivations and proofs — walk through the reasoning
- Formulas — write them in plain text or in fenced code blocks. Do NOT
  use LaTeX dollar notation (the notes are rendered as plain Markdown
  without math rendering). Write lim(x->a) f(x) = L, not LaTeX.
- Worked examples — show the steps, not just the answer
- Processes and procedures — list steps in order
- Terminology — define every technical term on first appearance
- Relationships between concepts
- Anything the teacher emphasized as important

FIELD-BY-FIELD INSTRUCTIONS:

lectureTitle: Concise, based on the actual topic (max 60 chars). Not a
greeting or lecture number.

summary: 3-5 sentences in plain language. What was taught and why it matters.

keyTakeaways: 3-8 points, each a complete sentence. Not "X was discussed"
but the actual insight: "The derivative measures instantaneous rate of change."

topics: Break the lecture into 2-6 topics in the order taught. For each:
  title: Short and descriptive.
  summary: 2-4 sentences explaining the core idea in plain language.
  concepts: Each gets term + definition. Thorough, not a dictionary snippet.
    Include why the concept matters and how it fits. If the concept
    involves a formula, include it in plain text within the definition.
  examples: Each is a string. If worked through step by step, write out
    the steps. Not "Example: limits" but "Evaluate lim(x->3) of f(x)=x^2.
    Substituting x=3 gives 9. Since f is continuous, the limit equals
    the function value: 9."
  processes: Named procedures. List steps in order.
  warnings: Mistakes the teacher mentioned or pitfalls to avoid.
  terminology: Technical terms. Give plain-language meaning.

crossTopicRelationships: How topics connect. Only real connections discussed.

assignments: Homework, readings, projects. Include due dates if stated.

examHints: Only explicit teacher statements about exams. No guesses.

ACCURACY: Faithful to the transcript. Do not invent. Use empty arrays
for fields with no content — never fabricate.

OUTPUT: JSON only. No prose before or after. No markdown fences. Follow
the schema exactly.`

export const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    lectureTitle: { type: 'string' },
    summary: { type: 'string' },
    keyTakeaways: { type: 'array', items: { type: 'string' } },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          concepts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                term: { type: 'string' },
                definition: { type: 'string' },
              },
              required: ['term', 'definition'],
            },
          },
          examples: { type: 'array', items: { type: 'string' } },
          processes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                steps: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'steps'],
            },
          },
          warnings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                issue: { type: 'string' },
                advice: { type: 'string' },
              },
              required: ['issue', 'advice'],
            },
          },
          terminology: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                term: { type: 'string' },
                meaning: { type: 'string' },
              },
              required: ['term', 'meaning'],
            },
          },
        },
        required: ['title', 'summary'],
      },
    },
    assignments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { description: { type: 'string' } },
        required: ['description'],
      },
    },
    examHints: { type: 'array', items: { type: 'string' } },
    crossTopicRelationships: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          relation: { type: 'string' },
        },
        required: ['from', 'to', 'relation'],
      },
    },
  },
  required: [
    'lectureTitle',
    'summary',
    'keyTakeaways',
    'topics',
    'assignments',
    'examHints',
    'crossTopicRelationships',
  ],
} as const

/** Detects audio MIME type from file magic bytes. */
export function detectMime(buf: Buffer): string {
  if (buf.length < 4) return 'audio/mpeg'
  // RIFF....WAVE
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    if (buf.length >= 12 && buf.slice(8, 12).toString('ascii') === 'WAVE') return 'audio/wav'
  }
  // ID3 (MP3)
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'audio/mpeg'
  // ftyp box (M4A)
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return 'audio/mp4'
  }
  // OggS (OGG)
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
    return 'audio/ogg'
  }
  // fLaC (FLAC)
  if (buf[0] === 0x66 && buf[1] === 0x4c && buf[2] === 0x61 && buf[3] === 0x43) {
    return 'audio/flac'
  }
  // WebM (0x1A 0x45 0xDF 0xA3)
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return 'audio/webm'
  }
  return 'audio/mpeg'
}

async function callOneModel(
  body: Record<string, unknown>,
  model: string
): Promise<unknown> {
  const ENDPOINT = endpointFor(model)
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= STATUS_RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, STATUS_RETRY_DELAYS[attempt - 1]))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'x-goog-api-key': GEMINI_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (res.ok) {
        return await res.json()
      }

      const text = await res.text()
      const message = `Gemini API ${res.status} (${model}): ${text.slice(0, 200)}`
      lastError = new Error(message)

      // Retry transient server errors / rate limits on the same model.
      if (RETRY_STATUS.has(res.status)) continue

      // Any other 4xx is a bad request — no model can fix it.
      if (res.status >= 400 && res.status < 500) {
        throw new NonRetryableError(message)
      }
      // Other 5xx — fall through to the next model.
      break
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof NonRetryableError) throw err
      // Timeout / network error: don't keep hammering this model — let the
      // caller fall back to the next one immediately.
      lastError = err instanceof Error ? err : new Error(String(err))
      break
    }
  }

  throw lastError ?? new Error('Gemini API call failed')
}

/**
 * Calls Gemini, retrying transient failures on the primary model and then
 * falling back through MODEL_CHAIN until one succeeds.
 * Returns the parsed response plus the model that produced it.
 */
async function callGeminiWithFallback(body: Record<string, unknown>): Promise<{
  response: unknown
  model: string
}> {
  const errors: string[] = []

  for (const model of MODEL_CHAIN) {
    try {
      const response = await callOneModel(body, model)
      return { response, model }
    } catch (err) {
      if (err instanceof NonRetryableError) throw err
      errors.push(err instanceof Error ? err.message : String(err))
      // otherwise fall through to the next model in the chain
    }
  }

  throw new Error(`All Gemini models failed:\n${errors.join('\n')}`)
}

function extractText(response: unknown): string {
  const r = response as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const parts = r?.candidates?.[0]?.content?.parts
  if (!parts) return ''
  return parts.map((p) => p.text || '').join('')
}

/** Transcribes audio via Gemini. Returns plain-text transcript. */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string
): Promise<string> {
  if (GEMINI_MOCK) {
    const { mockTranscribe } = await import('@/lib/mock')
    return mockTranscribe()
  }

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: audioBase64 } },
          { text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  }

  const response = await callGeminiWithFallback(body)
  const text = extractText(response.response)
  if (!text.trim()) throw new Error('Transcription returned empty text')
  return text.trim()
}

/** Synthesises structured notes from a transcript via Gemini.
 *  Returns parsed JSON matching RESPONSE_SCHEMA. */
export async function synthesizeNotes(
  transcript: string
): Promise<Record<string, unknown>> {
  if (GEMINI_MOCK) {
    const { mockSynthesize } = await import('@/lib/mock')
    return mockSynthesize()
  }

  const body = {
    contents: [
      {
        parts: [
          { text: `${SYNTHESIS_PROMPT}\n\nTRANSCRIPT:\n${transcript}` },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: RESPONSE_SCHEMA,
    },
  }

  const response = await callGeminiWithFallback(body)
  const text = extractText(response.response)
  if (!text.trim()) throw new Error('Synthesis returned empty text')

  try {
    return JSON.parse(text)
  } catch {
    // One repair attempt: strip markdown fences and retry
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    try {
      return JSON.parse(cleaned)
    } catch {
      throw new Error('Synthesis returned invalid JSON')
    }
  }
}
