import { useCallback, useEffect, useState } from "react";
import { TabBar } from "../components/TabBar";
import { CITY, getDayTimes } from "../lib/prayer-calc";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"] as const;
const KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
const MINUTE_KEYS = [
  "fajrMinutes",
  "dhuhrMinutes",
  "asrMinutes",
  "maghribMinutes",
  "ishaMinutes"
] as const;
const CACHE_KEY = "tallinn-prayer-cache-v1";
const TZ = CITY.timeZone;
const BOOT_MS = 320;

type PrayerItem = {
  name: string;
  key: string;
  time: string;
  minutes: number | null;
};

type TzParts = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
  second: number;
  minuteOfDay: number;
};

type Bundle = {
  today: TzParts;
  schedule: PrayerItem[];
  next: PrayerItem;
  nextIsTomorrow: boolean;
  currentIndex: number;
  totalSeconds: number | null;
  generatedAt: string;
  todayLabel?: string;
};

type CachePayload = {
  dateKey: string;
  schedule: PrayerItem[];
  next: PrayerItem;
  nextIsTomorrow: boolean;
  currentIndex: number;
  todayLabel: string;
  generatedAt: string;
};

/** Keep last painted Today bundle so returning from Month is instant (no re-boot). */
let lastBundle: Bundle | null = null;

function partsInTz(date = new Date()): TzParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const values: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") values[p.type] = p.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute)
  };
}

