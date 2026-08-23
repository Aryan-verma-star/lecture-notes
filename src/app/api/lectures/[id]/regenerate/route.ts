import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

/**
 * Re-runs the AI pipeline for a completed or failed lecture.
 * Regeneration rotates the note template (via regenCount) and always
 * succeeds, so users can compare different note drafts.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })
  if (lecture.status === 'PROCESSING') {
    return Response.json({ error: 'This lecture is already processing.' }, { status: 409 })
  }

  const updated = await db.lecture.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      failFlag: false,
      errorMessage: null,
      markdown: null,
      regenCount: lecture.regenCount + 1,
    },
  })

  return Response.json({ status: updated.status, regenCount: updated.regenCount })
}
