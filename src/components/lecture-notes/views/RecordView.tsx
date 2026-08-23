'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square, Upload } from 'lucide-react'
import { api, type Lecture, type Subject } from '@/lib/api'
import { navigate } from '@/lib/router'
import { formatClock } from '@/lib/format'
import { Button } from '@/components/lecture-notes/Button'
import { Field, Input, Select } from '@/components/lecture-notes/Input'
import { useToast } from '@/context/ToastContext'

interface RecordViewProps {
  preselectSubjectId?: string | null
}

export function RecordView({ preselectSubjectId }: RecordViewProps) {
  const { toast } = useToast()

  const [subjects, setSubjects] = useState<Subject[] | null>(null)
  const [subjectId, setSubjectId] = useState(preselectSubjectId ?? '')
  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [recording, setRecording] = useState(false)
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
  const startedAtRef = useRef(0)

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

  // Timer
  useEffect(() => {
    if (!recording) return
    startedAtRef.current = Date.now()
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 500)
    return () => window.clearInterval(interval)
  }, [recording])

  // Warn before leaving the tab mid-recording
  useEffect(() => {
    if (!recording) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [recording])

  const cleanupMic = useCallback(() => {
    mediaRecorderRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    chunksRef.current = []
  }, [])

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
      } catch {
        setMicWarning(true)
      }

      setElapsed(0)
      setRecording(true)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not start recording.')
    } finally {
      setStarting(false)
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
      <section className="record-stage" aria-label="Recording stage">
        <div className={`rec-indicator ${recording ? 'live' : ''}`}>
          <span className="rec-dot" aria-hidden="true" />
          {recording ? 'REC' : 'READY'}
        </div>

        <div className="record-timer num" role="timer" aria-live="off">
          {formatClock(elapsed)}
        </div>

        <p className="record-hint">
          {recording
            ? 'Recording will auto-segment every 10 minutes'
            : 'Capture live audio, or upload an existing file below'}
        </p>

        {recording ? (
          <Button
            variant="danger-solid"
            size="lg"
            onClick={stopRecording}
            loading={stopping}
            icon={<Square size={16} strokeWidth={1.5} />}
          >
            Stop Recording
          </Button>
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
