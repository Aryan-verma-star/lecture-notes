'use client'

import { useEffect, useState } from 'react'
import { Download, Github, LogOut } from 'lucide-react'
import { api, type ExportBundle } from '@/lib/api'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input } from '@/components/lecture-notes/Input'
import { formatDate, formatDuration } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

type BackendState = 'checking' | 'online' | 'offline'
type GithubState = { configured: boolean; notesToBackup: number }

export function SettingsView() {
  const { user, logout } = useAuth()
  const { toast } = useToast()

  const [backend, setBackend] = useState<BackendState>('checking')
  const [exporting, setExporting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [github, setGithub] = useState<GithubState | null>(null)

  useEffect(() => {
    api
      .get('/api/health')
      .then(() => setBackend('online'))
      .catch(() => setBackend('offline'))
    api
      .get<GithubState>('/api/github/sync')
      .then(setGithub)
      .catch(() => setGithub({ configured: false, notesToBackup: 0 }))
  }, [])

  async function handleExport() {
    setExporting(true)
    try {
      const bundle = await api.get<ExportBundle>('/api/export')
      const lines: string[] = [
        `# Lecture Notes — Export`,
        '',
        `> ${bundle.totalSubjects} subjects · ${bundle.totalLectures} lectures · ${bundle.lecturesWithNotes} with notes`,
        `> Exported ${new Date(bundle.exportedAt).toLocaleString('en-US')} · ${bundle.email}`,
        '',
        '---',
        '',
      ]
      for (const subject of bundle.subjects) {
        lines.push(`# ${subject.name}`, '')
        if (subject.description) lines.push(`*${subject.description}*`, '')
        if (subject.lectures.length === 0) {
          lines.push('_No lectures._', '')
        }
        for (const lecture of subject.lectures) {
          lines.push('---', '', `## ${lecture.title}`, '')
          lines.push(
            `> ${formatDate(lecture.recordedAt)} · ${formatDuration(lecture.durationSeconds)} · ${lecture.status}`,
            ''
          )
          if (lecture.markdown) {
            // demote the note's own H1 to H3 to keep the bundle hierarchy clean
            lines.push(lecture.markdown.replace(/^# /gm, '### '), '')
          } else {
            lines.push('_No generated notes._', '')
          }
        }
        lines.push('---', '')
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lecture-notes-export-${new Date().toISOString().slice(0, 10)}.md`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast(`Exported ${bundle.lecturesWithNotes} notes as Markdown`, 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Export failed', 'error')
    } finally {
      setExporting(false)
    }
  }

  async function handleGithubSync() {
    setSyncing(true)
    try {
      const res = await api.post<{ files: number; deleted: number }>(
        '/api/github/sync'
      )
      toast(
        `Backed up to GitHub — ${res.files} file(s) written, ${res.deleted} removed`,
        'success'
      )
      const updated = await api.get<GithubState>('/api/github/sync')
      setGithub(updated)
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'GitHub backup failed',
        'error'
      )
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="display">Settings</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
        {/* ------------ API Configuration ------------ */}
        <section className="settings-section" aria-labelledby="api-heading">
          <h2 className="heading" id="api-heading">
            API Configuration
          </h2>

          <div className="settings-card">
            <Field label="Backend URL">
              <Input value={typeof window !== 'undefined' ? window.location.origin : ''} readOnly />
            </Field>

            <div className="settings-row">
              <span className="settings-row-label">Status</span>
              <span className="connection-sub">
                {backend === 'online' ? (
                  <>
                    <span className="status-dot" style={{ background: 'var(--success)' }} />
                    Connected
                  </>
                ) : backend === 'checking' ? (
                  <>
                    <span className="status-dot" style={{ background: 'var(--warning)' }} />
                    Checking…
                  </>
                ) : (
                  <>
                    <span className="status-dot" style={{ background: 'var(--error)' }} />
                    Unreachable
                  </>
                )}
              </span>
            </div>
          </div>
        </section>

        {/* ------------ Data ------------ */}
        <section className="settings-section" aria-labelledby="data-heading">
          <h2 className="heading" id="data-heading">
            Data
          </h2>

          <div className="settings-card">
            <div>
              <p className="body" style={{ fontSize: 13 }}>
                Download every subject and lecture note as a single Markdown document — perfect for
                archiving, printing, or importing into another tool.
              </p>
            </div>
            <div className="settings-actions">
              <Button
                variant="secondary"
                onClick={handleExport}
                loading={exporting}
                icon={<Download size={14} strokeWidth={1.5} />}
              >
                Export all notes (.md)
              </Button>
            </div>
          </div>
        </section>

        {/* ------------ GitHub Backup ------------ */}
        <section className="settings-section" aria-labelledby="github-heading">
          <h2 className="heading" id="github-heading">
            GitHub Backup
          </h2>

          <div className="settings-card">
            <div>
              <p className="body" style={{ fontSize: 13 }}>
                Automatically mirrors your notes to a private GitHub repository as
                Markdown — one folder per subject, with each lecture's notes (and
                transcript) as a file. Set <code>GITHUB_TOKEN</code> and{' '}
                <code>GITHUB_REPO</code> (owner/repo) in the environment to enable it.
              </p>
            </div>
            <div className="settings-row">
              <span className="settings-row-label">Status</span>
              <span className="connection-sub">
                {github?.configured ? (
                  <>
                    <span className="status-dot" style={{ background: 'var(--success)' }} />
                    {github.notesToBackup} note(s) will be backed up
                  </>
                ) : (
                  <>
                    <span className="status-dot" style={{ background: 'var(--warning)' }} />
                    Not configured
                  </>
                )}
              </span>
            </div>
            <div className="settings-actions">
              <Button
                variant="secondary"
                onClick={handleGithubSync}
                loading={syncing}
                disabled={syncing || github?.configured === false}
                icon={<Github size={14} strokeWidth={1.5} />}
              >
                Backup to GitHub now
              </Button>
            </div>
          </div>
        </section>

        {/* ------------ Account ------------ */}
        <section className="settings-section" aria-labelledby="account-heading">
          <h2 className="heading" id="account-heading">
            Account
          </h2>

          <div className="settings-card">
            <div className="settings-row">
              <span className="settings-row-label">Signed in as</span>
              <span className="subheading">{user?.email}</span>
            </div>
            <div className="settings-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  logout()
                  toast('Signed out', 'info')
                }}
                icon={<LogOut size={14} strokeWidth={1.5} />}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
