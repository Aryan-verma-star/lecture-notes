import { supabaseAdmin } from '@/lib/supabase-admin'
import { upsertUserFromSupabase } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body?.password === 'string' ? body.password : ''

    if (!email || !password) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const sub = data.user.id
    await upsertUserFromSupabase(sub, data.user.email ?? email)

    return Response.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: { id: sub, email: data.user.email ?? email },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
