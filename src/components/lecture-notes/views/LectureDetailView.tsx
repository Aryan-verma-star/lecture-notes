'use client'

import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import {
  api,
  type GithubStatus,
  type LectureDetail,
  type LectureProgress,
} from '@/lib/api'
import { navigate, useBack } from '@/lib/router'
import { formatDate, formatDuration } from '@/lib/format'
import { Button } from '@/components/lecture-notes/Button'
import { StatusPill } from '@/components/lecture-notes/StatusPill'
import { useToast } from '@/context/ToastContext'

export function LectureDetailView({ lectureId }: { lectureId: string }) {
  const { toast } = useToast()
  const [lecture, setLecture] = useState<LectureDetail | null>(null)
  const [progress, setProgress] = useState<LectureProgress | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [github, setGithub] = useState<GithubStatus | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const back = useBack('/subjects')

  const load = useCallback(() => {
    return api
      .get<LectureDetail>(`/api/lectures/${lectureId}`)
      .then((data) => {
        setLecture(data)
        setNotFound(false)
        if (data.status !== 'PROCESSING') setProgress(null)
        return data
      })
      .catch(() => {
        setNotFound(true)
        return null
      })
  }, [lectureId])

  useEffect(() => {
    load()
    api.get<GithubStatus>('/api/github/status').then(setGithub).catch(() => {})
  }, [load])

  // Live progress polling while processing
  useEffect(() => {
    if (lecture?.status !== 'PROCESSING') return
    let cancelled = false

    const poll = async () => {
      try {
        const p = await api.get<LectureProgress>(`/api/lectures/${lectureId}/status`)
        if (cancelled) return
        setProgress(p)
        if (p.status !== 'PROCESSING') {
          await load() // pick up final markdown / error
        }
      } catch {
        /* transient network error — next tick retries */
      }
    }

    void poll()
    const interval = window.setInterval(() => void poll(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [lecture?.status, lectureId, load])

  async function handleRetry() {
    setRetrying(true)
    try {
      await api.post(`/api/lectures/${lectureId}/retry`)
      toast('Retrying transcription', 'info')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Retry failed', 'error')
    } finally {
      setRetrying(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.delete(`/api/lectures/${lectureId}`)
      toast('Lecture deleted', 'success')
      navigate(`/subjects/${lecture?.subjectId ?? ''}`)
    } catch {
      toast('Could not delete lecture', 'error')
      setDeleting(false)
    }
  }

  if (notFound) {
    return (
      <div className="empty-state">
        <h2 className="empty-state-title">Lecture not found</h2>
        <p className="empty-state-desc">It may have been deleted from another device.</p>
        <div className="empty-state-action">
          <Button onClick={() => navigate('/subjects')}>Back to Subjects</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <button className="back-link" onClick={back} style={{ marginBottom: 24 }}>
        <ArrowLeft size={15} strokeWidth={1.5} />
        {lecture?.subjectName ?? 'Back'}
      </button>

      {lecture === null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="skeleton" style={{ width: '60%', height: 30 }} />
          <div className="skeleton" style={{ height: 12, width: '40%' }} />
          <div style={{ height: 16 }} />
          <div className="skeleton" style={{ height: 12 }} />
          <div className="skeleton" style={{ height: 12, width: '92%' }} />
          <div className="skeleton" style={{ height: 12, width: '85%' }} />
          <div className="skeleton" style={{ height: 120, marginTop: 8 }} />
        </div>
      ) : (
        <div className="lecture-detail-layout">
          {/* ------- Main content ------- */}
          <article style={{ minWidth: 0 }}>
            {lecture.status === 'PROCESSING' || lecture.status === 'RECORDING' ? (
              <div className="processing-panel">
                {lecture.status === 'RECORDING' ? (
                  <>
                    <span className="rec-indicator live">
                      <span className="rec-dot" aria-hidden="true" />
                      RECORDING IN PROGRESS
                    </span>
                    <p className="body text-secondary">
                      This lecture is still being recorded from the Record page. Notes will appear
                      here once the session ends and transcription completes.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="processing-percent num">
                      {progress?.progressPercent ?? 5}%
                    </span>
                    <div
                      className="progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress?.progressPercent ?? 5}
                    >
                      <div
                        className="progress-fill"
                        style={{ width: `${progress?.progressPercent ?? 5}%` }}
                      />
                    </div>
                    <p className="caption">
                      {progress?.substage ?? 'Queued for transcription'} — this page updates
                      automatically.
                    </p>
                  </>
                )}
              </div>
            ) : lecture.status === 'FAILED' ? (
              <div className="processing-panel" style={{ borderColor: 'rgba(210, 74, 67, 0.3)' }}>
                <span style={{ color: 'var(--error)', display: 'flex' }}>
                  <AlertTriangle size={28} strokeWidth={1.5} />
                </span>
                <h2 className="heading">Transcription failed</h2>
                <p className="body text-secondary" style={{ maxWidth: 420 }}>
                  {lecture.errorMessage ??
                    'The audio could not be processed. Retry the transcription — it usually succeeds on the second attempt.'}
                </p>
                <Button
                  onClick={handleRetry}
                  loading={retrying}
                  icon={<RefreshCw size={15} strokeWidth={1.5} />}
                >
                  Retry Transcription
                </Button>
              </div>
            ) : lecture.markdown ? (
              <div className="markdown-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{lecture.markdown}</ReactMarkdown>
              </div>
            ) : (
              <div className="empty-state">
                <h2 className="empty-state-title">No notes yet</h2>
                <p className="empty-state-desc">This lecture has no generated notes.</p>
              </div>
            )}
          </article>

          {/* ------- Metadata sidebar ------- */}
          <aside className="lecture-meta-card" aria-label="Lecture metadata">
            <div className="lecture-meta-row">
              <h2 className="subheading" style={{ lineHeight: 1.4 }}>
                {lecture.title}
              </h2>
              <span className="caption">{lecture.subjectName}</span>
            </div>

            <div className="lecture-meta-divider" />

            <div className="lecture-meta-row">
              <span className="lecture-meta-label">Recorded</span>
              <span className="lecture-meta-value num">{formatDate(lecture.recordedAt)}</span>
            </div>

            <div className="lecture-meta-row">
              <span className="lecture-meta-label">Duration</span>
              <span className="lecture-meta-value num">
                {formatDuration(lecture.durationSeconds)}
              </span>
            </div>

            <div className="lecture-meta-row">
              <span className="lecture-meta-label">Audio</span>
              <span className="lecture-meta-value">
                {lecture.hasAudio ? 'Captured' : 'Timer session'}
              </span>
            </div>

            <div className="lecture-meta-row">
              <span className="lecture-meta-label">Status</span>
              <span className="lecture-meta-status">
                <StatusPill status={lecture.status} />
              </span>
            </div>

            <div className="lecture-meta-divider" />

            {github?.connected && github.username && github.repoName ? (
              <a
                className="btn-secondary btn-block"
                href={`https://github.com/${github.username}/${github.repoName}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <ExternalLink size={14} strokeWidth={1.5} />
                View on GitHub
              </a>
            ) : (
              <Button
                variant="secondary"
                block
                onClick={() => navigate('/settings')}
                icon={<ExternalLink size={14} strokeWidth={1.5} />}
              >
                Connect GitHub
              </Button>
            )}

            {lecture.status === 'FAILED' ? (
              <Button
                variant="secondary"
                block
                onClick={handleRetry}
                loading={retrying}
                icon={<RefreshCw size={14} strokeWidth={1.5} />}
              >
                Retry
              </Button>
            ) : null}

            {confirmDelete ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  variant="danger"
                  block
                  onClick={handleDelete}
                  loading={deleting}
                  icon={<Trash2 size={14} strokeWidth={1.5} />}
                >
                  Confirm delete
                </Button>
                <Button variant="ghost" block onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="ghost" block onClick={() => setConfirmDelete(true)}>
                Delete lecture
              </Button>
            )}
          </aside>
        </div>
      )}
    </>
  )
}
