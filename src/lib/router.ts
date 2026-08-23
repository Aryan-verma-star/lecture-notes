'use client'

/**
 * Minimal hash router. The whole app lives on the single "/" route;
 * views are addressed via `#/path` fragments so browser back/forward
 * and deep links still work.
 */

import { useCallback, useEffect, useState } from 'react'

export interface Route {
  /** e.g. "/subjects" */
  path: string
  /** path split into segments, e.g. ["subjects", "abc123"] */
  segments: string[]
  /** query params from the hash, e.g. ?subject=abc */
  query: URLSearchParams
}

function parse(): Route {
  const raw = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '')
  const [rawPath, rawQuery] = (raw === '' || raw === '/' ? '/subjects' : raw).split('?')
  const clean = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return {
    path: clean,
    segments: clean.split('/').filter(Boolean),
    query: new URLSearchParams(rawQuery),
  }
}

export function navigate(to: string) {
  if (typeof window === 'undefined') return
  const target = to.startsWith('/') ? to : `/${to}`
  if (`#${target}` === window.location.hash) return
  window.location.hash = target
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse())

  useEffect(() => {
    const onChange = () => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

/** Navigates back, falling back to a default route when there is no history. */
export function useBack(fallback: string) {
  return useCallback(() => {
    if (typeof window === 'undefined') return
    if (window.history.length > 1) window.history.back()
    else navigate(fallback)
  }, [fallback])
}
