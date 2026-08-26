import { db } from '@/lib/db'
import { getCurrentUser, unauthorized } from '@/lib/auth'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return unauthorized()
    const { id } = await params

    const subject = await db.subject.findFirst({
      where: { id, userId: user.id },
      include: {
        lectures: {
          orderBy: { recordedAt: 'desc' },
          select: {
            id: true,
            subjectId: true,
            title: true,
            status: true,
            recordedAt: true,
            durationSeconds: true,
          },
        },
      },
    })
    if (!subject) return Response.json({ error: 'Not found' }, { status: 404 })

    return Response.json({
      id: subject.id,
      name: subject.name,
      description: subject.description,
      createdAt: subject.createdAt,
      lectures: subject.lectures,
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

    const subject = await db.subject.findFirst({
      where: { id, userId: user.id },
    })
    if (!subject) return Response.json({ error: 'Not found' }, { status: 404 })

    const body = await request.json().catch(() => null)
    const name =
      typeof body?.name === 'string' ? body.name.trim() : undefined
    const description =
      typeof body?.description === 'string'
        ? body.description.trim()
        : undefined

    if (name !== undefined && !name) {
      return Response.json(
        { error: 'Subject name must not be empty' },
        { status: 422 }
      )
    }

    const data: { name?: string; description?: string | null; updatedAt?: string } = {
      updatedAt: new Date().toISOString(),
    }
    if (name !== undefined) data.name = name
    if (description !== undefined) {
      data.description = description.length > 0 ? description : null
    }

    const updated = await db.subject.update({ where: { id }, data })
    return Response.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
    })
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

    const subject = await db.subject.findFirst({
      where: { id, userId: user.id },
    })
    if (!subject) return Response.json({ error: 'Not found' }, { status: 404 })

    await db.subject.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Request failed'
    return Response.json({ error: message }, { status: 500 })
  }
}
