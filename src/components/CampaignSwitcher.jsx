// The sidebar's campaign switcher: shows the active campaign's name; clicking it
// returns to the campaign picker to switch. Rendered as the sidebar's <h2> so the
// heading outline stays h1 (app) → h2 (campaign) → h3 (Encounters).
export default function CampaignSwitcher({ campaign, onSwitch }) {
  return (
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
  )
}
