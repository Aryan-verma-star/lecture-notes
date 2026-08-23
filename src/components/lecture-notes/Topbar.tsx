'use client'

import { AudioLines, Search } from 'lucide-react'

const SECTION_TITLES: Record<string, string> = {
  subjects: 'Subjects',
  record: 'Record',
  lectures: 'Lecture',
  stats: 'Statistics',
  settings: 'Settings',
}

interface TopbarProps {
  path: string
  email: string
  onOpenPalette: () => void
}

/** Slim mobile-only top bar with wordmark, search trigger, and user avatar. */
export function Topbar({ path, email, onOpenPalette }: TopbarProps) {
  const root = path.split('/').filter(Boolean)[0] ?? 'subjects'
  const title = SECTION_TITLES[root] ?? 'Lecture Notes'
  const initial = email.charAt(0).toUpperCase() || '?'

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="topbar-mark" aria-hidden="true">
          <AudioLines size={13} strokeWidth={1.5} />
        </span>
        Lecture Notes
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="topbar-search"
          onClick={onOpenPalette}
          aria-label="Open search"
        >
          <Search size={15} strokeWidth={1.5} />
        </button>
        <div className="topbar-avatar" aria-label={`Signed in as ${email}`} title={email}>
          {initial}
        </div>
      </div>
      <span className="sr-only">{title}</span>
    </header>
  )
}
