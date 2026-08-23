import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { syncLectureState } from '@/lib/lecture-state'

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
    errorMessage: synced.errorMessage,
    hasAudio: synced.hasAudio,
  })
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })

  await db.lecture.delete({ where: { id } })
  return Response.json({ ok: true })
}
