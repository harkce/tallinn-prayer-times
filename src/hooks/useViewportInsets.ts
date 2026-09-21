import { useEffect } from "react";

const ANDROID = /Android/i.test(navigator.userAgent);

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    // iOS Safari legacy
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Never size the shell taller than what is actually visible. */
function visibleHeight(): number {
  const vv = window.visualViewport;
  const candidates: number[] = [];
  if (vv && vv.height > 0) candidates.push(vv.height);
  if (window.innerHeight > 0) candidates.push(window.innerHeight);
  const client = document.documentElement.clientHeight;
  if (client > 0) candidates.push(client);
  if (candidates.length === 0) return 0;
  return Math.floor(Math.min(...candidates));
}

/**
 * Size the app shell to the visible viewport and only raise --sab-floor when
 * we can measure real bottom chrome overlapping the layout viewport.
 * Do NOT invent a constant Android floor — that creates a gap when the
 * webview already sits above the system nav.
 */
export function syncViewportInsets() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const height = visibleHeight();
  if (height > 0) {
    root.style.setProperty("--app-vh", `${height}px`);
  }

  let floor = 0;
  if (vv) {
    // Layout viewport below the visual viewport = browser/system chrome.
    const occluded = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
    if (occluded >= 8) floor = Math.round(occluded);
  }
  // Android standalone sometimes reports env(safe-area-inset-bottom)=0 while
  // still drawing under a gesture/nav bar; prefer measured occlusion only.
  if (ANDROID && isStandalone() && floor === 0 && vv) {
    const gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    if (gap >= 20) floor = Math.round(gap);
  }
  root.style.setProperty("--sab-floor", `${floor}px`);
}

/** Browsers often update visualViewport a frame (or more) after orientationchange. */
function syncAfterOrientation() {
  syncViewportInsets();
  requestAnimationFrame(() => {
    syncViewportInsets();
    window.setTimeout(syncViewportInsets, 50);
    window.setTimeout(syncViewportInsets, 150);
    window.setTimeout(syncViewportInsets, 350);
  });
}

export function useViewportInsets() {
  useEffect(() => {
    syncViewportInsets();
    window.addEventListener("resize", syncViewportInsets);
    window.addEventListener("orientationchange", syncAfterOrientation);
    window.addEventListener("pageshow", syncViewportInsets);
    window.addEventListener("visibilitychange", syncViewportInsets);
    window.visualViewport?.addEventListener("resize", syncViewportInsets);
    window.visualViewport?.addEventListener("scroll", syncViewportInsets);
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", syncViewportInsets);
    return () => {
      window.removeEventListener("resize", syncViewportInsets);
      window.removeEventListener("orientationchange", syncAfterOrientation);
      window.removeEventListener("pageshow", syncViewportInsets);
      window.removeEventListener("visibilitychange", syncViewportInsets);
      window.visualViewport?.removeEventListener("resize", syncViewportInsets);
      window.visualViewport?.removeEventListener("scroll", syncViewportInsets);
      mq.removeEventListener?.("change", syncViewportInsets);
    };
  }, []);
}
