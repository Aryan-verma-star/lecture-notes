import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const subjects = await db.subject.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      lectures: {
        orderBy: { recordedAt: 'desc' },
        take: 1,
        select: { id: true, title: true, status: true, recordedAt: true },
      },
      _count: { select: { lectures: true } },
    },
  })

  const now = Date.now()
  return Response.json(
    subjects.map((s) => {
      const last = s.lectures[0]
      const recent = last ? now - new Date(last.recordedAt).getTime() < 7 * 24 * 3600 * 1000 : false
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        lectureCount: s._count.lectures,
        lastLectureAt: last?.recordedAt ?? null,
        lastLectureTitle: last?.title ?? null,
        lastLectureStatus: last?.status ?? null,
        active: recent,
        createdAt: s.createdAt,
      }
    })
  )
}

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  try {
    const body = await request.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const description =
      typeof body?.description === 'string' && body.description.trim() ? body.description.trim() : null

    if (!name) {
      return Response.json({ error: 'Subject name is required.' }, { status: 400 })
    }
    if (name.length > 80) {
      return Response.json({ error: 'Subject name must be under 80 characters.' }, { status: 400 })
    }

    const dupe = await db.subject.findFirst({ where: { userId: user.id, name } })
    if (dupe) {
      return Response.json({ error: 'You already have a subject with this name.' }, { status: 409 })
    }

    const subject = await db.subject.create({ data: { userId: user.id, name, description } })
    return Response.json(
      { ...subject, lectureCount: 0, lastLectureAt: null, lastLectureTitle: null, active: false },
      { status: 201 }
    )
  } catch (err) {
    console.error('create subject error', err)
    return Response.json({ error: 'Could not create subject.' }, { status: 500 })
  }
}
