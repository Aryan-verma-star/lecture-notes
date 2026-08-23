'use client'

import { AudioLines, BookOpen, LogOut, Mic, Search, Settings } from 'lucide-react'
import { navigate } from '@/lib/router'

const NAV_ITEMS = [
  { path: '/subjects', label: 'Subjects', icon: BookOpen },
  { path: '/record', label: 'Record', icon: Mic },
  { path: '/settings', label: 'Settings', icon: Settings },
]

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')

interface SidebarProps {
  activePath: string
  email: string
  onSignOut: () => void
  onOpenPalette: () => void
}

export function Sidebar({ activePath, email, onSignOut, onOpenPalette }: SidebarProps) {
  const activeRoot = `/${activePath.split('/').filter(Boolean)[0] ?? 'subjects'}`

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="sidebar-logo">
        <span className="sidebar-logo-mark" aria-hidden="true">
          <AudioLines size={16} strokeWidth={1.5} />
        </span>
        <span className="subheading">Lecture Notes</span>
      </div>

      <button
        className="sidebar-search"
        onClick={onOpenPalette}
        aria-label="Open search (Ctrl+K)"
        title="Search (Ctrl+K)"
      >
        <Search size={14} strokeWidth={1.5} />
        <span className="sidebar-search-label">Search…</span>
        <span className="sidebar-search-kbd kbd">{isMac ? '⌘K' : 'Ctrl K'}</span>
      </button>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = activeRoot === item.path
          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              className={`nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={item.label}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">
                <Icon size={17} strokeWidth={1.5} />
              </span>
              <span className="nav-label">{item.label}</span>
            </a>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-user-email" title={email}>
          {email}
        </span>
        <button
          className="sidebar-signout"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={15} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  )
}
