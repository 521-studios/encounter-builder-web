// The sidebar's campaign header. Clicking the campaign NAME opens its detail
// (party defaults + treasure summary) — direct manipulation, no separate
// "settings" link. A distinct "Switch ▾" control returns to the campaign picker.
// Rendered as the sidebar's <h2> so the heading outline stays h1 (app) → h2
// (campaign) → h3 (Encounters).
export default function CampaignSwitcher({ campaign, onSwitch, onSettings }) {
  return (
    <div className="campaign-switcher-block">
      <h2 className="campaign-switcher-heading">
        <button
          type="button"
          className="campaign-name-open"
          data-testid="campaign-settings"
          onClick={onSettings}
          aria-label={`Open campaign ${campaign.name}`}
        >
          {campaign.name}
        </button>
      </h2>
      <button
        type="button"
        className="link campaign-switch"
        data-testid="campaign-switcher"
        onClick={onSwitch}
        aria-label={`Switch campaign (current: ${campaign.name})`}
      >
        Switch <span aria-hidden="true">▾</span>
      </button>
    </div>
  )
}
