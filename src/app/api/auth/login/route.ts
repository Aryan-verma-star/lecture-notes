import { db } from '@/lib/db'
import { createToken, verifyPassword } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    return Response.json({
      accessToken: createToken(user.id),
      refreshToken: createToken(user.id),
      user: { id: user.id, email: user.email },
    })
  } catch (err) {
    console.error('login error', err)
    return Response.json({ error: 'Login failed. Please try again.' }, { status: 500 })
  }
}
