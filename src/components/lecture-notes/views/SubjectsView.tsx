'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Pencil, Plus } from 'lucide-react'
import { api, type Subject } from '@/lib/api'
import { navigate } from '@/lib/router'
import { relativeTime } from '@/lib/format'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input, Select, Textarea } from '@/components/lecture-notes/Input'
import { EmptyState } from '@/components/lecture-notes/EmptyState'
import { Modal } from '@/components/lecture-notes/Modal'
import { useToast } from '@/context/ToastContext'

type EditTarget = { id: string; name: string; description?: string | null } | null

type SubjectSort = 'recent' | 'name' | 'count'

export function SubjectsView() {
  const { toast } = useToast()
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [sortBy, setSortBy] = useState<SubjectSort>('recent')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    api
      .get<Subject[]>('/api/subjects')
      .then(setSubjects)
      .catch(() => setSubjects([]))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditTarget(null)
    setName('')
    setDescription('')
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(subject: EditTarget) {
    if (!subject) return
    setEditTarget(subject)
    setName(subject.name)
    setDescription(subject.description ?? '')
    setFormError(null)
    setModalOpen(true)
  }

  // Allow the command palette to trigger subject creation:
  // live event when already mounted, sessionStorage flag when navigating here
  useEffect(() => {
    if (window.sessionStorage.getItem('ln:open-create-subject') === '1') {
      window.sessionStorage.removeItem('ln:open-create-subject')
      openCreate()
    }
    const onCreate = () => openCreate()
    window.addEventListener('ln:create-subject', onCreate)
    return () => window.removeEventListener('ln:create-subject', onCreate)
  }, [])

  const sortedSubjects = useMemo(() => {
    if (!subjects) return null
    const list = [...subjects]
    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'count') return b.lectureCount - a.lectureCount || a.name.localeCompare(b.name)
      const at = a.lastLectureAt ? new Date(a.lastLectureAt).getTime() : 0
      const bt = b.lastLectureAt ? new Date(b.lastLectureAt).getTime() : 0
      return bt - at || a.name.localeCompare(b.name)
    })
    return list
  }, [subjects, sortBy])

  async function handleSubmit() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Give the subject a name.')
      return
    }
    setSaving(true)
    try {
      if (editTarget) {
        await api.patch(`/api/subjects/${editTarget.id}`, {
          name: name.trim(),
          description: description.trim(),
        })
        toast('Subject updated', 'success')
      } else {
        await api.post('/api/subjects', { name: name.trim(), description: description.trim() })
        toast('Subject created', 'success')
      }
      setModalOpen(false)
      setName('')
      setDescription('')
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="display">Subjects</h1>
        <div className="subjects-header-actions">
          {subjects !== null && subjects.length > 1 ? (
            <Select
              className="subjects-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SubjectSort)}
              aria-label="Sort subjects"
            >
              <option value="recent">Recent activity</option>
              <option value="name">Name A–Z</option>
              <option value="count">Most lectures</option>
            </Select>
          ) : null}
          <Button
            variant="secondary"
            icon={<Plus size={16} strokeWidth={1.5} />}
            onClick={openCreate}
          >
            New Subject
          </Button>
        </div>
      </div>

      {subjects === null ? (
        <div className="skeleton-grid" aria-label="Loading subjects">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton" style={{ width: 96, height: 18 }} />
              <div className="skeleton" style={{ width: 140, height: 12 }} />
              <div className="skeleton" style={{ width: '80%', height: 12, marginTop: 12 }} />
            </div>
          ))}
        </div>
      ) : sortedSubjects === null || sortedSubjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} strokeWidth={1} />}
          title="No subjects yet"
          description="Create your first subject to start recording lectures and building your study library."
          action={{
            label: 'Create Subject',
            icon: <Plus size={16} strokeWidth={1.5} />,
            onClick: openCreate,
          }}
        />
      ) : (
        <div className="subject-grid" role="list">
          {sortedSubjects.map((subject) => (
            <div
              key={subject.id}
              role="listitem"
              className="subject-card"
              onClick={() => navigate(`/subjects/${subject.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/subjects/${subject.id}`)
              }}
              tabIndex={0}
              aria-label={`Open ${subject.name}`}
            >
              <span className="subject-card-header">
                <span
                  className={`status-dot ${subject.active ? 'active' : 'inactive'}`}
                  aria-hidden="true"
                />
                <span className="heading">{subject.name}</span>
                <button
                  className="icon-btn subject-card-edit"
                  onClick={(e) => {
                    e.stopPropagation()
                    openEdit(subject)
                  }}
                  aria-label={`Edit ${subject.name}`}
                  title="Edit subject"
                >
                  <Pencil size={13} strokeWidth={1.5} />
                </button>
              </span>

              <span className="subject-card-meta caption">
                <span className="num">
                  {subject.lectureCount} {subject.lectureCount === 1 ? 'lecture' : 'lectures'}
                </span>
                <span className="text-muted">·</span>
                <span>Last: {subject.lastLectureAt ? relativeTime(subject.lastLectureAt) : 'none'}</span>
              </span>

              <span className="subject-card-preview truncate-2">
                {subject.lastLectureTitle
                  ? `Latest: ${subject.lastLectureTitle}`
                  : subject.description || 'No lectures recorded yet.'}
              </span>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setFormError(null)
        }}
        title={editTarget ? 'Edit Subject' : 'New Subject'}
        description={
          editTarget ? 'Rename the subject or update its description.' : 'Group your lectures by course or topic.'
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Field label="Name" error={formError}>
            <Input
              placeholder="e.g. Mathematics"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
            />
          </Field>

          <Field label="Description" hint="Optional — shown on the subject card">
            <Textarea
              placeholder="What is this subject about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </Field>

          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              {editTarget ? 'Save Changes' : 'Create Subject'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
