'use client'

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'

interface FieldProps {
  label: string
  error?: string | null
  children: ReactNode
  hint?: string
}

export function Field({ label, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {hint && !error ? <span className="caption text-muted">{hint}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export function Input({ invalid, className = '', ...rest }: InputProps) {
  return <input className={`input ${invalid ? 'input-error' : ''} ${className}`} {...rest} />
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export function Textarea({ invalid, className = '', ...rest }: TextareaProps) {
  return <textarea className={`textarea ${invalid ? 'input-error' : ''} ${className}`} {...rest} />
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export function Select({ invalid, className = '', children, ...rest }: SelectProps) {
  return (
    <select className={`select ${invalid ? 'input-error' : ''} ${className}`} {...rest}>
      {children}
    </select>
  )
}
