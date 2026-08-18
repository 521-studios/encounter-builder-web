import { skillCheckLabel, SKILL_CHECK_DEGREES, SKILL_CHECK_DEGREE_LABELS } from '../model.js'
import WikiMarkdown from './WikiMarkdown.jsx'

// One structured skill check: skill + DC (+ required successes), an effect (markdown),
// optional alternative skills (OR), and per-degree outcomes. Edits flow through onChange
// with the whole updated check; onRemove deletes it. Read-only when disabled (released).
export default function SkillCheckEditor({ value, disabled, siblings, onOpenEncounter, onChange, onRemove }) {
  const s = value
  const set = (fields) => onChange({ ...s, ...fields })
  const addAlt = () => set({ alternatives: [...(s.alternatives || []), { skill: '', dc: 0 }] })
  const setAlt = (j, fields) => set({ alternatives: (s.alternatives || []).map((a, k) => (k === j ? { ...a, ...fields } : a)) })
  const removeAlt = (j) => set({ alternatives: (s.alternatives || []).filter((_, k) => k !== j) })
  const setOutcome = (degree, text) => set({ outcomes: { ...(s.outcomes || {}), [degree]: text } })
  return (
    <div className="skill-check" data-testid="skill-check">
      {disabled ? (
        <div className="skill-check-head">
          <span className="check-label" data-testid="check-label">{skillCheckLabel(s)}</span>
        </div>
      ) : (
        <div className="skill-check-head">
          <input
            className="check-skill"
            aria-label="check skill"
            placeholder="Skill (e.g. Perception)"
            value={s.skill || ''}
            onChange={(e) => set({ skill: e.target.value })}
          />
          <input
            type="number"
            min="1"
            step="1"
            className="check-dc"
            aria-label="check DC"
            placeholder="DC"
            value={s.dc || ''}
            onChange={(e) => set({ dc: Number(e.target.value) })}
          />
          <input
            type="number"
            min="1"
            step="1"
            className="check-successes"
            aria-label="required successes"
            title="Required successes to resolve (e.g. 4 successful checks)"
            placeholder="×1"
            value={s.successes || ''}
            onChange={(e) => set({ successes: Number(e.target.value) })}
          />
          <button type="button" className="link danger" onClick={onRemove}>
            remove
          </button>
        </div>
      )}
      {!disabled ? (
        <textarea
          className="check-description"
          aria-label="check effect"
          placeholder="What it reveals / does (markdown)"
          value={s.description || ''}
          onChange={(e) => set({ description: e.target.value })}
        />
      ) : s.description ? (
        <WikiMarkdown text={s.description} encounters={siblings} onOpenEncounter={onOpenEncounter} />
      ) : null}

      {/* Alternative skills (OR) — a check the party can pass with another skill+DC. */}
      {!disabled && (
        <div className="check-alts">
          {(s.alternatives || []).map((a, j) => (
            <div className="check-alt" data-testid="check-alt" key={j}>
              <span className="muted">or</span>
              <input
                className="check-skill"
                aria-label="alternative skill"
                placeholder="Skill"
                value={a.skill || ''}
                onChange={(e) => setAlt(j, { skill: e.target.value })}
              />
              <input
                type="number"
                min="1"
                step="1"
                className="check-dc"
                aria-label="alternative DC"
                placeholder="DC"
                value={a.dc || ''}
                onChange={(e) => setAlt(j, { dc: Number(e.target.value) })}
              />
              <button type="button" className="link danger" onClick={() => removeAlt(j)}>remove</button>
            </div>
          ))}
          <button type="button" className="link add-alt" onClick={addAlt}>+ alternative skill</button>
        </div>
      )}

      {/* Per-degree-of-success outcomes (native details — open when any is set). */}
      {!disabled && (
        // Uncontrolled <details> — a native toggle React never re-collapses; the
        // summary shows how many degrees are set so it's discoverable when closed.
        <details className="check-outcomes">
          <summary>
            Per-degree outcomes
            {(() => {
              const n = SKILL_CHECK_DEGREES.filter((d) => (s.outcomes?.[d] || '').trim()).length
              return n ? ` (${n} set)` : ''
            })()}
          </summary>
          {SKILL_CHECK_DEGREES.map((d) => (
            <label className="outcome field" key={d}>
              <span>{SKILL_CHECK_DEGREE_LABELS[d]}</span>
              <textarea
                aria-label={`${SKILL_CHECK_DEGREE_LABELS[d]} outcome`}
                value={s.outcomes?.[d] || ''}
                onChange={(e) => setOutcome(d, e.target.value)}
              />
            </label>
          ))}
        </details>
      )}
      {disabled && s.outcomes && SKILL_CHECK_DEGREES.some((d) => (s.outcomes[d] || '').trim()) && (
        <ul className="check-outcomes-ro" data-testid="check-outcomes-ro">
          {SKILL_CHECK_DEGREES.filter((d) => (s.outcomes[d] || '').trim()).map((d) => (
            <li key={d}><strong>{SKILL_CHECK_DEGREE_LABELS[d]}</strong> {s.outcomes[d]}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
