import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

const BUCKET = 'lecture-audio'

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      select: { id: true, status: true },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (lecture.status !== 'RECORDING' && lecture.status !== 'FAILED') {
      return Response.json(
        {
          error:
            'Cannot request an upload URL for a lecture that is not RECORDING or FAILED',
        },
        { status: 422 }
      )
    }

    const body = (await request.json().catch(() => null)) as
      | { contentType?: unknown }
      | null
    const contentType =
      typeof body?.contentType === 'string' ? body.contentType : undefined

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(`lectures/${id}/audio`)
    if (error || !data) {
      console.error('[upload-url] createSignedUploadUrl error:', error)
      return Response.json(
        { error: error?.message ?? 'Failed to create upload URL' },
        { status: 500 }
      )
    }

    return Response.json({
      url: data.signedUrl,
      path: data.path,
      token: data.token,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
