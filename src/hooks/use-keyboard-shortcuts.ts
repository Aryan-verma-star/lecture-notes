'use client'

import { useEffect, useRef } from 'react'
import { navigate } from '@/lib/router'

interface ShortcutsOptions {
  enabled: boolean
  openPalette: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

/**
 * Global keyboard shortcuts (Linear-style):
 *   ⌘K / Ctrl+K / "/"  → command palette
 *   g then s           → subjects
 *   g then r           → record
 *   g then t           → statistics
 *   g then g           → settings
 *   ?                  → shortcut help (palette footer documents these)
 *
 * All shortcuts are suppressed while typing in a field.
 */
export function useKeyboardShortcuts({ enabled, openPalette }: ShortcutsOptions) {
  const gPressed = useRef(false)
  const gTimer = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      // Palette: ⌘K / Ctrl+K (works even while typing)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openPalette()
        return
      }

      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // "/" opens the palette
      if (e.key === '/') {
        e.preventDefault()
        openPalette()
        return
      }

      // "g"-prefix sequences
      if (e.key.toLowerCase() === 'g' && !gPressed.current) {
        gPressed.current = true
        window.clearTimeout(gTimer.current)
        gTimer.current = window.setTimeout(() => {
          gPressed.current = false
        }, 1200)
        return
      }

      if (gPressed.current) {
        const key = e.key.toLowerCase()
        gPressed.current = false
        window.clearTimeout(gTimer.current)
        if (key === 's') {
          e.preventDefault()
          navigate('/subjects')
        } else if (key === 'r') {
          e.preventDefault()
          navigate('/record')
        } else if (key === 't') {
          e.preventDefault()
          navigate('/stats')
        } else if (key === 'g') {
          e.preventDefault()
          navigate('/settings')
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(gTimer.current)
    }
  }, [enabled, openPalette])
}
