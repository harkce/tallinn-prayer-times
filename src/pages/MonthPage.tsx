import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "../components/TabBar";
import {
  CITY,
  getHijriParts,
  HIJRI_MONTHS,
  loadHijriMonthTimesAsync,
  loadMonthTimesAsync,
  MONTHS,
  shiftHijriMonth
} from "../lib/prayer-calc";

const TZ = CITY.timeZone;
const SKELETON_ROWS = 10;
const MIN_SKELETON_MS = 320;
const CAL_STORAGE_KEY = "tallinn-month-calendar-v1";

type CalMode = "gregorian" | "hijri";

type ViewState = {
  mode: CalMode;
  year: number;
  month: number;
};

type MonthRow = {
  day: number;
  weekday: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  gregorianLabel?: string;
  hijriLabel?: string;
  gYear?: number;
  gMonth?: number;
  gDay?: number;
};

function todayParts() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const values: Record<string, number> = {};
  for (const p of fmt.formatToParts(new Date())) {
    if (p.type !== "literal") values[p.type] = Number(p.value);
  }
  return values as { year: number; month: number; day: number };
}

function readCalMode(): CalMode {
  try {
    const raw = localStorage.getItem(CAL_STORAGE_KEY);
    if (raw === "hijri" || raw === "gregorian") return raw;
  } catch {
    /* ignore */
  }
  return "gregorian";
}

