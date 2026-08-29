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
      select: {
        id: true,
        status: true,
        durationSeconds: true,
        storagePath: true,
      },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (lecture.status !== 'RECORDING' && lecture.status !== 'FAILED') {
      return Response.json(
        {
          error:
            'Audio can only be uploaded while the lecture is RECORDING or FAILED',
        },
        { status: 422 }
      )
    }

    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      return Response.json(
        { error: 'Audio must be uploaded to storage via /upload-url first' },
        { status: 400 }
      )
    }

    const body = (await request.json().catch(() => null)) as
      | { storagePath?: unknown; durationSeconds?: unknown }
      | null

    const rawStoragePath = body?.storagePath
    const storagePath =
      typeof rawStoragePath === 'string' && rawStoragePath.length > 0
        ? rawStoragePath
        : null

    const rawDuration = body?.durationSeconds
    let durationSeconds: number | null = null
    if (
      typeof rawDuration === 'number' &&
      Number.isFinite(rawDuration) &&
      rawDuration >= 0
    ) {
      durationSeconds = Math.round(rawDuration)
    }

    let hasAudio = false
    if (storagePath) {
      // Verify the object actually landed in storage before we trust the path.
      const { data: objects, error: listError } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(`lectures/${id}`)
      if (listError) {
        console.error('[audio] storage list error:', listError)
        return Response.json(
          { error: 'Could not verify audio in storage' },
          { status: 500 }
        )
      }
      if (!objects || objects.length === 0) {
        return Response.json(
          { error: 'Audio file not found in storage' },
          { status: 400 }
        )
      }
      hasAudio = true
    }

    await db.lecture.update({
      where: { id },
      data: {
        status: 'PROCESSING',
        progressPercent: 0,
        substage: 'Transcribing audio',
        errorMessage: null,
        markdown: null,
        hasAudio,
        storagePath: storagePath ?? null,
        durationSeconds: durationSeconds ?? lecture.durationSeconds,
        updatedAt: new Date().toISOString(),
      },
    })

    // The pipeline is triggered by a separate /process request (synchronous,
    // maxDuration 300) so it runs INSIDE the request on Vercel.
    return Response.json({ status: 'PROCESSING', lectureId: id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
