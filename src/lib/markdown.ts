/**
 * Deterministic markdown renderer — no AI.
 * Converts the synthesis JSON into the note template.
 */

interface SynthesisData {
  lectureTitle?: string
  summary?: string
  keyTakeaways?: string[]
  topics?: Array<{
    title?: string
    summary?: string
    concepts?: Array<{ term?: string; definition?: string }>
    examples?: string[]
    processes?: Array<{ name?: string; steps?: string[] }>
    warnings?: Array<{ issue?: string; advice?: string }>
    terminology?: Array<{ term?: string; meaning?: string }>
  }>
  assignments?: Array<{ description?: string }>
  examHints?: string[]
  crossTopicRelationships?: Array<{ from?: string; to?: string; relation?: string }>
}

export function renderNotes(data: Record<string, unknown>): string {
  const d = data as SynthesisData
  const parts: string[] = []

  const title = d.lectureTitle || 'Untitled Lecture'
  parts.push(`# ${title}`)

  if (d.summary) {
    parts.push('')
    parts.push('## Summary')
    parts.push(d.summary)
  }

  if (d.keyTakeaways && d.keyTakeaways.length > 0) {
    parts.push('')
    parts.push('## Key Takeaways')
    for (const tk of d.keyTakeaways) {
      parts.push(`- ${tk}`)
    }
  }

  if (d.topics) {
    for (const topic of d.topics) {
      if (!topic.title) continue
      parts.push('')
      parts.push(`## ${topic.title}`)

      if (topic.summary) {
        parts.push('')
        parts.push('### Summary')
        parts.push(topic.summary)
      }

      if (topic.concepts && topic.concepts.length > 0) {
        parts.push('')
        parts.push('### Concepts')
        for (const c of topic.concepts) {
          if (c.term && c.definition) {
            parts.push(`- **${c.term}:** ${c.definition}`)
          }
        }
      }

      if (topic.examples && topic.examples.length > 0) {
        parts.push('')
        parts.push('### Examples')
        for (const ex of topic.examples) {
          parts.push(`- ${ex}`)
        }
      }

      if (topic.processes && topic.processes.length > 0) {
        parts.push('')
        parts.push('### Processes')
        for (const proc of topic.processes) {
          if (proc.name) {
            parts.push(`**${proc.name}**`)
            if (proc.steps) {
              for (let i = 0; i < proc.steps.length; i++) {
                parts.push(`${i + 1}. ${proc.steps[i]}`)
              }
            }
          }
        }
      }

      if (topic.warnings && topic.warnings.length > 0) {
        parts.push('')
        parts.push('### Warnings & Common Mistakes')
        for (const w of topic.warnings) {
          if (w.issue && w.advice) {
            parts.push(`- **${w.issue}:** ${w.advice}`)
          }
        }
      }

      if (topic.terminology && topic.terminology.length > 0) {
        parts.push('')
        parts.push('### Terminology')
        for (const t of topic.terminology) {
          if (t.term && t.meaning) {
            parts.push(`- **${t.term}:** ${t.meaning}`)
          }
        }
      }
    }
  }

  if (d.assignments && d.assignments.length > 0) {
    parts.push('')
    parts.push('## Assignments')
    for (const a of d.assignments) {
      if (a.description) {
        parts.push(`- [ ] ${a.description}`)
      }
    }
  }

  if (d.examHints && d.examHints.length > 0) {
    parts.push('')
    parts.push('## Exam Hints')
    for (const hint of d.examHints) {
      parts.push(`- ${hint}`)
    }
  }

  if (d.crossTopicRelationships && d.crossTopicRelationships.length > 0) {
    parts.push('')
    parts.push('## Cross-Topic Relationships')
    for (const r of d.crossTopicRelationships) {
      if (r.from && r.to && r.relation) {
        parts.push(`- **${r.from} → ${r.to}:** ${r.relation}`)
      }
    }
  }

  return parts.join('\n') + '\n'
}
