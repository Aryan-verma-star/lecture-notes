import { getCurrentUser, unauthorized } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized('Not authenticated')
    return Response.json({ id: user.id, email: user.email })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
