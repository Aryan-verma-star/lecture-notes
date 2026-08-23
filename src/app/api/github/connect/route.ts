import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

/**
 * Simulated GitHub OAuth completion. In production this would return the
 * OAuth authorization URL; the sandbox completes the handshake directly with
 * the provided account details.
 */
export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const body = await request.json().catch(() => null)
  const username =
    (typeof body?.username === 'string' ? body.username.trim() : '') || 'lecture-student'
  const repoName =
    (typeof body?.repoName === 'string' ? body.repoName.trim() : '') || 'lecture-notes'

  if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) {
    return Response.json({ error: 'Invalid GitHub username.' }, { status: 400 })
  }
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repoName)) {
    return Response.json({ error: 'Invalid repository name.' }, { status: 400 })
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      githubConnected: true,
      githubUsername: username,
      githubRepoName: repoName,
    },
  })

  return Response.json({
    connected: true,
    username,
    repoName,
    authUrl: `https://github.com/${username}/${repoName}`,
  })
}
