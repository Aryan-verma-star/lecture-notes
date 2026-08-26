import { promises as fs } from 'fs'
import path from 'path'
import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

/** Batch-deletes lectures owned by the authenticated user. Body: { ids: string[] } */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    const body = await request.json().catch(() => null)
    const rawIds = Array.isArray(body?.ids) ? body.ids : []
    // Dedupe + keep only strings
    const seen = new Set<string>()
    const ids: string[] = []
    for (const i of rawIds) {
      if (typeof i !== 'string' || !i) continue
      if (seen.has(i)) continue
      seen.add(i)
      ids.push(i)
    }

    if (ids.length === 0) {
      return Response.json({ deleted: 0 })
    }

    // Find only lectures owned by this user
    const owned = await db.lecture.findMany({
      where: { id: { in: ids }, userId: user.id },
      select: { id: true },
    })

    // Best-effort cleanup of on-disk audio files
    await Promise.all(
      owned.map(async (l) => {
        try {
          await fs.unlink(path.join(UPLOADS_DIR, l.id))
        } catch {
          /* file may not exist */
        }
      })
    )

    const result = await db.lecture.deleteMany({
      where: { id: { in: owned.map((l) => l.id) }, userId: user.id },
    })

    return Response.json({ deleted: result.count })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
