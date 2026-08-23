import { db } from '@/lib/db'

/**
 * Simulated AI processing pipeline.
 *
 * A lecture's audio is "processed" through timed stages. Elapsed time is
 * measured from `processingStartedAt`, and any read of a PROCESSING lecture
 * synchronizes its state against the clock:
 *
 *   0s–10s   Transcribing audio        5% → 45%
 *   10s–20s  Structuring notes        45% → 78%
 *   20s–28s  Writing summary          78% → 96%
 *   ≥30s     COMPLETED (markdown attached)
 *
 * A lecture flagged with `failFlag` fails at ~16s (simulating a transcription
 * error). Retrying always succeeds.
 */

export const STAGES = [
  { name: 'Transcribing audio', start: 0, end: 10, from: 5, to: 45 },
  { name: 'Structuring notes', start: 10, end: 20, from: 45, to: 78 },
  { name: 'Writing summary', start: 20, end: 28, from: 78, to: 96 },
] as const

export const COMPLETE_AFTER_MS = 30_000
export const FAIL_AFTER_MS = 16_000

export type LectureRecord = {
  id: string
  subjectId: string
  title: string
  status: string
  recordedAt: Date
  durationSeconds: number | null
  markdown: string | null
  errorMessage: string | null
  failFlag: boolean
  processingStartedAt: Date | null
  hasAudio: boolean
}

export type LectureProgress = {
  status: string
  progressPercent: number
  substage: string
}

/** Computes the live progress for a PROCESSING lecture. */
export function computeProgress(lecture: LectureRecord): LectureProgress {
  const startedAt = lecture.processingStartedAt?.getTime() ?? Date.now()
  const elapsed = (Date.now() - startedAt) / 1000

  if (lecture.failFlag && elapsed >= FAIL_AFTER_MS / 1000) {
    return { status: 'FAILED', progressPercent: 100, substage: 'Transcription failed' }
  }
  if (elapsed >= COMPLETE_AFTER_MS / 1000) {
    return { status: 'COMPLETED', progressPercent: 100, substage: 'Completed' }
  }
  for (const stage of STAGES) {
    if (elapsed < stage.end) {
      const t = Math.max(0, (elapsed - stage.start) / (stage.end - stage.start))
      const pct = Math.round(stage.from + (stage.to - stage.from) * t)
      return { status: 'PROCESSING', progressPercent: pct, substage: stage.name }
    }
  }
  return { status: 'PROCESSING', progressPercent: 96, substage: 'Writing summary' }
}

/** Applies time-based transitions and persists them. Returns the fresh lecture. */
export async function syncLectureState(lecture: LectureRecord, subjectName = 'the course') {
  if (lecture.status !== 'PROCESSING') return lecture

  const progress = computeProgress(lecture)

  if (progress.status === 'COMPLETED') {
    return db.lecture.update({
      where: { id: lecture.id },
      data: {
        status: 'COMPLETED',
        markdown: generateMarkdown(lecture, subjectName),
        errorMessage: null,
      },
    })
  }
  if (progress.status === 'FAILED') {
    return db.lecture.update({
      where: { id: lecture.id },
      data: {
        status: 'FAILED',
        errorMessage:
          'Transcription service could not decode the audio stream. The recording may be corrupt or empty.',
      },
    })
  }
  return lecture
}

/* ------------------------------------------------------------------ */
/* Markdown generation                                                */
/* ------------------------------------------------------------------ */

function hash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const TEMPLATE_A = (title: string, subject: string, duration: string) => `# ${title}

> Auto-generated from lecture audio · **${subject}** · Duration ${duration}

## Overview

This lecture builds on the previous session and introduces the core framework for ${subject.toLowerCase()}. The professor spent the first segment reviewing prerequisite material, then moved into new definitions, worked through two examples, and closed with exam-relevant remarks.

## Key Concepts

1. **Fundamental definition** — the formal statement introduced today, which generalizes last week's construction. Emphasis was placed on the conditions under which the definition applies.
2. **Central theorem** — the main result of the lecture. The proof sketch was presented in three steps; the full proof is examinable.
3. **Standard technique** — a solution pattern that appears repeatedly in problem sets. Practice problems 4.1–4.6 rely on it.
4. **Common pitfall** — the mistake the professor explicitly warned about: forgetting to verify the boundary condition before applying the theorem.

## Important Formulas

- The defining relation:

\`\`\`
f(x) = Σₙ aₙ · g(x, n),  n = 0, 1, 2, …
\`\`\`

- The convergence criterion used in the worked example:

\`\`\`
|aₙ₊₁ / aₙ| → L < 1  ⟹  absolute convergence
\`\`\`

## Worked Examples

### Example 1

Given the setup from the slides, apply the standard technique directly. The key observation is that the second term vanishes, leaving a single expression to evaluate. Result: **√3 / 2**, consistent with the numerical check.

### Example 2

A trickier variant where the boundary condition fails on the first attempt. The fix is to split the domain and handle each piece separately — this is exactly the kind of question that appears in finals.

## Summary Table

| Concept | Status | Exam relevance |
| --- | --- | --- |
| Fundamental definition | Introduced today | High — memorize |
| Central theorem | Proved (sketch) | High — full proof examinable |
| Standard technique | Demonstrated ×2 | Medium — practice PS 4.1–4.6 |
| Common pitfall | Warned explicitly | Low — but costly if ignored |

## Action Items

- [ ] Re-derive the central theorem without notes
- [ ] Complete problem set 4 (due next week)
- [ ] Review last year's past paper, question 3(b) uses the same technique

---

*Generated by Lecture Notes AI — always verify formulas against the official slides.*
`

