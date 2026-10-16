// Pure parsing and formatting helpers for Open-Meteo JSON (no SDK imports, so
// this file can be unit-tested in plain Node).
//
// Weather codes are the WMO 4677 subset used by Open-Meteo's `weather_code`.

export const WMO = {
  0: { text: 'Clear Sky', emoji: '☀️' },
  1: { text: 'Mainly Clear', emoji: '🌤' },
  2: { text: 'Partly Cloudy', emoji: '⛅' },
  3: { text: 'Overcast', emoji: '☁️' },
  45: { text: 'Fog', emoji: '🌫' },
  48: { text: 'Rime Fog', emoji: '🌫' },
  51: { text: 'Light Drizzle', emoji: '🌦' },
  53: { text: 'Drizzle', emoji: '🌦' },
  55: { text: 'Heavy Drizzle', emoji: '🌦' },
  56: { text: 'Freezing Drizzle', emoji: '🌧' },
  57: { text: 'Freezing Drizzle', emoji: '🌧' },
  61: { text: 'Light Rain', emoji: '🌧' },
  63: { text: 'Rain', emoji: '🌧' },
  65: { text: 'Heavy Rain', emoji: '🌧' },
  66: { text: 'Freezing Rain', emoji: '🌧' },
  67: { text: 'Freezing Rain', emoji: '🌧' },
  71: { text: 'Light Snow', emoji: '❄️' },
  73: { text: 'Snow', emoji: '❄️' },
  75: { text: 'Heavy Snow', emoji: '❄️' },
  77: { text: 'Snow Grains', emoji: '❄️' },
  80: { text: 'Light Showers', emoji: '🌦' },
  81: { text: 'Showers', emoji: '🌦' },
  82: { text: 'Heavy Showers', emoji: '🌧' },
  85: { text: 'Snow Showers', emoji: '🌨' },
  86: { text: 'Heavy Snow Showers', emoji: '🌨' },
  95: { text: 'Thunderstorm', emoji: '⛈' },
  96: { text: 'Thunderstorm with Hail', emoji: '⛈' },
  99: { text: 'Thunderstorm with Heavy Hail', emoji: '⛈' },
};

export function codeInfo(code) {
  return WMO[code] || { text: 'Unknown', emoji: '🌡' };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "2026-10-16" → { y, m, d, weekday, weekdayShort }, parsed manually so a date
// string never drifts across timezones.
function dateParts(isoDate) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, weekday: WEEKDAYS[weekday], weekdayShort: WEEKDAYS_SHORT[weekday] };
}

// "2026-10-16" → "Friday, October 16, 2026"
export function formatDateLabel(isoDate) {
  const { y, m, d, weekday } = dateParts(isoDate);
  return `${weekday}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

// "2026-10-16" → "Fri 16" (day of month without a leading zero)
export function formatShortDay(isoDate) {
  const { d, weekdayShort } = dateParts(isoDate);
  return `${weekdayShort} ${d}`;
}

// "2026-10-16T07:08" → "07:08 AM" (city-local wall clock, as Open-Meteo returns it)
export function formatClock(isoDateTime) {
  const hh = Number(String(isoDateTime).slice(11, 13));
  const mm = String(isoDateTime).slice(14, 16);
  const period = hh < 12 ? 'AM' : 'PM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${String(hour12).padStart(2, '0')}:${mm} ${period}`;
}

// ---------------------------------------------------------------------------
// The main forecast payload (current + hourly + daily), trimmed for the bot.
//
// Times come back in the city's own zone (`timezone=auto`): the daily arrays
// include `past_days` history, so "today" is located by index, not assumed.
export function normalizeWeather(fc, { label } = {}) {
  const todayIso = String(fc.current.time).slice(0, 10);
  let todayIndex = fc.daily.time.indexOf(todayIso);
  if (todayIndex < 0) {
    todayIndex = fc.daily.time.filter((t) => t < todayIso).length;
    todayIndex = Math.min(Math.max(todayIndex, 0), fc.daily.time.length - 1);
  }

  const days = fc.daily.time.map((iso, i) => ({
    iso,
    max: fc.daily.temperature_2m_max[i],
    min: fc.daily.temperature_2m_min[i],
    pop: fc.daily.precipitation_probability_max[i],
    precipMm: fc.daily.precipitation_sum[i],
    uv: fc.daily.uv_index_max[i],
    windMs: fc.daily.wind_speed_10m_max[i],
    sunrise: fc.daily.sunrise[i],
    sunset: fc.daily.sunset[i],
    ...codeInfo(fc.daily.weather_code[i]),
  }));

  // Hourly, from today's 00:00 on, capped at three days.
  const hours = fc.hourly;
  const pick = (arr, i) => (Array.isArray(arr) ? arr[i] : undefined);
  const hourly = [];
  for (let i = 0; i < hours.time.length && hourly.length < 72; i++) {
    const iso = hours.time[i];
    if (iso.slice(0, 10) < todayIso) continue;
    hourly.push({
      iso,
      temp: pick(hours.temperature_2m, i),
      feels: pick(hours.apparent_temperature, i),
      pop: pick(hours.precipitation_probability, i),
      precipMm: pick(hours.precipitation, i),
      windMs: pick(hours.wind_speed_10m, i),
      humidity: pick(hours.relative_humidity_2m, i),
      cloud: pick(hours.cloud_cover, i),
      uv: pick(hours.uv_index, i),
      isDay: pick(hours.is_day, i) === 1,
      ...codeInfo(pick(hours.weather_code, i)),
    });
  }

  const cur = fc.current;
  const info = codeInfo(cur.weather_code);
  return {
    label: label || 'Your location',
    tzOffsetMin: Math.round((fc.utc_offset_seconds || 0) / 60),
    todayIso,
    todayIndex,
    today: days[todayIndex],
    current: {
      temp: cur.temperature_2m,
      feels: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      windMs: cur.wind_speed_10m,
      isDay: cur.is_day === 1,
      text: info.text,
      emoji: info.emoji,
      localIso: cur.time,
    },
    hourly,
    days,
  };
}

// A one-day forecast payload (the travel mode's /v1/forecast call with
// start_date = end_date).
export function normalizeTravelForecast(fc, { label, dateIso }) {
  const i = Math.max(0, fc.daily.time.indexOf(dateIso));
  const day = {
    iso: dateIso,
    max: fc.daily.temperature_2m_max[i],
    min: fc.daily.temperature_2m_min[i],
    pop: fc.daily.precipitation_probability_max[i],
    uv: fc.daily.uv_index_max[i],
    windMs: fc.daily.wind_speed_10m_max[i],
    ...codeInfo(fc.daily.weather_code[i]),
  };
  const slots = [];
  for (const hour of ['06', '09', '12', '15', '18', '21']) {
    const j = fc.hourly.time.findIndex((t) => t.startsWith(dateIso) && t.slice(11, 13) === hour);
    if (j >= 0) {
      slots.push({
        hh: hour,
        temp: fc.hourly.temperature_2m[j],
        pop: fc.hourly.precipitation_probability[j],
        ...codeInfo(fc.hourly.weather_code[j]),
      });
    }
  }
  return { label, dateIso, day, slots };
}

// The archive payload (a past date, or the same date last year as "typical").
export function normalizeArchive(arch, { label, dateIso }) {
  const d = arch.daily;
  const max = d.temperature_2m_max[0];
  if (max == null) return null; // archive lags a few days for recent dates
  return {
    label,
    dateIso,
    max,
    min: d.temperature_2m_min[0],
    precipMm: d.precipitation_sum[0],
    ...codeInfo(d.weather_code[0]),
  };
}
