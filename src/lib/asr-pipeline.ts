import { promises as fs } from 'fs'
import { spawn } from 'child_process'
import path from 'path'
import os from 'os'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'

/**
 * Real AI transcription pipeline.
 *
 * Lectures uploaded with an audio file are processed by the actual
 * z-ai-web-dev-sdk (ASR → LLM) instead of the timer simulation in
 * lecture-state.ts. The pipeline runs fire-and-forget in the Next.js
 * dev server process and persists each stage to the database:
 *
 *   TRANSCRIBING  audio → transcript   (zai.audio.asr, ffmpeg-chunked)
 *   GENERATING    transcript → notes   (zai.chat.completions)
 *   COMPLETED / FAILED
 *
 * The ASR service accepts at most 30 seconds of audio per request, so longer
 * recordings are normalized to 16 kHz mono WAV with ffmpeg and transcribed in
 * 25-second chunks. Timer-only sessions (no audio) keep the simulated pipeline.
 */

const AUDIO_DIR = '/tmp/ln-asr'
const WORK_DIR = '/tmp/ln-asr/work'
const PIPELINE_TIMEOUT_MS = 8 * 60 * 1000 // stuck-processing guard
const TRANSCRIPT_CHAR_CAP = 24000
const CHUNK_SECONDS = 25
const MAX_CHUNKS = 16 // ≈ 6.5 minutes of audio per run

const EXT_BY_MIME: Record<string, string> = {
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/flac': 'flac',
}

export function audioPathFor(lectureId: string, mime: string, fallbackName?: string): string {
  const ext =
    EXT_BY_MIME[mime.toLowerCase()] ??
    (fallbackName && fallbackName.includes('.')
      ? fallbackName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
      : 'bin')
  return path.join(AUDIO_DIR, `${lectureId}.${ext}`)
}

export async function saveAudioFile(filePath: string, bytes: ArrayBuffer): Promise<void> {
  await fs.mkdir(AUDIO_DIR, { recursive: true })
  await fs.writeFile(filePath, Buffer.from(bytes))
}

export async function deleteAudioFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return
  try {
    await fs.unlink(filePath)
  } catch {
    /* already gone */
  }
}

/* ------------------------------------------------------------------ */
/* ffmpeg helpers                                                      */
/* ------------------------------------------------------------------ */

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args])
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += String(d)
    })
    proc.on('error', (err) => reject(new Error(`ffmpeg is unavailable: ${err.message}`)))
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg failed (${code}): ${stderr.slice(0, 300)}`))
    })
  })
}

/** Normalizes any input audio to mono 16 kHz PCM WAV. */
async function toNormalizedWav(inputPath: string, outPath: string): Promise<void> {
  await runFfmpeg(['-i', inputPath, '-ac', '1', '-ar', '16000', '-acodec', 'pcm_s16le', outPath])
}

function wavDurationSeconds(file: Buffer): number {
  // Walk RIFF chunks to find fmt + data
  if (file.length < 44 || file.toString('ascii', 0, 4) !== 'RIFF') return 0
  let pos = 12
  let byteRate = 8000
  while (pos + 8 <= file.length) {
    const cid = file.toString('ascii', pos, pos + 4)
    const size = file.readUInt32LE(pos + 4)
    if (cid === 'fmt ') byteRate = file.readUInt32LE(pos + 16)
    if (cid === 'data') return size / byteRate
    pos += 8 + size + (size % 2)
  }
  return 0
}

/** Slices [start, start+CHUNK_SECONDS) of a PCM WAV into another WAV file. */
async function sliceWavChunk(
  src: Buffer,
  startSec: number,
  durationSec: number,
  outPath: string
): Promise<void> {
  // 44-byte canonical header assumption holds for our own ffmpeg output
  const byteRate = 16000 * 2
  const dataStart = 44
  const from = dataStart + Math.round(startSec * byteRate)
  const to = Math.min(src.length, dataStart + Math.round((startSec + durationSec) * byteRate))
  const body = src.subarray(from, to)

  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + body.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(16000, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(body.length, 40)

  await fs.writeFile(outPath, Buffer.concat([header, body]))
}

/* ------------------------------------------------------------------ */
/* Transcription                                                       */
/* ------------------------------------------------------------------ */

async function asrFileBase64(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  filePath: string
): Promise<string> {
  const bytes = await fs.readFile(filePath)
  const response = await zai.audio.asr.create({
    file_base64: bytes.toString('base64'),
  })
  return response.text?.trim() ?? ''
}

/**
 * Transcribes an arbitrary-length audio file:
 * normalize → chunk into ≤25 s WAVs → per-chunk ASR → joined transcript.
 */
async function transcribeAudioFile(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  inputPath: string
): Promise<string> {
  await fs.mkdir(WORK_DIR, { recursive: true })
  const base = path.join(WORK_DIR, `n${process.pid}-${Date.now()}`)
  const normalized = `${base}-full.wav`

  try {
    await toNormalizedWav(inputPath, normalized)
    const wav = await fs.readFile(normalized)
    const duration = wavDurationSeconds(wav)

    const parts: string[] = []
    if (duration <= CHUNK_SECONDS + 5) {
      const text = await asrFileBase64(zai, normalized)
      parts.push(text)
    } else {
      const chunkCount = Math.min(
        MAX_CHUNKS,
        Math.ceil(duration / CHUNK_SECONDS)
      )
      for (let i = 0; i < chunkCount; i++) {
        const chunkPath = `${base}-c${i}.wav`
        await sliceWavChunk(wav, i * CHUNK_SECONDS, CHUNK_SECONDS, chunkPath)
        try {
          const text = await asrFileBase64(zai, chunkPath)
          if (text) parts.push(text)
        } finally {
          await deleteAudioFile(chunkPath)
        }
      }
      if (duration > MAX_CHUNKS * CHUNK_SECONDS) {
        parts.push(
          `[Transcription truncated — the first ${Math.round(
            (MAX_CHUNKS * CHUNK_SECONDS) / 60
          )} minutes were transcribed.]`
        )
      }
    }

    const transcript = parts.filter(Boolean).join(' ').trim()
    if (!transcript) {
      throw new Error('Transcription returned no speech. The audio may be silent or unreadable.')
    }
    return transcript
  } finally {
    await deleteAudioFile(normalized)
  }
}

/* ------------------------------------------------------------------ */
/* Note generation                                                     */
/* ------------------------------------------------------------------ */

const NOTE_SYSTEM_PROMPT = `You are an expert study-notes editor for university students. You convert raw lecture transcripts into structured Markdown study notes.

