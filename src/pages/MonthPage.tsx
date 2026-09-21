import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "../components/TabBar";
import { CITY, getMonthTimes, MONTHS } from "../lib/prayer-calc";

const TZ = CITY.timeZone;

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
  const [hintHidden, setHintHidden] = useState(false);
  const gridWrapRef = useRef<HTMLDivElement>(null);

  const updateScrollHint = useCallback(() => {
    const gridWrap = gridWrapRef.current;
    if (!gridWrap) return;
    const canScroll = gridWrap.scrollWidth > gridWrap.clientWidth + 4;
    const scrolled = gridWrap.scrollLeft > 8;
    setHintHidden(!canScroll || scrolled);
  }, []);

  const rows = getMonthTimes(view.year, view.month);
  const today = todayParts();

  useEffect(() => {
    const id = requestAnimationFrame(updateScrollHint);
    return () => cancelAnimationFrame(id);
  }, [view, updateScrollHint]);

  useEffect(() => {
    const gridWrap = gridWrapRef.current;
    gridWrap?.addEventListener("scroll", updateScrollHint, { passive: true });
    window.addEventListener("resize", updateScrollHint);
    return () => {
      gridWrap?.removeEventListener("scroll", updateScrollHint);
      window.removeEventListener("resize", updateScrollHint);
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

      <p className={`month-scroll-hint${hintHidden ? " is-hidden" : ""}`}>
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
            {rows.map((row) => {
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
