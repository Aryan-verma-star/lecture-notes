import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { syncLectureState } from '@/lib/lecture-state'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const subject = await db.subject.findFirst({
    where: { id, userId: user.id },
    include: { lectures: { orderBy: { recordedAt: 'desc' } } },
  })
  if (!subject) return Response.json({ error: 'Subject not found.' }, { status: 404 })

  const lectures = []
  for (const lecture of subject.lectures) {
    lectures.push(await syncLectureState(lecture, subject.name))
  }

  return Response.json({
    id: subject.id,
    name: subject.name,
    description: subject.description,
    createdAt: subject.createdAt,
    lectures: lectures.map((l) => ({
      id: l.id,
      subjectId: l.subjectId,
      title: l.title,
      status: l.status,
      recordedAt: l.recordedAt,
      durationSeconds: l.durationSeconds,
    })),
  })
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const subject = await db.subject.findFirst({ where: { id, userId: user.id } })
  if (!subject) return Response.json({ error: 'Subject not found.' }, { status: 404 })

  await db.subject.delete({ where: { id } })
  return Response.json({ ok: true })
}
