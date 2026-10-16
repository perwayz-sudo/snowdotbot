// Builds every Telegram message text the bot sends. Pure — no SDK imports.
import { formatDateLabel, formatShortDay, formatClock } from './weather-parse.js';
import { hhmm } from './insights.js';
import { minutesBetween } from './schedule.js';
import { prettyOccurrence } from './reminders.js';
import { WATCH_LABELS } from './content.js';

const SEP = '────────────────────────────';
const SPARK = '▁▂▃▄▅▆▇█';
const BAR = '█';

// "Good morning, Ann! ☀️" — the greeting that opens the report, chosen from the
// city-local hour.
export function greetingFor(name, localHour) {
  const h = Number.isFinite(localHour) ? localHour : 8;
  const part =
    h >= 5 && h < 12 ? 'Good morning' :
    h >= 12 && h < 17 ? 'Good afternoon' :
    h >= 17 && h < 22 ? 'Good evening' : 'Hello';
  return `${part}${name ? `, ${name}` : ''}! ☀️`;
}

export function rainLine(rain) {
  return `${rain.snow ? '❄️ Snow' : '☔ Rain'} likely ${hhmm(rain.startIso)}–${hhmm(rain.endIso)} (up to ${rain.peakPop}%)`;
}

// The morning report: the fixed block the user specified, plus the extras
// below it. `w` is the normalizeWeather() shape; extras are optional.
export function buildReport(w, { name, moon, clothing, uv, aqi, commute, rain, alerts, workout } = {}) {
  const localHour = Number(String(w.current.localIso).slice(11, 13));
  const lines = [
    greetingFor(name, localHour),
    '',
    `☀️ Weather Report — ${w.label}`,
    `📅 ${formatDateLabel(w.todayIso)}`,
    SEP,
    `🌡 Temperature: ${w.current.temp.toFixed(1)}°C (feels like ${w.current.feels.toFixed(1)}°C)`,
    `☁️ Condition: ${w.current.text}`,
    `💧 Humidity: ${Math.round(w.current.humidity)}%`,
    `💨 Wind: ${w.current.windMs.toFixed(1)} m/s`,
    `🌅 Sunrise: ${formatClock(w.today.sunrise)}`,
    `🌇 Sunset: ${formatClock(w.today.sunset)}`,
    SEP,
    '📊 3-Day Forecast:',
  ];
  for (const d of w.days.slice(w.todayIndex + 1, w.todayIndex + 4)) {
    lines.push(`  ${formatShortDay(d.iso)}: ${d.emoji} ${Math.round(d.max)}° / ${Math.round(d.min)}°`);
  }

  if (moon) lines.push(`🌙 Moon: ${moon.name} (${Math.round(moon.illumination)}% lit)`);
  if (clothing) lines.push(clothing);
  if (uv) lines.push(`☀️ UV index ${uv.value} (${uv.level})${uv.advice ? ' — ' + uv.advice : ''}`);
  if (aqi && Number.isFinite(aqi.usAqi)) {
    lines.push(`🫁 AQI ${Math.round(aqi.usAqi)} (${aqi.level}) · PM2.5 ${round1(aqi.pm25)} µg/m³`);
  }
  if (commute) lines.push(commute);
  if (rain) lines.push(rainLine(rain));
  for (const a of alerts || []) lines.push(a);
  if (workout) lines.push(`🏃 Best time to run: ${workout.start}–${workout.end} (${Math.round(workout.temp)}°C)`);
  return lines.join('\n');
}

export function buildRainAlert(label, rain, nowIso) {
  const startIn = minutesBetween(nowIso, rain.startIso);
  const endsIn = minutesBetween(nowIso, rain.endIso);
  const what = rain.snow ? 'Snow' : 'Rain';
  const when =
    startIn > 0 ? `${what} is likely to start around ${hhmm(rain.startIso)} (in ~${startIn} min) and ease by ~${hhmm(rain.endIso)}.` :
    endsIn > 0 ? `${what} has already started — it should ease by ~${hhmm(rain.endIso)}.` :
    `${what} is expected around ${hhmm(rain.startIso)}–${hhmm(rain.endIso)}.`;
  const tip = rain.snow ? 'Dress warm and watch your step! ❄️' : 'Take an umbrella! ☂️';
  return `☂️ ${what} Alert — ${label}\n${when} Chance up to ${rain.peakPop}%. ${tip}`;
}

