// Pure "advice" logic: rain windows, clothing, UV, AQI, workout, stargazing,
// temperature alerts, commute pick. No SDK imports — unit-testable.
import { addHour, floorHour, minutesBetween } from './schedule.js';

export const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
export const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

const isWet = (h) => h.precipMm >= 0.2 || RAIN_CODES.has(h.code) || SNOW_CODES.has(h.code);
const isMaybeWet = (h) => h.pop >= 55 && h.precipMm >= 0.1;

// "…T14:00" → "14:00"
export function hhmm(iso) {
  return String(iso).slice(11, 16);
}

// First rain/snow window in the next `hours` (default 12), or null.
// `fromIso` is the city-local "now" to the minute.
export function rainWindow(hourly, fromIso, { hours = 12 } = {}) {
  const from = floorHour(fromIso);
  for (let i = 0; i < hourly.length; i++) {
    const h = hourly[i];
    if (h.iso < from) continue;
    if (minutesBetween(fromIso, h.iso) > hours * 60) return null;
    if (!(isWet(h) || isMaybeWet(h))) continue;

    let lastIdx = i;
    let peakPop = h.pop ?? 0;
    let mm = h.precipMm ?? 0;
    let snow = SNOW_CODES.has(h.code);
    for (let j = i + 1; j < hourly.length && j < i + 8; j++) {
      const g = hourly[j];
      if (!(isWet(g) || isMaybeWet(g))) break;
      lastIdx = j;
      peakPop = Math.max(peakPop, g.pop ?? 0);
      mm += g.precipMm ?? 0;
      snow = snow || SNOW_CODES.has(g.code);
    }
    return {
      startIso: h.iso,
      endIso: addHour(hourly[lastIdx].iso),
      peakPop: Math.round(peakPop),
      mm: Math.round(mm * 10) / 10,
      snow,
    };
  }
  return null;
}

// "👕 Wear a jacket (8°–16°)" — or null when nothing worth saying.
export function clothingLine({ temp, min, max, pop, windMs }) {
  const t = temp ?? max ?? 20;
  const base =
    t >= 27 ? 'T-shirt weather' :
    t >= 21 ? 'Light clothes' :
    t >= 15 ? 'A light jacket' :
    t >= 8 ? 'Wear a jacket' :
    t >= 0 ? 'Warm coat' : 'Heavy winter coat, hat and gloves';
  const bits = [base];
  if (Number.isFinite(min) && Number.isFinite(max) && max - min >= 6) bits.push(`${Math.round(min)}°–${Math.round(max)}°`);
  const extra = [];
  if ((pop ?? 0) >= 50) extra.push('take an umbrella ☔');
  if ((windMs ?? 0) >= 8) extra.push('windy');
  return `👕 ${bits.join(' ')}${extra.length ? ' — ' + extra.join(', ') : ''}`;
}

export function uvInfo(uv) {
  const v = Number.isFinite(uv) ? Math.round(uv) : null;
  if (v == null) return null;
  const level =
    v >= 11 ? 'extreme' :
    v >= 8 ? 'very high' :
    v >= 6 ? 'high' :
    v >= 3 ? 'moderate' : 'low';
  const advice =
    v >= 11 ? 'avoid the sun at midday' :
    v >= 8 ? 'sunscreen advised' :
    v >= 6 ? 'sunscreen and a hat' :
    v >= 3 ? 'a little sunscreen' : null;
  return { value: v, level, advice };
}

export function aqiInfo(usAqi) {
  if (!Number.isFinite(usAqi)) return { level: '—' };
  return {
    usAqi: Math.round(usAqi),
    level:
      usAqi <= 50 ? 'Good' :
      usAqi <= 100 ? 'Moderate' :
      usAqi <= 150 ? 'Unhealthy for sensitive groups' :
      usAqi <= 200 ? 'Unhealthy' :
      usAqi <= 300 ? 'Very unhealthy' : 'Hazardous',
  };
}

// Best contiguous 2-hour daytime window from `fromIso` on, or null.
export function workoutWindow(hourly, fromIso) {
  const todayIso = fromIso.slice(0, 10);
  const from = floorHour(fromIso);
  const cand = hourly.filter((h) => h.iso.slice(0, 10) === todayIso && h.iso >= from && h.isDay);
  if (cand.length < 2) return null;
  let best = null;
  for (let i = 0; i + 1 < cand.length; i++) {
    const a = cand[i];
    const b = cand[i + 1];
    const avgTemp = (a.temp + b.temp) / 2;
    const score =
      100 -
      Math.max(a.pop ?? 0, b.pop ?? 0) * 0.7 -
      Math.abs(avgTemp - 19) * 3 -
      ((a.windMs ?? 0) + (b.windMs ?? 0)) / 2 * 4 -
      (isWet(a) || isWet(b) ? 60 : 0);
    if (!best || score > best.score) best = { score, a, b };
  }
  if (!best || best.score < 35) return null;
  return {
    start: hhmm(best.a.iso),
    end: hhmm(addHour(best.b.iso)),
    temp: (best.a.temp + best.b.temp) / 2,
  };
}

// Tonight 19:00–23:00 clear enough for stars, or null.
export function stargazingTonight(hourly, todayIso) {
  const night = hourly.filter((h) => {
    const hour = Number(h.iso.slice(11, 13));
    return h.iso.slice(0, 10) === todayIso && hour >= 19 && hour <= 23;
  });
  if (night.length < 3) return null;
  let cloud = 0;
  let humidity = 0;
  for (const h of night) {
    cloud += h.cloud ?? 100;
    humidity += h.humidity ?? 100;
  }
  cloud /= night.length;
  humidity /= night.length;
  const wet = night.some((h) => isWet(h));
  if (wet || cloud > 30 || humidity > 80) return null;
  return { cloud: Math.round(cloud), humidity: Math.round(humidity) };
}

// [{ kind: 'min'|'max', value, limit }] — today's extremes vs the user's limits.
export function tempAlerts(today, { alertMin, alertMax }) {
  const out = [];
  if (today) {
    if (Number.isFinite(alertMin) && Number.isFinite(today.min) && today.min < alertMin) {
      out.push({ kind: 'min', value: today.min, limit: alertMin });
    }
    if (Number.isFinite(alertMax) && Number.isFinite(today.max) && today.max > alertMax) {
      out.push({ kind: 'max', value: today.max, limit: alertMax });
    }
  }
  return out;
}

// The hourly entry for the next occurrence of "HH:MM", or null.
export function commuteHourly(w, depTime, fromIso) {
  const hh = String(depTime).slice(0, 2);
  const from = floorHour(fromIso);
  const hit = w.hourly.find((h) => h.iso.slice(11, 13) === hh && h.iso >= from);
  if (!hit) return null;
  const explicit = w.hourly.find((h) => h.iso === `${hit.iso.slice(0, 10)}T${depTime}`);
  return explicit || hit;
}

// The uv for "now" out of the hourly table.
export function uvNow(hourly, fromIso) {
  const from = floorHour(fromIso);
  let best = null;
  for (const h of hourly) {
    if (h.iso <= from) best = h;
    else break;
  }
  return best ? best.uv : null;
}
