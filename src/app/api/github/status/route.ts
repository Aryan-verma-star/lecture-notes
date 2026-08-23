import { getAuthUser, unauthorized } from '@/lib/auth'

export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  return Response.json({
    connected: user.githubConnected,
    username: user.githubUsername,
    repoName: user.githubRepoName,
  })
}
