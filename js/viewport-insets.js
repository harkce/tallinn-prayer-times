/**
 * Android standalone PWAs often report env(safe-area-inset-bottom) as 0
 * even with a 3-button system nav. Raise --sab-floor and sync --app-vh so
 * the tab bar stays fully visible above system chrome.
 */
const ANDROID = /Android/i.test(navigator.userAgent);

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true
  );
}

function syncViewportInsets() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const height = vv && vv.height > 0 ? vv.height : window.innerHeight;
  root.style.setProperty("--app-vh", `${Math.round(height)}px`);

  let floor = 0;
  if (ANDROID && isStandalone()) {
    // 3-button nav often needs ~56–64px; 48 still clipped on device.
    floor = 64;
    if (vv) {
      const gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      if (gap >= 24) floor = Math.max(floor, Math.round(gap));
    }
  }
  root.style.setProperty("--sab-floor", `${floor}px`);
}

syncViewportInsets();
window.addEventListener("resize", syncViewportInsets);
window.visualViewport?.addEventListener("resize", syncViewportInsets);
window.visualViewport?.addEventListener("scroll", syncViewportInsets);
window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncViewportInsets);
