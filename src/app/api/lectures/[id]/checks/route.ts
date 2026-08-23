import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

/**
 * Persists interactive task-checkbox states for a lecture's notes.
 * Body: { checks: { "taskIndex": boolean, ... } } — replaces the whole map.
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const raw = body?.checks

  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return Response.json({ error: 'Invalid checks payload.' }, { status: 400 })
  }

  // Sanitize to a flat { string: boolean } map with bounded size
  const checks: Record<string, boolean> = {}
  let count = 0
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'boolean') continue
    if (!/^[a-z0-9-]{1,64}$/.test(key)) continue
    checks[key] = value
    count += 1
    if (count >= 200) break
  }

  const hasAny = Object.keys(checks).length > 0
  await db.lecture.update({
    where: { id },
    data: { taskChecks: hasAny ? JSON.stringify(checks) : null },
  })

  return Response.json({ ok: true, checks })
}
