import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Params = { params: Promise<{ id: string }> }

const BUCKET = 'lecture-audio'

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      include: { subject: { select: { name: true } } },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    let taskChecks: Record<string, boolean> | null = null
    if (lecture.taskChecks) {
      try {
        const parsed = JSON.parse(lecture.taskChecks)
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
        ) {
          taskChecks = parsed as Record<string, boolean>
        }
      } catch {
        taskChecks = null
      }
    }

    return Response.json({
      id: lecture.id,
      subjectId: lecture.subjectId,
      subjectName: lecture.subject?.name ?? null,
      title: lecture.title,
      status: lecture.status,
      recordedAt: lecture.recordedAt,
      durationSeconds: lecture.durationSeconds,
      markdown: lecture.markdown,
      errorMessage: lecture.errorMessage,
      hasAudio: lecture.hasAudio,
      hasTranscript: lecture.transcript !== null,
      transcript: lecture.transcript,
      taskChecks,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const title =
      typeof body?.title === 'string' ? body.title.trim() : ''

    if (!title) {
      return Response.json(
        { error: 'Title must not be empty' },
        { status: 422 }
      )
    }

    const updated = await db.lecture.update({
      where: { id },
      data: { title, updatedAt: new Date().toISOString() },
    })
    return Response.json({ id: updated.id, title: updated.title })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const lecture = await db.lecture.findFirst({
      where: { id, userId: user.id },
      select: { id: true, storagePath: true },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    await db.lecture.delete({ where: { id } })

    // Best-effort cleanup of the audio object in Supabase Storage
    if (lecture.storagePath) {
      try {
        await supabaseAdmin.storage.from(BUCKET).remove([lecture.storagePath])
      } catch {
        /* object may not exist — ignore */
      }
    }

    return Response.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
