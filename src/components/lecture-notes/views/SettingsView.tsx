'use client'

import { useEffect, useState } from 'react'
import { Check, Github, Link2, LogOut, RefreshCw, Unlink, X } from 'lucide-react'
import { api, type GithubStatus } from '@/lib/api'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input } from '@/components/lecture-notes/Input'
import { Modal } from '@/components/lecture-notes/Modal'
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
