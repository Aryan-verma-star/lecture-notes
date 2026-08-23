'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ListTree,
  Pencil,
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
import { extractToc, slugify } from '@/lib/toc'
import { Button } from '@/components/lecture-notes/Button'
import { StatusPill } from '@/components/lecture-notes/StatusPill'
import { useToast } from '@/context/ToastContext'

type ViewMode = 'preview' | 'source'

/** Recursively extracts plain text from React children (strings, arrays, elements). */
function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (typeof node === 'object' && 'props' in (node as React.ReactElement)) {
    return nodeText((node as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ''
}

/** Markdown renderers that derive heading ids from heading text — stateless,
 *  so ids survive re-renders (scroll-spy, view toggles) without drift.
 *  Task checkboxes render UNCONTROLLED (defaultChecked) so React never
 *  reverts user toggles during unrelated re-renders. */
function useMarkdownComponents(): Components {
  return useMemo(
    () => ({
      h2: ({ children }) => (
        <h2 id={slugify(nodeText(children)) || undefined}>{children}</h2>
      ),
      h3: ({ children }) => (
        <h3 id={slugify(nodeText(children)) || undefined}>{children}</h3>
      ),
      input: ({ checked, ...props }) => (
        <input {...props} type="checkbox" defaultChecked={checked === true} />
      ),
    }),
    []
  )
}

export function LectureDetailView({ lectureId }: { lectureId: string }) {
  const { toast } = useToast()
  const [lecture, setLecture] = useState<LectureDetail | null>(null)
  const [progress, setProgress] = useState<LectureProgress | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [github, setGithub] = useState<GithubStatus | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renamingBusy, setRenamingBusy] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [activeHeading, setActiveHeading] = useState<string | null>(null)
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

  const toc = useMemo(
    () => (lecture?.markdown ? extractToc(lecture.markdown) : []),
    [lecture?.markdown]
  )
  const markdownComponents = useMarkdownComponents()

  /* ---------------- Interactive task checkboxes ---------------- */

  const markdownRef = useRef<HTMLDivElement>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [checksInitFor, setChecksInitFor] = useState<string | null>(null)

  // Initialize persisted checks once per lecture
  useEffect(() => {
    if (lecture && lecture.id !== checksInitFor) {
      setChecksInitFor(lecture.id)
      setChecks(lecture.taskChecks ?? {})
    }
  }, [lecture, checksInitFor])

  // Enable + hydrate checkboxes in the rendered markdown
  useEffect(() => {
    const container = markdownRef.current
    if (!container || viewMode !== 'preview') return
    const boxes = container.querySelectorAll('input[type="checkbox"]')
    boxes.forEach((node, i) => {
      const box = node as HTMLInputElement
      const key = `task-${i}`
      box.disabled = false
      box.dataset.taskIndex = key
      const state = checks[key]
      if (state !== undefined) box.checked = state
      const li = box.closest('li')
      if (li) li.classList.add('task-item')
    })
  }, [lecture?.markdown, viewMode, checks])

  // Delegated toggle → update state + persist to the server
  function handleMarkdownClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement
    if (
      target instanceof HTMLInputElement &&
      target.type === 'checkbox' &&
      target.dataset.taskIndex
    ) {
      const key = target.dataset.taskIndex
      const next = { ...checks, [key]: target.checked }
      setChecks(next)
      api.post(`/api/lectures/${lectureId}/checks`, { checks: next }).catch(() => {
        /* persistence failure is non-fatal */
      })
    }
  }

  // Scroll-spy: highlight the TOC entry for the topmost visible heading
  useEffect(() => {
    if (viewMode !== 'preview' || toc.length === 0) return
    const headings = toc
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => el !== null)
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveHeading(entry.target.id)
          }
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 }
    )
    headings.forEach((h) => observer.observe(h))
    return () => observer.disconnect()
  }, [toc, viewMode, lecture?.markdown])

  function scrollToHeading(id: string) {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveHeading(id)
    }
  }

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

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      await api.post(`/api/lectures/${lectureId}/regenerate`)
      toast('Regenerating notes with a fresh draft', 'info')
      setViewMode('preview')
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Regeneration failed', 'error')
    } finally {
      setRegenerating(false)
    }
  }

  async function handleCopy() {
    if (!lecture?.markdown) return
    try {
      await navigator.clipboard.writeText(lecture.markdown)
      setCopied(true)
      toast('Markdown copied to clipboard', 'success')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Clipboard unavailable in this browser', 'error')
    }
  }

  function handleDownload() {
    if (!lecture?.markdown) return
    const slug =
      lecture.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'lecture-notes'
    const blob = new Blob([lecture.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast('Notes downloaded', 'success')
  }

  async function handleRenameSubmit() {
    const title = renameValue.trim()
    if (!title) {
      setRenaming(false)
      return
    }
    if (title === lecture?.title) {
      setRenaming(false)
      return
    }
    setRenamingBusy(true)
    try {
      await api.patch(`/api/lectures/${lectureId}`, { title })
      toast('Lecture renamed', 'success')
      setRenaming(false)
      await load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Rename failed', 'error')
    } finally {
      setRenamingBusy(false)
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

  const isDone = lecture?.status === 'COMPLETED'
  const canRegenerate = lecture?.status === 'COMPLETED' || lecture?.status === 'FAILED'

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
              <>
                <div className="notes-toolbar" role="tablist" aria-label="Notes view mode">
                  <div className="segmented">
                    <button
                      role="tab"
                      aria-selected={viewMode === 'preview'}
                      className={`segment ${viewMode === 'preview' ? 'active' : ''}`}
                      onClick={() => setViewMode('preview')}
                    >
                      <ListTree size={13} strokeWidth={1.5} />
                      Preview
                    </button>
                    <button
                      role="tab"
                      aria-selected={viewMode === 'source'}
                      className={`segment ${viewMode === 'source' ? 'active' : ''}`}
                      onClick={() => setViewMode('source')}
                    >
                      <FileText size={13} strokeWidth={1.5} />
                      Source
                    </button>
                  </div>
                  <span className="caption text-muted">
                    {toc.length > 0
                      ? `${toc.length} sections · ${lecture.markdown.split('\n').length} lines`
                      : `${lecture.markdown.split('\n').length} lines`}
                  </span>
                </div>

                {viewMode === 'preview' ? (
                  <div className="markdown-content" ref={markdownRef} onClick={handleMarkdownClick}>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={markdownComponents}
                    >
                      {lecture.markdown}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <pre className="markdown-source mono" tabIndex={0}>
                    {lecture.markdown}
                  </pre>
                )}
              </>
            ) : (
              <div className="empty-state">
                <h2 className="empty-state-title">No notes yet</h2>
                <p className="empty-state-desc">This lecture has no generated notes.</p>
              </div>
            )}
          </article>

          {/* ------- Metadata sidebar ------- */}
          <aside className="lecture-side" aria-label="Lecture metadata">
            <div className="lecture-meta-card">
              <div className="lecture-meta-row">
                {renaming ? (
                  <div className="rename-box">
                    <input
                      className="input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit()
                        if (e.key === 'Escape') setRenaming(false)
                      }}
                      autoFocus
                      maxLength={120}
                      aria-label="Lecture title"
                      disabled={renamingBusy}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRenaming(false)}
                        disabled={renamingBusy}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleRenameSubmit}
                        loading={renamingBusy}
                        icon={<Check size={13} strokeWidth={1.5} />}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="lecture-title-row">
                    <h2 className="subheading" style={{ lineHeight: 1.4, flex: 1 }}>
                      {lecture.title}
                    </h2>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setRenameValue(lecture.title)
                        setRenaming(true)
                      }}
                      aria-label="Rename lecture"
                      title="Rename lecture"
                    >
                      <Pencil size={13} strokeWidth={1.5} />
                    </button>
                  </div>
                )}
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

              {isDone ? (
                <div className="meta-action-grid">
                  <Button
                    variant="secondary"
                    onClick={handleCopy}
                    icon={
                      copied ? (
                        <Check size={14} strokeWidth={1.5} />
                      ) : (
                        <Copy size={14} strokeWidth={1.5} />
                      )
                    }
                  >
                    {copied ? 'Copied' : 'Copy MD'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleDownload}
                    icon={<Download size={14} strokeWidth={1.5} />}
                  >
                    Download
                  </Button>
                </div>
              ) : null}

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

              {canRegenerate ? (
                <Button
                  variant="secondary"
                  block
                  onClick={handleRegenerate}
                  loading={regenerating}
                  icon={<RefreshCw size={14} strokeWidth={1.5} />}
                >
                  Regenerate notes
                </Button>
              ) : null}

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
            </div>

            {/* ------- Table of contents ------- */}
            {viewMode === 'preview' && toc.length > 0 ? (
              <nav className="toc-card" aria-label="Table of contents">
                <span className="toc-title">
                  <ListTree size={12} strokeWidth={1.5} />
                  On this page
                </span>
                <ul className="toc-list">
                  {toc.map((entry) => (
                    <li key={entry.id} className={entry.depth === 3 ? 'toc-h3' : ''}>
                      <a
                        href={`#${entry.id}`}
                        className={`toc-link ${activeHeading === entry.id ? 'active' : ''}`}
                        onClick={(e) => {
                          e.preventDefault()
                          scrollToHeading(entry.id)
                        }}
                      >
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </aside>
        </div>
      )}
    </>
  )
}
