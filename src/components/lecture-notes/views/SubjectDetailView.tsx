'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckSquare, Mic, Search, Square, Trash2, X } from 'lucide-react'
import { api, type LectureStatus, type SubjectDetail } from '@/lib/api'
import { navigate, useBack } from '@/lib/router'
import { Button } from '@/components/lecture-notes/Button'
import { EmptyState } from '@/components/lecture-notes/EmptyState'
import { Select } from '@/components/lecture-notes/Input'
import { LectureRowContent } from './LectureRow'
import { useToast } from '@/context/ToastContext'

type SortKey = 'newest' | 'oldest' | 'title'
type StatusFilter = 'all' | LectureStatus

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'RECORDING', label: 'Recording' },
  { value: 'FAILED', label: 'Failed' },
]

export function SubjectDetailView({ subjectId }: { subjectId: string }) {
  const { toast } = useToast()
  const [subject, setSubject] = useState<SubjectDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
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

  const filteredLectures = useMemo(() => {
    if (!subject) return []
    const q = query.trim().toLowerCase()
    let list = subject.lectures
    if (q) list = list.filter((l) => l.title.toLowerCase().includes(q))
    if (statusFilter !== 'all') list = list.filter((l) => l.status === statusFilter)
    const sorted = [...list]
    sorted.sort((a, b) => {
      if (sortKey === 'title') return a.title.localeCompare(b.title)
      const diff = new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
      return sortKey === 'newest' ? diff : -diff
    })
    return sorted
  }, [subject, query, statusFilter, sortKey])

  const hasFilters = query.trim() !== '' || statusFilter !== 'all' || sortKey !== 'newest'

  /* ---------------- j/k row navigation ---------------- */

  const [cursorIndex, setCursorIndex] = useState(0)
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])

  // Keep the cursor inside bounds when the filtered list changes
  useEffect(() => {
    setCursorIndex((i) => Math.min(i, Math.max(0, filteredLectures.length - 1)))
  }, [filteredLectures.length])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key !== 'j' && e.key !== 'k' && e.key !== 'Enter') return
      if (filteredLectures.length === 0) return
      if (selectMode) return // selection clicks handle rows in batch mode

      const delta = e.key === 'j' ? 1 : e.key === 'k' ? -1 : 0
      if (delta !== 0) {
        e.preventDefault()
        setCursorIndex((i) => {
          const next = Math.min(Math.max(i + delta, 0), filteredLectures.length - 1)
          rowRefs.current[next]?.scrollIntoView({ block: 'nearest' })
          return next
        })
      } else if (e.key === 'Enter') {
        const row = rowRefs.current[cursorIndex]
        // Only act when the cursor row itself (not a child button) has focus context
        if (row && document.activeElement === document.body) {
          e.preventDefault()
          navigate(`/lectures/${filteredLectures[cursorIndex].id}`)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredLectures, cursorIndex, selectMode])

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return
    setBatchDeleting(true)
    try {
      const res = await api.post<{ deleted: number }>('/api/lectures/batch-delete', {
        ids: [...selected],
      })
      toast(`Deleted ${res.deleted} ${res.deleted === 1 ? 'lecture' : 'lectures'}`, 'success')
      setSelected(new Set())
      setSelectMode(false)
      load()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Batch delete failed', 'error')
    } finally {
      setBatchDeleting(false)
    }
  }

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
            <>
              {/* -------- Filter / sort bar -------- */}
              <div className="lecture-toolbar" role="search" aria-label="Filter lectures">
                <div className="lecture-search-box">
                  <Search size={14} strokeWidth={1.5} className="lecture-search-icon" />
                  <input
                    className="lecture-search-input"
                    placeholder="Filter lectures…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    aria-label="Filter lectures by title"
                    spellCheck={false}
                  />
                  {query ? (
                    <button
                      className="lecture-search-clear"
                      onClick={() => setQuery('')}
                      aria-label="Clear filter"
                    >
                      <X size={13} strokeWidth={1.5} />
                    </button>
                  ) : null}
                </div>
                <Select
                  className="lecture-toolbar-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  aria-label="Filter by status"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
                <Select
                  className="lecture-toolbar-select"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort lectures"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A–Z</option>
                </Select>
                <Button
                  variant={selectMode ? 'primary' : 'ghost'}
                  onClick={() => {
                    setSelectMode((m) => !m)
                    setSelected(new Set())
                  }}
                  icon={<CheckSquare size={14} strokeWidth={1.5} />}
                  aria-pressed={selectMode}
                >
                  {selectMode ? 'Cancel' : 'Select'}
                </Button>
              </div>

              {!selectMode ? (
                <p className="caption text-muted list-kbd-hint">
                  <span className="kbd">J</span>
                  <span className="kbd">K</span>
                  move · <span className="kbd">↵</span> open
                </p>
              ) : null}

              {/* -------- Batch action bar -------- */}
              {selectMode ? (
                <div className="batch-bar" role="toolbar" aria-label="Batch actions">
                  <span className="caption">
                    {selected.size} of {filteredLectures.length} selected
                  </span>
                  <button
                    className="link-wine"
                    onClick={() =>
                      setSelected(
                        selected.size === filteredLectures.length
                          ? new Set()
                          : new Set(filteredLectures.map((l) => l.id))
                      )
                    }
                  >
                    {selected.size === filteredLectures.length ? 'Deselect all' : 'Select all'}
                  </button>
                  <div style={{ flex: 1 }} />
                  <Button
                    variant="danger"
                    onClick={handleBatchDelete}
                    loading={batchDeleting}
                    disabled={selected.size === 0}
                    icon={<Trash2 size={13} strokeWidth={1.5} />}
                  >
                    Delete selected
                  </Button>
                </div>
              ) : null}

              {filteredLectures.length === 0 ? (
                <div className="lecture-empty-filter">
                  {hasFilters
                    ? `No lectures match ${query.trim() ? `“${query.trim()}”` : 'this filter'}.`
                    : 'No lectures to show.'}
                  {hasFilters ? (
                    <button
                      className="link-wine"
                      onClick={() => {
                        setQuery('')
                        setStatusFilter('all')
                        setSortKey('newest')
                      }}
                    >
                      Clear filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="lecture-list" role="list">
                  {filteredLectures.map((lecture, index) => (
                    <div
                      key={lecture.id}
                      role="listitem"
                      ref={(el) => {
                        rowRefs.current[index] = el
                      }}
                      className={`lecture-row-wrap ${selected.has(lecture.id) ? 'selected' : ''} ${
                        !selectMode && index === cursorIndex ? 'cursor' : ''
                      }`}
                    >
                      {selectMode ? (
                        <button
                          className="lecture-check"
                          onClick={() => toggleSelected(lecture.id)}
                          aria-label={`Select ${lecture.title}`}
                          aria-pressed={selected.has(lecture.id)}
                        >
                          {selected.has(lecture.id) ? (
                            <CheckSquare size={16} strokeWidth={1.5} />
                          ) : (
                            <Square size={16} strokeWidth={1.5} />
                          )}
                        </button>
                      ) : null}
                      <div
                        className="lecture-row lecture-row-flex"
                        onClick={() =>
                          selectMode
                            ? toggleSelected(lecture.id)
                            : navigate(`/lectures/${lecture.id}`)
                        }
                      >
                        <LectureRowContent lecture={lecture} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
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
