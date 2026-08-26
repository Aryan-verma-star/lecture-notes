import { SignJWT, jwtVerify } from 'jose'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-secret-change-in-production-min-32-chars'
)
const TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

// ── Password hashing (crypto.scryptSync, N=16384, r=8, p=1) ──

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

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

// ── JWT (jose, HS256, 30-day TTL) ──

export async function createToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(SECRET)
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: ['HS256'] })
    return payload.sub ?? null
  } catch {
    return null
  }
}

// ── Request helper ──

export async function getCurrentUser(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null
  const userId = await verifyToken(token)
  if (!userId) return null
  return db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true },
  })
}

export function unauthorized(message = 'Not authenticated') {
  return Response.json({ error: message }, { status: 401 })
}

// ── ID generator ──

export function genId(): string {
  return crypto.randomUUID()
}
