'use client'

import { useState, type FormEvent } from 'react'
import { AudioLines } from 'lucide-react'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input } from '@/components/lecture-notes/Input'
import { useAuth } from '@/context/AuthContext'
import { navigate } from '@/lib/router'

export function LoginView() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/subjects')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-header">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <span className="sidebar-logo-mark" style={{ width: 40, height: 40, borderRadius: 10 }}>
            <AudioLines size={20} strokeWidth={1.5} />
          </span>
        </div>
        <h1 className="display">Lecture Notes</h1>
        <p className="caption">Record. Transcribe. Study.</p>
      </div>

      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <Field label="Email">
          <Input
            type="email"
            placeholder="you@university.edu"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            invalid={!!error}
            autoFocus
          />
        </Field>

        <Field label="Password" error={error}>
          <Input
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
          />
        </Field>

        <Button type="submit" block loading={loading}>
          Log In
        </Button>
      </form>

      <p className="auth-footer caption">
        No account?{' '}
        <a
          href="#/register"
          className="link-wine"
          onClick={() => navigate('/register')}
        >
          Register
        </a>
      </p>
    </div>
  )
}
