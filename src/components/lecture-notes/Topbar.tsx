'use client'

import { AudioLines } from 'lucide-react'

const SECTION_TITLES: Record<string, string> = {
  subjects: 'Subjects',
  record: 'Record',
  lectures: 'Lecture',
  settings: 'Settings',
}

/** Slim mobile-only top bar with the wordmark and user avatar. */
export function Topbar({ path, email }: { path: string; email: string }) {
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
      <div className="topbar-avatar" aria-label={`Signed in as ${email}`} title={email}>
        {initial}
      </div>
      <span className="sr-only">{title}</span>
    </header>
  )
}
