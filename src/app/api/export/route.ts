import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

/**
 * Full data export for the authenticated user: every subject with its
 * lectures (status, duration, markdown, transcript). Used by the Settings
 * "Export all notes" action; the client renders it as a Markdown bundle.
 */
export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const subjects = await db.subject.findMany({
    where: { userId: user.id },
    orderBy: { name: 'asc' },
    include: {
      lectures: {
        orderBy: { recordedAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          recordedAt: true,
          durationSeconds: true,
          markdown: true,
          transcript: true,
        },
      },
    },
  })

  const totalLectures = subjects.reduce((n, s) => n + s.lectures.length, 0)
  const withNotes = subjects.reduce(
    (n, s) => n + s.lectures.filter((l) => l.markdown).length,
    0
  )

  return Response.json({
    exportedAt: new Date().toISOString(),
    email: user.email,
    totalSubjects: subjects.length,
    totalLectures,
    lecturesWithNotes: withNotes,
    subjects: subjects.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      lectures: s.lectures,
    })),
  })
}
