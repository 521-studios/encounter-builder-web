import { useEffect, useState } from 'react'
import {
  ItemCard,
  ItemSlotPicker,
  fetchEligible,
  applyItemEffect,
  mergeItemPatches,
  customizedItem,
  itemPriceCp,
} from '@521studios/pfsrd2-display'
import { pfsrd2 } from '../api/pfsrd2.js'
import { errorMessage } from '../api/errors.js'
import { buildItemRef } from '../itemRef.js'
import { variantIndex } from '../variants.js'

// Injectable dependencies — the async client/library calls and the two library
// components this view drives. Production uses these real ones; a test injects fakes
// (Node 24 has no unflagged test:mock.module, so this DI bag is the seam). The pure
// transforms customizedItem/mergeItemPatches stay imported directly — they're tolerant
// of a minimal item, so nothing to fake. (j54u)
const defaultDeps = {
  api: pfsrd2, // entryFull / applyItemPost / templatesGet / suggestSpells
  applyItemEffect,
  fetchEligible,
  SlotPicker: ItemSlotPicker,
  Card: ItemCard,
}

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
export default function ItemComposeView({ treasure, onChange, disabled, deps = defaultDeps }) {
  const { api, applyItemEffect, fetchEligible, SlotPicker, Card } = deps
  const ref = treasure.ref || {}
  const baseGameId = ref.base?.game_id || ref.game_id || ''

  const [base, setBase] = useState(null)
  const [stack, setStack] = useState([]) // [{ effect:{game_id,name}, grade, item, patches }]
  const [name, setName] = useState('')
  const [eligibility, setEligibility] = useState(null)
  const [customizing, setCustomizing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null) // FATAL: the base item couldn't load — nothing to show
  const [applyError, setApplyError] = useState(null) // non-fatal: a customize/apply refusal, shown inline

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
    setApplyError(null)
    ;(async () => {
      try {
        const b = await api.entryFull(baseGameId)
        if (!alive) return
        setBase(b)
        let current = b
        const rebuilt = []
        for (const m of ref.modifications || []) {
          const res = await applyItemEffect({
            post: api.applyItemPost,
            itemGameId: baseGameId,
            item: current,
            effectGameId: m.effect_game_id,
            grade: m.grade ?? undefined,
          })
          rebuilt.push({
            effect: { game_id: m.effect_game_id, name: m.effect_name || m.effect_game_id },
            applied: res.applied || m.effect_name || m.effect_game_id, // label for the picker tag + patch attribution
            grade: m.grade ?? null,
            price_cp: typeof m.price_cp === 'number' ? m.price_cp : null, // persisted component price (4den)
            price_mode: m.price_mode || 'add', // how it combines into the total (qeai); eligibility isn't loaded on rebuild
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
        // A composed line renders collapsed on load — the resolved card (name +
        // highlighted changes, from the rebuilt stack) plus a Customize button to
        // re-open the panel. Auto-expanding every treasure line's rune browser (and
        // eagerly fetching eligibility for each) would be cluttered and slow.
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

  // The copper price of an applied rune at a chosen grade, from the loaded eligibility
  // (grades now carry price_cp). The picker passes grade = the grade's LEVEL; a
  // single-grade rune may apply with no level, so fall back to its only grade. null when
  // the rune/grade or its price can't be resolved, which leaves the whole line unpriced
  // rather than undercounting. (4den)
  function gradePriceCp(effectGameId, gradeLevel) {
    const runes = eligibility?.runes
    if (!runes) return null
    const rune = [...(runes.fundamental || []), ...(runes.property || [])].find((r) => r.game_id === effectGameId)
    const grades = rune?.grades || []
    const g = (gradeLevel != null && grades.find((x) => x.level === gradeLevel)) || (grades.length === 1 ? grades[0] : null)
    return g && typeof g.price_cp === 'number' ? g.price_cp : null
  }

  // The copper price of a spell placed in a scroll/wand holder: the holder entry
  // carries a price variant per spell rank (Magic Scroll → {spell_rank:3, price:"30 gp"}),
  // so the composed item's price IS that rank's variant price (non-additive — the
  // generic holder has no standalone price). null for a holder with no matching rank
  // variant (a staff: tier-priced, not per-rank — deferred to its own follow-up), which
  // leaves the line unpriced rather than mis-valuing it. (qeai)
  function holderRankPriceCp(rank) {
    if (rank == null) return null
    const variants = base?.stat_block?.variants || []
    const v = variants.find((x) => x.spell_rank === rank)
    return v ? itemPriceCp(base, v.name) : null
  }

  // The base item's price in copper, summed with the applied runes' prices to give the
  // composed total that buildItemRef stores for the treasure budget. Honors the selected
  // variant like the non-derived budget path (budget.js itemPriceCp(entry, line.variant)).
  const basePriceCp = base ? itemPriceCp(base, treasure.variant || undefined) : null

  function persist(nextStack, nextName) {
    onChange({ ...treasure, ref: buildItemRef(baseGameId, nextStack, nextName, basePriceCp) })
  }

  async function startCustomize() {
    setCustomizing(true)
    setApplyError(null)
    try {
      const elig = await fetchEligible({ get: api.templatesGet, itemGameId: baseGameId })
      if (!elig) throw new Error('Could not load what can be applied to this item.')
      setEligibility(elig)
    } catch (e) {
      // Non-fatal: the base item still renders. Drop back out of customize mode so the
      // Customize button reappears (the picker never opened — eligibility is null), giving
      // the GM a retry affordance alongside the inline error.
      setCustomizing(false)
      setApplyError(errorMessage(e))
    }
  }

  // spellRank is set only when applying a spell to a holder (scroll/wand/staff); it
  // switches pricing from additive rune grades to the holder's per-rank variant price.
  async function applyEffect(effectGameId, effectName, grade, spellRank = null) {
    const currentItem = stack.length ? stack[stack.length - 1].item : base
    setBusy(true)
    setApplyError(null)
    try {
      const res = await applyItemEffect({
        post: api.applyItemPost,
        itemGameId: baseGameId,
        item: currentItem,
        effectGameId,
        grade,
      })
      // A spell sets the whole price (a scroll/wand rank price); a rune adds to the base.
      const isSpell = spellRank != null
      const next = [
        ...stack,
        {
          effect: { game_id: effectGameId, name: effectName },
          applied: res.applied || effectName, // the resolved label (e.g. "Weapon Potency (+1)")
          grade: grade ?? null,
          price_cp: isSpell ? holderRankPriceCp(spellRank) : gradePriceCp(effectGameId, grade),
          price_mode: isSpell ? 'set' : 'add', // component price for the treasure total (4den/qeai)
          item: res.item,
          patches: res.patches,
        },
      ]
      setStack(next)
      persist(next, name)
    } catch (e) {
      // A boundary refusal (409) is a GM-facing "not allowed", not a crash — surface it
      // inline (the compose panel + item card stay put) rather than replacing the view.
      setApplyError(e.status === 409 ? `Not allowed: ${e.body || 'ineligible'}` : errorMessage(e))
    }
    setBusy(false)
  }

  // The custom name belongs to the COMPOSED item (buildItemRef only persists it with
  // a modification). So when the composition empties, clear the name too — otherwise
  // the field would show a name that silently won't survive reload.
  function onRemoveLast() {
    const next = stack.slice(0, -1)
    const nextName = next.length ? name : ''
    setStack(next)
    if (!next.length) setName('')
    persist(next, nextName)
  }
  function onClearAll() {
    setStack([])
    setName('')
    persist([], '')
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
      {applyError && (
        <p className="error" data-testid="apply-error">
          {applyError}
        </p>
      )}
      {customizing && eligibility && !disabled && (
        <SlotPicker
          eligibility={eligibility}
          name={name}
          onNameChange={onNameChange}
          stack={stack}
          loading={busy}
          onApply={(candidate, { grade }) => applyEffect(candidate.game_id, candidate.name, grade)}
          // The spell search row carries `level` = the spell's rank, which prices the
          // scroll/wand by its matching rank variant (qeai).
          onApplySpell={(spell) => applyEffect(spell.game_id, spell.name, undefined, spell.level ?? null)}
          onRemoveLast={onRemoveLast}
          onClearAll={onClearAll}
          searchSpells={api.suggestSpells}
        />
      )}
      {needsPick ? <p className="variant-hint">Choose a version below to lock this item in.</p> : null}
      <Card
        data={current}
        patches={mergeItemPatches(stack)}
        variant={vIndex}
        onVariantChange={
          disabled
            ? undefined
            : (i) => {
                const variantName = variants[i] ? variants[i].name : ''
                // A composed line bakes its price into ref.price_cp, which the budget reads
                // directly (ignoring line.variant) — so re-derive it against the newly chosen
                // variant's base price. A pristine line is budgeted via line.variant, so its
                // ref is untouched. (4den)
                const ref = stack.length
                  ? buildItemRef(baseGameId, stack, name, base ? itemPriceCp(base, variantName || undefined) : null)
                  : treasure.ref
                onChange({ ...treasure, variant: variantName, ref })
              }
        }
      />
    </div>
  )
}
