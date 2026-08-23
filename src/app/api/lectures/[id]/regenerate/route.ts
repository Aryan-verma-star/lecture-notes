import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { runAiPipeline } from '@/lib/asr-pipeline'

type Params = { params: Promise<{ id: string }> }

/**
 * Re-runs note generation for a completed or failed lecture.
 * Real-audio lectures keep their transcript and only re-run the LLM stage
 * (regenCount nudges the simulated template rotation for timer sessions).
 */
export async function POST(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })
  if (lecture.status === 'PROCESSING') {
    return Response.json({ error: 'This lecture is already processing.' }, { status: 409 })
  }

  const useAiPipeline = Boolean(lecture.audioPath)

  const updated = await db.lecture.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      failFlag: false,
      errorMessage: null,
      markdown: null,
      regenCount: lecture.regenCount + 1,
      pipelineStage: null,
    },
  })

  if (useAiPipeline) void runAiPipeline(id)

  return Response.json({ status: updated.status, pipeline: useAiPipeline ? 'ai' : 'simulated' })
}
