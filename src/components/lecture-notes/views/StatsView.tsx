'use client'

import { useEffect, useState } from 'react'
import { Activity, BarChart3, CheckCircle2, Clock3, Library } from 'lucide-react'
import { api, type Stats } from '@/lib/api'
import { navigate } from '@/lib/router'
import { formatDate, formatHours, formatNumber, relativeTime } from '@/lib/format'
import { Button } from '@/components/lecture-notes/Button'
import { EmptyState } from '@/components/lecture-notes/EmptyState'
import { StatusPill } from '@/components/lecture-notes/StatusPill'

/** Pure-SVG activity chart: one bar per day for the last 28 days. */
function ActivityChart({ activity }: { activity: { date: string; count: number }[] }) {
  const max = Math.max(1, ...activity.map((a) => a.count))
  const total = activity.reduce((sum, a) => sum + a.count, 0)

  return (
    <div className="activity-card" role="img" aria-label={`Activity chart: ${total} lectures in the last 4 weeks`}>
      <div className="activity-header">
        <span className="stat-label">
          <Activity size={13} strokeWidth={1.5} />
          Last 4 weeks
        </span>
        <span className="caption num">
          {total} {total === 1 ? 'lecture' : 'lectures'}
        </span>
      </div>
      <div className="activity-chart">
        {activity.map((day) => {
          const pct = (day.count / max) * 100
          const d = new Date(day.date + 'T00:00:00Z')
          const label = d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })
          return (
            <div
              key={day.date}
              className="activity-col"
              title={`${label} — ${day.count} ${day.count === 1 ? 'lecture' : 'lectures'}`}
            >
              <div className="activity-bar-track">
                <div
                  className={`activity-bar ${day.count > 0 ? 'has-activity' : ''}`}
                  style={{ height: `${day.count > 0 ? Math.max(pct, 12) : 0}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <div className="activity-axis">
        <span className="caption text-muted">
          {new Date(activity[0]?.date + 'T00:00:00Z').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
        <span className="caption text-muted">today</span>
      </div>
    </div>
  )
}

export function StatsView() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .get<Stats>('/api/stats')
      .then((data) => {
        if (!cancelled) {
          setStats(data)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (failed) {
    return (
      <EmptyState
        icon={<BarChart3 size={48} strokeWidth={1} />}
        title="Could not load statistics"
        description="The stats service did not respond. Try again in a moment."
        action={{ label: 'Retry', onClick: () => window.location.reload() }}
      />
    )
  }

  if (stats === null) {
    return (
      <>
        <div className="page-header">
          <h1 className="display">Statistics</h1>
        </div>
        <div className="stat-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: 90, height: 12 }} />
              <div className="skeleton" style={{ width: 60, height: 30, marginTop: 12 }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ height: 180, marginTop: 32 }} />
      </>
    )
  }

  if (stats.totalLectures === 0 && stats.totalSubjects === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={48} strokeWidth={1} />}
        title="Nothing to measure yet"
        description="Record your first lecture and this dashboard will show hours captured, completion rate, and per-subject progress."
        action={{
          label: 'Start Recording',
          onClick: () => navigate('/record'),
        }}
      />
    )
  }

  const maxLectures = Math.max(1, ...stats.subjects.map((s) => s.lectureCount))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="display">Statistics</h1>
          {stats.firstLectureAt ? (
            <p className="caption" style={{ marginTop: 6 }}>
              Tracking since {formatDate(stats.firstLectureAt)}
            </p>
          ) : null}
        </div>
      </div>

      {/* -------- KPI cards -------- */}
      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">
            <Library size={13} strokeWidth={1.5} />
            Lectures
          </span>
          <span className="stat-value num">{formatNumber(stats.totalLectures)}</span>
          <span className="stat-sub caption">
            {stats.processing > 0
              ? `${stats.processing} processing now`
              : `${formatNumber(stats.completed)} completed`}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            <Clock3 size={13} strokeWidth={1.5} />
            Hours recorded
          </span>
          <span className="stat-value num">{formatHours(stats.totalDurationSeconds)}</span>
          <span className="stat-sub caption">
            across {formatNumber(stats.totalSubjects)}{' '}
            {stats.totalSubjects === 1 ? 'subject' : 'subjects'}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            <CheckCircle2 size={13} strokeWidth={1.5} />
            Completion rate
          </span>
          <span className="stat-value num">
            {stats.completionRate == null ? '—' : `${stats.completionRate}%`}
          </span>
          <span className="stat-sub caption">
            {stats.failed > 0
              ? `${stats.failed} failed — retry available`
              : 'all transcriptions healthy'}
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            <Activity size={13} strokeWidth={1.5} />
            Last activity
          </span>
          <span className="stat-value stat-value-sm">
            {stats.recentLectures[0] ? relativeTime(stats.recentLectures[0].recordedAt) : '—'}
          </span>
          <span className="stat-sub caption truncate">
            {stats.recentLectures[0] ? stats.recentLectures[0].title : 'no activity yet'}
          </span>
        </div>
      </div>

      {/* -------- Activity chart -------- */}
      {stats.activity && stats.activity.length > 0 ? (
        <section className="stats-section" aria-label="Recording activity">
          <ActivityChart activity={stats.activity} />
        </section>
      ) : null}

      {/* -------- Per-subject breakdown -------- */}
      {stats.subjects.length > 0 ? (
        <section className="stats-section" aria-labelledby="by-subject-heading">
          <h2 className="heading" id="by-subject-heading">
            By subject
          </h2>
          <div className="stats-card">
            {stats.subjects.map((s) => (
              <button
                key={s.id}
                className="subject-stat-row"
                onClick={() => navigate(`/subjects/${s.id}`)}
                aria-label={`Open ${s.name}`}
              >
                <span className="subject-stat-name">{s.name}</span>
                <span className="subject-stat-bar-track" aria-hidden="true">
                  <span
                    className="subject-stat-bar-fill"
                    style={{ width: `${(s.lectureCount / maxLectures) * 100}%` }}
                  />
                </span>
                <span className="subject-stat-meta num caption">
                  {s.lectureCount} {s.lectureCount === 1 ? 'lecture' : 'lectures'}
                </span>
                <span className="subject-stat-meta num caption">
                  {formatHours(s.durationSeconds)}
                </span>
                <span className="subject-stat-meta caption text-muted">
                  {s.lastLectureAt ? relativeTime(s.lastLectureAt) : 'no recordings'}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* -------- Recent activity -------- */}
      {stats.recentLectures.length > 0 ? (
        <section className="stats-section" aria-labelledby="recent-heading">
          <h2 className="heading" id="recent-heading">
            Recent activity
          </h2>
          <div className="lecture-list">
            {stats.recentLectures.map((l) => (
              <button
                key={l.id}
                className="lecture-row"
                onClick={() => navigate(`/lectures/${l.id}`)}
              >
                <div className="lecture-row-main">
                  <span className="lecture-row-title">{l.title}</span>
                  <span className="lecture-row-meta">
                    <span className="caption">{l.subjectName}</span>
                    <span className="caption text-muted">·</span>
                    <span className="caption num">{relativeTime(l.recordedAt)}</span>
                  </span>
                </div>
                <StatusPill status={l.status} />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {stats.processing > 0 ? (
        <p className="caption text-muted" style={{ marginTop: 24, textAlign: 'center' }}>
          {stats.processing} lecture{stats.processing === 1 ? '' : 's'} currently processing —
          statistics refresh on next visit.
        </p>
      ) : null}
    </>
  )
}
