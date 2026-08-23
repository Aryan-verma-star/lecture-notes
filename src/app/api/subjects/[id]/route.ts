import { db } from '@/lib/db'
import { getAuthUser, unauthorized } from '@/lib/auth'
import { syncLectureState } from '@/lib/lecture-state'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const subject = await db.subject.findFirst({
    where: { id, userId: user.id },
    include: { lectures: { orderBy: { recordedAt: 'desc' } } },
  })
  if (!subject) return Response.json({ error: 'Subject not found.' }, { status: 404 })

  const lectures = []
  for (const lecture of subject.lectures) {
    lectures.push(await syncLectureState(lecture, subject.name))
  }

  return Response.json({
    id: subject.id,
    name: subject.name,
    description: subject.description,
    createdAt: subject.createdAt,
    lectures: lectures.map((l) => ({
      id: l.id,
      subjectId: l.subjectId,
      title: l.title,
      status: l.status,
      recordedAt: l.recordedAt,
      durationSeconds: l.durationSeconds,
    })),
  })
}

/** Updates a subject's name and/or description. */
export async function PATCH(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const subject = await db.subject.findFirst({
    where: { id, userId: user.id },
  })
  if (!subject) return Response.json({ error: 'Subject not found.' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : undefined
  const description =
    typeof body?.description === 'string' ? body.description.trim() : undefined

  if (name !== undefined && !name) {
    return Response.json({ error: 'Subject name is required.' }, { status: 400 })
  }
  if (name && name.length > 80) {
    return Response.json({ error: 'Subject name must be under 80 characters.' }, { status: 400 })
  }
  if (name && name !== subject.name) {
    const dupe = await db.subject.findFirst({ where: { userId: user.id, name } })
    if (dupe) {
      return Response.json({ error: 'You already have a subject with this name.' }, { status: 409 })
    }
  }

  const updated = await db.subject.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
    },
  })

  return Response.json({ id: updated.id, name: updated.name, description: updated.description })
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getAuthUser(request)
  if (!user) return unauthorized()
  const { id } = await params

  const subject = await db.subject.findFirst({ where: { id, userId: user.id } })
  if (!subject) return Response.json({ error: 'Subject not found.' }, { status: 404 })

  await db.subject.delete({ where: { id } })
  return Response.json({ ok: true })
}
