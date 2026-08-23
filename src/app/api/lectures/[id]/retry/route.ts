import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

/** Re-runs the processing pipeline for a failed lecture. Retries always succeed. */
export async function POST(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })
  if (lecture.status !== 'FAILED') {
    return Response.json({ error: 'Only failed lectures can be retried.' }, { status: 409 })
  }

  const updated = await db.lecture.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      failFlag: false,
      errorMessage: null,
      markdown: null,
    },
  })

  return Response.json({ status: updated.status })
}
