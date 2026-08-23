'use client'

import { ChevronRight } from 'lucide-react'
import type { Lecture } from '@/lib/api'
import { formatDate, formatDuration } from '@/lib/format'
import { StatusPill } from '@/components/lecture-notes/StatusPill'

interface LectureRowProps {
  lecture: Lecture
  onClick: () => void
}

export function LectureRow({ lecture, onClick }: LectureRowProps) {
  return (
    <button className="lecture-row" onClick={onClick}>
      <div className="lecture-row-main">
        <span className="lecture-row-title">{lecture.title}</span>
        <span className="lecture-row-meta">
          <span className="caption num">{formatDate(lecture.recordedAt)}</span>
          <span className="caption text-muted">·</span>
          <span className="caption num">{formatDuration(lecture.durationSeconds)}</span>
        </span>
      </div>
      <StatusPill status={lecture.status} />
      <span className="lecture-row-chevron">
        <ChevronRight size={16} strokeWidth={1.5} />
      </span>
    </button>
  )
}
