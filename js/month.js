import "./viewport-insets.js";
import { getMonthTimes, MONTHS, CITY } from "./prayer-calc.js";

const monthTitle = document.getElementById("monthTitle");
const monthBody = document.getElementById("monthBody");
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");
const gridWrap = document.getElementById("monthGridWrap");
const scrollHint = document.getElementById("monthScrollHint");
const labels = document.querySelector(".month-labels");

const TZ = CITY.timeZone;

function todayParts() {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const values = {};
  for (const p of fmt.formatToParts(new Date())) {
    if (p.type !== "literal") values[p.type] = Number(p.value);
  }
  return values;
}

let view = todayParts();

function updateScrollHint() {
  if (!gridWrap || !scrollHint) return;
  const canScroll = gridWrap.scrollWidth > gridWrap.clientWidth + 4;
  const scrolled = gridWrap.scrollLeft > 8;
  scrollHint.classList.toggle("is-hidden", !canScroll || scrolled);
}

function render() {
  const { year, month } = view;
  monthTitle.textContent = `${MONTHS[month - 1]} ${year}`;
  const rows = getMonthTimes(year, month);
  const today = todayParts();
  monthBody.innerHTML = "";

  for (const row of rows) {
    const tr = document.createElement("tr");
    const isToday = today.year === year && today.month === month && today.day === row.day;
    if (isToday) tr.classList.add("today-row");

    const cells = [
      { value: String(row.day).padStart(2, "0"), className: "col-day" },
      { value: row.weekday, className: "col-wd" },
      { value: row.fajr },
      { value: row.dhuhr },
      { value: row.asr },
      { value: row.maghrib },
      { value: row.isha }
    ];
    for (const cell of cells) {
      const td = document.createElement("td");
      td.textContent = cell.value;
      if (cell.className) td.className = cell.className;
      tr.appendChild(td);
    }
    monthBody.appendChild(tr);
  }

  requestAnimationFrame(updateScrollHint);
}

function shiftMonth(delta) {
  let { year, month } = view;
  month += delta;
  if (month < 1) { month = 12; year -= 1; }
  if (month > 12) { month = 1; year += 1; }
  view = { year, month, day: 1 };
  if (gridWrap) gridWrap.scrollTop = 0;
  render();
}

prevBtn.addEventListener("click", () => shiftMonth(-1));
nextBtn.addEventListener("click", () => shiftMonth(1));
gridWrap?.addEventListener("scroll", updateScrollHint, { passive: true });
window.addEventListener("resize", updateScrollHint);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

render();
