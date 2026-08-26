import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

/** Full data export: every subject + its lectures (status, duration,
 *  markdown, transcript). Used by the Settings "Export all notes" action. */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request)
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

    const totalLectures = subjects.reduce(
      (n, s) => n + s.lectures.length,
      0
    )
    const lecturesWithNotes = subjects.reduce(
      (n, s) => n + s.lectures.filter((l) => l.markdown !== null).length,
      0
    )

    return Response.json({
      exportedAt: new Date().toISOString(),
      email: user.email,
      totalSubjects: subjects.length,
      totalLectures,
      lecturesWithNotes,
      subjects: subjects.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        lectures: s.lectures,
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
