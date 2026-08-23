import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { audioPathFor, runAiPipeline, saveAudioFile } from '@/lib/asr-pipeline'

type Params = { params: Promise<{ id: string }> }

const MAX_AUDIO_BYTES = 200 * 1024 * 1024 // 200 MB

/**
 * Accepts the recorded/uploaded audio for a lecture and kicks off the REAL AI
 * pipeline (ASR → LLM notes via z-ai-web-dev-sdk). The audio file is stored on
 * disk so Retry / Regenerate can re-run the pipeline without a re-upload.
 * Timer-only sessions (no file) fall back to the simulated pipeline.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })
  if (lecture.status === 'PROCESSING' || lecture.status === 'COMPLETED') {
    return Response.json({ error: 'This lecture is already processing or completed.' }, { status: 409 })
  }

  let hasAudio = false
  let durationSeconds: number | null = null
  let savedPath: string | null = null

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('audio')
    const durationRaw = form.get('duration')

    if (typeof durationRaw === 'string' && durationRaw) {
      const parsed = Number(durationRaw)
      if (Number.isFinite(parsed) && parsed >= 0) durationSeconds = Math.round(parsed)
    }
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_AUDIO_BYTES) {
        return Response.json({ error: 'Audio file exceeds the 200 MB limit.' }, { status: 413 })
      }
      hasAudio = true
      savedPath = audioPathFor(id, file.type || '', file.name)
      await saveAudioFile(savedPath, await file.arrayBuffer())
    }
  } else {
    const body = await request.json().catch(() => null)
    if (typeof body?.durationSeconds === 'number' && body.durationSeconds >= 0) {
      durationSeconds = Math.round(body.durationSeconds)
    }
  }

  const updated = await db.lecture.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      hasAudio,
      audioPath: savedPath ?? lecture.audioPath,
      durationSeconds: durationSeconds ?? lecture.durationSeconds,
      failFlag: !hasAudio && Math.random() < 0.15, // simulated failure only for timer sessions
      errorMessage: null,
      markdown: null,
    },
  })

  // Real AI pipeline when audio exists; simulation otherwise (syncLectureState)
  if (hasAudio) {
    void runAiPipeline(id)
  }

  return Response.json({ status: updated.status, lectureId: updated.id })
}
