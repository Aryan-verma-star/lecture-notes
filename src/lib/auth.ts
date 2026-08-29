import { scryptSync, randomBytes, timingSafeEqual, randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

// Password hashing — retained for the create-user script (custom-DB accounts).
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64, SCRYPT_OPTS)
  return `${salt}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const actual = scryptSync(password, salt, 64, SCRYPT_OPTS)
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), actual)
  } catch {
    return false
  }
}

// ── Supabase Auth ──

export async function getCurrentUser(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? '' }
}

// Ensures an app-side User row exists for a Supabase identity so that
// subjects/lectures can be owned by the Supabase user id.
export async function upsertUserFromSupabase(sub: string, email: string) {
  await db.user.upsert({
    where: { id: sub },
    create: { id: sub, email, createdAt: new Date().toISOString() },
    update: { email },
  })
}

export function unauthorized(message = 'Not authenticated') {
  return Response.json({ error: message }, { status: 401 })
}

export function genId(): string {
  return randomUUID()
}
