import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { runAiPipeline } from '@/lib/asr-pipeline'

type Params = { params: Promise<{ id: string }> }

/** Re-runs processing for a failed lecture. Real-audio lectures re-run the AI
 *  pipeline (an existing transcript is reused — only notes are regenerated). */
export async function POST(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })
  if (lecture.status !== 'FAILED') {
    return Response.json({ error: 'Only failed lectures can be retried.' }, { status: 409 })
  }

  const useAiPipeline = Boolean(lecture.audioPath)

  await db.lecture.update({
    where: { id },
    data: {
      status: 'PROCESSING',
      processingStartedAt: new Date(),
      failFlag: false,
      errorMessage: null,
      markdown: null,
      pipelineStage: null,
    },
  })

  if (useAiPipeline) void runAiPipeline(id)

  return Response.json({ status: 'PROCESSING', pipeline: useAiPipeline ? 'ai' : 'simulated' })
}
