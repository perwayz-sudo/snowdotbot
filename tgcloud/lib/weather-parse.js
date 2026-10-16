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
    code: fc.daily.weather_code[i],
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
      code: pick(hours.weather_code, i),
      ...codeInfo(pick(hours.weather_code, i)),
    });
  }

  const cur = fc.current;
  const info = codeInfo(cur.weather_code);
  // The current hour's UV, for callers that show "UV now" (insights' uvNow
  // reads the hourly table; OW payloads leave the hours' uv null instead).
  const curHourIso = String(cur.time).slice(0, 13) + ':00';
  const curHourEntry = hourly.find((h) => h.iso === curHourIso);
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
      uv: curHourEntry ? curHourEntry.uv : null,
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

// ---------------------------------------------------------------------------
// OpenWeather (the classic 2.5 endpoints) → the same payload shape.
//
// The free tier gives a 5-day / 3-hour forecast, current conditions and the UV
// index (current + daily noon values) — but no history and no 8-day daily, so
// the Sunday recap and Friday preview stay on Open-Meteo (fetchWeatherFull in
// weather.js), which is also the fallback whenever OpenWeather fails.

// OpenWeather condition id → the WMO code our tables already speak, so
// codeInfo and insights' rain/snow sets keep working unchanged.
export function owToWmo(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return undefined;
  if (n >= 200 && n < 300) return 95;                    // thunderstorm
  if (n >= 300 && n < 400) {                             // drizzle
    if (n === 302 || n === 312) return 55;
    if (n === 300 || n === 310 || n === 321) return 51;
    return 53;
  }
  if (n === 500) return 61;                              // light rain
  if (n === 501) return 63;                              // rain
  if (n >= 502 && n < 511) return 65;                    // heavy / extreme rain
  if (n === 511) return 66;                              // freezing rain
  if (n === 520) return 80;                              // light shower rain
  if (n === 521) return 81;                              // shower rain
  if (n >= 522 && n < 600) return 82;                    // heavy shower rain
  if (n === 600) return 71;                              // light snow
  if (n === 601) return 73;                              // snow
  if (n === 602) return 75;                              // heavy snow
  if (n >= 611 && n < 620) return 66;                    // sleet / rain and snow
  if (n === 620 || n === 621) return 85;                 // snow showers
  if (n === 622) return 86;                              // heavy snow showers
  if (n >= 700 && n < 800) return n === 771 || n === 781 ? 95 : 45; // fog, haze, squall
  if (n === 800) return 0;
  if (n === 801) return 1;
  if (n === 802) return 2;
  if (n === 803 || n === 804) return 3;
  return undefined;
}

