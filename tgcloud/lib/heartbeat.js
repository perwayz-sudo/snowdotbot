// The heartbeat: one weather fetch, then send whatever is due — the morning
// report, rain / temperature / stargazing pings, the Friday preview, the Sunday
// recap, plus the reminder extras (birthdays, Memory Lane, the relationship
// CRM). Dedupe keys live in `subscribers.seen`, so nothing repeats (and the
// same call works from a message, a forced /report, or the pulse endpoint).
import { api } from 'sdk';
import { fetchWeather, fetchAir } from './weather.js';
import { moonInfo } from './moon.js';
import { riddleOfDay } from './content.js';
import { dueContacts, dueMemories, dueReminders } from './reminders.js';
import { suggestGifts } from './gifts.js';
import {
  aqiInfo,
  clothingLine,
  commuteHourly,
  rainWindow,
  stargazingTonight,
  tempAlerts,
  uvInfo,
  workoutWindow,
} from './insights.js';
import {
  buildContactNudge,
  buildEventReminder,
  buildMemoryReplay,
  buildReport,
  buildRainAlert,
  buildRiddleOfDay,
  buildStarAlert,
  buildTempAlert,
  buildWeekendPreview,
  buildWeeklyRecap,
  buildCommuteLine,
  tempAlertLine,
} from './format.js';
import {
  SEND_HOUR,
  WEEKEND_HOUR,
  WEEKEND_DOW,
  RECAP_HOUR,
  RECAP_DOW,
  STAR_HOUR,
  RAIN_LOOKAHEAD_MIN,
  localNow,
  localDateOf,
  localHourOf,
  localDowOf,
  localIsoMinute,
  minutesBetween,
  eventKey,
  pruneSeen,
  heartbeatPlan,
} from './schedule.js';
import { listContacts, listEvents, listMemories, saveHeartbeat } from './store.js';

// Weekly CRM keys must outlive the usual 5-day key pruning.
function pruneCrmSeen(seen, nowMs) {
  const out = {};
  for (const [k, v] of Object.entries(seen || {})) {
    if (k.startsWith('crm:') && Number.isFinite(v) && v > nowMs - 40 * 86400000) out[k] = v;
  }
  return out;
}

// AQI is a nice-to-have on the report — never let it fail the run.
async function prefetchAir(lat, lon) {
  try {
    return await fetchAir(lat, lon);
  } catch (err) {
    console.warn('air quality fetch failed', err && err.message);
    return null;
  }
}

