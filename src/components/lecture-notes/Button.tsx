'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  icon,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    `btn-${variant}`,
    size === 'lg' ? 'btn-lg' : '',
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 size={16} strokeWidth={1.5} className="spin" /> : icon}
      {children}
    </button>
  )
}
