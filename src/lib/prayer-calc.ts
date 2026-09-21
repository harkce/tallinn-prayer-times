// @ts-nocheck
/**
 * Prayer-time calculation ported from Eesti Islamikeskus (eestiislamikeskus.org/app.js).
 * Tallinn-only. METHOD, high-latitude, and Isha month rules are unchanged so times match.
 */

export type City = {
  label: string;
  latitude: number;
  longitude: number;
  timeZone: string;
};

type PrayerTimeResult = {
  time: number;
  rule: string;
  ruleType: string;
  minutesAfterMaghrib?: number;
};

type IshaMonthRule = {
  mode: string;
  fallbackMinutes: number;
  maxAngleMinutes: number;
  label: string;
};

type HijriDate = {
  day: string | undefined;
  month: string;
  year: string;
} | null;

export const CITY: City = {
  label: "Tallinn, Estonia",
  latitude: 59.4370,
  longitude: 24.7536,
  timeZone: "Europe/Tallinn"
};

const METHOD = {
  fajrAngle: 15,
  ishaAngle: 15,
  asrShadowFactor: 1,
  sunriseSunsetAltitude: -0.833,
  dhuhrOffsetMinutes: 0,
  maghribOffsetMinutes: 0,
  highLatitudeDivisor: 60,
  fajrExtremeMinMinutesBeforeSunrise: 45,
  fajrExtremeMaxMinutesBeforeSunrise: 120,
  minGapMinutesBetweenIshaAndFajr: 30,
  ishaExtremeNightThresholdMinutes: 520,
  defaultExtremeIshaMinutes: 90
};

/*
  Automatic Isha rules by month.
  - May to August use the approved high-latitude rule: Isha = Maghrib + 90 minutes.
  - Other months use the 15° angle when it is valid. If the angle is missing or too late,
    the same Maghrib-plus fallback is used.
  You can change the minutes below if the local mosque approves a different value.
*/
const ISHA_MONTH_RULES: Record<number, IshaMonthRule> = {
  1: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 240, label: "15° angle, with fallback only if extreme" },
  2: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 240, label: "15° angle, with fallback only if extreme" },
  3: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 220, label: "15° angle, with fallback only if extreme" },
  4: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 180, label: "spring transition: 15° angle unless extreme" },
  5: { mode: "fixedAfterMaghrib", fallbackMinutes: 90, maxAngleMinutes: 0, label: "summer high-latitude: Maghrib + 90 minutes" },
  6: { mode: "fixedAfterMaghrib", fallbackMinutes: 90, maxAngleMinutes: 0, label: "summer high-latitude: Maghrib + 90 minutes" },
  7: { mode: "fixedAfterMaghrib", fallbackMinutes: 90, maxAngleMinutes: 0, label: "summer high-latitude: Maghrib + 90 minutes" },
  8: { mode: "fixedAfterMaghrib", fallbackMinutes: 90, maxAngleMinutes: 0, label: "summer high-latitude: Maghrib + 90 minutes" },
  9: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 180, label: "autumn transition: 15° angle unless extreme" },
  10: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 220, label: "15° angle, with fallback only if extreme" },
  11: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 240, label: "15° angle, with fallback only if extreme" },
  12: { mode: "anglePreferred", fallbackMinutes: 90, maxAngleMinutes: 240, label: "15° angle, with fallback only if extreme" }
};

