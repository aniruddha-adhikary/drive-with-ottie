import { parseStem } from '../content/lint'
import { termById } from '../content/terms'

interface Props {
  text: string
  onTerm?: (termId: string) => void
  /** Render terms as plain text (mock exam). */
  plain?: boolean
}

/** Renders a stem, turning {{term}} markers into dashed-underlined tappable tokens. */
export function TermText({ text, onTerm, plain = false }: Props) {
  return (
    <>
      {parseStem(text).map((part, i) => {
        if (part.kind === 'text') return <span key={i}>{part.text}</span>
        const term = termById.get(part.termId)
        const label = term?.name ?? part.termId.replace(/_/g, ' ')
        if (plain || !term) return <span key={i}>{label}</span>
        return (
          <button key={i} type="button" className="term" onClick={() => onTerm?.(part.termId)} aria-label={`Explain ${label}`}>
            {label}
          </button>
        )
      })}
    </>
  )
}
