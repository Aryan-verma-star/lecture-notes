/**
 * API client — same-origin requests with bearer-token auth.
 */

const TOKEN_KEY = 'ln_access_token'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(path, { ...init, headers })

  if (res.status === 401 && typeof window !== 'undefined') {
    setToken(null)
    window.location.reload()
    throw new ApiError('Session expired. Please sign in again.', 401)
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data?.error === 'string') message = data.error
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status)
  }

  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/* ---------------- Types ---------------- */

export interface User {
  id: string
  email: string
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

export type LectureStatus = 'RECORDING' | 'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export interface Subject {
  id: string
  name: string
  description?: string | null
  lectureCount: number
  lastLectureAt?: string | null
  lastLectureTitle?: string | null
  lastLectureStatus?: LectureStatus | null
  active?: boolean
  createdAt?: string
}

export interface Lecture {
  id: string
  subjectId: string
  subjectName?: string
  title: string
  status: LectureStatus
  recordedAt: string
  durationSeconds?: number | null
  markdown?: string | null
  errorMessage?: string | null
  hasAudio?: boolean
}

export interface LectureDetail extends Lecture {
  subjectName: string
  hasTranscript?: boolean
  transcript?: string | null
  taskChecks?: Record<string, boolean> | null
}

export interface ExportBundle {
  exportedAt: string
  email: string
  totalSubjects: number
  totalLectures: number
  lecturesWithNotes: number
  subjects: {
    id: string
    name: string
    description?: string | null
    lectures: {
      id: string
      title: string
      status: LectureStatus
      recordedAt: string
      durationSeconds?: number | null
      markdown?: string | null
      transcript?: string | null
    }[]
  }[]
}

export interface SubjectDetail {
  id: string
  name: string
  description?: string | null
  createdAt: string
  lectures: Lecture[]
}

export interface LectureProgress {
  status: LectureStatus
  progressPercent: number
  substage: string
  errorMessage?: string | null
}

export interface GithubStatus {
  connected: boolean
  username?: string | null
  repoName?: string | null
}

export interface SearchResults {
  subjects: { id: string; name: string; lectureCount: number }[]
  lectures: {
    id: string
    title: string
    subjectId: string
    subjectName: string
    status: LectureStatus
    recordedAt: string
  }[]
}

export interface SubjectStat {
  id: string
  name: string
  lectureCount: number
  durationSeconds: number
  completed: number
  lastLectureAt?: string | null
}

export interface Stats {
  totalSubjects: number
  totalLectures: number
  totalDurationSeconds: number
  completed: number
  failed: number
  processing: number
  completionRate: number | null
  firstLectureAt?: string | null
  activity?: { date: string; count: number; seconds: number }[]
  subjects: SubjectStat[]
  recentLectures: {
    id: string
    title: string
    subjectId: string
    subjectName: string
    status: LectureStatus
    recordedAt: string
    durationSeconds?: number | null
  }[]
}
