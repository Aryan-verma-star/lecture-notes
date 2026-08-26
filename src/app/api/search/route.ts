import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

/** Global search across subjects and lecture titles for the command palette. */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').trim()

    if (!q) {
      // No query: return recent items so the palette shows something useful
      const [subjects, lectures] = await Promise.all([
        db.subject.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { _count: { select: { lectures: true } } },
        }),
        db.lecture.findMany({
          where: { userId: user.id },
          orderBy: { recordedAt: 'desc' },
          take: 8,
          include: { subject: { select: { name: true } } },
        }),
      ])

      return Response.json({
        subjects: subjects.map((s) => ({
          id: s.id,
          name: s.name,
          lectureCount: s._count.lectures,
        })),
        lectures: lectures.map((l) => ({
          id: l.id,
          title: l.title,
          subjectId: l.subjectId,
          subjectName: l.subject.name,
          status: l.status,
          recordedAt: l.recordedAt,
        })),
      })
    }

    const [subjects, lectures] = await Promise.all([
      db.subject.findMany({
        where: {
          userId: user.id,
          name: { contains: q, mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
        take: 5,
        include: { _count: { select: { lectures: true } } },
      }),
      db.lecture.findMany({
        where: {
          userId: user.id,
          title: { contains: q, mode: 'insensitive' },
        },
        orderBy: { recordedAt: 'desc' },
        take: 8,
        include: { subject: { select: { name: true } } },
      }),
    ])

    return Response.json({
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        lectureCount: s._count.lectures,
      })),
      lectures: lectures.map((l) => ({
        id: l.id,
        title: l.title,
        subjectId: l.subjectId,
        subjectName: l.subject.name,
        status: l.status,
        recordedAt: l.recordedAt,
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
