import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { computeProgress, syncLectureState } from '@/lib/lecture-state'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const lecture = await db.lecture.findFirst({
    where: { id, subject: { userId: user.id } },
    include: { subject: { select: { name: true } } },
  })
  if (!lecture) return Response.json({ error: 'Lecture not found.' }, { status: 404 })

  if (lecture.status === 'PROCESSING') {
    const synced = await syncLectureState(lecture, lecture.subject.name)
    if (synced.status !== 'PROCESSING') {
      return Response.json({
        status: synced.status,
        progressPercent: 100,
        substage: synced.status === 'COMPLETED' ? 'Completed' : 'Transcription failed',
        errorMessage: synced.errorMessage,
      })
    }
    return Response.json(computeProgress(synced))
  }

  return Response.json({
    status: lecture.status,
    progressPercent: lecture.status === 'COMPLETED' ? 100 : 0,
    substage:
      lecture.status === 'FAILED'
        ? 'Transcription failed'
        : lecture.status === 'COMPLETED'
          ? 'Completed'
          : 'Waiting for audio',
    errorMessage: lecture.errorMessage,
  })
}
