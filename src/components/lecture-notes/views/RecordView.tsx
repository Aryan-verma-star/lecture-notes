'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Square, Upload } from 'lucide-react'
import { api, type Lecture, type Subject } from '@/lib/api'
import { navigate } from '@/lib/router'
import { formatClock } from '@/lib/format'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input, Select } from '@/components/lecture-notes/Input'
import { useToast } from '@/context/ToastContext'

interface RecordViewProps {
  preselectSubjectId?: string | null
}

const METER_CELLS = 28

export function RecordView({ preselectSubjectId }: RecordViewProps) {
  const { toast } = useToast()

  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [subjectId, setSubjectId] = useState(preselectSubjectId ?? '')
  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [micWarning, setMicWarning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [uploading, setUploading] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const activeLectureRef = useRef<Lecture | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const accumulatedRef = useRef(0)
  const segmentStartRef = useRef(0)

  // Level meter plumbing
  const meterRef = useRef<HTMLDivElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    api
      .get<Subject[]>('/api/subjects')
      .then((list) => {
        setSubjects(list)
        if (list.length > 0) {
          setSubjectId((prev) => {
            if (prev && list.some((s) => s.id === prev)) return prev
            return list[0].id
          })
        }
      })
      .catch(() => setSubjects([]))
  }, [])

  // Timer — accumulates only while running (paused time is excluded)
  useEffect(() => {
    if (!recording) return
    const interval = window.setInterval(() => {
      if (paused) return
      const live = (Date.now() - segmentStartRef.current) / 1000
      setElapsed(Math.floor(accumulatedRef.current + live))
    }, 250)
    return () => window.clearInterval(interval)
  }, [recording, paused])

  // Warn before leaving the tab mid-recording
  useEffect(() => {
    if (!recording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [recording])

  /* ---------------- Level meter ---------------- */

  const stopMeterLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const meter = meterRef.current
    if (meter) {
      meter.querySelectorAll('.meter-cell').forEach((c) => c.classList.remove('lit', 'hot'))
    }
  }, [])

  const startMeterLoop = useCallback(() => {
    const analyser = analyserRef.current
    const meter = meterRef.current
    if (!analyser || !meter) return

    const buffer = new Uint8Array(analyser.fftSize)
    const cells = Array.from(meter.querySelectorAll('.meter-cell'))

    const tick = () => {
      analyser.getByteTimeDomainData(buffer)
      // RMS level 0..1
      let sum = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      // Perceptual curve — speech sits around 0.05–0.3 RMS
      const level = Math.min(1, Math.pow(rms * 3.2, 0.75))
      const lit = Math.round(level * cells.length)

      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        cell.classList.toggle('lit', i < lit)
        cell.classList.toggle('hot', i >= cells.length - 6 && i < lit)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const teardownAudio = useCallback(() => {
    stopMeterLoop()
    analyserRef.current = null
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [stopMeterLoop])

  const cleanupMic = useCallback(() => {
    teardownAudio()
    mediaRecorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    chunksRef.current = []
  }, [teardownAudio])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /* ---------------- Recording controls ---------------- */

  async function startRecording() {
    setFormError(null)
    if (!subjectId) {
      setFormError('Select a subject first.')
      return
    }
    if (!title.trim()) {
      setFormError('Give this lecture a title.')
      return
    }

    setStarting(true)
    try {
      const lecture = await api.post<Lecture>('/api/lectures', {
        subjectId,
        title: title.trim(),
      })
      activeLectureRef.current = lecture

      // Try to capture the microphone (timer still runs if unavailable)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        chunksRef.current = []
        const recorder = new MediaRecorder(stream)
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        recorder.start(1000)
        mediaRecorderRef.current = recorder
        setMicWarning(false)

        // Wire the level meter
        try {
          const ctx = new AudioContext()
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser) // not connected to destination → no feedback
          audioCtxRef.current = ctx
          analyserRef.current = analyser
          requestAnimationFrame(() => startMeterLoop())
        } catch {
          /* meter is optional */
        }
      } catch {
        setMicWarning(true)
      }

      accumulatedRef.current = 0
      segmentStartRef.current = Date.now()
      setElapsed(0)
      setPaused(false)
      setRecording(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not start recording.')
    } finally {
      setStarting(false)
    }
  }

  function togglePause() {
    const recorder = mediaRecorderRef.current

    if (!paused) {
      // → pausing
      accumulatedRef.current += (Date.now() - segmentStartRef.current) / 1000
      setElapsed(Math.floor(accumulatedRef.current))
      setPaused(true)
      stopMeterLoop()
      try {
        recorder?.pause()
      } catch {
        /* recorder may be absent in timer-only mode */
      }
    } else {
      // → resuming
      segmentStartRef.current = Date.now()
      setPaused(false)
      if (analyserRef.current) startMeterLoop()
      try {
        recorder?.resume()
      } catch {
        /* recorder may be absent in timer-only mode */
      }
    }
  }

  async function stopRecording() {
    const lecture = activeLectureRef.current
    if (!lecture) return

    setStopping(true)
    const duration = elapsed

    const finishRecording = async () => {
      const recorder = mediaRecorderRef.current
      let blob: Blob | null = null
      if (recorder && recorder.state !== 'inactive') {
        blob = await new Promise<Blob | null>((resolve) => {
          recorder.onstop = () => {
            if (chunksRef.current.length > 0) {
              resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
            } else {
              resolve(null)
            }
          }
          recorder.stop()
        })
      }
      cleanupMic()
      return blob
    }

    try {
      const blob = await finishRecording()
      await uploadAndProcess(lecture.id, blob, duration)
      toast('Recording saved — transcription started', 'success')
      navigate(`/lectures/${lecture.id}`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed. Try again.', 'error')
      setRecording(false)
      setStopping(false)
    }
  }

  function readAudioDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file)
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url)
        resolve(Number.isFinite(audio.duration) ? audio.duration : null)
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      audio.src = url
    })
  }

  async function uploadAndProcess(lectureId: string, blob: Blob | null, duration: number | null) {
    if (blob) {
      const form = new FormData()
      const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
      form.append('audio', blob, `recording.${ext}`)
      if (duration != null) form.append('duration', String(Math.round(duration)))
      await api.post(`/api/lectures/${lectureId}/audio`, form)
    } else {
      await api.post(`/api/lectures/${lectureId}/audio`, {
        durationSeconds: duration ?? undefined,
      })
    }
  }

  async function handleFileUpload(file: File) {
    setFormError(null)
    if (!subjectId) {
      setFormError('Select a subject first.')
      return
    }
    if (!title.trim()) {
      setFormError('Give this lecture a title.')
      return
    }

    setUploading(true)
    try {
      const lecture = await api.post<Lecture>('/api/lectures', {
        subjectId,
        title: title.trim(),
      })
      const duration = await readAudioDuration(file)
      const form = new FormData()
      form.append('audio', file, file.name)
      if (duration != null) form.append('duration', String(Math.round(duration)))
      await api.post(`/api/lectures/${lecture.id}/audio`, form)
      toast('Audio uploaded — transcription started', 'success')
      navigate(`/lectures/${lecture.id}`)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  /* ---------- No subjects yet ---------- */
  if (subjects !== null && subjects.length === 0) {
    return (
      <>
        <div className="page-header">
          <h1 className="display">Record</h1>
        </div>
        <div className="empty-state">
          <span className="empty-state-icon">
            <Mic size={48} strokeWidth={1} />
          </span>
          <h2 className="empty-state-title">Create a subject first</h2>
          <p className="empty-state-desc">
            Lectures are organized by subject. Create one to start recording.
          </p>
          <div className="empty-state-action">
            <Button onClick={() => navigate('/subjects')}>Go to Subjects</Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="display">Record</h1>
      </div>

      {/* Precision-instrument stage */}
      <section
        className={`record-stage ${recording ? 'is-live' : ''} ${paused ? 'is-paused' : ''}`}
        aria-label="Recording stage"
      >
        <div className={`rec-indicator ${recording && !paused ? 'live' : ''} ${recording && paused ? 'paused' : ''}`}>
          <span className="rec-dot" aria-hidden="true" />
          {!recording ? 'READY' : paused ? 'PAUSED' : 'REC'}
        </div>

        <div className={`record-timer num ${paused ? 'dimmed' : ''}`} role="timer" aria-live="off">
          {formatClock(elapsed)}
        </div>

        {/* Live input level meter */}
        {recording && !micWarning ? (
          <div
            className="meter"
            ref={meterRef}
            role="meter"
            aria-label="Input level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={0}
          >
            {Array.from({ length: METER_CELLS }, (_, i) => (
              <span key={i} className="meter-cell" />
            ))}
          </div>
        ) : null}

        <p className="record-hint">
          {!recording
            ? 'Capture live audio, or upload an existing file below'
            : paused
              ? 'Recording paused — resume when you are ready'
              : 'Recording will auto-segment every 10 minutes'}
        </p>

        {recording ? (
          <div className="record-controls">
            <Button
              variant="secondary"
              size="lg"
              onClick={togglePause}
              icon={
                paused ? (
                  <Play size={16} strokeWidth={1.5} />
                ) : (
                  <Pause size={16} strokeWidth={1.5} />
                )
              }
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant="danger-solid"
              size="lg"
              onClick={stopRecording}
              loading={stopping}
              icon={<Square size={16} strokeWidth={1.5} />}
            >
              Stop Recording
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={startRecording}
            loading={starting}
            disabled={subjects === null}
            icon={<Mic size={16} strokeWidth={1.5} />}
          >
            Start Recording
          </Button>
        )}

        {micWarning && recording ? (
          <div className="mic-warning" role="alert">
            Microphone unavailable — running as a timer session. The lecture will still be created
            when you stop; attach a file next time for real transcription.
          </div>
        ) : null}
      </section>

      <div className="record-divider" aria-hidden="true">
        OR
      </div>

      {/* Session details + upload */}
      <section className="record-form" aria-label="Session details">
        <Field label="Subject">
          <Select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            disabled={recording}
          >
            {subjects === null ? (
              <option value="">Loading subjects…</option>
            ) : (
              subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </Select>
        </Field>

        <Field label="Title" error={formError}>
          <Input
            placeholder="Lecture 5: Fourier Series"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={recording}
          />
        </Field>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFileUpload(file)
              e.target.value = ''
            }}
          />
          <Button
            variant="secondary"
            block
            onClick={() => fileInputRef.current?.click()}
            loading={uploading}
            disabled={recording}
            icon={<Upload size={16} strokeWidth={1.5} />}
          >
            Upload Audio File
          </Button>
          <p className="record-hint" style={{ marginTop: 10, textAlign: 'center' }}>
            MP3, M4A, WAV, or WebM — up to 200 MB
          </p>
        </div>
      </section>
    </>
  )
}
