'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, Plus } from 'lucide-react'
import { api, type Subject } from '@/lib/api'
import { navigate } from '@/lib/router'
import { relativeTime } from '@/lib/format'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input, Textarea } from '@/components/lecture-notes/Input'
import { EmptyState } from '@/components/lecture-notes/EmptyState'
import { Modal } from '@/components/lecture-notes/Modal'
import { useToast } from '@/context/ToastContext'

export function SubjectsView() {
  const { toast } = useToast()
  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(() => {
    api
      .get<Subject[]>('/api/subjects')
      .then(setSubjects)
      .catch(() => setSubjects([]))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleCreate() {
    setFormError(null)
    if (!name.trim()) {
      setFormError('Give the subject a name.')
      return
    }
    setCreating(true)
    try {
      await api.post('/api/subjects', { name: name.trim(), description: description.trim() })
      toast('Subject created', 'success')
      setModalOpen(false)
      setName('')
      setDescription('')
      load()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not create subject.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="display">Subjects</h1>
        <Button
          variant="secondary"
          icon={<Plus size={16} strokeWidth={1.5} />}
          onClick={() => setModalOpen(true)}
        >
          New Subject
        </Button>
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
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} strokeWidth={1} />}
          title="No subjects yet"
          description="Create your first subject to start recording lectures and building your study library."
          action={{
            label: 'Create Subject',
            icon: <Plus size={16} strokeWidth={1.5} />,
            onClick: () => setModalOpen(true),
          }}
        />
      ) : (
        <div className="subject-grid" role="list">
          {subjects.map((subject) => (
            <button
              key={subject.id}
              role="listitem"
              className="subject-card"
              onClick={() => navigate(`/subjects/${subject.id}`)}
              aria-label={`Open ${subject.name}`}
            >
              <span className="subject-card-header">
                <span
                  className={`status-dot ${subject.active ? 'active' : 'inactive'}`}
                  aria-hidden="true"
                />
                <span className="heading">{subject.name}</span>
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
            </button>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setFormError(null)
        }}
        title="New Subject"
        description="Group your lectures by course or topic."
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
                if (e.key === 'Enter') handleCreate()
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
            <Button onClick={handleCreate} loading={creating}>
              Create Subject
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
