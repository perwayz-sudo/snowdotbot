// Reminders: birthdays / anniversaries / countdowns, Memory Lane replays and
// the relationship-CRM overdue check. Pure date math + due decisions — the
// heartbeat only sends what these return. No SDK imports.
import { daysAhead } from './travel.js';

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = /^[a-z]+$/i;
const DAY_RE = /^(\d{1,2})(st|nd|rd|th)?$/i;
const YEAR_RE = /^(19|20)\d{2}$/;

const KINDS = ['birthday', 'anniversary', 'event'];
const EVENT_USAGE =
  'Usage: /event add birthday|anniversary|event <title> <date> [year]\n' +
  'e.g. /event add birthday Mom Jun 16 · /event add anniversary Us Jun 3 2019 · /event add event Reunion Jul 10 2027';

function monthOf(token) {
  const t = String(token).toLowerCase().replace(/\.$/, '');
  if (!t || !MONTH_RE.test(t)) return null;
  const hit = Object.keys(MONTHS).find((name) => name === t.slice(0, name.length));
  return hit ? MONTHS[hit] : null;
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// "/event add birthday Mom Jun 16" → { kind, title, date, year }
// Recurring kinds store "MM-DD"; one-off events store "YYYY-MM-DD" and need a year.
export function parseEventArgs(args) {
  const tokens = String(args || '').trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return { error: EVENT_USAGE };
  const verb = tokens[0].toLowerCase();

  if (verb === 'list' || verb === 'ls') return { list: true };
  if (verb === 'del' || verb === 'delete' || verb === 'remove') {
    const id = Number(tokens[1]);
    if (!Number.isInteger(id) || id <= 0) return { error: 'Usage: /event del <id> — ids are in /events' };
    return { del: id };
  }
  if (verb !== 'add') return { error: EVENT_USAGE };

  let kind = (tokens[1] || '').toLowerCase();
  if (kind === 'bday' || kind === 'birthdays') kind = 'birthday';
  if (kind === 'anniv' || kind === 'anniversaries') kind = 'anniversary';
  if (!KINDS.includes(kind)) return { error: EVENT_USAGE };

  const rest = tokens.slice(2);
  if (!rest.length) return { error: EVENT_USAGE };

  // The date: a month name, a day number next to it, and an optional year after.
  let monthIdx = -1;
  let month = 0;
  for (let i = 0; i < rest.length; i++) {
    const m = monthOf(rest[i]);
    if (m != null) {
      monthIdx = i;
      month = m;
      break;
    }
  }
  if (monthIdx === -1) return { error: `📅 I need a date — e.g. /event add ${kind} ${rest.join(' ')} Jun 16` };

  let dayIdx = -1;
  let day = 0;
  for (const i of [monthIdx + 1, monthIdx - 1]) {
    if (i < 0 || i >= rest.length) continue;
    const m = DAY_RE.exec(rest[i]);
    if (m) {
      dayIdx = i;
      day = Number(m[1]);
      break;
    }
  }
  if (dayIdx === -1) return { error: `📅 I need a day — e.g. /event add ${kind} ${rest.join(' ')} 16` };

  const after = Math.max(monthIdx, dayIdx) + 1;
  let year = null;
  let yearIdx = -1;
  if (after < rest.length && YEAR_RE.test(rest[after])) {
    year = Number(rest[after]);
    yearIdx = after;
  }

  const used = new Set([monthIdx, dayIdx, yearIdx].filter((i) => i >= 0));
  const title = rest.filter((_, i) => !used.has(i)).join(' ').trim();
  if (!title) return { error: `📅 Give it a name — e.g. /event add ${kind} Mom Jun 16` };

  const y = year || 2000; // leap-year check only matters for Feb 29
  if (day < 1 || day > daysInMonth(y, month)) {
    return { error: `📅 There is no ${month}/${day}.` };
  }

  const mmdd = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (kind === 'event') {
    if (!year) return { error: '📅 One-off events need a year — e.g. /event add event Reunion Jul 10 2027' };
    return { kind, title, date: `${year}-${mmdd}`, year: null };
  }
  return { kind, title, date: mmdd, year };
}

// When does this event next occur on/after `todayIso`? null when a one-off is past.
export function nextOccurrence(event, todayIso) {
  const todayYear = Number(todayIso.slice(0, 4));
  if (event.date.length === 10) {
    const daysUntil = daysAhead(todayIso, event.date);
    if (daysUntil < 0) return null;
    return { dateIso: event.date, daysUntil, yearsCount: null };
  }
  let year = todayYear;
  if (`${year}-${event.date}` < todayIso) year += 1;
  const dateIso = `${year}-${event.date}`;
  return {
    dateIso,
    daysUntil: daysAhead(todayIso, dateIso),
    yearsCount: event.year != null ? year - event.year : null,
  };
}

// What should ping right now: birthdays/anniversaries the day before and the
// day of; one-off events also a week before.
export function dueReminders(events, todayIso) {
  const out = [];
  for (const event of events) {
    const occ = nextOccurrence(event, todayIso);
    if (!occ) continue;
    const wanted = event.kind === 'event' ? [7, 1, 0] : [1, 0];
    if (wanted.includes(occ.daysUntil)) out.push({ event, ...occ });
  }
  return out;
}

// Memories whose month/day is today, from an earlier year.
export function dueMemories(memories, todayIso) {
  const todayYear = Number(todayIso.slice(0, 4));
  const mmdd = todayIso.slice(5);
  const out = [];
  for (const m of memories) {
    if (m.dayKey === mmdd && m.year < todayYear) out.push({ memory: m, yearsAgo: todayYear - m.year });
  }
  return out;
}

// Overdue friends, nudge-ed once per week past their cadence.
// Returns [{ contact, daysSince, weekIndex }].
export function dueContacts(contacts, nowMs) {
  const out = [];
  for (const contact of contacts) {
    const last = Number(contact.lastContact instanceof Date ? contact.lastContact.getTime() : contact.lastContact);
    if (!Number.isFinite(last)) continue;
    const daysSince = Math.floor((nowMs - last) / 86400000);
    if (daysSince <= contact.intervalDays) continue;
    out.push({ contact, daysSince, weekIndex: Math.floor((daysSince - contact.intervalDays) / 7) });
  }
  return out;
}

// "Sat, Jun 16" — for listings. "2026-06-16" or "06-16" (year taken from today).
export function prettyOccurrence(dateIso) {
  const d = new Date(dateIso + 'T12:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
