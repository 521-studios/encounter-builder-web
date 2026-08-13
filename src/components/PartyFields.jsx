// Shared editor for a layer's expected-party override (party_level + party_size).
// Used by the campaign detail page, the chapter detail page, and the encounter
// editor. Each input is empty when this layer has no override; its placeholder
// shows the value inherited from the layer(s) below (resolved by the caller), and
// a hint names the source. Leaving a field empty saves it as "inherit".
//
// value:     { party_level, party_size } (nullable) — this layer's raw override.
// inherited: { level, size, levelSource, sizeSource } — what an empty field falls
//            back to (from resolveParty over the layers below this one).
// onChange:  (next) => void with the updated { party_level, party_size }.
import { sourceLabel } from '../party.js'

export default function PartyFields({ value, inherited, onChange, disabled, inheritedError }) {
  const set = (field, raw) => {
    const n = raw === '' ? null : Number(raw)
    onChange({ ...value, [field]: n })
  }
  return (
    <fieldset className="party-fields">
      <legend>Expected party</legend>
      {inheritedError && (
        <p className="error party-inherit-error" role="alert">
          Couldn’t load inherited party values — the defaults shown may be inaccurate.
        </p>
      )}
      <div className="line">
        <label className="field">
          <span>Level</span>
          <input
            type="number"
            min="1"
            max="20"
            step="1"
            aria-label="party level"
            value={value?.party_level ?? ''}
            placeholder={String(inherited.level)}
            disabled={disabled}
            onChange={(e) => set('party_level', e.target.value)}
          />
          <span className="party-inherit-hint muted">
            {value?.party_level == null
              ? `inherited from ${sourceLabel(inherited.levelSource)}`
              : 'override'}
          </span>
        </label>
        <label className="field">
          <span>PCs</span>
          <input
            type="number"
            min="1"
            step="1"
            aria-label="party size"
            value={value?.party_size ?? ''}
            placeholder={String(inherited.size)}
            disabled={disabled}
            onChange={(e) => set('party_size', e.target.value)}
          />
          <span className="party-inherit-hint muted">
            {value?.party_size == null
              ? `inherited from ${sourceLabel(inherited.sizeSource)}`
              : 'override'}
          </span>
        </label>
      </div>
    </fieldset>
  )
}
