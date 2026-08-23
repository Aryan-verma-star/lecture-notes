import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { syncLectureState } from '@/lib/lecture-state'
import { deleteAudioFile } from '@/lib/asr-pipeline'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
    include: { subject: { select: { id: true, name: true } } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })

  const synced = await syncLectureState(lecture, lecture.subject.name)
  return Response.json({
    id: synced.id,
    subjectId: synced.subjectId,
    subjectName: lecture.subject.name,
    title: synced.title,
    status: synced.status,
    recordedAt: synced.recordedAt,
    durationSeconds: synced.durationSeconds,
    markdown: synced.markdown,
    hasTranscript: Boolean(synced.transcript),
    taskChecks: synced.taskChecks ? JSON.parse(synced.taskChecks) : null,
    errorMessage: synced.errorMessage,
    hasAudio: synced.hasAudio,
  })
}

/** Renames a lecture. */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''

  if (!title) {
    return Response.json({ error: 'Title is required.' }, { status: 400 })
  }
  if (title.length > 120) {
    return Response.json({ error: 'Title must be under 120 characters.' }, { status: 400 })
  }

  const updated = await db.lecture.update({ where: { id }, data: { title } })
  return Response.json({ id: updated.id, title: updated.title })
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })

  await deleteAudioFile(lecture.audioPath)
  await db.lecture.delete({ where: { id } })
  return Response.json({ ok: true })
}
