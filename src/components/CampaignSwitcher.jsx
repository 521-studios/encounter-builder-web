// The sidebar's campaign switcher: shows the active campaign's name; clicking it
// returns to the campaign picker to switch. Sits at the top of the sidebar.
export default function CampaignSwitcher({ campaign, onSwitch }) {
  return (
    <button
      className="campaign-switcher"
      data-testid="campaign-switcher"
      onClick={onSwitch}
      title="Switch campaign"
    >
      <span className="campaign-switcher-name">{campaign.name}</span>
      <span className="campaign-switcher-hint">Switch ▾</span>
    </button>
  )
}
