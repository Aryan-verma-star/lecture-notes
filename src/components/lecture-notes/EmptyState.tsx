'use client'

import type { ReactNode } from 'react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: { label: string; onClick: () => void; icon?: ReactNode }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <h2 className="empty-state-title">{title}</h2>
      <p className="empty-state-desc">{description}</p>
      {action ? (
        <div className="empty-state-action">
          <Button variant="primary" onClick={action.onClick} icon={action.icon}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