function writeCalMode(mode: CalMode) {
  try {
    localStorage.setItem(CAL_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function initialView(): ViewState {
  const today = todayParts();
  const mode = readCalMode();
  if (mode === "hijri") {
    const h = getHijriParts(today.year, today.month, today.day);
    if (h?.month) return { mode, year: h.year, month: h.month };
  }
  return { mode: "gregorian", year: today.year, month: today.month };
}

export function MonthPage() {
  const [view, setView] = useState<ViewState>(() => initialView());
  const [rows, setRows] = useState<MonthRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hintHidden, setHintHidden] = useState(false);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const loadGen = useRef(0);

  const updateScrollHint = useCallback(() => {
    const gridWrap = gridWrapRef.current;
    if (!gridWrap) return;
    const canScroll = gridWrap.scrollWidth > gridWrap.clientWidth + 4;
    const scrolled = gridWrap.scrollLeft > 8;
    setHintHidden(!canScroll || scrolled);
  }, []);

  const today = todayParts();
  const todayHijri = getHijriParts(today.year, today.month, today.day);

  useEffect(() => {
    const gen = ++loadGen.current;
    setLoading(true);
    setRows(null);
    const started = performance.now();
    let settleTimer = 0;
    let cancelled = false;
    const isCancelled = () => cancelled || gen !== loadGen.current;

    const raf1 = requestAnimationFrame(() => {
      const load =
        view.mode === "hijri"
          ? loadHijriMonthTimesAsync(view.year, view.month, isCancelled)
          : loadMonthTimesAsync(view.year, view.month, isCancelled);

      void load
        .then((next) => {
          if (isCancelled()) return;
          const remain = Math.max(0, MIN_SKELETON_MS - (performance.now() - started));
          settleTimer = window.setTimeout(() => {
            if (isCancelled()) return;
            setRows(next as MonthRow[]);
            setLoading(false);
          }, remain);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error(err);
        });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      clearTimeout(settleTimer);
    };
  }, [view]);

  // Center today's row in the viewport when this month (Gregorian or Hijri) contains today.
  useEffect(() => {
    if (loading || !rows?.length) return;
    const wrap = gridWrapRef.current;
    if (!wrap) return;
    const todayEl = wrap.querySelector("tr.today-row") as HTMLElement | null;
    if (!todayEl) return;
    const id = requestAnimationFrame(() => {
      todayEl.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [loading, rows, view]);

  useEffect(() => {
    const id = requestAnimationFrame(updateScrollHint);
    return () => cancelAnimationFrame(id);
  }, [view, rows, updateScrollHint]);

  useEffect(() => {
    const gridWrap = gridWrapRef.current;
    gridWrap?.addEventListener("scroll", updateScrollHint, { passive: true });
    window.addEventListener("resize", updateScrollHint);
    window.addEventListener("orientationchange", updateScrollHint);
    return () => {
      gridWrap?.removeEventListener("scroll", updateScrollHint);
      window.removeEventListener("resize", updateScrollHint);
      window.removeEventListener("orientationchange", updateScrollHint);
    };
  }, [updateScrollHint]);

  function shiftMonth(delta: number) {
    setView((prev) => {
      if (prev.mode === "hijri") {
        const next = shiftHijriMonth(prev.year, prev.month, delta);
        return { mode: "hijri", year: next.year, month: next.month };
      }
      let { year, month } = prev;
      month += delta;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      if (month > 12) {
        month = 1;
        year += 1;
      }
      return { mode: "gregorian", year, month };
    });
    if (gridWrapRef.current) gridWrapRef.current.scrollTop = 0;
  }

  function setMode(mode: CalMode) {
    if (mode === view.mode) return;
    writeCalMode(mode);
    if (mode === "hijri") {
      // Prefer today's Hijri month when current Gregorian month contains today; else day 1.
      const inView =
        today.year === view.year && today.month === view.month ? today : { year: view.year, month: view.month, day: 1 };
      const h = getHijriParts(inView.year, inView.month, inView.day);
      if (h?.month) {
        setView({ mode: "hijri", year: h.year, month: h.month });
        return;
      }
    } else {
      // Map Hijri month onto the Gregorian month of its first day.
      const h = todayHijri;
      const anchor =
        h && h.year === view.year && h.month === view.month
          ? today
          : null;
      if (anchor) {
        setView({ mode: "gregorian", year: anchor.year, month: anchor.month });
        return;
      }
      // Fall back: use first loaded row's gregorian if present, else today
      const first = rows?.[0];
      if (first?.gYear && first.gMonth) {
        setView({ mode: "gregorian", year: first.gYear, month: first.gMonth });
        return;
      }
      setView({ mode: "gregorian", year: today.year, month: today.month });
      return;
    }
    setView({ mode: "gregorian", year: today.year, month: today.month });
  }

  const title =
    view.mode === "hijri"
      ? `${HIJRI_MONTHS[view.month - 1] ?? ""} ${view.year}`
      : `${MONTHS[view.month - 1]} ${view.year}`;

  return (
    <div className="app month-app has-dual-day">
      <header className="month-header">
        <span className="month-header-spacer" aria-hidden="true" />
        <div className="month-title-block">
          <h1 className="month-title">{title}</h1>
          <p className="month-sub">Tallinn</p>
        </div>
        <div className="month-nav">
          <button type="button" className="nav-btn" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            ‹
          </button>
          <button type="button" className="nav-btn" aria-label="Next month" onClick={() => shiftMonth(1)}>
            ›
          </button>
        </div>
      </header>

      <div className="month-cal-toggle" role="group" aria-label="Calendar">
        <button
          type="button"
          className={view.mode === "gregorian" ? "is-active" : undefined}
          aria-pressed={view.mode === "gregorian"}
          onClick={() => setMode("gregorian")}
        >
          Gregorian
        </button>
        <button
          type="button"
          className={view.mode === "hijri" ? "is-active" : undefined}
          aria-pressed={view.mode === "hijri"}
          onClick={() => setMode("hijri")}
        >
          Hijri
        </button>
      </div>

      <p className={`month-scroll-hint${hintHidden || loading ? " is-hidden" : ""}`}>
        Swipe sideways for Maghrib &amp; Isha →
      </p>

      <div className="month-grid-wrap" ref={gridWrapRef}>
        <div className="month-labels" aria-hidden="true">
          <span className="col-day">Day</span>
          <span className="col-wd">Wd</span>
          <span>Fajr</span>
          <span>Dhuhr</span>
          <span>Asr</span>
          <span>Maghrib</span>
          <span>Isha</span>
        </div>
        <table className="month-grid">
          <colgroup>
            <col className="col-day" />
            <col className="col-wd" />
            <col className="col-time" />
            <col className="col-time" />
            <col className="col-time" />
            <col className="col-time" />
            <col className="col-time" />
          </colgroup>
          <thead className="sr-only">
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Weekday</th>
              <th scope="col">Fajr</th>
              <th scope="col">Dhuhr</th>
              <th scope="col">Asr</th>
              <th scope="col">Maghrib</th>
              <th scope="col">Isha</th>
            </tr>
          </thead>
          <tbody>
            {loading || !rows
              ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                  <tr key={`sk-${i}`} className="month-skel-row" aria-hidden="true">
                    <td className="col-day">
                      <span className="sk sk-month-day" />
                    </td>
                    <td className="col-wd">
                      <span className="sk sk-month-wd" />
                    </td>
                    <td>
                      <span className="sk sk-month-time" />
                    </td>
                    <td>
                      <span className="sk sk-month-time" />
                    </td>
                    <td>
                      <span className="sk sk-month-time" />
                    </td>
                    <td>
                      <span className="sk sk-month-time" />
                    </td>
                    <td>
                      <span className="sk sk-month-time" />
                    </td>
                  </tr>
                ))
              : rows.map((row) => {
                  const isToday =
                    view.mode === "hijri"
                      ? Boolean(
                          todayHijri &&
                            todayHijri.year === view.year &&
                            todayHijri.month === view.month &&
                            todayHijri.day === row.day
                        )
                      : today.year === view.year && today.month === view.month && today.day === row.day;
                  return (
                    <tr key={`${view.mode}-${row.day}-${row.gDay ?? ""}`} className={isToday ? "today-row" : undefined}>
                      <td className="col-day">
                        <span className="day-primary">{String(row.day).padStart(2, "0")}</span>
                        {view.mode === "hijri" && row.gregorianLabel ? (
                          <span className="day-secondary">{row.gregorianLabel}</span>
                        ) : null}
                        {view.mode === "gregorian" && row.hijriLabel ? (
                          <span className="day-secondary">{row.hijriLabel}</span>
                        ) : null}
                      </td>
                      <td className="col-wd">{row.weekday}</td>
                      <td>{row.fajr}</td>
                      <td>{row.dhuhr}</td>
                      <td>{row.asr}</td>
                      <td>{row.maghrib}</td>
                      <td>{row.isha}</td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      <TabBar />
    </div>
  );
}
