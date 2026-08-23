'use client'

import { useState, type FormEvent } from 'react'
import { AudioLines, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input } from '@/components/lecture-notes/Input'
import { useAuth } from '@/context/AuthContext'
import { navigate } from '@/lib/router'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginView() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  function validate(): boolean {
    let ok = true
    if (!email.trim()) {
      setEmailError('Enter your email address.')
      ok = false
    } else if (!EMAIL_RE.test(email.trim())) {
      setEmailError('Enter a valid email address.')
      ok = false
    } else {
      setEmailError(null)
    }
    if (!password) {
      setPasswordError('Enter your password.')
      ok = false
    } else {
      setPasswordError(null)
    }
    return ok
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!validate()) return

    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/subjects')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Login failed. Please try again.')
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
        <Field label="Email" error={emailError}>
          <Input
            type="email"
            placeholder="you@university.edu"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (emailError) setEmailError(null)
            }}
            invalid={!!emailError}
            autoFocus
            disabled={loading}
          />
        </Field>

        <Field label="Password" error={passwordError || formError}>
          <div className="password-field">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
              invalid={!!passwordError || !!formError}
              disabled={loading}
              className="password-input"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              title={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff size={15} strokeWidth={1.5} />
              ) : (
                <Eye size={15} strokeWidth={1.5} />
              )}
            </button>
          </div>
        </Field>

        <Button type="submit" block loading={loading} disabled={!email.trim() || !password}>
          Log In
        </Button>
      </form>
    </div>
  )
}
