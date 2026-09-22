import { useEffect } from "react";

const ANDROID = /Android/i.test(navigator.userAgent);
const IOS =
  /iP(hone|ad|od)/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS standalone (WebKit #254868): visualViewport / svh / -webkit-fill-available
 * report the "lying" viewport — short of the real screen by the chin. 100vh fills
 * the screen; screen.height - innerHeight estimates the dead zone.
 */
function iosChinPx(): number {
  const lie = Math.max(0, window.screen.height - window.innerHeight);
  if (lie <= 0) return 0;
  // lie includes top status + bottom home indicator. Prefer a bottom-sized slice.
  // Typical: status ~47–59, home ~20–34. If lie is small, use it as-is.
  if (lie <= 40) return Math.round(lie);
  const bottom = Math.min(40, Math.max(20, lie - 47));
  return Math.round(bottom);
}

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
 * Size the app shell to the visible viewport.
 * iOS standalone: use CSS 100vh (not a short px height) + --ios-chin for tab padding.
 */
export function syncViewportInsets() {
  const root = document.documentElement;

  if (IOS && isStandalone()) {
    // Must be the keyword 100vh — pixel innerHeight recreates the white chin gap.
    root.style.setProperty("--app-vh", "100vh");
    root.style.setProperty("--ios-chin", `${iosChinPx()}px`);
    root.style.setProperty("--sab-floor", "0px");
    return;
  }

  root.style.setProperty("--ios-chin", "0px");
  const height = visibleHeight();
  if (height > 0) {
    root.style.setProperty("--app-vh", `${height}px`);
  }

  let floor = 0;
  const vv = window.visualViewport;
  if (vv) {
    const occluded = Math.max(0, window.innerHeight - (vv.offsetTop + vv.height));
    if (occluded >= 8) floor = Math.round(occluded);
  }
  if (ANDROID && isStandalone() && floor === 0 && vv) {
    const gap = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    if (gap >= 20) floor = Math.round(gap);
  }
  root.style.setProperty("--sab-floor", `${floor}px`);
}

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
