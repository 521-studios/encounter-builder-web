import { useEffect, useState } from 'react'
import {
  ItemCard,
  ItemSlotPicker,
  fetchEligible,
  applyItemEffect,
  mergeItemPatches,
  customizedItem,
} from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'
import { buildItemRef } from '../itemRef.js'
import { variantIndex } from '../variants.js'

// A treasure item with rune/material/spell composition — the item analog of
// MonsterView. The library owns the machinery (eligible/apply + the ItemSlotPicker);
// this wires it to the web (signed POST) and persists the result as a derived
// ContentRef on the treasure line:
//   pristine  { game_id }
//   derived   { base:{game_id}, modifications:[{effect_game_id,effect_name,grade}], json:<resolved> }
//
// The applied-effect stack is reconstructed on mount by re-applying the stored
// modifications, so remove/clear, the custom name, and change-highlighting survive a
// reload. Composition is opt-in behind a "Customize" toggle (Devon's flow: select →
// Customize → panel); a plain catalog item just renders its card until then.
export default function ItemComposeView({ treasure, onChange, disabled }) {
  const ref = treasure.ref || {}
  const baseGameId = ref.base?.game_id || ref.game_id || ''

  const [base, setBase] = useState(null)
  const [stack, setStack] = useState([]) // [{ effect:{game_id,name}, grade, item, patches }]
  const [name, setName] = useState('')
  const [eligibility, setEligibility] = useState(null)
  const [customizing, setCustomizing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Load the base item and rebuild the applied-effect stack from the ref by
  // re-applying each stored modification (mirrors MonsterView). Deriving fresh gives
  // current change-highlighting and lets the GM keep stacking.
  useEffect(() => {
    let alive = true
    setBase(null)
    setStack([])
    setName('')
    setCustomizing(false)
    setEligibility(null)
    setError(null)
    ;(async () => {
      try {
        const b = await pfsrd2.entryFull(baseGameId)
        if (!alive) return
        setBase(b)
        let current = b
        const rebuilt = []
        for (const m of ref.modifications || []) {
          const res = await applyItemEffect({
            post: pfsrd2.applyItemPost,
            itemGameId: baseGameId,
            item: current,
            effectGameId: m.effect_game_id,
            grade: m.grade ?? undefined,
          })
          rebuilt.push({
            effect: { game_id: m.effect_game_id, name: m.effect_name || m.effect_game_id },
            grade: m.grade ?? null,
            item: res.item,
            patches: res.patches,
          })
          current = res.item
        }
        if (!alive) return
        setStack(rebuilt)
        // A stored custom name (in ref.json) that differs from the base seeds the field.
        const storedName = ref.json?.name
        if (storedName && storedName !== b.name) setName(storedName)
        if (rebuilt.length) setCustomizing(true) // already composed → show the panel
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
    }
    // Rebuild only when the BASE item changes, not on our own ref writes.
  }, [baseGameId]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = customizedItem(base, stack, name)
  const variants = (current?.stat_block && current.stat_block.variants) || []
  const vIndex = variantIndex(variants, treasure.variant)

  function persist(nextStack, nextName) {
    onChange({ ...treasure, ref: buildItemRef(baseGameId, nextStack, nextName) })
  }

  async function startCustomize() {
    setCustomizing(true)
    setError(null)
    try {
      const elig = await fetchEligible({ get: pfsrd2.templatesGet, itemGameId: baseGameId })
      if (!elig) throw new Error('Could not load what can be applied to this item.')
      setEligibility(elig)
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function applyEffect(effectGameId, effectName, grade) {
    const currentItem = stack.length ? stack[stack.length - 1].item : base
    setBusy(true)
    setError(null)
    try {
      const res = await applyItemEffect({
        post: pfsrd2.applyItemPost,
        itemGameId: baseGameId,
        item: currentItem,
        effectGameId,
        grade,
      })
      const next = [...stack, { effect: { game_id: effectGameId, name: effectName }, grade: grade ?? null, item: res.item, patches: res.patches }]
      setStack(next)
      persist(next, name)
    } catch (e) {
      // A boundary refusal (409) is a GM-facing "not allowed", not a crash.
      setError(e.status === 409 ? `Not allowed: ${e.body || 'ineligible'}` : errorMessage(e))
    }
    setBusy(false)
  }

  function onRemoveLast() {
    const next = stack.slice(0, -1)
    setStack(next)
    persist(next, name)
  }
  function onClearAll() {
    setStack([])
    persist([], name)
  }
  function onNameChange(v) {
    setName(v)
    persist(stack, v)
  }

  if (error) return <p className="error">Could not load item: {error}</p>
  if (!current) return <p className="muted">Loading item…</p>

  const needsPick = variants.length > 1 && vIndex < 0 && !disabled && !customizing
  return (
    <div className="itemcard">
      {!disabled && !customizing && (
        <button type="button" className="link" data-testid="customize-item" onClick={startCustomize}>
          Customize
        </button>
      )}
      {customizing && eligibility && !disabled && (
        <ItemSlotPicker
          eligibility={eligibility}
          name={name}
          onNameChange={onNameChange}
          stack={stack.map((s) => ({ applied: s.effect.name }))}
          loading={busy}
          onApply={(candidate, { grade }) => applyEffect(candidate.game_id, candidate.name, grade)}
          onApplySpell={(spell) => applyEffect(spell.game_id, spell.name, undefined)}
          onRemoveLast={onRemoveLast}
          onClearAll={onClearAll}
          searchSpells={pfsrd2.suggestSpells}
        />
      )}
      {needsPick ? <p className="variant-hint">Choose a version below to lock this item in.</p> : null}
      <ItemCard
        data={current}
        patches={mergeItemPatches(stack)}
        variant={vIndex}
        onVariantChange={
          disabled ? undefined : (i) => onChange({ ...treasure, variant: variants[i] ? variants[i].name : '' })
        }
      />
    </div>
  )
}
