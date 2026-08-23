'use client'

import { useState, type FormEvent } from 'react'
import { AudioLines } from 'lucide-react'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input } from '@/components/lecture-notes/Input'
import { useAuth } from '@/context/AuthContext'
import { navigate } from '@/lib/router'

export function RegisterView() {
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and a password.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await register(email.trim(), password)
      navigate('/subjects')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
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
        <h1 className="display">Create your account</h1>
        <p className="caption">Turn lectures into structured study notes.</p>
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

        <Field label="Password" hint="At least 8 characters">
          <Input
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            invalid={!!error}
          />
        </Field>

        <Field label="Confirm password" error={error}>
          <Input
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            invalid={!!error}
          />
        </Field>

        <Button type="submit" block loading={loading}>
          Register
        </Button>
      </form>

      <p className="auth-footer caption">
        Already have an account?{' '}
        <a href="#/login" className="link-wine" onClick={() => navigate('/login')}>
          Log In
        </a>
      </p>
    </div>
  )
}
