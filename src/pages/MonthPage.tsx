import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "../components/TabBar";
import { CITY, loadMonthTimesAsync, MONTHS } from "../lib/prayer-calc";

const TZ = CITY.timeZone;
const SKELETON_ROWS = 10;
/** Keep shimmer on screen long enough to be perceptible even when calc is instant. */
const MIN_SKELETON_MS = 320;

type MonthRow = Awaited<ReturnType<typeof loadMonthTimesAsync>>[number];

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

export function MonthPage() {
  const [view, setView] = useState(() => todayParts());
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

  // Paint shell + skeleton first (rAF), then compute; enforce a short minimum
  // so Month tab / prev-next always shows a visible shimmer.
  useEffect(() => {
    const gen = ++loadGen.current;
    setLoading(true);
    setRows(null);
    const started = performance.now();
    let settleTimer = 0;
    let cancelled = false;

    // Paint skeleton, then compute in yielded chunks so Today/prev-next stay tappable.
    const raf1 = requestAnimationFrame(() => {
      void loadMonthTimesAsync(view.year, view.month, () => cancelled || gen !== loadGen.current)
        .then((next) => {
          if (cancelled || gen !== loadGen.current) return;
          const remain = Math.max(0, MIN_SKELETON_MS - (performance.now() - started));
          settleTimer = window.setTimeout(() => {
            if (cancelled || gen !== loadGen.current) return;
            setRows(next);
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
      return { year, month, day: 1 };
    });
    if (gridWrapRef.current) gridWrapRef.current.scrollTop = 0;
  }

  return (
    <div className="app month-app">
      <header className="month-header">
        <span className="month-header-spacer" aria-hidden="true" />
        <div className="month-title-block">
          <h1 className="month-title">
            {MONTHS[view.month - 1]} {view.year}
          </h1>
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
                    today.year === view.year && today.month === view.month && today.day === row.day;
                  return (
                    <tr key={row.day} className={isToday ? "today-row" : undefined}>
                      <td className="col-day">{String(row.day).padStart(2, "0")}</td>
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
