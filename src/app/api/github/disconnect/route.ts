import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'

export async function POST(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  await db.user.update({
    where: { id: user.id },
    data: {
      githubConnected: false,
      githubUsername: null,
      githubRepoName: null,
    },
  })

  return Response.json({ connected: false })
}