export function tempAlertLine(alert) {
  return alert.kind === 'min'
    ? `🥶 Cold alert: today's low ${Math.round(alert.value)}°C (your limit ${Math.round(alert.limit)}°C)`
    : `🥵 Heat alert: today's high ${Math.round(alert.value)}°C (your limit ${Math.round(alert.limit)}°C)`;
}

export function buildTempAlert(label, alerts) {
  return `🌡 Temperature Alert — ${label}\n${alerts.map(tempAlertLine).join('\n')}`;
}

export function buildStarAlert(label, star) {
  return (
    `🌌 Stargazing Alert — ${label}\n` +
    `Clear skies tonight — cloud cover ~${star.cloud}%, humidity ${star.humidity}%. ` +
    `A good night to look up! ✨`
  );
}

// Five-day summary sent on Friday evening (the tourist view of the weekend).
export function buildWeekendPreview(w, { name } = {}) {
  const lines = [`🗓 Weekend Preview — ${w.label}`, ''];
  for (const d of w.days.slice(w.todayIndex + 1, w.todayIndex + 6)) {
    lines.push(`${formatShortDay(d.iso)}: ${d.emoji} ${Math.round(d.max)}° / ${Math.round(d.min)}° · 💧 ${d.pop ?? '—'}%`);
  }
  return `${greetingFor(name, 17)}\n\n` + lines.join('\n');
}

// Sunday recap of the past seven days, charted with block characters.
// Null when less than four days of history are available.
export function buildWeeklyRecap(w, { name } = {}) {
  const past = w.days.slice(Math.max(0, w.todayIndex - 7), w.todayIndex);
  if (past.length < 4) return null;
  const lo = Math.min(...past.map((d) => d.min));
  const hi = Math.max(...past.map((d) => d.max));
  const scale = (v) => SPARK[Math.min(7, Math.max(0, Math.round(((v - lo) / (hi - lo || 1)) * 7)))];

  const chart = past.map((d) => `${formatShortDay(d.iso)} ${scale(d.min)}${BAR}${scale(d.max)} ${Math.round(d.min)}°→${Math.round(d.max)}°`);
  const warmest = past.reduce((a, b) => (b.max > a.max ? b : a));
  const coolest = past.reduce((a, b) => (b.min < a.min ? b : a));
  const rainMm = past.reduce((sum, d) => sum + (d.precipMm || 0), 0);

  return (
    `${greetingFor(name, 18)}\n\n` +
    `📊 Your Week in Weather — ${w.label}\n` +
    '```\n' + chart.join('\n') + '\n```\n' +
    `☀️ Warmest: ${formatShortDay(warmest.iso)} ${Math.round(warmest.max)}° · ` +
    `🥶 Coolest night: ${formatShortDay(coolest.iso)} ${Math.round(coolest.min)}° · ` +
    `💧 ${Math.round(rainMm * 10) / 10} mm rain`
  );
}

// "🚴 07:45 commute: 14°C, Light Rain 🌧 — take an umbrella ☔"
export function buildCommuteLine(h, depTime) {
  if (!h) return null;
  const wet = (h.pop ?? 0) >= 50 || (h.precipMm ?? 0) >= 0.2;
  return (
    `🚴 ${depTime} commute: ${Math.round(h.temp)}°C, ${h.text} ${h.emoji}` +
    (wet ? ' — take an umbrella ☔' : '')
  );
}

export function buildTravelForecast(t) {
  const lines = [
    `🧳 Travel Forecast — ${t.label}`,
    `📅 ${formatDateLabel(t.dateIso)}`,
    `${t.day.emoji} ${t.day.text} · ${Math.round(t.day.max)}° / ${Math.round(t.day.min)}°`,
    `💧 Rain chance ${t.day.pop ?? '—'}% · 💨 ${round1(t.day.windMs)} m/s · ☀️ UV ${t.day.uv ?? '—'}`,
  ];
  if (t.slots.length) {
    lines.push('⏱ ' + t.slots.map((s) => `${s.hh}h ${Math.round(s.temp)}° ${s.emoji}`).join(' · '));
  }
  return lines.join('\n');
}

