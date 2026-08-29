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

    // Run the pipeline synchronously, inside this request (maxDuration 300).
    await processLecture(id)

    const updated = await db.lecture.findUnique({
      where: { id },
      select: { status: true },
    })

    return Response.json({ ok: true, status: updated?.status ?? 'UNKNOWN' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
