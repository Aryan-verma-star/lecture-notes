'use client'

import type { LectureStatus } from '@/lib/api'
import { STATUS_LABELS } from '@/lib/format'

const STATUS_CLASS: Record<LectureStatus, string> = {
  RECORDING: 'recording',
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
}

export function StatusPill({ status }: { status: LectureStatus }) {
  return (
    <span className={`status-pill ${STATUS_CLASS[status] ?? 'uploaded'}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