Rules:
- Output ONLY Markdown — no preamble, no code fences around the whole document.
- Start with an H1 containing the lecture title.
- Then a blockquote line: > Transcribed from lecture audio · <subject> · Duration <duration>
- Organize into H2 sections such as Overview, Key Concepts, Important Formulas / Details, Worked Examples (if applicable), Summary Table (markdown table), and finish with an "## Study Checklist" section containing a GFM task list ("- [ ] ...").
- Bold key terms, use tables where they aid comparison, fenced code blocks only for formulas/code.
- Be faithful to the transcript: only include content the lecturer actually covered. Never invent facts. If the transcript is too short or garbled to structure, still produce a brief honest note saying so.
- Keep it under 700 words.`

async function generateNotesFromTranscript(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  args: { title: string; subjectName: string; durationLabel: string; transcript: string }
): Promise<string> {
  const transcript = args.transcript.slice(0, TRANSCRIPT_CHAR_CAP)
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: NOTE_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Lecture title: ${args.title}\nSubject: ${args.subjectName}\nDuration: ${args.durationLabel}\n\nTranscript:\n"""\n${transcript}\n"""`,
      },
    ],
    thinking: { type: 'disabled' },
  })
  const content = completion.choices[0]?.message?.content?.trim()
  if (!content) throw new Error('The notes model returned an empty response.')
  // Strip accidental full-document fences
  return content.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i, '$1')
}

function formatDurationLabel(seconds: number | null): string {
  if (!seconds) return 'unknown'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}

/* ------------------------------------------------------------------ */
/* Pipeline driver                                                     */
/* ------------------------------------------------------------------ */

/**
 * Runs the real AI pipeline for a lecture. Fire-and-forget safe: every stage
 * persists to the DB, and the status endpoint reflects pipelineStage.
 */
export async function runAiPipeline(lectureId: string): Promise<void> {
  const lecture = await db.lecture.findUnique({
    where: { id: lectureId },
    include: { subject: { select: { name: true } } },
  })
  if (!lecture) return
  if (!lecture.audioPath) {
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        status: 'FAILED',
        pipelineStage: null,
        errorMessage: 'No audio file stored for this lecture.',
      },
    })
    return
  }
  // Already finished (e.g. duplicate invocation)?
  if (lecture.status !== 'PROCESSING') return

  try {
    const zai = await ZAI.create()

    // ---- Stage 1: transcribe (skip if a transcript already exists) ----
    let transcript = lecture.transcript ?? null
    if (!transcript) {
      await db.lecture.update({
        where: { id: lectureId },
        data: { pipelineStage: 'TRANSCRIBING' },
      })
      transcript = await transcribeAudioFile(zai, lecture.audioPath)
      await db.lecture.update({
        where: { id: lectureId },
        data: { transcript },
      })
    }

    // ---- Stage 2: generate notes ----
    await db.lecture.update({
      where: { id: lectureId },
      data: { pipelineStage: 'GENERATING' },
    })
    const markdown = await generateNotesFromTranscript(zai, {
      title: lecture.title,
      subjectName: lecture.subject.name,
      durationLabel: formatDurationLabel(lecture.durationSeconds),
      transcript,
    })

    await db.lecture.update({
      where: { id: lectureId },
      data: {
        status: 'COMPLETED',
        pipelineStage: null,
        markdown,
        errorMessage: null,
        failFlag: false,
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'The AI transcription pipeline failed unexpectedly.'
    console.error(`[asr-pipeline] lecture ${lectureId} failed:`, message)
    await db.lecture
      .update({
        where: { id: lectureId },
        data: {
          status: 'FAILED',
          pipelineStage: null,
          errorMessage: message,
        },
      })
      .catch(() => {})
  }
}

/** Progress reported while the real pipeline runs. */
export function pipelineProgress(stage: string | null): {
  progressPercent: number
  substage: string
} {
  if (stage === 'TRANSCRIBING') return { progressPercent: 35, substage: 'Transcribing audio (AI)' }
  if (stage === 'GENERATING') return { progressPercent: 75, substage: 'Structuring notes (AI)' }
  return { progressPercent: 10, substage: 'Preparing audio' }
}

/** Workspace cleanup for orphaned temp files (best effort on boot). */
export async function cleanupWorkDir(): Promise<void> {
  try {
    await fs.rm(WORK_DIR, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}

export const TMP_DIR_HINT = os.tmpdir()
