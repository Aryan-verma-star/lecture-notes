import { db } from '@/lib/db'
import { slugify } from '@/lib/toc'

/**
 * GitHub backup.
 *
 * Mirrors every lecture's generated notes (and transcript, when present) into
 * a Git repo as Markdown, organised as:
 *
 *   <BASE_DIR>/<subject>/<lecture>.md
 *   <BASE_DIR>/<subject>/<lecture>.transcript.md
 *
 * The whole user library is reconciled on each run: files that still exist in
 * the DB are upserted, and repo files that no longer correspond to a lecture
 * are deleted — so the repo stays an accurate backup of the database.
 *
 * Configuration (env):
 *   GITHUB_TOKEN        – a repo-scoped Personal Access Token
 *   GITHUB_REPO         – "owner/repo"
 *   GITHUB_BRANCH       – default "main"
 *   GITHUB_BASE_DIR     – default "subjects"
 */

const API = 'https://api.github.com'
const TOKEN = process.env.GITHUB_TOKEN || ''
const REPO = process.env.GITHUB_REPO || ''
const BRANCH = process.env.GITHUB_BRANCH || 'main'
const BASE_DIR = (process.env.GITHUB_BASE_DIR || 'subjects').replace(/^\/+|\/+$/g, '')

export function isGitHubConfigured(): boolean {
  return Boolean(TOKEN && REPO.includes('/'))
}

interface TreeEntry {
  path: string
  sha: string
  type: string
}

async function gh(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function toBase64(content: string): string {
  return Buffer.from(content, 'utf-8').toString('base64')
}

/** Reads the current repo tree (recursively) under BASE_DIR. */
async function getExistingTree(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (!isGitHubConfigured()) return map

  const res = await gh(`/repos/${REPO}/git/trees/${BRANCH}?recursive=1`)
  // Empty / missing branch → nothing to reconcile against.
  if (res.status === 404 || res.status === 409) return map
  if (!res.ok) {
    throw new Error(
      `GitHub tree ${res.status}: ${(await res.text()).slice(0, 200)}`
    )
  }

  const data = (await res.json()) as { tree?: TreeEntry[] }
  for (const entry of data.tree || []) {
    if (entry.type === 'blob' && entry.path.startsWith(`${BASE_DIR}/`)) {
      map.set(entry.path, entry.sha)
    }
  }
  return map
}

async function putFile(path: string, content: string, sha?: string): Promise<void> {
  const res = await gh(`/repos/${REPO}/contents/${encodePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `backup: update ${path}`,
      content: toBase64(content),
      branch: BRANCH,
      ...(sha ? { sha } : {}),
    }),
  })
  if (!res.ok) {
    throw new Error(
      `GitHub put ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`
    )
  }
}

async function deleteFile(path: string, sha: string): Promise<void> {
  const res = await gh(`/repos/${REPO}/contents/${encodePath(path)}`, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `backup: remove ${path}`,
      branch: BRANCH,
      sha,
    }),
  })
  if (!res.ok) {
    throw new Error(
      `GitHub delete ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`
    )
  }
}

function frontmatter(opts: {
  title: string
  subject: string
  lectureId: string
  recordedAt: string
  durationSeconds: number | null
  status: string
}): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`
  return [
    '---',
    `title: ${q(opts.title)}`,
    `subject: ${q(opts.subject)}`,
    `lectureId: ${opts.lectureId}`,
    `recordedAt: ${opts.recordedAt}`,
    `durationSeconds: ${opts.durationSeconds ?? ''}`,
    `status: ${opts.status}`,
    `syncedAt: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n')
}

export interface SyncResult {
  files: number
  deleted: number
}

/**
 * Backs up a user's entire library to GitHub. No-ops (and logs) when GitHub is
 * not configured, so callers can invoke it unconditionally.
 */
export async function syncToGitHub(userId: string): Promise<SyncResult> {
  if (!isGitHubConfigured()) {
    console.warn('[github] sync skipped — GITHUB_TOKEN / GITHUB_REPO not configured')
    return { files: 0, deleted: 0 }
  }

  const subjects = await db.subject.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    include: {
      lectures: {
        orderBy: { recordedAt: 'desc' },
        select: {
          id: true,
          title: true,
          status: true,
          recordedAt: true,
          durationSeconds: true,
          markdown: true,
          transcript: true,
        },
      },
    },
  })

  const desired = new Map<string, string>()
  const used = new Set<string>()

  for (const subject of subjects) {
    const subjectSlug = slugify(subject.name) || 'untitled-subject'
    for (const lec of subject.lectures) {
      if (!lec.markdown && !lec.transcript) continue

      const base = slugify(lec.title) || slugify(lec.id) || lec.id
      let fileSlug = base
      let n = 2
      while (used.has(`${subjectSlug}/${fileSlug}`)) {
        fileSlug = `${base}-${n++}`
      }
      used.add(`${subjectSlug}/${fileSlug}`)

      const fm = frontmatter({
        title: lec.title,
        subject: subject.name,
        lectureId: lec.id,
        recordedAt: lec.recordedAt,
        durationSeconds: lec.durationSeconds,
        status: lec.status,
      })

      if (lec.markdown) {
        desired.set(
          `${BASE_DIR}/${subjectSlug}/${fileSlug}.md`,
          `${fm}${lec.markdown}\n`
        )
      }
      if (lec.transcript) {
        desired.set(
          `${BASE_DIR}/${subjectSlug}/${fileSlug}.transcript.md`,
          `${fm}\n${lec.transcript}\n`
        )
      }
    }
  }

  const existing = await getExistingTree()
  let files = 0
  let deleted = 0

  for (const [path, content] of desired) {
    const sha = existing.get(path)
    await putFile(path, content, sha)
    files++
  }

  for (const [path, sha] of existing) {
    if (!desired.has(path)) {
      await deleteFile(path, sha)
      deleted++
    }
  }

  console.log(`[github] backup complete — ${files} files written, ${deleted} removed`)
  return { files, deleted }
}
