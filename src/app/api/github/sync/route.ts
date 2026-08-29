import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { syncToGitHub, isGitHubConfigured } from '@/lib/github'

export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    if (!isGitHubConfigured()) {
      return Response.json(
        {
          error:
            'GitHub backup is not configured. Set GITHUB_TOKEN and GITHUB_REPO in the environment.',
        },
        { status: 422 }
      )
    }

    const result = await syncToGitHub(user.id)
    return Response.json({
      ok: true,
      files: result.files,
      deleted: result.deleted,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()

    const configured = isGitHubConfigured()
    const count = configured
      ? await db.lecture.count({
          where: { userId: user.id, markdown: { not: null } },
        })
      : 0

    return Response.json({ configured, notesToBackup: count })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