export function buildTravelTypical(t, { beyond } = {}) {
  const lines = [
    `🧳 Travel Weather — ${t.label}`,
    `📅 ${formatDateLabel(t.dateIso)}${beyond ? ' (typical — last year)' : ''}`,
    `${t.emoji} ${t.text} · ${Math.round(t.max)}° / ${Math.round(t.min)}° · 💧 ${round1(t.precipMm)} mm`,
  ];
  if (beyond) {
    lines.push('ℹ️ That date is beyond the 16-day forecast, so this is what the same date looked like last year.');
  }
  return lines.join('\n');
}

export function buildAirReply(label, air, uvNow, uvToday) {
  const lines = [`🫁 Air Quality — ${label}`];
  if (Number.isFinite(air.usAqi)) {
    lines.push(`AQI ${Math.round(air.usAqi)} (${air.level}) · PM2.5 ${round1(air.pm25)} µg/m³ · PM10 ${round1(air.pm10)} µg/m³`);
  } else {
    lines.push('No reading right now.');
  }
  if (uvNow != null) lines.push(buildUVLine(uvNow, uvToday));
  return lines.join('\n');
}

export function buildUVLine(uvNow, uvToday) {
  const parts = [];
  if (uvNow != null) parts.push(`UV now ${Math.round(uvNow)}`);
  if (uvToday) parts.push(`today's max ${uvToday.value} (${uvToday.level})${uvToday.advice ? ' — ' + uvToday.advice : ''}`);
  return `☀️ ${parts.length ? parts.join(' · ') : 'no UV reading right now.'}`;
}

export function buildRainReply(label, rain) {
  if (!rain) return `☀️ No rain expected in ${label} over the next 12 hours.`;
  return (
    `☔ Rain window — ${label}\n` +
    `Likely ${hhmm(rain.startIso)}–${hhmm(rain.endIso)} · chance up to ${rain.peakPop}% · ~${rain.mm} mm`
  );
}

export function buildSkyReply(label, star) {
  if (!star) return `☁️ Not a stargazing night in ${label} — too cloudy, humid or wet.`;
  return `🌌 Tonight looks good — cloud cover ~${star.cloud}%, humidity ${star.humidity}%. Look up! ✨`;
}

export function buildWorkoutReply(workout) {
  if (!workout) return '🏋️ No great outdoor window left today — maybe a short indoor session.';
  return `🏃 Best time to run: ${workout.start}–${workout.end} (${Math.round(workout.temp)}°C).`;
}

// --- fun & social features --------------------------------------------------

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Spoiler needs HTML parse_mode (the heartbeat sends this one with it).
export function buildRiddleOfDay(riddle) {
  return `🧩 Riddle of the day\n\n${esc(riddle.q)}\n\nAnswer: <tg-spoiler>${esc(riddle.a)}</tg-spoiler>`;
}

export function buildSlotsReply(spin) {
  const [a, b, c] = spin.reels;
  const tail =
    spin.outcome === 'jackpot' ? '💰 JACKPOT — all three match!' :
    spin.outcome === 'small' ? '✨ Two match — so close!' :
    '😅 No match. One more spin?';
  return `🎰 ${a} | ${b} | ${c}\n${tail}`;
}

export function buildWatchReply(genre, pick) {
  const label = WATCH_LABELS[genre] || genre;
  return `🎬 Tonight's pick: ${pick.t} (${pick.y})\n${label} · ${pick.tag}\n\nNot feeling it? Tap below for another.`;
}

const KIND_EMOJI = { birthday: '🎂', anniversary: '💞', event: '🎉' };

// rows: [{ id, event, occurrence }] — occurrence may be null (a passed one-off).
export function buildEventsList(rows) {
  if (!rows.length) {
    return '📆 No dates saved yet.\n\nAdd one:\n/event add birthday Mom Jun 16\n/event add anniversary Us Jun 3 2019\n/event add event Reunion Jul 10 2027';
  }
  const lines = ['📆 Your dates & countdowns', ''];
  for (const { id, event, occurrence } of rows) {
    const emoji = KIND_EMOJI[event.kind] || '📅';
    let line = `${emoji} #${id} ${event.title} — `;
    if (!occurrence) {
      line += `${event.date} · passed`;
    } else {
      const inDays = occurrence.daysUntil === 0 ? 'today!' : occurrence.daysUntil === 1 ? 'tomorrow' : `in ${occurrence.daysUntil} days`;
      line += `${prettyOccurrence(occurrence.dateIso)} · ${inDays}`;
      if (occurrence.yearsCount != null && occurrence.yearsCount > 0) {
        line += event.kind === 'birthday' ? ` (turning ${occurrence.yearsCount})` : ` (${occurrence.yearsCount} years)`;
      }
    }
    lines.push(line);
  }
  lines.push('', 'Remove one with /event del <id>.');
  return lines.join('\n');
}

