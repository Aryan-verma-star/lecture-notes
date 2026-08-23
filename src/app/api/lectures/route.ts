import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { syncLectureState } from '@/lib/lecture-state'

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const url = new URL(request.url)
  const subjectId = url.searchParams.get('subjectId')

  const where = subjectId
    ? { subjectId, subject: { userId: user.id } }
    : { subject: { userId: user.id } }

  const lectures = await db.lecture.findMany({
    where,
    orderBy: { recordedAt: 'desc' },
    include: { subject: { select: { name: true } } },
  })

  const synced = []
  for (const lecture of lectures) {
    synced.push(await syncLectureState(lecture, lecture.subject.name))
  }

  return Response.json(
    synced.map((l) => ({
      id: l.id,
      subjectId: l.subjectId,
      subjectName: (l as { subject?: { name: string } }).subject?.name,
      title: l.title,
      status: l.status,
      recordedAt: l.recordedAt,
      durationSeconds: l.durationSeconds,
    }))
  )
}

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  try {
    const body = await request.json().catch(() => null)
    const subjectId = typeof body?.subjectId === 'string' ? body.subjectId : ''
    const title = typeof body?.title === 'string' ? body.title.trim() : ''

    if (!subjectId || !title) {
      return Response.json({ error: 'Subject and title are required.' }, { status: 400 })
    }

    const subject = await db.subject.findFirst({ where: { id: subjectId, userId: user.id } })
    if (!subject) return Response.json({ error: 'Subject not found.' }, { status: 404 })

    const lecture = await db.lecture.create({
      data: { subjectId, title, status: 'RECORDING' },
    })

    return Response.json(
      {
        id: lecture.id,
        subjectId: lecture.subjectId,
        title: lecture.title,
        status: lecture.status,
        recordedAt: lecture.recordedAt,
        durationSeconds: lecture.durationSeconds,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('create lecture error', err)
    return Response.json({ error: 'Could not create lecture.' }, { status: 500 })
  }
}
