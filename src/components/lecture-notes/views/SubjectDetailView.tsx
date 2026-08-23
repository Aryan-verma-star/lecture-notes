'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Mic, Trash2 } from 'lucide-react'
import { api, type SubjectDetail } from '@/lib/api'
import { navigate, useBack } from '@/lib/router'
import { Button } from '@/components/lecture-notes/Button'
import { EmptyState } from '@/components/lecture-notes/EmptyState'
import { LectureRow } from './LectureRow'
import { useToast } from '@/context/ToastContext'

export function SubjectDetailView({ subjectId }: { subjectId: string }) {
  const { toast } = useToast()
  const [subject, setSubject] = useState<SubjectDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const back = useBack('/subjects')

  const load = useCallback(() => {
    api
      .get<SubjectDetail>(`/api/subjects/${subjectId}`)
      .then((data) => {
        setSubject(data)
        setNotFound(false)
      })
      .catch(() => setNotFound(true))
  }, [subjectId])

  useEffect(() => {
    load()
  }, [load])

  // Poll while any lecture is processing so rows update live
  useEffect(() => {
    if (!subject) return
    const busy = subject.lectures.some((l) => l.status === 'PROCESSING' || l.status === 'RECORDING')
    if (!busy) return
    const interval = window.setInterval(load, 3000)
    return () => window.clearInterval(interval)
  }, [subject, load])

  async function handleDelete() {
    try {
      await api.delete(`/api/subjects/${subjectId}`)
      toast('Subject deleted', 'success')
      navigate('/subjects')
    } catch {
      toast('Could not delete subject', 'error')
    }
  }

  if (notFound) {
    return (
      <EmptyState
        icon={<Mic size={48} strokeWidth={1} />}
        title="Subject not found"
        description="This subject may have been deleted. Head back to your subjects to continue."
        action={{ label: 'Back to Subjects', onClick: () => navigate('/subjects') }}
      />
    )
  }

  return (
    <>
      <button className="back-link" onClick={back} style={{ marginBottom: 24 }}>
        <ArrowLeft size={15} strokeWidth={1.5} />
        Subjects
      </button>

      {subject === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton" style={{ width: 200, height: 28 }} />
          <div className="skeleton" style={{ width: 320, height: 14 }} />
          <div style={{ height: 24 }} />
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 64 }} />
        </div>
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1 className="display">{subject.name}</h1>
              {subject.description ? (
                <p className="body text-secondary" style={{ marginTop: 8 }}>
                  {subject.description}
                </p>
              ) : null}
            </div>
            <Button
              variant="secondary"
              icon={<Mic size={16} strokeWidth={1.5} />}
              onClick={() => navigate(`/record?subject=${subject.id}`)}
            >
              Record
            </Button>
          </div>

          {subject.lectures.length === 0 ? (
            <EmptyState
              icon={<Mic size={48} strokeWidth={1} />}
              title="No lectures yet"
              description={`Record your first ${subject.name} lecture and it will appear here once transcribed.`}
              action={{
                label: 'Start Recording',
                icon: <Mic size={16} strokeWidth={1.5} />,
                onClick: () => navigate(`/record?subject=${subject.id}`),
              }}
            />
          ) : (
            <div className="lecture-list" role="list">
              {subject.lectures.map((lecture) => (
                <LectureRow
                  key={lecture.id}
                  lecture={lecture}
                  onClick={() => navigate(`/lectures/${lecture.id}`)}
                />
              ))}
            </div>
          )}

          <div style={{ marginTop: 40, display: 'flex', justifyContent: 'flex-start' }}>
            {confirmDelete ? (
              <div className="settings-actions">
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button variant="danger" icon={<Trash2 size={14} strokeWidth={1.5} />} onClick={handleDelete}>
                  Confirm delete
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete subject
              </Button>
            )}
          </div>
        </>
      )}
    </>
  )
}