const TEMPLATE_B = (title: string, subject: string, duration: string) => `# ${title}

> Auto-generated from lecture audio · **${subject}** · Duration ${duration}

## Session Summary

The session was organized around one guiding question and three supporting arguments. Audio quality was good for the first 80 minutes; the last few minutes were partially inaudible and are marked below.

## Main Thread

### Framing

The professor opened by connecting today's material to the reading assigned last week, then posed the central question that structures the entire lecture. Note the exact wording — it reappeared verbatim in last year's exam.

### Argument 1 — Historical context

A compact overview of how the field arrived at the current formulation. Names and dates are examinable at a high level only (know the sequence, not the years).

### Argument 2 — Mechanism

The technical core of the lecture. Two mechanisms were contrasted side by side:

| Mechanism | Speed | Conditions | Example |
| --- | --- | --- | --- |
| Pathway A | Fast | Saturated regime | Case study 2.1 |
| Pathway B | Slow | Dilute regime | Case study 2.2 |

### Argument 3 — Implications

Where the professor's own research connects. This section is **not examinable** but explains why the course emphasizes the dilute regime.

> ⚠️ Audio note: the final 3 minutes were noisy. The last slide reference was reconstructed from the slide deck — verify against the uploaded PDF.

## Terminology Introduced

- **Term 1** — precise definition given; contrast with the colloquial usage
- **Term 2** — a family of related concepts; know which is which
- **Term 3** — only used in the supplementary reading

## Study Checklist

- [ ] Summarize the three arguments in your own words
- [ ] Re-draw the comparison table from memory
- [ ] Skim the supplementary reading, focus on §3
- [ ] Prepare one discussion question for the seminar

---

*Generated by Lecture Notes AI — always verify against the official slides.*
`

const TEMPLATE_C = (title: string, subject: string, duration: string) => `# ${title}

> Auto-generated from lecture audio · **${subject}** · Duration ${duration}

## Lecture Outline

1. Recap and motivation (≈ 10 min)
2. Core framework (≈ 40 min)
3. Applications and worked problems (≈ 25 min)
4. Administrivia and deadlines (≈ 5 min)

## Detailed Notes

### 1. Recap and motivation

The lecture begins by resolving a question left open last time: why the naive approach fails. The counterexample from the slides is worth copying into your notes — it is the cleanest way to remember the motivation for the general theory.

### 2. Core framework

The formal machinery was introduced in three layers:

\`\`\`python
# Sketch of the algorithm presented in lecture
def solve(instance):
    model = build_model(instance)      # step 1: formalize
    reduced = simplify(model)           # step 2: reduce
    return search(reduced, strategy="A*")  # step 3: search
\`\`\`

**Key insight:** the reduction in step 2 is what gives the speedup — the search itself is standard. Complexity drops from exponential to polynomial for well-formed inputs.

### 3. Applications

Two worked problems. The first was a direct application; the second required a non-obvious modeling choice that the professor flagged as "the kind of leap you need to make on the exam."

### 4. Administrivia

- Problem set due **Friday 17:00**
- Office hours moved to Thursday
- Next week: guest lecture, no tutorial

## Notation Cheat Sheet

| Symbol | Meaning | Introduced |
| --- | --- | --- |
| ⟨s, a⟩ | State-action pair | Week 3 |
| V*(s) | Optimal value function | Today |
| γ | Discount factor | Week 4 |

## Questions Raised in Lecture

- Does the reduction preserve optimality, or only feasibility? *(Answer: optimality — proof next lecture.)*
- What happens with partial observability? *(Out of scope, but see the supplementary paper.)*

---

*Generated by Lecture Notes AI — always verify against the official slides.*
`

export function generateMarkdown(
  lecture: {
    id: string
    title: string
    durationSeconds: number | null
    regenCount?: number
  },
  subjectName: string
): string {
  const duration = lecture.durationSeconds
    ? formatDuration(lecture.durationSeconds)
    : 'unknown'
  const templates = [TEMPLATE_A, TEMPLATE_B, TEMPLATE_C]
  // regenCount rotates the template so "Regenerate" yields fresh notes
  const seed = hash(lecture.id) + (lecture.regenCount ?? 0)
  const pick = templates[seed % templates.length]
  return pick(lecture.title, subjectName, duration)
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}
