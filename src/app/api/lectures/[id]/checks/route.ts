import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const raw = body?.checks

    if (
      raw == null ||
      typeof raw !== 'object' ||
      Array.isArray(raw)
    ) {
      return Response.json(
        { error: 'Invalid checks payload' },
        { status: 422 }
      )
    }

    const checks: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(
      raw as Record<string, unknown>
    )) {
      if (typeof value === 'boolean') {
        checks[key] = value
      }
    }

    const stored =
      Object.keys(checks).length > 0 ? JSON.stringify(checks) : null

    await db.lecture.update({
      where: { id },
      data: { taskChecks: stored, updatedAt: new Date().toISOString() },
    })

    return Response.json({
      ok: true,
      checks: Object.keys(checks).length > 0 ? checks : {},
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
