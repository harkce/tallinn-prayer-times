/**
 * Size the app shell to the visible viewport. Only raise --sab-floor when
 * we can measure real bottom chrome overlapping the layout viewport.
 * Do NOT invent a constant Android floor — that creates a gap when the
 * webview already sits above the system nav.
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
  if (ANDROID && isStandalone() && vv) {
    const gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    if (gap >= 20) floor = Math.round(gap);
  }
  root.style.setProperty("--sab-floor", `${floor}px`);
}

syncViewportInsets();
window.addEventListener("resize", syncViewportInsets);
window.visualViewport?.addEventListener("resize", syncViewportInsets);
window.visualViewport?.addEventListener("scroll", syncViewportInsets);
window.matchMedia("(display-mode: standalone)").addEventListener?.("change", syncViewportInsets);
