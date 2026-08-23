'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { BookOpen, CornerDownLeft, Mic, Plus, Search, Settings } from 'lucide-react'
import { api, type SearchResults } from '@/lib/api'
import { navigate } from '@/lib/router'
import { relativeTime } from '@/lib/format'
import { StatusPill } from './StatusPill'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface ActionItem {
  kind: 'action'
  id: string
  label: string
  icon: ReactNode
  hint?: string
  run: () => void
}

interface ResultItem {
  kind: 'subject' | 'lecture'
  id: string
  subjectId?: string
  label: string
  meta?: string
  status?: SearchResults['lectures'][number]['status']
}

type Item = ActionItem | ResultItem

/* ---------------- Recents memory ---------------- */

const RECENTS_KEY = 'ln_recents'
const RECENTS_LIMIT = 6

type RecentsMap = Record<string, { kind: 'subject' | 'lecture'; at: number }>

function readRecents(): RecentsMap {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    return raw ? (JSON.parse(raw) as RecentsMap) : {}
  } catch {
    return {}
  }
}

function rememberRecent(kind: 'subject' | 'lecture', id: string) {
  try {
    const map = readRecents()
    map[id] = { kind, at: Date.now() }
    // prune oldest beyond limit
    const entries = Object.entries(map).sort((a, b) => b[1].at - a[1].at)
    const pruned: RecentsMap = {}
    for (const [key, value] of entries.slice(0, RECENTS_LIMIT)) {
      pruned[key] = value
    }
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(pruned))
  } catch {
    /* storage unavailable */
  }
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recents, setRecents] = useState<RecentsMap>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults(null)
      setActiveIndex(0)
      setRecents(readRecents())
      // Focus after mount so the input exists
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const data = await api.get<SearchResults>(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        )
        if (!cancelled) setResults(data)
      } catch {
        if (!cancelled) setResults({ subjects: [], lectures: [] })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, query ? 180 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, open])

  const actions: ActionItem[] = useMemo(
    () => [
      {
        kind: 'action',
        id: 'a-record',
        label: 'Start recording',
        icon: <Mic size={15} strokeWidth={1.5} />,
        hint: 'R',
        run: () => navigate('/record'),
      },
      {
        kind: 'action',
        id: 'a-new-subject',
        label: 'Create new subject',
        icon: <Plus size={15} strokeWidth={1.5} />,
        run: () => {
          window.sessionStorage.setItem('ln:open-create-subject', '1')
          navigate('/subjects')
          window.dispatchEvent(new CustomEvent('ln:create-subject'))
        },
      },
      {
        kind: 'action',
        id: 'a-subjects',
        label: 'Go to subjects',
        icon: <BookOpen size={15} strokeWidth={1.5} />,
        hint: 'G S',
        run: () => navigate('/subjects'),
      },
      {
        kind: 'action',
        id: 'a-settings',
        label: 'Open settings',
        icon: <Settings size={15} strokeWidth={1.5} />,
        hint: 'G G',
        run: () => navigate('/settings'),
      },
    ],
    []
  )

  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filteredActions = q
      ? actions.filter((a) => a.label.toLowerCase().includes(q))
      : actions
    const subjects: ResultItem[] = (results?.subjects ?? []).map((s) => ({
      kind: 'subject',
      id: s.id,
      label: s.name,
      meta: `${s.lectureCount} ${s.lectureCount === 1 ? 'lecture' : 'lectures'}`,
    }))
    const lectures: ResultItem[] = (results?.lectures ?? []).map((l) => ({
      kind: 'lecture',
      id: l.id,
      subjectId: l.subjectId,
      label: l.title,
      meta: `${l.subjectName} · ${relativeTime(l.recordedAt)}`,
      status: l.status,
    }))
    return [...filteredActions, ...subjects, ...lectures]
  }, [query, results, actions])

  // Clamp active index when the list changes
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, items.length - 1)))
  }, [items.length])

  const runItem = useCallback(
    (item: Item) => {
      if (item.kind === 'action') {
        item.run()
      } else if (item.kind === 'subject') {
        rememberRecent('subject', item.id)
        navigate(`/subjects/${item.id}`)
      } else {
        rememberRecent('lecture', item.id)
        navigate(`/lectures/${item.id}`)
      }
      onClose()
    },
    [onClose]
  )

  const isRecent = useCallback(
    (item: Item) => item.kind !== 'action' && item.id in recents,
    [recents]
  )

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[activeIndex]
      if (item) runItem(item)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Keep active item in view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`)
    if (el instanceof HTMLElement) {
      const parent = listRef.current
      const top = el.offsetTop
      const bottom = top + el.offsetHeight
      if (bottom > parent.scrollTop + parent.clientHeight) {
        parent.scrollTo({ top: bottom - parent.clientHeight })
      } else if (top < parent.scrollTop) {
        parent.scrollTo({ top })
      }
    }
  }, [activeIndex])

  if (!open) return null

  let lastKind = ''

  return (
    <div
      className="palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="palette" onKeyDown={handleKeyDown}>
        <div className="palette-input-row">
          <Search size={16} strokeWidth={1.5} className="palette-search-icon" />
          <input
            ref={inputRef}
            className="palette-input"
            placeholder="Search subjects, lectures, or actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search"
            spellCheck={false}
          />
          {loading ? <span className="palette-spinner" aria-label="Searching" /> : null}
        </div>

        <div className="palette-list" ref={listRef} role="listbox" aria-label="Results">
          {items.length === 0 ? (
            <div className="palette-empty">
              {query ? `No results for “${query.trim()}”` : 'No content yet'}
            </div>
          ) : (
            items.map((item, i) => {
              const showHeader = item.kind !== lastKind
              lastKind = item.kind
              return (
                <div key={`${item.kind}-${item.id}`}>
                  {showHeader ? (
                    <div className="palette-group-header">
                      {item.kind === 'action'
                        ? 'Actions'
                        : item.kind === 'subject'
                          ? 'Subjects'
                          : 'Lectures'}
                    </div>
                  ) : null}
                  <div
                    role="option"
                    aria-selected={i === activeIndex}
                    data-index={i}
                    className={`palette-item ${i === activeIndex ? 'active' : ''}`}
                    onMouseMove={() => setActiveIndex(i)}
                    onClick={() => runItem(item)}
                  >
                    <span className="palette-item-icon">
                      {item.kind === 'action' ? (
                        item.icon
                      ) : item.kind === 'subject' ? (
                        <BookOpen size={15} strokeWidth={1.5} />
                      ) : (
                        <Mic size={15} strokeWidth={1.5} />
                      )}
                    </span>
                    <span className="palette-item-label">{item.label}</span>
                    {item.kind !== 'action' && isRecent(item) ? (
                      <span className="palette-recent-badge">Recent</span>
                    ) : null}
                    {item.kind === 'lecture' && item.status ? (
                      <StatusPill status={item.status} />
                    ) : null}
                    {item.meta ? (
                      <span className="palette-item-meta">{item.meta}</span>
                    ) : null}
                    {item.kind === 'action' && item.hint ? (
                      <span className="palette-kbd">{item.hint}</span>
                    ) : null}
                    {i === activeIndex && item.kind !== 'action' ? (
                      <CornerDownLeft size={13} strokeWidth={1.5} className="palette-enter-icon" />
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="palette-footer">
          <span className="palette-footer-hint">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            navigate
          </span>
          <span className="palette-footer-hint">
            <span className="kbd">↵</span>
            open
          </span>
          <span className="palette-footer-hint">
            <span className="kbd">esc</span>
            close
          </span>
        </div>
      </div>
    </div>
  )
}
