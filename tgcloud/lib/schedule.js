// Pure scheduling helpers for the bot's heartbeat — no SDK imports, so this
// file can be unit-tested in plain Node.
//
// Everything is tied to the subscriber's *city-local* wall clock; the city's
// offset (minutes east of UTC) is refreshed from each weather fetch.

export const SEND_HOUR = 8;            // morning report goes out from 08:00
export const WEEKEND_HOUR = 17;        // Friday evening weekend preview
export const WEEKEND_DOW = 5;          // Friday
export const RECAP_HOUR = 18;          // Sunday evening weekly recap
export const RECAP_DOW = 0;            // Sunday
export const STAR_HOUR = 18;           // stargazing checks from 18:00
export const RAIN_LOOKAHEAD_MIN = 180; // rain alert when rain starts within 3 h
export const HEARTBEAT_MIN_INTERVAL_MIN = 10; // at most one full heartbeat per 10 min per chat

// A Date whose UTC fields are the city-local wall clock: offset minutes east of
// UTC applied to "now". A missing offset is treated as UTC.
export function localNow(nowMs, tzOffsetMin) {
  const off = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 0;
  return new Date(nowMs + off * 60000);
}

export function localDateOf(localDate) {
  return localDate.toISOString().slice(0, 10);
}

export function localHourOf(localDate) {
  return localDate.getUTCHours();
}

export function localDowOf(localDate) {
  return localDate.getUTCDay();
}

// "2026-10-17T14:23" — local date + time to the minute.
export function localIsoMinute(localDate) {
  return localDate.toISOString().slice(0, 16);
}

// Minutes from one local wall-clock stamp to another ("...THH:MM"). Both are
// parsed as naive UTC stamps, so only their difference has meaning.
export function minutesBetween(fromIso, toIso) {
  return Math.round((Date.parse(toIso + ':00Z') - Date.parse(fromIso + ':00Z')) / 60000);
}

// "2026-10-17T14:23" → "2026-10-17T14:00" (hour floor).
export function floorHour(iso) {
  return iso.slice(0, 14) + '00';
}

// "2026-10-17T14:00" → "2026-10-17T15:00".
export function addHour(iso) {
  return new Date(Date.parse(iso + ':00Z') + 3600000).toISOString().slice(0, 16);
}

// Dedupe keys: "<type>:<stamp>", e.g. "report:2026-10-17", "rain:2026-10-17T14:00".
export function eventKey(type, stamp) {
  return `${type}:${stamp}`;
}

// Drop heartbeat entries older than maxAgeMs (default 5 days).
export function pruneSeen(seen, nowMs, maxAgeMs = 5 * 86400000) {
  const out = {};
  for (const [k, v] of Object.entries(seen || {})) {
    if (Number.isFinite(v) && Number(v) > nowMs - maxAgeMs) out[k] = v;
  }
  return out;
}

// How the next heartbeat run should behave — decided from the *cached* UTC
// offset alone, before any network call:
//
//   throttle — a run finished less than HEARTBEAT_MIN_INTERVAL_MIN ago and
//              nothing time-critical is waiting: skip entirely, so a burst of
//              messages costs one weather fetch, not one per message.
//   full     — the report, the Friday preview or the Sunday recap could fire
//              this run; those need the big payload (7 days of history + 8 of
//              forecast). Everything else (rain / temp / star pings) fits in
//              the small 2-day payload.
//   report   — the morning report looks due; drives the AQI prefetch.
//
// `seen['hb']` stamps the last run; unknown offset (first-ever run) never
// throttles — it is how the offset gets learned.
export function heartbeatPlan({ seen, tzOffsetMin, nowMs, forceReport = false }) {
  if (forceReport) return { throttle: false, full: true, report: true };
  const tz = Number.isFinite(tzOffsetMin) ? tzOffsetMin : null;
  if (tz == null) return { throttle: false, full: true, report: false };

  const local = localNow(nowMs, tz);
  const today = localDateOf(local);
  const hour = localHourOf(local);
  const dow = localDowOf(local);

  const due = (stamp, fromHour) => hour >= fromHour && !Number(seen?.[eventKey(stamp, today)]);
  const report = due('report', SEND_HOUR);
  const weekend = dow === WEEKEND_DOW && due('weekend', WEEKEND_HOUR);
  const recap = dow === RECAP_DOW && due('recap', RECAP_HOUR);

  const lastHb = Number(seen?.['hb'] || 0);
  const throttle = !(report || weekend || recap) && nowMs - lastHb < HEARTBEAT_MIN_INTERVAL_MIN * 60000;
  return { throttle, full: report || weekend || recap, report };
}
