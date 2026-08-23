import { db } from '@/lib/db'
import { createToken, hashPassword } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return Response.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return Response.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }

    const user = await db.user.create({
      data: { email, passwordHash: hashPassword(password) },
    })

    return Response.json(
      {
        accessToken: createToken(user.id),
        refreshToken: createToken(user.id),
        user: { id: user.id, email: user.email },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('register error', err)
    return Response.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  }
}
