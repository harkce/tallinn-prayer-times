import { getMonthTimes, MONTHS, CITY } from "./prayer-calc.js";

const monthTitle = document.getElementById("monthTitle");
const monthBody = document.getElementById("monthBody");
const prevBtn = document.getElementById("prevMonth");
const nextBtn = document.getElementById("nextMonth");

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
      String(row.day).padStart(2, "0"),
      row.weekday,
      row.fajr,
      row.dhuhr,
      row.asr,
      row.maghrib,
      row.isha
    ];
    for (const value of cells) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    monthBody.appendChild(tr);
  }
}

function shiftMonth(delta) {
  let { year, month } = view;
  month += delta;
  if (month < 1) { month = 12; year -= 1; }
  if (month > 12) { month = 1; year += 1; }
  view = { year, month, day: 1 };
  render();
}

prevBtn.addEventListener("click", () => shiftMonth(-1));
nextBtn.addEventListener("click", () => shiftMonth(1));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
}

render();
