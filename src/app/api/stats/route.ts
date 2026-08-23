import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { syncLectureState } from '@/lib/lecture-state'

/** Aggregated study statistics for the dashboard. */
export async function GET(request: Request) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()

  const subjects = await db.subject.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: {
      lectures: { orderBy: { recordedAt: 'desc' } },
    },
  })

  // Sync any in-flight processing first so stats reflect live state
  const perSubject = []
  const recent = []
  let totalLectures = 0
  let totalDuration = 0
  let completed = 0
  let failed = 0
  let processing = 0
  let firstLectureAt: Date | null = null

  for (const subject of subjects) {
    let subjectDuration = 0
    let subjectCompleted = 0

    for (const lecture of subject.lectures) {
      const synced = await syncLectureState(lecture, subject.name)
      totalLectures += 1
      if (synced.durationSeconds) totalDuration += synced.durationSeconds
      if (synced.status === 'COMPLETED') {
        completed += 1
        subjectCompleted += 1
      } else if (synced.status === 'FAILED') failed += 1
      else if (synced.status === 'PROCESSING') processing += 1
      if (synced.durationSeconds) subjectDuration += synced.durationSeconds

      const recordedAt = new Date(synced.recordedAt)
      if (!firstLectureAt || recordedAt < firstLectureAt) firstLectureAt = recordedAt

      recent.push({
        id: synced.id,
        title: synced.title,
        subjectId: subject.id,
        subjectName: subject.name,
        status: synced.status,
        recordedAt: synced.recordedAt,
        durationSeconds: synced.durationSeconds,
      })
    }

    perSubject.push({
      id: subject.id,
      name: subject.name,
      lectureCount: subject.lectures.length,
      durationSeconds: subjectDuration,
      completed: subjectCompleted,
      lastLectureAt: subject.lectures[0]?.recordedAt ?? null,
    })
  }

  recent.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())

  // Activity series: daily lecture counts + recorded minutes for the last 28
  // days (UTC-normalized). Both metrics are always returned; the client picks.
  const days = 28
  const activity: { date: string; count: number; seconds: number }[] = []
  const dayCounts = new Map<string, number>()
  const daySeconds = new Map<string, number>()
  for (const l of recent) {
    const d = new Date(l.recordedAt)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1)
    daySeconds.set(key, (daySeconds.get(key) ?? 0) + (l.durationSeconds ?? 0))
  }
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000)
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
      d.getUTCDate()
    ).padStart(2, '0')}`
    activity.push({
      date: key,
      count: dayCounts.get(key) ?? 0,
      seconds: daySeconds.get(key) ?? 0,
    })
  }

  const finished = completed + failed
  return Response.json({
    totalSubjects: subjects.length,
    totalLectures,
    totalDurationSeconds: totalDuration,
    completed,
    failed,
    processing,
    completionRate: finished > 0 ? Math.round((completed / finished) * 100) : null,
    firstLectureAt,
    activity,
    subjects: perSubject,
    recentLectures: recent.slice(0, 6),
  })
}
