import { useEffect, useState } from 'react'
import {
  CreatureStatBlock,
  TemplatePicker,
  listTemplates,
  applyTemplate,
  mergePatches,
  appliedTemplates,
} from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'
import { buildMonsterRef } from '../monsterRef.js'

// The monster stat block with template application. The library owns the
// machinery (list/apply/merge + the picker); this component wires it to the web
// (signed fetch) and persists the result as a derived ContentRef on the monster:
//   pristine  { game_id }
//   derived   { base:{game_id}, modifications:[{template_game_id,template_name}], json:<resolved> }
//
// The applied-template stack is reconstructed on mount by re-applying the stored
// modifications, so remove/clear and change-highlighting work after a reload.
// (Selections/SelectionsPanel are deferred per the v2 design's open decision 2.)
export default function MonsterView({ monster, onChange, disabled }) {
  const ref = monster.ref || {}
  const baseGameId = ref.base?.game_id || ref.game_id || ''

  const [base, setBase] = useState(null)
  const [stack, setStack] = useState([]) // [{ template:{game_id,name}, patches, creature, templateData }]
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Load the base creature and rebuild the applied-template stack from the ref by
  // re-applying each stored modification (N sequential /templates/apply calls per
  // open). Deliberate: re-deriving gives fresh change-highlighting and lets the GM
  // keep stacking. The persisted ref.json is the snapshot downstream/released
  // consumers read — the editor showing a fresh derive of the latest data is the
  // intended authoring behavior.
  useEffect(() => {
    let alive = true
    setBase(null)
    setStack([])
    setError(null)
    ;(async () => {
      try {
        const b = await pfsrd2.entryFull(baseGameId)
        if (!alive) return
        setBase(b)
        let current = b
        const rebuilt = []
        for (const m of ref.modifications || []) {
          const applied = await applyTemplate({
            post: pfsrd2.applyTemplatePost,
            get: pfsrd2.templatesGet,
            creature: current,
            templateGameId: m.template_game_id,
          })
          rebuilt.push({
            template: { game_id: m.template_game_id, name: m.template_name || m.template_game_id },
            patches: applied.patches,
            creature: applied.creature,
            templateData: applied.templateData,
          })
          current = applied.creature
        }
        if (alive) setStack(rebuilt)
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
    }
    // Rebuild only when the BASE creature changes, not on our own ref writes.
  }, [baseGameId]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = stack.length ? stack[stack.length - 1].creature : base

  // Templates applicable to the current creature's edition.
  useEffect(() => {
    if (!current) return
    let alive = true
    listTemplates({ get: pfsrd2.templatesGet, edition: current.edition })
      .then((t) => alive && setTemplates(t))
      .catch(() => alive && setTemplates([]))
    return () => {
      alive = false
    }
  }, [current?.edition])

  // Write the stack back onto the monster ref (pristine when empty, else derived).
  function persist(nextStack) {
    onChange({ ...monster, ref: buildMonsterRef(baseGameId, nextStack) })
  }

  async function onApply(template) {
    setBusy(true)
    setError(null)
    try {
      const applied = await applyTemplate({
        post: pfsrd2.applyTemplatePost,
        get: pfsrd2.templatesGet,
        creature: current,
        templateGameId: template.game_id,
      })
      const next = [
        ...stack,
        {
          template: { game_id: template.game_id, name: template.name },
          patches: applied.patches,
          creature: applied.creature,
          templateData: applied.templateData,
        },
      ]
      setStack(next)
      persist(next)
    } catch (e) {
      setError(errorMessage(e))
    }
    setBusy(false)
  }

  function onRemoveLast() {
    const next = stack.slice(0, -1)
    setStack(next)
    persist(next)
  }
  function onClearAll() {
    setStack([])
    persist([])
  }

  if (error) return <p className="error">Could not load stat block: {error}</p>
  if (!current) return <p className="muted">Loading stat block…</p>

  return (
    <div className="monster-view">
      {!disabled && (
        <TemplatePicker
          templates={templates}
          stack={stack}
          onApply={onApply}
          onRemoveLast={onRemoveLast}
          onClearAll={onClearAll}
          loading={busy}
        />
      )}
      <div className="statblock">
        <CreatureStatBlock
          data={current}
          patches={mergePatches(stack)}
          appliedTemplates={appliedTemplates(stack)}
          onRoll={() => {}}
          onLoadMonster={() => {}}
          imageBaseUrl="/api/pfsrd2/images"
        />
      </div>
    </div>
  )
}
