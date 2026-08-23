'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, RotateCcw, RotateCw, X } from 'lucide-react'
import type { Flashcard } from '@/lib/flashcards'

interface FlashcardReviewProps {
  onClose: () => void
  title: string
  cards: Flashcard[]
}

/** Fullscreen flashcard study session with flip + Again/Got-it flow.
 *  Mounted fresh each session (parent renders conditionally) so all state
 *  starts clean — no reset effects needed. */
export function FlashcardReview({ onClose, title, cards }: FlashcardReviewProps) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [finished, setFinished] = useState(false)

  const total = cards.length

  const card = cards[index]

  const advance = useCallback(
    (delta: number) => {
      setFlipped(false)
      setIndex((i) => {
        const next = i + delta
        if (next >= total) {
          setFinished(true)
          return Math.max(0, total - 1)
        }
        return Math.max(0, next)
      })
    },
    [total]
  )

  const markKnown = useCallback(() => {
    const current = cards[index]
    if (!current) return
    setKnown((prev) => new Set(prev).add(current.id))
    advance(1)
  }, [cards, index, advance])

  const restart = useCallback(() => {
    setIndex(0)
    setFlipped(false)
    setKnown(new Set())
    setFinished(false)
  }, [])

  // Keyboard: space flip, arrows navigate, 1 again, 2 got-it, esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (finished) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        advance(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        advance(-1)
      } else if (e.key === '1') {
        e.preventDefault()
        advance(1)
      } else if (e.key === '2') {
        e.preventDefault()
        markKnown()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
     
  }, [finished, markKnown, advance, onClose])

  const originLabel = useMemo(
    () =>
      card
        ? card.origin === 'concept'
          ? 'Key concept'
          : card.origin === 'checklist'
            ? 'Study checklist'
            : 'Section'
        : '',
    [card]
  )

  return (
    <div className="flash-overlay" role="dialog" aria-modal="true" aria-label="Flashcard review">
      <div className="flash-shell">
        <div className="flash-header">
          <span className="caption truncate" style={{ maxWidth: '50%' }}>
            {title}
          </span>
          <span className="flash-progress num">
            {finished ? total : index + 1}/{total}
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close review">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>

        {finished ? (
          <div className="flash-done">
            <span className="flash-done-ring">
              <Check size={28} strokeWidth={1.5} />
            </span>
            <h2 className="heading">Session complete</h2>
            <p className="body text-secondary" style={{ textAlign: 'center' }}>
              You marked <strong className="text-primary">{known.size}</strong> of {total} card
              {total === 1 ? '' : 's'} as known.
              {known.size < total ? ` ${total - known.size} to review again.` : ' Excellent work.'}
            </p>
            <div className="flash-done-actions">
              <button className="btn-secondary" onClick={restart}>
                <RotateCw size={14} strokeWidth={1.5} />
                Study again
              </button>
              <button className="btn-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : card ? (
          <>
            <div
              className={`flash-card ${flipped ? 'flipped' : ''}`}
              onClick={() => setFlipped((f) => !f)}
              role="button"
              tabIndex={0}
              aria-label={flipped ? 'Answer. Click to see question.' : 'Question. Click to reveal answer.'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setFlipped((f) => !f)
                }
              }}
            >
              <div className="flash-face flash-front">
                <span className="flash-origin">{originLabel}</span>
                <p className="flash-text">{card.front}</p>
                <span className="flash-hint caption text-muted">
                  Click or press <span className="kbd">space</span> to flip
                </span>
              </div>
              <div className="flash-face flash-back">
                <span className="flash-origin">{originLabel} · answer</span>
                <p className="flash-text">{card.back}</p>
              </div>
            </div>

            <div className="flash-controls">
              <button className="btn-secondary flash-nav" onClick={() => advance(-1)} aria-label="Previous card">
                <ArrowLeft size={14} strokeWidth={1.5} />
              </button>

              {flipped ? (
                <>
                  <button className="btn-secondary flash-mark" onClick={() => advance(1)}>
                    <RotateCcw size={14} strokeWidth={1.5} />
                    Again
                    <span className="kbd kbd-inline">1</span>
                  </button>
                  <button className="btn-primary flash-mark" onClick={markKnown}>
                    <Check size={14} strokeWidth={1.5} />
                    Got it
                    <span className="kbd kbd-inline">2</span>
                  </button>
                </>
              ) : (
                <button className="btn-secondary flash-mark flash-flip-btn" onClick={() => setFlipped(true)}>
                  <RotateCw size={14} strokeWidth={1.5} />
                  Reveal answer
                  <span className="kbd kbd-inline">space</span>
                </button>
              )}

              <button className="btn-secondary flash-nav" onClick={() => advance(1)} aria-label="Next card">
                <ArrowRight size={14} strokeWidth={1.5} />
              </button>
            </div>

            <div className="flash-meter" aria-hidden="true">
              {cards.map((c, i) => (
                <span
                  key={c.id}
                  className={`flash-dot ${known.has(c.id) ? 'known' : ''} ${i === index && !finished ? 'current' : ''}`}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="flash-done">
            <h2 className="heading">No cards available</h2>
            <p className="body text-secondary">These notes did not yield any study cards.</p>
            <button className="btn-primary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