export function buildEventReminder({ event, daysUntil, yearsCount, dateIso }, gifts) {
  const emoji = KIND_EMOJI[event.kind] || '📅';
  const years =
    yearsCount != null && yearsCount > 0
      ? event.kind === 'birthday' ? ` Turning ${yearsCount} 🎉` : ` ${yearsCount} years 💕`
      : '';
  let head;
  if (daysUntil === 7) head = `🎉 In a week: ${event.title} — ${prettyOccurrence(dateIso)}.`;
  else if (daysUntil === 1) head = `${emoji} ${event.title} is tomorrow.${years}`;
  else head = `${emoji} Today: ${event.title}!${years}`;
  const giftLine = daysUntil === 1 && gifts && gifts.length ? `\n🎁 Gift ideas: ${gifts.slice(0, 2).join(' · ')}.` : '';
  return head + giftLine;
}

export function buildMemoryReplay(memory, yearsAgo) {
  const n = yearsAgo === 1 ? '1 year' : `${yearsAgo} years`;
  return `📸 ${n} ago today${memory.caption ? ` — ${memory.caption}` : ''}`;
}

export function buildContactNudge(name, daysSince, intervalDays) {
  return `🤝 It's been ${daysSince} days since you last talked to ${name} — you wanted to keep it to every ${intervalDays}. Send them a hello? 💬`;
}

export function buildList(header, items) {
  return [header, '', ...items].join('\n');
}

export function buildGiftIdeas(person, ideas) {
  const lines = [`🎁 Gift ideas${person ? ` for ${person}` : ''}:`, ''];
  for (const idea of ideas) lines.push(`• ${idea}`);
  return lines.join('\n');
}

function money(n) {
  return (Math.round(n * 100) / 100).toLocaleString('en-US');
}

// { trip, total, categories: [[name, sum]], trips: [[name, sum]] }
export function buildBudgetReply(current, history) {
  const lines = [`💰 Budget — ${current.trip}`, `Total so far: ${money(current.total)}`, ''];
  if (current.categories.length) {
    lines.push('By category:');
    for (const [name, sum] of current.categories) lines.push(`  ${name}: ${money(sum)}`);
    lines.push('');
  }
  lines.push(`Log with /spent 25 lunch · stop with /trip end`);
  if (history.length) {
    lines.push('', 'Past trips:');
    for (const [name, sum] of history) lines.push(`  ${name}: ${money(sum)}`);
  }
  return lines.join('\n');
}

export function buildWatchGenres(genres) {
  return `🎬 What should you watch tonight?\n\nPick a mood:`;
}

// --- the menu bar ------------------------------------------------------------

export function buildMenuPrompt() {
  return (
    '☰ Menu — tap a button below instead of typing.\n' +
    'The bar stays put; hide it with /menu hide, bring it back with /menu.'
  );
}

export function buildFunPrompt() {
  return '🎲 Fun — pick something:';
}

export function buildTravelHint() {
  return (
    '🧳 Trip planning:\n' +
    '/weather Tokyo Jul 10 — forecast for any city + date\n' +
    '/pack Tokyo Jul 10 — auto packing checklist\n' +
    '/trip Tokyo · /spent 25 lunch · /budget — trip money'
  );
}

export function buildSetupHint() {
  return (
    '⚙️ Setup:\n' +
    '📌 Your city: tap 📍 My location, or send /city Berlin\n' +
    '🚴 /commute 07:45 — departure-time report (off with /commute off)\n' +
    '🌡 /limits -5 30 — custom temperature alerts\n' +
    '🙈 /menu hide — remove the button bar\n' +
    '🛑 /stop — no more reports or alerts'
  );
}

export function buildPollHint() {
  return '📊 Usage: /poll Question | option A | option B — 2 to 10 options, separated by |.';
}


function round1(v) {
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : '—';
}
