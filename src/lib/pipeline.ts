import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { transcribeAudio, synthesizeNotes, detectMime } from '@/lib/gemini'
import { renderNotes } from '@/lib/markdown'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

/** Path to the stored audio file for a lecture. */
function audioFilePath(lectureId: string): string {
  return path.join(UPLOADS_DIR, lectureId)
}

/**
 * Background pipeline: transcribe → synthesise → render.
 * Updates DB progress at each stage. On failure, marks FAILED and
 * preserves or deletes the audio file depending on where it failed.
 */
export async function processLecture(lectureId: string): Promise<void> {
  const lecture = await db.lecture.findUnique({ where: { id: lectureId } })
  if (!lecture) return
  if (lecture.status !== 'PROCESSING') return

  const audioPath = audioFilePath(lectureId)
  const hasAudioFile = existsSync(audioPath)
  const hasTranscript = !!lecture.transcript

  let transcribed = false

  try {
    // ── If a transcript already exists (retry/regenerate), skip to synthesis ──
    if (hasTranscript) {
      const transcript = lecture.transcript!

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          progressPercent: 50,
          substage: 'Structuring notes',
          updatedAt: new Date().toISOString(),
        },
      })

      const synthesis = await synthesizeNotes(transcript)

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          progressPercent: 85,
          substage: 'Writing summary',
          updatedAt: new Date().toISOString(),
        },
      })

      const markdown = renderNotes(synthesis)

      let finalTitle = lecture.title
      const synthTitle = (synthesis as { lectureTitle?: string }).lectureTitle
      if (lecture.title === 'Untitled Lecture' && synthTitle) {
        finalTitle = synthTitle
      }

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          status: 'COMPLETED',
          progressPercent: 100,
          substage: null,
          markdown,
          title: finalTitle,
          errorMessage: null,
          updatedAt: new Date().toISOString(),
        },
      })
      return
    }

    // ── Timer session (no audio file on disk) ──
    if (!hasAudioFile) {
      await db.lecture.update({
        where: { id: lectureId },
        data: {
          progressPercent: 85,
          substage: 'Writing summary',
          updatedAt: new Date().toISOString(),
        },
      })

      const timerMarkdown = `# ${lecture.title}\n\n## Summary\nNo audio was captured for this session — it was recorded as a timer-only session. Record with a microphone or upload an audio file to generate full notes.\n`

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          status: 'COMPLETED',
          progressPercent: 100,
          substage: null,
          markdown: timerMarkdown,
          updatedAt: new Date().toISOString(),
        },
      })
      return
    }

    // ── Step 3: Transcription ──
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        progressPercent: 10,
        substage: 'Transcribing audio',
        updatedAt: new Date().toISOString(),
      },
    })

    const audioBuf = await fs.readFile(audioPath)
    const mimeType = detectMime(audioBuf)
    const base64 = audioBuf.toString('base64')

    const transcript = await transcribeAudio(base64, mimeType)

    // CHECKPOINT: save transcript, then delete audio
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        transcript,
        updatedAt: new Date().toISOString(),
      },
    })
    transcribed = true

    // Delete audio file (the ONLY deletion point)
    try {
      await fs.unlink(audioPath)
    } catch {
      /* already gone */
    }

    // ── Step 4: Synthesis ──
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        progressPercent: 50,
        substage: 'Structuring notes',
        updatedAt: new Date().toISOString(),
      },
    })

    const synthesis = await synthesizeNotes(transcript)

    // ── Step 5: Rendering ──
    await db.lecture.update({
      where: { id:lectureId },
      data: {
        progressPercent: 85,
        substage: 'Writing summary',
        updatedAt: new Date().toISOString(),
      },
    })

    const markdown = renderNotes(synthesis)

    // ── Step 6: Complete ──
    // If the lecture was untitled, use the synthesis-generated title
    let finalTitle = lecture.title
    const synthTitle = (synthesis as { lectureTitle?: string }).lectureTitle
    if (lecture.title === 'Untitled Lecture' && synthTitle) {
      finalTitle = synthTitle
    }

    await db.lecture.update({
      where: { id: lectureId },
      data: {
        status: 'COMPLETED',
        progressPercent: 100,
        substage: null,
        markdown,
        title: finalTitle,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Pipeline failed unexpectedly'
    console.error(`[pipeline] lecture ${lectureId} failed:`, message)

    // If failure was BEFORE transcript checkpoint: keep audio file (retry can re-transcribe)
    // If AFTER: audio already deleted (retry uses transcript)
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        status: 'FAILED',
        errorMessage: message.slice(0, 500),
        substage: null,
        updatedAt: new Date().toISOString(),
      },
    })
  }
}
