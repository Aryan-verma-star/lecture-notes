'use client'

import { useEffect, useState } from 'react'
import { Check, Download, Github, Link2, LogOut, RefreshCw, Unlink, X } from 'lucide-react'
import { api, type ExportBundle, type GithubStatus } from '@/lib/api'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input } from '@/components/lecture-notes/Input'
import { Modal } from '@/components/lecture-notes/Modal'
import { formatDate, formatDuration } from '@/lib/format'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'

type BackendState = 'checking' | 'online' | 'offline'

export function SettingsView() {
  const { user, logout } = useAuth()
  const { toast } = useToast()

  const [github, setGithub] = useState<GithubStatus | null>(null)
  const [backend, setBackend] = useState<BackendState>('checking')
  const [connectOpen, setConnectOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [repoName, setRepoName] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const loadGithub = () => {
    api.get<GithubStatus>('/api/github/status').then(setGithub).catch(() => setGithub(null))
  }

  useEffect(() => {
    loadGithub()
    api
      .get('/api/health')
      .then(() => setBackend('online'))
      .catch(() => setBackend('offline'))
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

  async function handleConnect() {
    setFormError(null)
    if (username.trim() && !/^[A-Za-z0-9-]{1,39}$/.test(username.trim())) {
      setFormError('Usernames may only contain letters, numbers, and hyphens.')
      return
    }
    if (repoName.trim() && !/^[A-Za-z0-9._-]{1,100}$/.test(repoName.trim())) {
      setFormError('Repository name contains invalid characters.')
      return
    }
    setConnecting(true)
    try {
      await api.post('/api/github/connect', {
        username: username.trim() || undefined,
        repoName: repoName.trim() || undefined,
      })
      toast('GitHub connected — notes will sync to your repository', 'success')
      setConnectOpen(false)
      setUsername('')
      setRepoName('')
      loadGithub()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Connection failed.')
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await api.post('/api/github/disconnect')
      toast('GitHub disconnected', 'info')
      loadGithub()
    } catch {
      toast('Could not disconnect', 'error')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="display">Settings</h1>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
        {/* ------------ GitHub Connection ------------ */}
        <section className="settings-section" aria-labelledby="github-heading">
          <h2 className="heading" id="github-heading">
            GitHub Connection
          </h2>

          <div className="settings-card">
            {github === null ? (
              <>
                <div className="skeleton" style={{ width: 220, height: 16 }} />
                <div className="skeleton" style={{ width: 160, height: 12 }} />
              </>
            ) : github.connected ? (
              <>
                <div>
                  <div className="connection-line">
                    <span className="status-dot" style={{ background: 'var(--success)' }} />
                    Connected as <span className="mono">@{github.username}</span>
                  </div>
                  <p className="connection-sub" style={{ marginTop: 8 }}>
                    <Github size={13} strokeWidth={1.5} />
                    Repository: <span className="mono">{github.repoName}</span> (private)
                  </p>
                </div>

                <div className="settings-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setConnectOpen(true)}
                    icon={<RefreshCw size={14} strokeWidth={1.5} />}
                  >
                    Reconnect
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDisconnect}
                    loading={disconnecting}
                    icon={<Unlink size={14} strokeWidth={1.5} />}
                  >
                    Disconnect
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="connection-line text-secondary">
                    <span className="status-dot" style={{ background: 'var(--text-muted)' }} />
                    Not connected
                  </div>
                  <p className="body text-secondary" style={{ marginTop: 8, fontSize: 13 }}>
                    Connect a private repository to store your lecture notes as Markdown files.
                  </p>
                </div>
                <div className="settings-actions">
                  <Button
                    onClick={() => setConnectOpen(true)}
                    icon={<Github size={15} strokeWidth={1.5} />}
                  >
                    Connect GitHub
                  </Button>
                </div>
              </>
            )}
          </div>
        </section>

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

      {/* ------------ Connect modal (simulated OAuth) ------------ */}
      <Modal
        open={connectOpen}
        onClose={() => {
          setConnectOpen(false)
          setFormError(null)
        }}
        title="Connect GitHub"
        description="Authorize Lecture Notes to write notes to a private repository."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div
            className="settings-card"
            style={{ padding: 16, gap: 12, background: 'var(--bg-tertiary)' }}
          >
            <div className="connection-sub">
              <Link2 size={13} strokeWidth={1.5} />
              This sandbox simulates the GitHub OAuth handshake.
            </div>
            <div className="connection-sub text-muted">
              <Check size={13} strokeWidth={1.5} /> Create repo &lt;name&gt; under your account
            </div>
            <div className="connection-sub text-muted">
              <Check size={13} strokeWidth={1.5} /> Push one Markdown file per lecture
            </div>
            <div className="connection-sub text-muted">
              <X size={13} strokeWidth={1.5} /> No access to your other repositories
            </div>
          </div>

          <Field label="GitHub username">
            <Input
              placeholder="octocat"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={39}
              autoFocus
            />
          </Field>

          <Field label="Repository name" error={formError} hint="Defaults to lecture-notes">
            <Input
              placeholder="lecture-notes"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConnect()
              }}
            />
          </Field>

          <div className="modal-actions">
            <Button variant="ghost" onClick={() => setConnectOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConnect}
              loading={connecting}
              icon={<Github size={15} strokeWidth={1.5} />}
            >
              Authorize
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
