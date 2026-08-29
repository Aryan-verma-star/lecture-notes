import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Real DB query — keeps the Supabase project from pausing after ~7 days idle.
  await db.subject.count()
  return Response.json({ ok: true, time: new Date().toISOString() })
}