// `current` = /data/2.5/weather, `forecast` = /data/2.5/forecast (40 steps),
// `uvi` = /data/2.5/uvi, `uviForecast` = /data/2.5/uvi/forecast (best effort,
// may be null). Times are rebuilt from the forecast's own UTC offset.
export function normalizeOpenWeather({ current, forecast, uvi, uviForecast }, { label } = {}) {
  const tzSec = Number(forecast?.city?.timezone) || Number(current?.timezone) || 0; // seconds east of UTC
  const localStamp = (sec) => new Date((sec + tzSec) * 1000).toISOString().slice(0, 16);
  const localDate = (sec) => localStamp(sec).slice(0, 10);

  const cur = current || {};
  const curId = owToWmo(cur.weather?.[0]?.id);
  const curInfo = codeInfo(curId);
  const curIso = localStamp(cur.dt);
  const todayIso = curIso.slice(0, 10);

  // UV: "now" from the current reading, later days from the noon forecast.
  const uvValue = Number.isFinite(uvi?.value) ? uvi.value : null;
  const uvByDate = new Map();
  for (const e of Array.isArray(uviForecast) ? uviForecast : []) {
    const sec = e?.date ?? e?.dt;
    if (Number.isFinite(sec) && Number.isFinite(e?.value)) uvByDate.set(localDate(sec), e.value);
  }

  // Each 3-hour step covers [dt, dt+3h) — expand to hourly so the rain,
  // commute and workout checks keep their hourly look (values repeat).
  const hourly = [];
  const steps = Array.isArray(forecast?.list) ? forecast.list : [];
  for (const s of steps) {
    if (hourly.length >= 72) break;
    const wmo = owToWmo(s.weather?.[0]?.id);
    const info = codeInfo(wmo);
    const pop = Number.isFinite(s.pop) ? Math.round(s.pop * 100) : null;
    const mm = ((s.rain && s.rain['3h']) || 0) + ((s.snow && s.snow['3h']) || 0);
    const perHour = Math.round((mm / 3) * 100) / 100;
    for (let k = 0; k < 3 && hourly.length < 72; k++) {
      hourly.push({
        iso: localStamp(s.dt + k * 3600),
        temp: s.main?.temp,
        feels: s.main?.feels_like,
        pop,
        precipMm: perHour,
        windMs: s.wind?.speed,
        humidity: s.main?.humidity,
        cloud: s.clouds?.all,
        uv: null, // the free tier has no hourly UV
        isDay: s.sys?.pod === 'd',
        code: wmo,
        ...info,
      });
    }
  }

  // Daily buckets from the same steps; the icon comes from local noon.
  const groups = new Map();
  for (const s of steps) {
    const iso = localDate(s.dt);
    if (!groups.has(iso)) groups.set(iso, []);
    groups.get(iso).push(s);
  }
  const days = [];
  for (const [iso, list] of groups) {
    const temps = list.map((s) => s.main?.temp).filter(Number.isFinite);
    const winds = list.map((s) => s.wind?.speed).filter(Number.isFinite);
    const pops = list.map((s) => s.pop).filter(Number.isFinite);
    const mm = list.reduce((sum, s) => sum + ((s.rain && s.rain['3h']) || 0) + ((s.snow && s.snow['3h']) || 0), 0);
    const midday = list.reduce((a, b) => {
      const da = Math.abs(Number(localStamp(a.dt).slice(11, 13)) - 12);
      const db = Math.abs(Number(localStamp(b.dt).slice(11, 13)) - 12);
      return db < da ? b : a;
    });
    const wmo = owToWmo(midday.weather?.[0]?.id);
    const isToday = iso === todayIso;
    days.push({
      iso,
      max: temps.length ? Math.max(...temps) : null,
      min: temps.length ? Math.min(...temps) : null,
      pop: pops.length ? Math.round(Math.max(...pops) * 100) : null,
      precipMm: Math.round(mm * 10) / 10,
      uv: uvByDate.has(iso) ? uvByDate.get(iso) : isToday ? uvValue : null,
      windMs: winds.length ? Math.max(...winds) : null,
      sunrise: isToday && cur.sys?.sunrise ? localStamp(cur.sys.sunrise) : null,
      sunset: isToday && cur.sys?.sunset ? localStamp(cur.sys.sunset) : null,
      code: wmo,
      ...codeInfo(wmo),
    });
  }

  // Just before local midnight the first step is already tomorrow — make sure
  // "today" exists (built from the current reading) at its natural index.
  let todayIndex = days.findIndex((d) => d.iso === todayIso);
  if (todayIndex < 0) {
    const t = cur.main?.temp;
    days.unshift({
      iso: todayIso,
      max: cur.main?.temp_max ?? t,
      min: cur.main?.temp_min ?? t,
      pop: null,
      precipMm: null,
      uv: uvValue,
      windMs: cur.wind?.speed,
      sunrise: cur.sys?.sunrise ? localStamp(cur.sys.sunrise) : null,
      sunset: cur.sys?.sunset ? localStamp(cur.sys.sunset) : null,
      code: curId,
      ...curInfo,
    });
    todayIndex = 0;
  }

  return {
    label: label || 'Your location',
    tzOffsetMin: Math.round(tzSec / 60),
    todayIso,
    todayIndex,
    today: days[todayIndex],
    current: {
      temp: cur.main?.temp,
      feels: cur.main?.feels_like,
      humidity: cur.main?.humidity,
      windMs: cur.wind?.speed,
      isDay: !String(cur.weather?.[0]?.icon || 'd').endsWith('n'),
      uv: uvValue,
      text: curInfo.text,
      emoji: curInfo.emoji,
      localIso: curIso,
    },
    hourly,
    days,
  };
}
