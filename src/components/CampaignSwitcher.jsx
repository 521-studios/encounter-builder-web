// The sidebar's campaign switcher: shows the active campaign's name; clicking it
// returns to the campaign picker to switch. Rendered as the sidebar's <h2> so the
// heading outline stays h1 (app) → h2 (campaign) → h3 (Encounters). Below it, a
// link opens the campaign detail page (expected-party defaults).
export default function CampaignSwitcher({ campaign, onSwitch, onSettings }) {
  return (
    <div className="campaign-switcher-block">
      <h2 className="campaign-switcher-heading">
        <button
          className="campaign-switcher"
          data-testid="campaign-switcher"
          onClick={onSwitch}
          aria-label={`Switch campaign (current: ${campaign.name})`}
        >
          <span className="campaign-switcher-name">{campaign.name}</span>
          <span className="campaign-switcher-hint">
            Switch <span aria-hidden="true">▾</span>
          </span>
        </button>
      </h2>
      {onSettings && (
        <button type="button" className="link campaign-settings-link" data-testid="campaign-settings" onClick={onSettings}>
          ⚙ Campaign settings
        </button>
      )}
    </div>
  )
}