function formatShortDate(parts: Pick<TzParts, "weekday" | "day" | "month">) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts.weekday.slice(0, 3)} ${parts.day} ${months[parts.month - 1]}`;
}

function addCalendarDays(year: number, month: number, day: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function computeBundle(now = new Date()): Bundle {
  const today = partsInTz(now);
  const tomorrow = addCalendarDays(today.year, today.month, today.day, 1);
  const todayTimes = getDayTimes(today.year, today.month, today.day);
  const tomorrowTimes = getDayTimes(tomorrow.year, tomorrow.month, tomorrow.day);

  const schedule: PrayerItem[] = KEYS.map((key, i) => ({
    name: PRAYERS[i],
    key,
    time: todayTimes[key] as string,
    minutes: todayTimes[MINUTE_KEYS[i]] as number | null
  }));

  const nowMin = today.minuteOfDay;
  let nextIndex = schedule.findIndex((p) => (p.minutes ?? -1) > nowMin);
  let nextIsTomorrow = false;
  let next: PrayerItem;

  if (nextIndex === -1) {
    nextIsTomorrow = true;
    next = {
      name: "Fajr",
      key: "fajr",
      time: tomorrowTimes.fajr,
      minutes: tomorrowTimes.fajrMinutes
    };
  } else {
    next = schedule[nextIndex];
  }

  let currentIndex = -1;
  for (let i = 0; i < schedule.length; i += 1) {
    if ((schedule[i].minutes ?? Infinity) <= nowMin) currentIndex = i;
  }

  const countdownMinutes = nextIsTomorrow
    ? 1440 - nowMin + (next.minutes ?? 0)
    : (next.minutes ?? 0) - nowMin;
  const totalSeconds = countdownMinutes * 60 - today.second;

  return {
    today,
    schedule,
    next,
    nextIsTomorrow,
    currentIndex,
    totalSeconds,
    generatedAt: now.toISOString()
  };
}

function formatCountdown(totalSeconds: number) {
  if (totalSeconds < 0) totalSeconds = 0;
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

function saveCache(bundle: Bundle) {
  try {
    const payload: CachePayload = {
      dateKey: `${bundle.today.year}-${bundle.today.month}-${bundle.today.day}`,
      schedule: bundle.schedule,
      next: bundle.next,
      nextIsTomorrow: bundle.nextIsTomorrow,
      currentIndex: bundle.currentIndex,
      todayLabel: formatShortDate(bundle.today),
      generatedAt: bundle.generatedAt
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function loadCache(): CachePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachePayload) : null;
  } catch {
    return null;
  }
}


function bundleFromCache(): Bundle | null {
  const cached = loadCache();
  if (!cached) return null;
  return {
    today: {
      year: 0,
      month: 0,
      day: 0,
      weekday: "",
      hour: 0,
      minute: 0,
      second: 0,
      minuteOfDay: -1
    },
    todayLabel: cached.todayLabel,
    schedule: cached.schedule,
    next: cached.next,
    nextIsTomorrow: cached.nextIsTomorrow,
    currentIndex: cached.currentIndex,
    totalSeconds: null,
    generatedAt: cached.generatedAt
  };
}

export function TodayPage() {
  const hadPainted = lastBundle != null;
  const [booting, setBooting] = useState(!hadPainted);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [bundle, setBundle] = useState<Bundle | null>(() => lastBundle ?? bundleFromCache());
  const [fromCache, setFromCache] = useState(() => lastBundle == null && loadCache() != null);

  const tick = useCallback(() => {
    try {
      const next = computeBundle();
      lastBundle = next;
      setBundle(next);
      setFromCache(false);
      setOffline(!navigator.onLine);
      saveCache(next);
    } catch (err) {
      console.error(err);
      const cached = loadCache();
      if (cached) {
        const fallback: Bundle = {
          today: {
            year: 0,
            month: 0,
            day: 0,
            weekday: "",
            hour: 0,
            minute: 0,
            second: 0,
            minuteOfDay: -1
          },
          todayLabel: cached.todayLabel,
          schedule: cached.schedule,
          next: cached.next,
          nextIsTomorrow: cached.nextIsTomorrow,
          currentIndex: cached.currentIndex,
          totalSeconds: null,
          generatedAt: cached.generatedAt
        };
        lastBundle = fallback;
        setBundle(fallback);
        setFromCache(true);
        setOffline(true);
      }
    }
  }, []);

  useEffect(() => {
    let intervalId: number | undefined;
    let timeoutId: number | undefined;
    let raf = 0;

    if (hadPainted) {
      // Instant return: paint cached Today, then resume live ticks.
      tick();
      intervalId = window.setInterval(tick, 1000);
    } else {
      const readyAt = performance.now() + BOOT_MS;
      const boot = () => {
        try {
          tick();
        } catch (err) {
          console.error(err);
        }
        const wait = Math.max(0, readyAt - performance.now());
        timeoutId = window.setTimeout(() => {
          setBooting(false);
          try {
            tick();
          } catch (err) {
            console.error(err);
          }
          intervalId = window.setInterval(tick, 1000);
        }, wait);
      };
      raf = requestAnimationFrame(boot);
    }

    const onOnline = () => {
      setOffline(false);
      tick();
    };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [tick, hadPainted]);

  const dateText =
    fromCache && bundle?.todayLabel
      ? bundle.todayLabel
      : bundle
        ? formatShortDate(bundle.today)
        : "—";
  const nowMin = bundle?.today?.minuteOfDay ?? -1;

  return (
    <div className={`app app-today${booting ? " is-booting" : ""}${bundle ? " has-data" : ""}`} id="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="city">Tallinn</span>
          <span className="sep" aria-hidden="true">
            ·
          </span>
          <span className="date-line">{dateText}</span>
        </div>
        <div className="topbar-right">
          <span className="offline-pill" hidden={!offline}>
            offline
          </span>
        </div>
      </header>

      <div className="today-body">
        <section className="hero" aria-live="polite">
          <div className="skeleton hero-skel" hidden={!!bundle}>
            <div className="sk sk-label" />
            <div className="sk sk-name" />
            <div className="sk sk-time" />
            <div className="sk sk-countdown" />
          </div>
          <div className="hero-content" hidden={!bundle}>
            <div className="next-label">Next</div>
            <div className="next-name-row">
              <h1 className="next-name">{bundle?.next.name ?? "—"}</h1>
              <span className="chip tomorrow-chip" hidden={!bundle?.nextIsTomorrow}>
                tomorrow
              </span>
            </div>
            <div className="next-time">{bundle?.next.time ?? "—:—"}</div>
            <div className="next-countdown">
              {bundle?.totalSeconds != null ? formatCountdown(bundle.totalSeconds) : "—"}
            </div>
          </div>
        </section>

        <section className="today" aria-label="Today's prayer times">
          <ul className={`prayer-list${!bundle ? " is-loading" : ""}`}>
            {!bundle
              ? [0, 1, 2, 3, 4].map((i) => (
                  <li key={i} className="prayer-row skeleton-row">
                    <span className="sk sk-row-name" />
                    <span className="sk sk-row-time" />
                  </li>
                ))
              : bundle.schedule.map((p, i) => {
                  const classes = ["prayer-row"];
                  if ((p.minutes ?? -1) < nowMin && i !== bundle.currentIndex) classes.push("past");
                  if (i === bundle.currentIndex) classes.push("current");
                  if ((p.minutes ?? -1) > nowMin) classes.push("upcoming");
                  return (
                    <li key={p.key} className={classes.join(" ")}>
                      <span className="prayer-name">{p.name}</span>
                      <span className="prayer-time">{p.time}</span>
                    </li>
                  );
                })}
          </ul>
        </section>
      </div>
      <TabBar />
    </div>
  );
}
