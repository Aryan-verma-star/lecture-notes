import { db } from '@/lib/db'
import { createToken, hashPassword, verifyPassword } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const accessToken = await createToken(user.id)
    const refreshToken = await createToken(user.id)

    return Response.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
