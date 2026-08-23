import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

/** Batch-deletes lectures owned by the authenticated user. Body: { ids: string[] } */
export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const body = await request.json().catch(() => null)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((i: unknown): i is string => typeof i === 'string') : []

  if (ids.length === 0) {
    return Response.json({ error: 'No lecture ids provided.' }, { status: 400 })
  }
  if (ids.length > 100) {
    return Response.json({ error: 'Cannot delete more than 100 lectures at once.' }, { status: 400 })
  }

  // Scoped to the owning user via the subject relation
  const result = await db.lecture.deleteMany({
    where: { id: { in: ids }, subject: { userId: user.id } },
  })

  return Response.json({ deleted: result.count })
}
