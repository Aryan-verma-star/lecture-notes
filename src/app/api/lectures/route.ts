import { db } from '@/lib/db'
import { getCurrentUser, genId, unauthorized } from '@/lib/auth'

function toLectureShape(l: {
  id: string
  subjectId: string
  title: string
  status: string
  recordedAt: string
  durationSeconds: number | null
  markdown: string | null
  errorMessage: string | null
  hasAudio: boolean
  subject?: { name: string } | null
}) {
  return {
    id: l.id,
    subjectId: l.subjectId,
    subjectName: l.subject?.name ?? null,
    title: l.title,
    status: l.status,
    recordedAt: l.recordedAt,
    durationSeconds: l.durationSeconds,
    markdown: l.markdown,
    errorMessage: l.errorMessage,
    hasAudio: l.hasAudio,
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    const url = new URL(request.url)
    const subjectId = url.searchParams.get('subjectId')

    if (subjectId) {
      // Verify the subject belongs to the user
      const subject = await db.subject.findFirst({
        where: { id: subjectId, userId: user.id },
        select: { id: true },
      })
      if (!subject) {
        return Response.json({ error: 'Not found' }, { status: 404 })
      }
    }

    const where = subjectId
      ? { subjectId, userId: user.id }
      : { userId: user.id }

    const lectures = await db.lecture.findMany({
      where,
      orderBy: { recordedAt: 'desc' },
      include: { subject: { select: { name: true } } },
    })

    return Response.json(lectures.map(toLectureShape))
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
    const subjectId =
      typeof body?.subjectId === 'string' ? body.subjectId : ''
    const titleRaw =
      typeof body?.title === 'string' ? body.title.trim() : ''

    if (!subjectId) {
      return Response.json(
        { error: 'Subject id must not be empty' },
        { status: 422 }
      )
    }

    const subject = await db.subject.findFirst({
      where: { id: subjectId, userId: user.id },
      select: { id: true, name: true },
    })
    if (!subject) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const title = titleRaw.length > 0 ? titleRaw : 'Untitled Lecture'
    const now = new Date().toISOString()

    const lecture = await db.lecture.create({
      data: {
        id: genId(),
        userId: user.id,
        subjectId,
        title,
        status: 'RECORDING',
        recordedAt: now,
        hasAudio: false,
        progressPercent: 0,
        regenerateCount: 0,
        createdAt: now,
        updatedAt: now,
      },
      include: { subject: { select: { name: true } } },
    })

    return Response.json(toLectureShape(lecture), { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
