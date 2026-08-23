import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

/** Global search across subjects and lecture titles for the command palette. */
export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()

  if (!q) {
    // No query yet: return recents so the palette shows something useful
    const [subjects, lectures] = await Promise.all([
      db.subject.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        include: { _count: { select: { lectures: true } } },
      }),
      db.lecture.findMany({
        where: { subject: { userId: user.id } },
        orderBy: { recordedAt: 'desc' },
        take: 6,
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
      where: { userId: user.id, name: { contains: q } },
      orderBy: { name: 'asc' },
      take: 5,
      include: { _count: { select: { lectures: true } } },
    }),
    db.lecture.findMany({
      where: { subject: { userId: user.id }, title: { contains: q } },
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
