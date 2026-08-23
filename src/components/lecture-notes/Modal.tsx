'use client'

import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
}

export function Modal({ open, onClose, title, description, children }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <h2 className="heading">{title}</h2>
            {description ? (
              <p className="caption" style={{ marginTop: 6 }}>
                {description}
              </p>
            ) : null}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
