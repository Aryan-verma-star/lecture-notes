import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { processLecture } from '@/lib/pipeline'

export const maxDuration = 300

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (lecture.status !== 'FAILED') {
      return Response.json(
        { error: 'Retry is only available for failed lectures' },
        { status: 422 }
      )
    }

    await db.lecture.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        progressPercent: 0,
        substage: 'Transcribing audio',
        errorMessage: null,
        markdown: null,
        updatedAt: new Date().toISOString(),
      },
    })

    // Synchronous — runs inside this request (maxDuration 300).
    await processLecture(id)

    return Response.json({ status: 'PROCESSING', pipeline: 'ai' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
