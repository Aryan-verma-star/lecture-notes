import { supabaseAdmin } from '@/lib/supabase-admin'
import { db } from '@/lib/db'
import { transcribeAudio, synthesizeNotes, detectMime } from '@/lib/gemini'
import { renderNotes } from '@/lib/markdown'
import { syncToGitHub, isGitHubConfigured } from '@/lib/github'

const BUCKET = 'lecture-audio'

/**
 * Best-effort GitHub backup after a lecture finishes. Never throws — failures
 * are logged and must not affect the lecture's COMPLETED status.
 */
async function backupToGitHub(userId: string) {
  if (!isGitHubConfigured()) return
  try {
    await syncToGitHub(userId)
  } catch (err) {
    console.error('[github] backup failed (non-fatal):', err)
  }
}

/**
 * Synchronous pipeline: transcribe → synthesise → render.
 * Runs INSIDE a request (Vercel freezes functions after the response, so the
 * work must complete before we return). Updates DB progress at each stage.
 * On failure, marks FAILED and preserves the storage object when safe.
 */
export async function processLecture(lectureId: string): Promise<void> {
  const lecture = await db.lecture.findUnique({ where: { id: lectureId } })
  if (!lecture) return
  if (lecture.status !== 'PROCESSING') return

  const storagePath = lecture.storagePath
  const hasTranscript = !!lecture.transcript

  const now = () => new Date().toISOString()

  try {
    // ── If a transcript already exists (retry/regenerate), skip to synthesis ──
    if (hasTranscript) {
      const transcript = lecture.transcript!

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          progressPercent: 50,
          substage: 'Structuring notes',
          updatedAt: now(),
        },
      })

      const synthesis = await synthesizeNotes(transcript)

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          progressPercent: 85,
          substage: 'Writing summary',
          updatedAt: now(),
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
          updatedAt: now(),
        },
      })
      await backupToGitHub(lecture.userId)
      return
    }

    // ── Timer session (no storage object and no transcript) ──
    if (!storagePath) {
      const timerMarkdown = `# ${lecture.title}\n\n## Summary\nNo audio was captured for this session — it was recorded as a timer-only session. Record with a microphone or upload an audio file to generate full notes.\n`

      await db.lecture.update({
        where: { id: lectureId },
        data: {
          status: 'COMPLETED',
          progressPercent: 100,
          substage: null,
          markdown: timerMarkdown,
          updatedAt: now(),
        },
      })
      return
    }

    // ── Transcription from Supabase Storage ──
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        progressPercent: 10,
        substage: 'Transcribing audio',
        updatedAt: now(),
      },
    })

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(storagePath)
    if (error || !data) {
      throw new Error(
        `Storage download failed: ${error?.message ?? 'no data returned'}`
      )
    }

    const audioBuf = Buffer.from(await data.arrayBuffer())
    const mimeType = detectMime(audioBuf)
    const base64 = audioBuf.toString('base64')

    const transcript = await transcribeAudio(base64, mimeType)

    // CHECKPOINT: save transcript, then delete the storage object (the ONLY
    // deletion point — before this, a retry can re-download and re-transcribe).
    await db.lecture.update({
      where: { id: lectureId },
      data: { transcript, updatedAt: now() },
    })

    try {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath])
    } catch (e) {
      console.error('[pipeline] failed to remove storage object:', e)
    }

    // ── Synthesis ──
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        progressPercent: 50,
        substage: 'Structuring notes',
        updatedAt: now(),
      },
    })

    const synthesis = await synthesizeNotes(transcript)

    // ── Rendering ──
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        progressPercent: 85,
        substage: 'Writing summary',
        updatedAt: now(),
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
        updatedAt: now(),
      },
    })
    await backupToGitHub(lecture.userId)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Pipeline failed unexpectedly'
    console.error(`[pipeline] lecture ${lectureId} failed:`, message)
    await db.lecture.update({
      where: { id: lectureId },
      data: {
        status: 'FAILED',
        errorMessage: message.slice(0, 500),
        substage: null,
        updatedAt: now(),
      },
    })
  }
}
