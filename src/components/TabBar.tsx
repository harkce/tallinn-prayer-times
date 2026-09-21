import { NavLink } from "react-router-dom";

const ICON_TODAY = (
  <svg className="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.5v4.75l3 1.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ICON_MONTH = (
  <svg className="tab-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3 10h18" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export function TabBar() {
  return (
    <div id="tabbar-root">
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => `tab${isActive ? " is-active" : ""}`}>
          {ICON_TODAY}
          <span className="tab-label">Today</span>
        </NavLink>
        <NavLink to="/month" className={({ isActive }) => `tab${isActive ? " is-active" : ""}`}>
          {ICON_MONTH}
          <span className="tab-label">Month</span>
        </NavLink>
      </nav>
    </div>
  );
}
