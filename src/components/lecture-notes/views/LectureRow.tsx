'use client'

import { ChevronRight } from 'lucide-react'
import type { Lecture } from '@/lib/api'
import { formatDate, formatDuration } from '@/lib/format'
import { StatusPill } from '@/components/lecture-notes/StatusPill'

interface LectureRowProps {
  lecture: Lecture
  onClick: () => void
}

/** The inner content of a lecture row (shared by list + batch-select layouts). */
export function LectureRowContent({ lecture }: { lecture: Lecture }) {
  return (
    <>
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
    </>
  )
}

/** Standalone clickable row (used on the stats page). */
export function LectureRow({ lecture, onClick }: LectureRowProps) {
  return (
    <button className="lecture-row" onClick={onClick}>
      <LectureRowContent lecture={lecture} />
    </button>
  )
}
