/** Shared bottom tab bar — one markup, both screens. */
const ICON_TODAY = `<svg class="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.8"/>
  <path d="M12 7.5v4.75l3 1.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const ICON_MONTH = `<svg class="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="1.8"/>
  <path d="M3 10h18" stroke="currentColor" stroke-width="1.8"/>
  <path d="M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

/**
 * @param {"today"|"month"} active
 */
export function mountTabbar(active) {
  const root = document.getElementById("tabbar-root");
  if (!root) return;

  const todayActive = active === "today";
  root.innerHTML = `
<nav class="tabbar" aria-label="Main">
  <a class="tab${todayActive ? " is-active" : ""}" href="index.html"${todayActive ? ' aria-current="page"' : ""}>
    ${ICON_TODAY}
    <span class="tab-label">Today</span>
  </a>
  <a class="tab${!todayActive ? " is-active" : ""}" href="month.html"${!todayActive ? ' aria-current="page"' : ""}>
    ${ICON_MONTH}
    <span class="tab-label">Month</span>
  </a>
</nav>`;
}
