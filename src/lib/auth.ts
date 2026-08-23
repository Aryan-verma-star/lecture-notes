import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'

const SECRET = process.env.AUTH_SECRET || 'lecture-notes-ai-dev-secret-722f37'
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = scryptSync(password, salt, 64)
  return timingSafeEqual(expected, actual)
}

function sign(payload: string): string {
  return createHmac('sha256', SECRET).update(payload).digest('hex')
}

/** Creates an HMAC-signed token: base64url(userId.timestamp).signature */
export function createToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`
  const encoded = Buffer.from(payload).toString('base64url')
  return `${encoded}.${sign(payload)}`
}

export function verifyToken(token: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, signature] = parts
  let payload: string
  try {
    payload = Buffer.from(encoded, 'base64url').toString()
  } catch {
    return null
  }
  const expected = Buffer.from(sign(payload), 'hex')
  const actual = Buffer.from(signature, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  const [userId, issuedAt] = payload.split('.')
  if (!userId || !issuedAt) return null
  if (Date.now() - Number(issuedAt) > TOKEN_TTL_MS) return null
  return userId
}

/** Extracts and validates the bearer token, returning the user id or null. */
export function getUserId(request: Request): string | null {
  const header = request.headers.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  return verifyToken(token)
}

/** Returns the authenticated user record, or null. */
export async function getAuthUser(request: Request) {
  const userId = getUserId(request)
  if (!userId) return null
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      githubConnected: true,
      githubUsername: true,
      githubRepoName: true,
    },
  })
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
