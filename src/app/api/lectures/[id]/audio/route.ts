import { promises as fs } from 'fs'
import path from 'path'
import { after } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'
import { processLecture } from '@/lib/pipeline'

type Params = { params: Promise<{ id: string }> }

const MAX_AUDIO_BYTES = Number(process.env.MAX_AUDIO_BYTES) || 200 * 1024 * 1024
const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

function launchPipeline(lectureId: string) {
  try {
    after(() => {
      processLecture(lectureId).catch((err) => {
        console.error(`[pipeline] lecture ${lectureId} failed:`, err)
      })
    })
  } catch {
    // `after` may throw outside a request scope; fall back to setImmediate
    setImmediate(() => {
      processLecture(lectureId).catch((err) => {
        console.error(`[pipeline] lecture ${lectureId} failed:`, err)
      })
    })
  }
}

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
      },
    })
    if (!lecture) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (
      lecture.status !== 'RECORDING' &&
      lecture.status !== 'FAILED'
    ) {
      return Response.json(
        {
          error:
            'Audio can only be uploaded while the lecture is RECORDING or FAILED',
        },
        { status: 422 }
      )
    }

    const contentType = request.headers.get('content-type') || ''

    let audioFile: File | null = null
    let durationSeconds: number | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('audio')
      const durationRaw = form.get('duration')
      if (typeof durationRaw === 'string' && durationRaw) {
        const parsed = Number(durationRaw)
        if (Number.isFinite(parsed) && parsed >= 0) {
          durationSeconds = Math.round(parsed)
        }
      }
      if (file instanceof File && file.size > 0) {
        audioFile = file
      }
    } else {
      const body = await request.json().catch(() => null)
      if (
        body &&
        typeof body === 'object' &&
        typeof (body as { durationSeconds?: unknown }).durationSeconds ===
          'number'
      ) {
        const n = (body as { durationSeconds: number }).durationSeconds
        if (Number.isFinite(n) && n >= 0) {
          durationSeconds = Math.round(n)
        }
      }
    }

    let hasAudio = false
    if (audioFile) {
      if (audioFile.size > MAX_AUDIO_BYTES) {
        return Response.json(
          { error: 'Audio file exceeds 200 MB limit' },
          { status: 413 }
        )
      }

      // Ensure uploads dir exists
      try {
        await fs.mkdir(UPLOADS_DIR, { recursive: true })
      } catch {
        /* may already exist */
      }

      const buf = Buffer.from(await audioFile.arrayBuffer())
      try {
        await fs.writeFile(path.join(UPLOADS_DIR, id), buf)
        hasAudio = true
      } catch (err) {
        // Could not write file — partial upload, clean up
        try {
          await fs.unlink(path.join(UPLOADS_DIR, id))
        } catch {
          /* ignore */
        }
        throw err
      }
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
        durationSeconds:
          durationSeconds ?? lecture.durationSeconds,
        updatedAt: new Date().toISOString(),
      },
    })

    launchPipeline(id)

    return Response.json({ status: 'PROCESSING', lectureId: id })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