const MONTHS: string[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS: string[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const MINUTES_PER_DAY = 1440;
const ROOT_SEARCH_STEP_MINUTES = 5;


function calculatePrayerTimes({ year, month, day, city }: { year: number; month: number; day: number; city: City }) {
  const sunrise = timeAtSolarAltitude(year, month, day, city, METHOD.sunriseSunsetAltitude, "morning");
  const sunset = timeAtSolarAltitude(year, month, day, city, METHOD.sunriseSunsetAltitude, "afternoon");
  const dhuhr = solarNoon(year, month, day, city) + METHOD.dhuhrOffsetMinutes;
  const asrAltitude = asrSolarAltitude(year, month, day, city, METHOD.asrShadowFactor);
  const asr = timeAtSolarAltitude(year, month, day, city, asrAltitude, "afternoon");
  const maghrib = sunset + METHOD.maghribOffsetMinutes;
  const fajr = calculateFajr(year, month, day, city, sunrise);
  const isha = calculateIsha(year, month, day, city, maghrib);

  return { fajr, sunrise, dhuhr, asr, maghrib, isha };
}

function calculateFajr(year, month, day, city, sunrise) {
  const rawFajr = calculateFajrCore(year, month, day, city, sunrise);
  const previousDate = addDays(year, month, day, -1);
  const previousSunset = timeAtSolarAltitude(
    previousDate.year,
    previousDate.month,
    previousDate.day,
    city,
    METHOD.sunriseSunsetAltitude,
    "afternoon"
  );

  if (previousSunset === null || sunrise === null) return rawFajr;

  const previousMaghrib = previousSunset + METHOD.maghribOffsetMinutes;
  const previousIsha = calculateIsha(previousDate.year, previousDate.month, previousDate.day, city, previousMaghrib, {
    skipNextFajrSafety: true
  });
  const previousIshaRelativeToToday = previousIsha.time - MINUTES_PER_DAY;
  const earliestAllowedFajr = previousIshaRelativeToToday + METHOD.minGapMinutesBetweenIshaAndFajr;

  if (rawFajr.time < earliestAllowedFajr && earliestAllowedFajr < sunrise) {
    return {
      time: earliestAllowedFajr,
      rule: `${rawFajr.rule}; moved later to keep at least ${METHOD.minGapMinutesBetweenIshaAndFajr} minutes after the previous Isha`,
      ruleType: rawFajr.ruleType === "angle" ? "safety" : `${rawFajr.ruleType}+safety`
    };
  }

  return rawFajr;
}

function calculateFajrCore(year, month, day, city, sunrise) {
  const angleFajr = timeAtSolarAltitude(year, month, day, city, -METHOD.fajrAngle, "morning");
  const guard = calculateFajrNightPortionGuard(year, month, day, city, sunrise, angleFajr === null);

  if (angleFajr !== null && sunrise !== null && angleFajr < sunrise) {
    if (guard && angleFajr < guard.time) {
      return {
        time: guard.time,
        rule: `High-latitude Fajr guard: 15° is earlier than the ${METHOD.fajrAngle}/60 night portion, so Fajr = sunrise − ${formatDuration(guard.fajrPortion)}`,
        ruleType: "guard"
      };
    }

    return {
      time: angleFajr,
      rule: `Sun angle ${METHOD.fajrAngle}°`,
      ruleType: "angle"
    };
  }

  if (guard) {
    return {
      time: guard.time,
      rule: `High-latitude Fajr: the sun does not reach ${METHOD.fajrAngle}°, so Fajr = sunrise − ${formatDuration(guard.fajrPortion)} (${METHOD.fajrAngle}/60 of the night)`,
      ruleType: "nightPortion"
    };
  }

  return {
    time: sunrise - 90,
    rule: "Fallback Fajr: sunrise minus 90 minutes because the previous night length could not be measured",
    ruleType: "fallback"
  };
}

function calculateFajrNightPortionGuard(year, month, day, city, sunrise, applyBounds) {
  const previousDate = addDays(year, month, day, -1);
  const previousSunset = timeAtSolarAltitude(
    previousDate.year,
    previousDate.month,
    previousDate.day,
    city,
    METHOD.sunriseSunsetAltitude,
    "afternoon"
  );

  if (previousSunset === null || sunrise === null) return null;

  const previousMaghrib = previousSunset + METHOD.maghribOffsetMinutes;
  const nightLength = minutesForward(previousMaghrib, sunrise);
  const rawFajrPortion = nightLength * METHOD.fajrAngle / METHOD.highLatitudeDivisor;
  let fajrPortion = rawFajrPortion;

  if (applyBounds) {
    const maxPortion = Math.min(METHOD.fajrExtremeMaxMinutesBeforeSunrise, Math.max(1, nightLength - 1));
    const minPortion = Math.min(METHOD.fajrExtremeMinMinutesBeforeSunrise, maxPortion);
    fajrPortion = clamp(rawFajrPortion, minPortion, maxPortion);
  }

  return {
    time: sunrise - fajrPortion,
    nightLength,
    fajrPortion,
    rawFajrPortion
  };
}

function calculateIsha(year, month, day, city, maghrib, options = {}) {
  const monthRule = getIshaMonthRule(month);
  const fixedIsha = maghrib + monthRule.fallbackMinutes;
  let time = fixedIsha;
  let rule = `Monthly high-latitude rule: Isha = Maghrib + ${monthRule.fallbackMinutes} minutes`;
  let ruleType = monthRule.mode === "fixedAfterMaghrib" ? "monthFixed" : "fallback";

  if (monthRule.mode === "anglePreferred") {
    const angleResult = calculateIshaAngleResult(year, month, day, city, maghrib);
    const extremeByAngle = angleResult.time === null;
    const extremeByNight = angleResult.nightLength !== null && angleResult.nightLength < METHOD.ishaExtremeNightThresholdMinutes;
    const extremeByLateAngle = angleResult.minutesAfterMaghrib !== null && angleResult.minutesAfterMaghrib > monthRule.maxAngleMinutes;

    if (!extremeByAngle && !extremeByNight && !extremeByLateAngle) {
      time = angleResult.time;
      rule = `Sun angle ${METHOD.ishaAngle}°`;
      ruleType = "angle";
    } else {
      const reason = extremeByAngle
        ? `the sun does not reach ${METHOD.ishaAngle}° before the next sunrise`
        : extremeByNight
          ? `the night is shorter than ${METHOD.ishaExtremeNightThresholdMinutes} minutes`
          : `the ${METHOD.ishaAngle}° time is ${Math.round(angleResult.minutesAfterMaghrib)} minutes after Maghrib`;
      rule = `High-latitude Isha fallback: ${reason}, so Isha = Maghrib + ${monthRule.fallbackMinutes} minutes`;
      ruleType = "fallback";
    }
  }

  if (!options.skipNextFajrSafety) {
    const capped = capIshaBeforeNextFajr(year, month, day, city, time, maghrib);
    if (capped.wasCapped) {
      return {
        time: capped.time,
        rule: `${rule}; safety cap keeps Isha at least ${METHOD.minGapMinutesBetweenIshaAndFajr} minutes before next Fajr`,
        ruleType: "safetyCap",
        minutesAfterMaghrib: Math.round(capped.time - maghrib)
      };
    }
  }

  return {
    time,
    rule,
    ruleType,
    minutesAfterMaghrib: Math.round(time - maghrib)
  };
}

function calculateIshaAngleResult(year, month, day, city, maghrib) {
  const nextDate = addDays(year, month, day, 1);
  const nextSunrise = timeAtSolarAltitude(
    nextDate.year,
    nextDate.month,
    nextDate.day,
    city,
    METHOD.sunriseSunsetAltitude,
    "morning"
  );

  const searchEnd = nextSunrise === null ? MINUTES_PER_DAY * 2 : nextSunrise + MINUTES_PER_DAY;
  const angleIsha = firstAltitudeCrossingInWindow(year, month, day, city, -METHOD.ishaAngle, maghrib, searchEnd);

  return {
    time: angleIsha,
    minutesAfterMaghrib: angleIsha === null ? null : angleIsha - maghrib,
    nightLength: nextSunrise === null ? null : (nextSunrise + MINUTES_PER_DAY - maghrib)
  };
}

function capIshaBeforeNextFajr(year, month, day, city, ishaTime, maghrib) {
  const nextDate = addDays(year, month, day, 1);
  const nextSunrise = timeAtSolarAltitude(
    nextDate.year,
    nextDate.month,
    nextDate.day,
    city,
    METHOD.sunriseSunsetAltitude,
    "morning"
  );

  if (nextSunrise === null) return { time: ishaTime, wasCapped: false };

  const nextFajr = calculateFajrCore(nextDate.year, nextDate.month, nextDate.day, city, nextSunrise);
  const nextFajrRelativeToToday = MINUTES_PER_DAY + nextFajr.time;
  const latestAllowedIsha = nextFajrRelativeToToday - METHOD.minGapMinutesBetweenIshaAndFajr;

  if (ishaTime > latestAllowedIsha && latestAllowedIsha > maghrib) {
    return { time: latestAllowedIsha, wasCapped: true };
  }

  return { time: ishaTime, wasCapped: false };
}

function getIshaMonthRule(month) {
  return ISHA_MONTH_RULES[month] || {
    mode: "fixedAfterMaghrib",
    fallbackMinutes: METHOD.defaultExtremeIshaMinutes,
    maxAngleMinutes: 0,
    label: `Maghrib + ${METHOD.defaultExtremeIshaMinutes} minutes`
  };
}

function timeAtSolarAltitude(year, month, day, city, altitude, partOfDay) {
  const roots = findAltitudeCrossingsInWindow(year, month, day, city, altitude, 0, MINUTES_PER_DAY);
  if (!roots.length) return null;

  const noon = solarNoon(year, month, day, city);

  if (partOfDay === "morning") {
    const morningRoots = roots.filter((root) => root < noon);
    return morningRoots.length ? morningRoots[morningRoots.length - 1] : null;
  }

  const afternoonRoots = roots.filter((root) => root > noon);
  return afternoonRoots.length ? afternoonRoots[0] : null;
}

function firstAltitudeCrossingInWindow(year, month, day, city, altitude, startMinute, endMinute) {
  const roots = findAltitudeCrossingsInWindow(year, month, day, city, altitude, startMinute, endMinute);
  return roots.find((root) => root > startMinute + 0.01) ?? null;
}

function findAltitudeCrossingsInWindow(year, month, day, city, altitude, startMinute, endMinute) {
  const roots = [];
  const step = ROOT_SEARCH_STEP_MINUTES;
  let previousTime = startMinute;
  let previousValue = solarElevation(year, month, day, previousTime, city) - altitude;

  for (let time = startMinute + step; time <= endMinute + 0.0001; time += step) {
    const currentTime = Math.min(time, endMinute);
    const currentValue = solarElevation(year, month, day, currentTime, city) - altitude;
    const crosses = previousValue === 0 || currentValue === 0 ||
      (previousValue < 0 && currentValue > 0) ||
      (previousValue > 0 && currentValue < 0);

    if (crosses) {
      const root = refineAltitudeRoot(year, month, day, city, altitude, previousTime, currentTime, previousValue);
      if (root >= startMinute - 0.001 && root <= endMinute + 0.001 && !isDuplicateRoot(roots, root)) {
        roots.push(root);
      }
    }

    if (currentTime >= endMinute) break;
    previousTime = currentTime;
    previousValue = currentValue;
  }

  return roots;
}

function refineAltitudeRoot(year, month, day, city, altitude, low, high, lowValue) {
  if (Math.abs(lowValue) < 1e-10) return low;

  let left = low;
  let right = high;
  let leftValue = lowValue;

  for (let i = 0; i < 45; i += 1) {
    const middle = (left + right) / 2;
    const middleValue = solarElevation(year, month, day, middle, city) - altitude;

    if (Math.abs(middleValue) < 1e-10) return middle;

    if ((middleValue >= 0) === (leftValue >= 0)) {
      left = middle;
      leftValue = middleValue;
    } else {
      right = middle;
    }
  }

  return (left + right) / 2;
}

function isDuplicateRoot(roots, root) {
  return roots.some((existing) => Math.abs(existing - root) < 1);
}

function solarNoon(year, month, day, city) {
  let low = 600;
  let high = 900;
  let lowValue = trueSolarTimeDifference(year, month, day, low, city);

  for (let i = 0; i < 45; i += 1) {
    const middle = (low + high) / 2;
    const middleValue = trueSolarTimeDifference(year, month, day, middle, city);

    if ((middleValue >= 0) === (lowValue >= 0)) {
      low = middle;
      lowValue = middleValue;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

function asrSolarAltitude(year, month, day, city, shadowFactor) {
  const noon = solarNoon(year, month, day, city);
  const { declination } = solarCoordinatesAtLocalMinute(year, month, day, noon, city);
  const difference = Math.abs((city.latitude - declination) * RAD);
  return Math.atan(1 / (shadowFactor + Math.tan(difference))) * DEG;
}

function solarElevation(year, month, day, localMinute, city) {
  const { declination, equationOfTime, utcMinutes } = solarCoordinatesAtLocalMinute(
    year,
    month,
    day,
    localMinute,
    city
  );

  const trueSolarTime = normalizeMinutesFloat(utcMinutes + equationOfTime + 4 * city.longitude);
  let hourAngle = trueSolarTime / 4 - 180;
  if (hourAngle < -180) hourAngle += 360;

  const latitudeRad = city.latitude * RAD;
  const declinationRad = declination * RAD;
  const hourAngleRad = hourAngle * RAD;

  return Math.asin(
    Math.sin(latitudeRad) * Math.sin(declinationRad) +
    Math.cos(latitudeRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad)
  ) * DEG;
}

function trueSolarTimeDifference(year, month, day, localMinute, city) {
  const { equationOfTime, utcMinutes } = solarCoordinatesAtLocalMinute(year, month, day, localMinute, city);
  const trueSolarTime = normalizeMinutesFloat(utcMinutes + equationOfTime + 4 * city.longitude);
  return circularDifference(trueSolarTime, 720);
}

function solarCoordinatesAtLocalMinute(year, month, day, localMinute, city) {
  const localCivilMillis = Date.UTC(year, month - 1, day, 0, 0, 0) + localMinute * 60 * 1000;
  const localCivilDate = new Date(localCivilMillis);
  const localYear = localCivilDate.getUTCFullYear();
  const localMonth = localCivilDate.getUTCMonth() + 1;
  const localDay = localCivilDate.getUTCDate();
  const minuteOfDay =
    localCivilDate.getUTCHours() * 60 +
    localCivilDate.getUTCMinutes() +
    localCivilDate.getUTCSeconds() / 60 +
    localCivilDate.getUTCMilliseconds() / 60000;

  const utcMillis = utcMillisFromZonedLocal(localYear, localMonth, localDay, minuteOfDay, city.timeZone);
  const date = new Date(utcMillis);
  const julianDay = getJulianDay(date);
  const { declination, equationOfTime } = getSolarCoordinates(julianDay);

  const utcMinutes =
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60 +
    date.getUTCMilliseconds() / 60000;

  return { declination, equationOfTime, utcMinutes };
}

function getSolarCoordinates(julianDay) {
  const t = (julianDay - 2451545.0) / 36525;
  const geometricMeanLongitude = normalizeDegrees(280.46646 + t * (36000.76983 + t * 0.0003032));
  const geometricMeanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const meanAnomalyRad = geometricMeanAnomaly * RAD;
  const equationOfCenter =
    Math.sin(meanAnomalyRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomalyRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomalyRad) * 0.000289;

  const trueLongitude = geometricMeanLongitude + equationOfCenter;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * RAD);

  const meanObliquitySeconds = 21.448 - t * (46.8150 + t * (0.00059 - t * 0.001813));
  const meanObliquity = 23 + (26 + meanObliquitySeconds / 60) / 60;
  const correctedObliquity = meanObliquity + 0.00256 * Math.cos(omega * RAD);

  const declination = Math.asin(
    Math.sin(correctedObliquity * RAD) * Math.sin(apparentLongitude * RAD)
  ) * DEG;

  const y = Math.tan((correctedObliquity * RAD) / 2) ** 2;
  const equationOfTime = 4 * (
    y * Math.sin(2 * geometricMeanLongitude * RAD) -
    2 * eccentricity * Math.sin(meanAnomalyRad) +
    4 * eccentricity * y * Math.sin(meanAnomalyRad) * Math.cos(2 * geometricMeanLongitude * RAD) -
    0.5 * y * y * Math.sin(4 * geometricMeanLongitude * RAD) -
    1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomalyRad)
  ) * DEG;

  return { declination, equationOfTime };
}

function getJulianDay(date) {
  let year = date.getUTCFullYear();
  let month = date.getUTCMonth() + 1;
  const day = date.getUTCDate() + (
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600 +
    date.getUTCMilliseconds() / 3600000
  ) / 24;

  if (month <= 2) {
    year -= 1;
    month += 12;
  }

  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);

  return Math.floor(365.25 * (year + 4716)) +
    Math.floor(30.6001 * (month + 1)) +
    day + b - 1524.5;
}


const TIME_ZONE_PART_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function utcMillisFromZonedLocal(year, month, day, minuteOfDay, timeZone) {
  const localCivilMillis = Date.UTC(year, month - 1, day, 0, 0, 0) + minuteOfDay * 60 * 1000;
  const fallbackOffsetMinutes = fallbackUtcOffsetMinutesAtLocalMinute(year, month, day, minuteOfDay, timeZone);
  let utcMillis = localCivilMillis - fallbackOffsetMinutes * 60 * 1000;

  for (let i = 0; i < 5; i += 1) {
    const offsetMinutes = timeZoneOffsetMinutesAtUtc(utcMillis, timeZone);
    if (!Number.isFinite(offsetMinutes)) break;

    const nextUtcMillis = localCivilMillis - offsetMinutes * 60 * 1000;
    if (Math.abs(nextUtcMillis - utcMillis) < 1) return nextUtcMillis;
    utcMillis = nextUtcMillis;
  }

  return utcMillis;
}

function timeZoneOffsetMinutesAtUtc(utcMillis, timeZone) {
  try {
    let formatter = TIME_ZONE_PART_FORMATTERS.get(timeZone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
      TIME_ZONE_PART_FORMATTERS.set(timeZone, formatter);
    }

    const parts = formatter.formatToParts(new Date(utcMillis));
    const values = {};
    parts.forEach((part) => {
      if (part.type !== "literal") values[part.type] = Number(part.value);
    });

    if (![values.year, values.month, values.day, values.hour, values.minute, values.second].every(Number.isFinite)) {
      return NaN;
    }

    const zonedMillisAsUtc = Date.UTC(
      values.year,
      values.month - 1,
      values.day,
      values.hour,
      values.minute,
      values.second
    );

    const utcMillisRoundedToSecond = Math.floor(utcMillis / 1000) * 1000;
    return Math.round((zonedMillisAsUtc - utcMillisRoundedToSecond) / 60000);
  } catch (error) {
    return NaN;
  }
}

function fallbackUtcOffsetMinutesAtLocalMinute(year, month, day, minuteOfDay, timeZone) {
  if (timeZone === "Europe/Tallinn") {
    return estoniaUtcOffsetHoursAtLocalMinute(year, month, day, minuteOfDay) * 60;
  }

  return 0;
}

function estoniaUtcOffsetHoursAtLocalMinute(year, month, day, minuteOfDay) {
  const marchSwitch = lastSundayOfMonth(year, 3);
  const octoberSwitch = lastSundayOfMonth(year, 10);

  if (month > 3 && month < 10) return 3;
  if (month < 3 || month > 10) return 2;

  if (month === 3) {
    if (day < marchSwitch) return 2;
    if (day > marchSwitch) return 3;
    return minuteOfDay >= 180 ? 3 : 2;
  }

  if (day < octoberSwitch) return 3;
  if (day > octoberSwitch) return 2;
  return minuteOfDay >= 240 ? 2 : 3;
}

function lastSundayOfMonth(year, month) {
  const lastDay = daysInMonth(year, month);
  const weekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - weekday;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(year, month, day, amount) {
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getWeekday(year, month, day) {
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** Canonical English Hijri month names — avoid Intl `month: "long"` (Android can emit Gregorian names). */
export const HIJRI_MONTHS = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Akhir",
  "Jumada al-Awwal",
  "Jumada al-Akhir",
  "Rajab",
  "Shaban",
  "Ramadan",
  "Shawwal",
  "Dhul Qadah",
  "Dhul Hijjah"
];

function getHijriDate(year, month, day, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      timeZone,
      day: "numeric",
      month: "numeric",
      year: "numeric"
    });

    const parts = formatter.formatToParts(new Date(Date.UTC(year, month - 1, day, 12)));
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    const monthIndex = Number(getPart("month"));
    const monthName =
      monthIndex >= 1 && monthIndex <= 12
        ? HIJRI_MONTHS[monthIndex - 1]
        : normalizeHijriMonthName(getPart("month") || "");

    return {
      day: getPart("day"),
      month: monthName,
      year: (getPart("year") || "").replace(/\s*AH$/i, "")
    };
  } catch (error) {
    return null;
  }
}

function normalizeHijriMonthName(value) {
  const plain = value
    .toLowerCase()
    .replace(/[’ʻʿ']/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();

  if (plain.includes("muharram")) return "Muharram";
  if (plain.includes("safar")) return "Safar";
  if (plain.includes("ramadan")) return "Ramadan";
  if (plain.includes("shawwal")) return "Shawwal";
  if (plain.includes("rajab")) return "Rajab";
  if (plain.includes("shaban") || plain.includes("sha ban")) return "Shaban";
  if (plain.includes("hijjah")) return "Dhul Hijjah";
  if (plain.includes("qidah") || plain.includes("qadah") || plain.includes("qi dah")) return "Dhul Qadah";
  if (plain.includes("rabi") && (plain.includes("ii") || plain.includes("second") || plain.includes("thani"))) return "Rabi al-Akhir";
  if (plain.includes("rabi")) return "Rabi al-Awwal";
  if (plain.includes("jumada") && (plain.includes("ii") || plain.includes("second") || plain.includes("thani"))) return "Jumada al-Akhir";
  if (plain.includes("jumada")) return "Jumada al-Awwal";

  return value;
}

export type HijriParts = {
  year: number;
  month: number;
  day: number;
  monthName: string;
};

/** Numeric Umm al-Qura parts for a Gregorian civil date (Tallinn TZ noon). */
export function getHijriParts(year: number, month: number, day: number): HijriParts | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      timeZone: CITY.timeZone,
      day: "numeric",
      month: "numeric",
      year: "numeric"
    });
    const parts = formatter.formatToParts(new Date(Date.UTC(year, month - 1, day, 12)));
    const getPart = (type: string) => parts.find((part) => part.type === type)?.value;
    const monthIndex = Number(getPart("month"));
    const monthName =
      monthIndex >= 1 && monthIndex <= 12
        ? HIJRI_MONTHS[monthIndex - 1]
        : normalizeHijriMonthName(getPart("month") || "");
    return {
      year: Number((getPart("year") || "").replace(/\s*AH$/i, "")),
      month: monthIndex >= 1 && monthIndex <= 12 ? monthIndex : HIJRI_MONTHS.indexOf(monthName) + 1,
      day: Number(getPart("day")),
      monthName
    };
  } catch {
    return null;
  }
}

