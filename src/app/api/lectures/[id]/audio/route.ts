import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const MAX_AUDIO_BYTES = 200 * 1024 * 1024 // 200 MB

/**
 * Accepts the recorded/uploaded audio for a lecture and kicks off the
 * (simulated) AI processing pipeline. The audio payload is inspected then
 * discarded — transcription is simulated server-side on a timer.
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
      durationSeconds: durationSeconds ?? lecture.durationSeconds,
      failFlag: Math.random() < 0.15, // occasional simulated transcription failure
    },
  })

  return Response.json({ status: updated.status, lectureId: updated.id })
}
