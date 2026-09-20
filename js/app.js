import "./viewport-insets.js";
import { mountTabbar } from "./tabbar.js";
mountTabbar("today");
import { getDayTimes, CITY } from "./prayer-calc.js";

const PRAYERS = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
const MINUTE_KEYS = ["fajrMinutes", "dhuhrMinutes", "asrMinutes", "maghribMinutes", "ishaMinutes"];
const CACHE_KEY = "tallinn-prayer-cache-v1";
const TZ = CITY.timeZone;

const dateLine = document.getElementById("dateLine");
const offlinePill = document.getElementById("offlinePill");
const heroSkeleton = document.getElementById("heroSkeleton");
const heroContent = document.getElementById("heroContent");
const nextName = document.getElementById("nextName");
const nextTime = document.getElementById("nextTime");
const nextCountdown = document.getElementById("nextCountdown");
const tomorrowChip = document.getElementById("tomorrowChip");
const prayerList = document.getElementById("prayerList");

let tickTimer = null;
let booting = true;

function partsInTz(date = new Date()) {
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
  const values = {};
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

function formatShortDate(parts) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${parts.weekday.slice(0, 3)} ${parts.day} ${months[parts.month - 1]}`;
}

function addCalendarDays(year, month, day, amount) {
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function computeBundle(now = new Date()) {
  const today = partsInTz(now);
  const tomorrow = addCalendarDays(today.year, today.month, today.day, 1);
  const todayTimes = getDayTimes(today.year, today.month, today.day);
  const tomorrowTimes = getDayTimes(tomorrow.year, tomorrow.month, tomorrow.day);

  const schedule = KEYS.map((key, i) => ({
    name: PRAYERS[i],
    key,
    time: todayTimes[key],
    minutes: todayTimes[MINUTE_KEYS[i]]
  }));

  const nowMin = today.minuteOfDay;
  let nextIndex = schedule.findIndex((p) => p.minutes > nowMin);
  let nextIsTomorrow = false;
  let next;

  if (nextIndex === -1) {
    nextIsTomorrow = true;
    nextIndex = 0;
    next = {
      name: "Fajr",
      key: "fajr",
      time: tomorrowTimes.fajr,
      minutes: tomorrowTimes.fajrMinutes
    };
  } else {
    next = schedule[nextIndex];
  }

  // Current prayer: last one that has started (minutes <= now)
  let currentIndex = -1;
  for (let i = 0; i < schedule.length; i += 1) {
    if (schedule[i].minutes <= nowMin) currentIndex = i;
  }

  let countdownMinutes;
  if (nextIsTomorrow) {
    countdownMinutes = 1440 - nowMin + next.minutes;
  } else {
    countdownMinutes = next.minutes - nowMin;
  }

  // Account for seconds so countdown feels live
  const secsIntoMinute = today.second;
  const totalSeconds = countdownMinutes * 60 - secsIntoMinute;

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

function formatCountdown(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;
  const mins = Math.floor(totalSeconds / 60);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

function saveCache(bundle) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      dateKey: `${bundle.today.year}-${bundle.today.month}-${bundle.today.day}`,
      schedule: bundle.schedule,
      next: bundle.next,
      nextIsTomorrow: bundle.nextIsTomorrow,
      currentIndex: bundle.currentIndex,
      todayLabel: formatShortDate(bundle.today),
      generatedAt: bundle.generatedAt
    }));
  } catch (_) { /* ignore */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function renderList(schedule, currentIndex, nowMin) {
  prayerList.innerHTML = "";
  schedule.forEach((p, i) => {
    const li = document.createElement("li");
    li.className = "prayer-row";
    if (p.minutes < nowMin && i !== currentIndex) li.classList.add("past");
    if (i === currentIndex) li.classList.add("current");
    if (p.minutes > nowMin) li.classList.add("upcoming");

    const name = document.createElement("span");
    name.className = "prayer-name";
    name.textContent = p.name;

    const time = document.createElement("span");
    time.className = "prayer-time";
    time.textContent = p.time;

    li.append(name, time);
    prayerList.appendChild(li);
  });
}

function render(bundle, { fromCache = false, offline = false } = {}) {
  dateLine.textContent = fromCache && bundle.todayLabel
    ? bundle.todayLabel
    : formatShortDate(bundle.today);

  offlinePill.hidden = !offline;

  nextName.textContent = bundle.next.name;
  nextTime.textContent = bundle.next.time;
  tomorrowChip.hidden = !bundle.nextIsTomorrow;

  if (bundle.totalSeconds != null) {
    nextCountdown.textContent = formatCountdown(bundle.totalSeconds);
  } else {
    nextCountdown.textContent = "";
  }

  const nowMin = bundle.today?.minuteOfDay ?? -1;
  renderList(bundle.schedule, bundle.currentIndex, nowMin);

  if (!booting) {
    heroSkeleton.hidden = true;
    heroContent.hidden = false;
  }
}

function tick() {
  try {
    const bundle = computeBundle();
    render(bundle, { offline: !navigator.onLine });
    saveCache(bundle);
  } catch (err) {
    console.error(err);
    const cached = loadCache();
    if (cached) {
      render({
        today: { minuteOfDay: -1 },
        todayLabel: cached.todayLabel,
        schedule: cached.schedule,
        next: cached.next,
        nextIsTomorrow: cached.nextIsTomorrow,
        currentIndex: cached.currentIndex,
        totalSeconds: null
      }, { fromCache: true, offline: true });
    }
  }
}

const BOOT_MS = 320;

function revealLoaded() {
  booting = false;
  document.getElementById("app")?.classList.remove("is-booting");
  prayerList.classList.remove("is-loading");
  // Re-render once so hero swaps off skeleton
  tick();
}

function start() {
  const app = document.getElementById("app");
  app?.classList.add("is-booting");
  const readyAt = performance.now() + BOOT_MS;

  const boot = () => {
    tick();
    const wait = Math.max(0, readyAt - performance.now());
    setTimeout(() => {
      revealLoaded();
      if (tickTimer) clearInterval(tickTimer);
      tickTimer = setInterval(tick, 1000);
    }, wait);
  };

  requestAnimationFrame(boot);
}

window.addEventListener("online", () => {
  offlinePill.hidden = true;
  tick();
});
window.addEventListener("offline", () => {
  offlinePill.hidden = false;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

start();