function addGregorianDays(year: number, month: number, day: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1, day + delta, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

/** Rough Gregorian seed for a Hijri year/month (refined by walk). */
function estimateGregorianForHijri(hijriYear: number, hijriMonth: number) {
  const islamicDays =
    Math.floor((hijriYear - 1) * 354.36667) + Math.floor((hijriMonth - 1) * 29.53059) + 1;
  const epoch = Date.UTC(622, 6, 16);
  const date = new Date(epoch + islamicDays * 86400000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

export function findHijriMonthStart(hijriYear: number, hijriMonth: number) {
  let g = estimateGregorianForHijri(hijriYear, hijriMonth);
  for (let i = 0; i < 60; i += 1) {
    const h = getHijriParts(g.year, g.month, g.day);
    if (!h || !h.month) {
      g = addGregorianDays(g.year, g.month, g.day, 5);
      continue;
    }
    if (h.year === hijriYear && h.month === hijriMonth) {
      while (true) {
        const prev = addGregorianDays(g.year, g.month, g.day, -1);
        const ph = getHijriParts(prev.year, prev.month, prev.day);
        if (!ph || ph.year !== hijriYear || ph.month !== hijriMonth) break;
        g = prev;
      }
      return g;
    }
    if (h.year > hijriYear || (h.year === hijriYear && h.month > hijriMonth)) {
      g = addGregorianDays(g.year, g.month, g.day, -12);
    } else {
      g = addGregorianDays(g.year, g.month, g.day, 12);
    }
  }
  return g;
}

export function shiftHijriMonth(hijriYear: number, hijriMonth: number, delta: number) {
  let year = hijriYear;
  let month = hijriMonth + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return { year, month };
}

function formatGregorianShort(year: number, month: number, day: number) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]}`;
}

export type HijriMonthRow = {
  day: number;
  weekday: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  gregorianLabel: string;
  gYear: number;
  gMonth: number;
  gDay: number;
};

const hijriMonthTimesCache = new Map<string, HijriMonthRow[]>();

export function loadHijriMonthTimesAsync(
  hijriYear: number,
  hijriMonth: number,
  isCancelled: () => boolean = () => false
): Promise<HijriMonthRow[]> {
  const key = `h-${hijriYear}-${hijriMonth}`;
  const cached = hijriMonthTimesCache.get(key);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const start = findHijriMonthStart(hijriYear, hijriMonth);
    const rows: HijriMonthRow[] = [];
    let g = { ...start };
    const chunk = 2;

    const step = () => {
      if (isCancelled()) {
        reject(new DOMException("cancelled", "AbortError"));
        return;
      }
      for (let i = 0; i < chunk; i += 1) {
        const h = getHijriParts(g.year, g.month, g.day);
        if (!h || h.year !== hijriYear || h.month !== hijriMonth) {
          hijriMonthTimesCache.set(key, rows);
          resolve(rows);
          return;
        }
        const times = getDayTimes(g.year, g.month, g.day);
        rows.push({
          day: h.day,
          weekday: times.weekday,
          fajr: times.fajr,
          dhuhr: times.dhuhr,
          asr: times.asr,
          maghrib: times.maghrib,
          isha: times.isha,
          gregorianLabel: formatGregorianShort(g.year, g.month, g.day),
          gYear: g.year,
          gMonth: g.month,
          gDay: g.day
        });
        g = addGregorianDays(g.year, g.month, g.day, 1);
      }
      globalThis.setTimeout(step, 0);
    };

    globalThis.setTimeout(step, 0);
  });
}


function formatPrayerTime(minutes, mode = "round") {
  if (minutes === null || Number.isNaN(minutes)) return "--";

  let rounded;
  if (mode === "ceil") rounded = Math.ceil(minutes - 0.000001);
  else if (mode === "floor") rounded = Math.floor(minutes + 0.000001);
  else rounded = Math.round(minutes);

  const normalized = normalizeMinutes(rounded);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 || 12;

  return `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(minutes) {
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} minutes`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function minutesForward(start, end) {
  let diff = end - start;
  while (diff <= 0) diff += MINUTES_PER_DAY;
  return diff;
}

function normalizeMinutes(value) {
  return ((Math.round(value) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function normalizeMinutesFloat(value) {
  return ((value % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function circularDifference(value, target) {
  return ((value - target + MINUTES_PER_DAY / 2) % MINUTES_PER_DAY) - MINUTES_PER_DAY / 2;
}

export function formatClock24(minutes: number | null, mode: "round" | "ceil" | "floor" = "round"): string {
  if (minutes === null || Number.isNaN(minutes)) return "--:--";
  let rounded;
  if (mode === "ceil") rounded = Math.ceil(minutes - 0.000001);
  else if (mode === "floor") rounded = Math.floor(minutes + 0.000001);
  else rounded = Math.round(minutes);
  const normalized = normalizeMinutes(rounded);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function roundedMinutes(minutes, mode) {
  if (minutes === null || Number.isNaN(minutes)) return null;
  let rounded;
  if (mode === "ceil") rounded = Math.ceil(minutes - 0.000001);
  else if (mode === "floor") rounded = Math.floor(minutes + 0.000001);
  else rounded = Math.round(minutes);
  return normalizeMinutes(rounded);
}

export function getDayTimes(year: number, month: number, day: number) {
  const prayers = calculatePrayerTimes({ year, month, day, city: CITY });
  return {
    fajr: formatClock24(prayers.fajr.time, "round"),
    sunrise: formatClock24(prayers.sunrise, "round"),
    dhuhr: formatClock24(prayers.dhuhr, "ceil"),
    asr: formatClock24(prayers.asr, "ceil"),
    maghrib: formatClock24(prayers.maghrib, "ceil"),
    isha: formatClock24(prayers.isha.time, "ceil"),
    fajrMinutes: roundedMinutes(prayers.fajr.time, "round"),
    dhuhrMinutes: roundedMinutes(prayers.dhuhr, "ceil"),
    asrMinutes: roundedMinutes(prayers.asr, "ceil"),
    maghribMinutes: roundedMinutes(prayers.maghrib, "ceil"),
    ishaMinutes: roundedMinutes(prayers.isha.time, "ceil"),
    fajrAmPm: formatPrayerTime(prayers.fajr.time, "round"),
    dhuhrAmPm: formatPrayerTime(prayers.dhuhr, "ceil"),
    asrAmPm: formatPrayerTime(prayers.asr, "ceil"),
    maghribAmPm: formatPrayerTime(prayers.maghrib, "ceil"),
    ishaAmPm: formatPrayerTime(prayers.isha.time, "ceil"),
    weekday: getWeekday(year, month, day),
    hijri: getHijriDate(year, month, day, CITY.timeZone)
  };
}

export function getMonthTimes(year: number, month: number) {
  const key = `${year}-${month}`;
  const cached = monthTimesCache.get(key);
  if (cached) return cached;
  const days = daysInMonth(year, month);
  const rows = [];
  for (let day = 1; day <= days; day += 1) {
    rows.push({ day, ...getDayTimes(year, month, day) });
  }
  monthTimesCache.set(key, rows);
  return rows;
}

type MonthRow = ReturnType<typeof getDayTimes> & { day: number };

const monthTimesCache = new Map<string, MonthRow[]>();

/** Yield between day chunks so the UI (tabs, nav) stays responsive during first compute. */
export function loadMonthTimesAsync(
  year: number,
  month: number,
  isCancelled: () => boolean = () => false
): Promise<MonthRow[]> {
  const key = `${year}-${month}`;
  const cached = monthTimesCache.get(key);
  if (cached) return Promise.resolve(cached);

  const days = daysInMonth(year, month);
  const rows: MonthRow[] = [];
  const chunk = 2; // ~2 days per turn keeps the main thread free for taps

  return new Promise((resolve, reject) => {
    let day = 1;

    const step = () => {
      if (isCancelled()) {
        reject(new DOMException("cancelled", "AbortError"));
        return;
      }
      const end = Math.min(day + chunk - 1, days);
      for (; day <= end; day += 1) {
        rows.push({ day, ...getDayTimes(year, month, day) });
      }
      if (day > days) {
        monthTimesCache.set(key, rows);
        resolve(rows);
        return;
      }
      globalThis.setTimeout(step, 0);
    };

    globalThis.setTimeout(step, 0);
  });
}

export { MONTHS, WEEKDAYS, METHOD, ISHA_MONTH_RULES, calculatePrayerTimes, formatPrayerTime, daysInMonth, getWeekday };