// Runs the due checks for one subscriber and sends what is due.
// `forceReport` sends the full report regardless of the hour (used by the
// /report, /city and /start commands).
export async function heartbeat(sub, { forceReport = false } = {}) {
  const nowMs = Date.now();
  const sent = [];

  // Cheap decision first: a burst of messages within HEARTBEAT_MIN_INTERVAL_MIN
  // skips the whole run (network + DB reads); an upcoming report/preview/recap
  // always goes through and picks the big payload.
  const plan = heartbeatPlan({ seen: sub.seen, tzOffsetMin: sub.tzOffsetMin, nowMs, forceReport });
  if (plan.throttle) return { sent, throttled: true };

  let w = null;
  let air = null;
  try {
    if (plan.full) {
      // The report also needs the air quality — fetch the two in parallel.
      [w, air] = await Promise.all([
        fetchWeather({ lat: sub.lat, lon: sub.lon, label: sub.city }),
        plan.report ? prefetchAir(sub.lat, sub.lon) : Promise.resolve(null),
      ]);
    } else {
      w = await fetchWeather({ lat: sub.lat, lon: sub.lon, label: sub.city, quick: true });
    }
  } catch (err) {
    if (forceReport) throw err;
    console.warn('weather fetch failed', err && err.message);
  }

  const seen = { ...pruneCrmSeen(sub.seen, nowMs), ...pruneSeen(sub.seen || {}, nowMs) };
  seen['hb'] = nowMs; // stamps this run for the throttle above
  const send = async (key, text, extra) => {
    await api.sendMessage({ chat_id: sub.chatId, text, ...extra });
    seen[key] = nowMs;
    sent.push(key);
  };

  if (w) {
    const local = localNow(nowMs, w.tzOffsetMin);
    const today = localDateOf(local);
    const hour = localHourOf(local);
    const dow = localDowOf(local);
    const nowIso = localIsoMinute(local);

    const alerts = tempAlerts(w.today, sub);
    const tempKey = eventKey('temp', today);
    const reportKey = eventKey('report', today);
    let reportWentOut = false;

    if (forceReport || (hour >= SEND_HOUR && !seen[reportKey])) {
      // --- the full report ---------------------------------------------------
      // The plan expected no report (small payload); the fresh offset moved
      // past the cached one (DST edge). Upgrade before building the 3-day list.
      if (w.days.length < w.todayIndex + 4) {
        w = await fetchWeather({ lat: sub.lat, lon: sub.lon, label: sub.city });
      }
      const rain = rainWindow(w.hourly, nowIso, { hours: 12 });
      if (!air) air = await prefetchAir(sub.lat, sub.lon); // rare: the offset moved since the plan
      const aqi = air ? { ...aqiInfo(air.usAqi), pm25: air.pm25 } : null;
      const text = buildReport(w, {
        name: sub.name,
        moon: moonInfo(nowMs),
        clothing: clothingLine({
          temp: w.current.temp,
          min: w.today.min,
          max: w.today.max,
          pop: w.today.pop,
          windMs: w.current.windMs,
        }),
        uv: uvInfo(w.today.uv),
        aqi,
        commute: sub.depTime ? buildCommuteLine(commuteHourly(w, sub.depTime, nowIso), sub.depTime) : null,
        rain,
        alerts: alerts.map(tempAlertLine),
        workout: workoutWindow(w.hourly, nowIso),
      });
      await send(reportKey, text);
      reportWentOut = true;
      if (rain) seen[eventKey('rain', rain.startIso)] = nowMs;
      if (alerts.length) seen[tempKey] = nowMs;
    } else {
      // --- short pings -------------------------------------------------------
      const rain = rainWindow(w.hourly, nowIso, { hours: RAIN_LOOKAHEAD_MIN / 60 });
      if (rain) {
        const key = eventKey('rain', rain.startIso);
        const startsIn = minutesBetween(nowIso, rain.startIso);
        const endsIn = minutesBetween(nowIso, rain.endIso);
        const relevant = endsIn > 0 && (startsIn > 0 ? startsIn <= RAIN_LOOKAHEAD_MIN : startsIn > -60);
        if (relevant && !seen[key]) await send(key, buildRainAlert(w.label, rain, nowIso));
      }

      if (alerts.length && !seen[tempKey]) await send(tempKey, buildTempAlert(w.label, alerts));

      if (hour >= STAR_HOUR) {
        const starKey = eventKey('star', today);
        if (!seen[starKey]) {
          const star = stargazingTonight(w.hourly, today);
          if (star) await send(starKey, buildStarAlert(w.label, star));
          else seen[starKey] = nowMs; // checked tonight — don't re-check
        }
      }

      if (dow === WEEKEND_DOW && hour >= WEEKEND_HOUR) {
        const key = eventKey('weekend', today);
        if (!seen[key]) {
          // The plan normally requested the full payload already; this guards
          // the rare case where the fresh offset moved past the cached one.
          if (w.days.length < w.todayIndex + 6) {
            w = await fetchWeather({ lat: sub.lat, lon: sub.lon, label: sub.city });
          }
          await send(key, buildWeekendPreview(w, { name: sub.name }));
        }
      }

      if (dow === RECAP_DOW && hour >= RECAP_HOUR) {
        const key = eventKey('recap', today);
        if (!seen[key]) {
          if (w.todayIndex < 7) {
            w = await fetchWeather({ lat: sub.lat, lon: sub.lon, label: sub.city });
          }
          const text = buildWeeklyRecap(w, { name: sub.name });
          if (text) await send(key, text);
          else seen[key] = nowMs;
        }
      }
    }

    // The riddle of the day rides along with the morning report.
    if (reportWentOut) {
      const riddleKey = eventKey('riddle', today);
      if (!seen[riddleKey]) {
        await send(riddleKey, buildRiddleOfDay(riddleOfDay(today)), { parse_mode: 'HTML' });
      }
    }
  }

  // --- reminder extras (these need no weather) -------------------------------
  const tz = w ? w.tzOffsetMin : sub.tzOffsetMin;
  const today = localDateOf(localNow(nowMs, tz));

  // Birthdays, anniversaries and countdowns.
  try {
    const rows = await listEvents(sub.chatId);
    for (const r of dueReminders(rows, today)) {
      const key = `event:${r.event.id}:${r.dateIso}:${r.daysUntil}`;
      if (seen[key]) continue;
      const gifts = r.daysUntil === 1 && r.event.kind !== 'event' ? suggestGifts(null, r.event.kind, { count: 2 }) : null;
      await send(key, buildEventReminder(r, gifts));
    }
  } catch (err) {
    console.warn('event reminders failed', err && err.message);
  }

  // Memory Lane: a photo/video from an earlier year, same month & day.
  try {
    const rows = await listMemories(sub.chatId);
    for (const { memory, yearsAgo } of dueMemories(rows, today)) {
      const key = `memory:${memory.id}:${today.slice(0, 4)}`;
      if (seen[key]) continue;
      const caption = buildMemoryReplay(memory, yearsAgo);
      if (memory.kind === 'video') await api.sendVideo({ chat_id: sub.chatId, video: memory.fileId, caption });
      else await api.sendPhoto({ chat_id: sub.chatId, photo: memory.fileId, caption });
      seen[key] = nowMs;
      sent.push(key);
    }
  } catch (err) {
    console.warn('memory replay failed', err && err.message);
  }

  // Relationship CRM: an overdue friend, nudged once per week past the cadence.
  try {
    const rows = await listContacts(sub.chatId);
    for (const { contact, daysSince, weekIndex } of dueContacts(rows, nowMs)) {
      const key = `crm:${contact.id}:${weekIndex}`;
      if (seen[key]) continue;
      await send(key, buildContactNudge(contact.name, daysSince, contact.intervalDays));
    }
  } catch (err) {
    console.warn('contact nudge failed', err && err.message);
  }

  await saveHeartbeat(sub.chatId, { tzOffsetMin: w ? w.tzOffsetMin : sub.tzOffsetMin, seen });
  return { sent };
}
