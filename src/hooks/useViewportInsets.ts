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

/** Browsers often update visualViewport a frame (or more) after orientationchange. */
function syncAfterOrientation() {
  syncViewportInsets();
  requestAnimationFrame(() => {
    syncViewportInsets();
    window.setTimeout(syncViewportInsets, 50);
    window.setTimeout(syncViewportInsets, 200);
  });
}

export function useViewportInsets() {
  useEffect(() => {
    syncViewportInsets();
    window.addEventListener("resize", syncViewportInsets);
    window.addEventListener("orientationchange", syncAfterOrientation);
    window.addEventListener("pageshow", syncViewportInsets);
    window.visualViewport?.addEventListener("resize", syncViewportInsets);
    window.visualViewport?.addEventListener("scroll", syncViewportInsets);
    const mq = window.matchMedia("(display-mode: standalone)");
    mq.addEventListener?.("change", syncViewportInsets);
    return () => {
      window.removeEventListener("resize", syncViewportInsets);
      window.removeEventListener("orientationchange", syncAfterOrientation);
      window.removeEventListener("pageshow", syncViewportInsets);
      window.visualViewport?.removeEventListener("resize", syncViewportInsets);
      window.visualViewport?.removeEventListener("scroll", syncViewportInsets);
      mq.removeEventListener?.("change", syncViewportInsets);
    };
  }, []);
}
