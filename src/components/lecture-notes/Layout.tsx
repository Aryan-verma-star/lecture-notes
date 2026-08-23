'use client'

import type { ReactNode } from 'react'
import { BookOpen, Mic, Search, Settings } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { navigate } from '@/lib/router'

const TABS = [
  { path: '/subjects', label: 'Subjects', icon: BookOpen },
  { path: '/record', label: 'Record', icon: Mic },
  { path: '/settings', label: 'Settings', icon: Settings },
]

interface LayoutProps {
  path: string
  email: string
  wide?: boolean
  onSignOut: () => void
  onOpenPalette: () => void
  children: ReactNode
}

/** App shell: desktop sidebar / mobile topbar + bottom tabs, content column. */
export function Layout({ path, email, wide, onSignOut, onOpenPalette, children }: LayoutProps) {
  const activeRoot = `/${path.split('/').filter(Boolean)[0] ?? 'subjects'}`

  return (
    <div className="app-shell">
      <Sidebar
        activePath={path}
        email={email}
        onSignOut={onSignOut}
        onOpenPalette={onOpenPalette}
      />
      <div className="app-main">
        <Topbar path={path} email={email} onOpenPalette={onOpenPalette} />
        <main className={`page ${wide ? 'page-wide' : ''} page-enter`}>{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="bottom-tabs" aria-label="Mobile navigation">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeRoot === tab.path
          return (
            <button
              key={tab.path}
              className={`tab-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(tab.path)}
            >
              <Icon size={20} strokeWidth={1.5} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
