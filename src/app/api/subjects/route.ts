import { db } from '@/lib/db'
import { getCurrentUser, genId, unauthorized } from '@/lib/auth'

/** Abandons any lecture stuck in RECORDING for > 24h. */
async function reapAbandonedRecordings(userId: string) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  await db.lecture.updateMany({
    where: {
      userId,
      status: 'RECORDING',
      updatedAt: { lt: cutoff },
    },
    data: {
      status: 'FAILED',
      errorMessage: 'Recording abandoned',
      updatedAt: new Date().toISOString(),
    },
  })
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    await reapAbandonedRecordings(user.id)

    const subjects = await db.subject.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        lectures: {
          orderBy: { recordedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            title: true,
            status: true,
            recordedAt: true,
          },
        },
        _count: { select: { lectures: true } },
      },
    })

    return Response.json(
      subjects.map((s) => {
        const last = s.lectures[0]
        const active =
          !!last &&
          (last.status === 'RECORDING' || last.status === 'PROCESSING')
        return {
          id: s.id,
          name: s.name,
          description: s.description,
          lectureCount: s._count.lectures,
          lastLectureAt: last?.recordedAt ?? null,
          lastLectureTitle: last?.title ?? null,
          lastLectureStatus: last?.status ?? null,
          active,
          createdAt: s.createdAt,
        }
      })
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    const body = await request.json().catch(() => null)
    const name =
      typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return Response.json(
        { error: 'Subject name must not be empty' },
        { status: 422 }
      )
    }

    const description =
      typeof body?.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null

    const now = new Date().toISOString()
    const subject = await db.subject.create({
      data: {
        id: genId(),
        userId: user.id,
        name,
        description,
        createdAt: now,
        updatedAt: now,
      },
    })

    return Response.json(
      {
        id: subject.id,
        name: subject.name,
        description: subject.description,
        lectureCount: 0,
        lastLectureAt: null,
        lastLectureTitle: null,
        lastLectureStatus: null,
        active: false,
        createdAt: subject.createdAt,
      },
      { status: 201 }
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
