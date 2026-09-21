/**
 * Android standalone PWAs often report env(safe-area-inset-bottom) as 0
 * even with a 3-button system nav. Prefer a measured visualViewport gap;
 * fall back to 48px (not 64) so the tab bar sits flush for the thumb.
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
    // Prefer measured occlusion; 48px floor when env/vv lie (designer: 48–56).
    floor = 48;
    if (vv) {
      const gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      if (gap >= 20) floor = Math.round(gap);
    }
  }
  root.style.setProperty("--sab-floor", `${floor}px`);
}

syncViewportInsets();
window.addEventListener("resize", syncViewportInsets);
window.visualViewport?.addEventListener("resize", syncViewportInsets);
window.visualViewport?.addEventListener("scroll", syncViewportInsets);
window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncViewportInsets);
