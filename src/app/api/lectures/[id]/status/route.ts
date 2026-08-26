import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

const TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        status: true,
        progressPercent: true,
        substage: true,
        errorMessage: true,
        updatedAt: true,
      },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    let { status, progressPercent, substage, errorMessage, updatedAt } =
      lecture

    if (
      status === 'PROCESSING' &&
      Date.now() - new Date(updatedAt).getTime() > TIMEOUT_MS
    ) {
      const updated = await db.lecture.update({
        where: { id },
        data: {
          status: 'FAILED',
          errorMessage: 'Processing timed out',
          substage: null,
          updatedAt: new Date().toISOString(),
        },
      })
      status = updated.status
      progressPercent = updated.progressPercent
      substage = updated.substage
      errorMessage = updated.errorMessage
    }

    return Response.json({
      status,
      progressPercent,
      substage,
      errorMessage,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
