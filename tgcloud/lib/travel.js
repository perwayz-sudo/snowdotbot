// Pure parsing for the travel command: "/weather Tokyo Jul 10" → the city plus
// a target date. No SDK imports — unit-testable.

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_NAMES = Object.keys(MONTHS);

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function monthOf(token) {
  const t = String(token).toLowerCase().replace(/\.$/, '');
  if (t.length < 3) return null;
  const hit = MONTH_NAMES.find((name) => name === t.slice(0, name.length));
  return hit ? MONTHS[hit] : null;
}

const DAY_RE = /^(\d{1,2})(st|nd|rd|th)?$/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns one of:
//   { city, dateIso }              — everything parsed
//   { city, needDate: true }       — city found, no understandable date
//   { error }                      — a bad date was given
//   null                           — empty input
export function parseTravelQuery(args, nowMs) {
  const tokens = String(args || '').trim().split(/[\s,]+/).filter(Boolean);
  if (!tokens.length) return null;

  const used = new Set();
  const utcToday = new Date(nowMs).toISOString().slice(0, 10);
  const year0 = Number(utcToday.slice(0, 4));

  // "today" / "tomorrow" win outright.
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    if (t === 'today' || t === 'tomorrow') {
      used.add(i);
      const iso = new Date(Date.parse(utcToday + 'T12:00Z') + (t === 'tomorrow' ? 86400000 : 0))
        .toISOString().slice(0, 10);
      return { city: cityOf(tokens, used), dateIso: iso };
    }
  }

  // A full ISO date anywhere.
  for (let i = 0; i < tokens.length; i++) {
    if (ISO_RE.test(tokens[i])) {
      used.add(i);
      return { city: cityOf(tokens, used), dateIso: tokens[i] };
    }
  }

  // "Jul 10" / "10 July" (+ optional year).
  let month = null;
  let monthIdx = -1;
  let day = null;
  let year = null;
  for (let i = 0; i < tokens.length; i++) {
    const m = monthOf(tokens[i]);
    if (m != null && month == null) {
      month = m;
      monthIdx = i;
    } else if (year == null && /^(20\d{2})$/.test(tokens[i]) && tokens[i] !== tokens[monthIdx]) {
      year = Number(tokens[i]);
    }
  }
  if (month == null) return { city: cityOf(tokens, new Set()), dateIso: null, needDate: true };

  used.add(monthIdx);
  // Day number just before or after the month.
  for (const i of [monthIdx - 1, monthIdx + 1, monthIdx + 2]) {
    if (i < 0 || i >= tokens.length) continue;
    const m = DAY_RE.exec(tokens[i]);
    if (m) {
      day = Number(m[1]);
      used.add(i);
      break;
    }
  }
  if (year != null) used.add(tokens.indexOf(String(year)));
  if (day == null) return { city: cityOf(tokens, used), dateIso: null, needDate: true };

  let y = year || year0;
  if (day < 1 || day > daysInMonth(y, month)) return { error: `There is no ${month}/${day}.` };
  let dateIso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // A date that already passed means next year's trip.
  if (!year && dateIso < utcToday) {
    y += 1;
    dateIso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const city = cityOf(tokens, used);
  if (!city) return { error: 'Which city? e.g. /weather Tokyo Jul 10' };
  return { city, dateIso };
}

function cityOf(tokens, used) {
  return tokens.filter((_, i) => !used.has(i)).join(' ').trim();
}

// Whole days from `todayIso` to `dateIso` (both "YYYY-MM-DD").
export function daysAhead(todayIso, dateIso) {
  return Math.round((Date.parse(dateIso + 'T12:00Z') - Date.parse(todayIso + 'T12:00Z')) / 86400000);
}

// The same date one year earlier ("2027-07-10" → "2026-07-10").
export function previousYear(dateIso) {
  return `${Number(dateIso.slice(0, 4)) - 1}${dateIso.slice(4)}`;
}
