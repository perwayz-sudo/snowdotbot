// Weather data over HTTP. Forecasts prefer OpenWeather — its key lives in the
// cloud DB (see endpoints/setkey.js), never in this public repo. Open-Meteo
// stays as the keyless fallback, the history source (Sunday recap / Friday
// preview), and the geocoding / travel / archive / air-quality provider.
import { fetch } from 'sdk';
import {
  normalizeWeather,
  normalizeOpenWeather,
  normalizeTravelForecast,
  normalizeArchive,
} from './weather-parse.js';
import { getSetting } from './store.js';

const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const AIR_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';
const REVERSE_API = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
const OW_API = 'https://api.openweathermap.org/data/2.5';

// `label` is what an error names the call by — never pass a URL that carries a
// secret (the OpenWeather appid).
async function getJson(url, { label = url } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${label} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

// "New York" → { lat, lon, label } | null when nothing matches.
export async function geocodeCity(name) {
  const url = `${GEO_API}?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
  const data = await getJson(url);
  const hit = data.results && data.results[0];
  if (!hit) return null;
  return { lat: hit.latitude, lon: hit.longitude, label: hit.name };
}

// Coordinates → a city-ish name ("Paris") or null. Best effort only.
export async function lookupLabel(lat, lon) {
  const url = `${REVERSE_API}?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  const data = await getJson(url);
  return data.city || data.locality || data.principalSubdivision || data.countryName || null;
}

// The OpenWeather key is read once per isolate; undefined = not read yet,
// null = none stored (the layer simply stays on Open-Meteo).
let owKey;
async function openWeatherKey() {
  if (owKey === undefined) {
    try {
      owKey = await getSetting('openweather_key');
    } catch (err) {
      console.warn('openweather key lookup failed', err && err.message);
      owKey = null;
    }
  }
  return owKey;
}

// One OpenWeather round: current conditions, the 5-day / 3-hour forecast and
// the UV index (current + the next days' noon values, best effort).
async function fetchOpenWeather({ lat, lon, label, key }) {
  const base = `lat=${lat}&lon=${lon}&appid=${key}&units=metric`;
  const [current, forecast, uvi, uviForecast] = await Promise.all([
    getJson(`${OW_API}/weather?${base}`, { label: 'openweather/weather' }),
    getJson(`${OW_API}/forecast?${base}`, { label: 'openweather/forecast' }),
    getJson(`${OW_API}/uvi?${base}`, { label: 'openweather/uvi' }).catch(() => null),
    getJson(`${OW_API}/uvi/forecast?${base}&cnt=6`, { label: 'openweather/uvi-forecast' }).catch(() => null),
  ]);
  const w = normalizeOpenWeather({ current, forecast, uvi, uviForecast }, { label });
  return { ...w, source: 'openweather' };
}

// Open-Meteo's forecast in two sizes:
//   full  — current + 3 days of hourly + 7 days of history + 8 days of daily:
//           needs past days (Sunday recap) and a week ahead (Friday preview).
//   quick — current + 2 days hourly + 2 days daily, no history: the rain,
//           temperature, stargazing, UV, workout and commute checks only ever
//           look from now into the next ~2 days, so this is several times
//           smaller and that much faster to fetch and parse.
async function fetchOpenMeteo({ lat, lon, label, quick = false }) {
  const url =
    `${FORECAST_API}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code' +
    ',wind_speed_10m,relative_humidity_2m,cloud_cover,uv_index,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
    ',precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max' +
    '&timezone=auto&wind_speed_unit=ms' +
    (quick ? '&forecast_days=2' : '&past_days=7&forecast_days=8');
  const data = await getJson(url);
  const w = normalizeWeather(data, { label });
  return { ...w, source: 'open-meteo' };
}

// The forecast payload the heartbeat works from: OpenWeather while a key is
// stored, Open-Meteo otherwise — and always on any OpenWeather failure, so it
// never takes the weather down. Either way, times come back in the city's own
// zone, and so does the UTC offset used by 8 AM.
export async function fetchWeather({ lat, lon, label, quick = false }) {
  const key = await openWeatherKey();
  if (key) {
    try {
      return await fetchOpenWeather({ lat, lon, label, key });
    } catch (err) {
      console.warn('openweather fetch failed — falling back to open-meteo:', err && err.message);
    }
  }
  return fetchOpenMeteo({ lat, lon, label, quick });
}

// The deep payload: 7 days of history + 8 days of daily. Open-Meteo only —
// the free OpenWeather tier has neither (used by the Sunday recap and the
// Friday preview).
export async function fetchWeatherFull({ lat, lon, label }) {
  return fetchOpenMeteo({ lat, lon, label, quick: false });
}

// Air quality for a point: US AQI + particulate matter (µg/m³).
export async function fetchAir(lat, lon) {
  const url = `${AIR_API}?latitude=${lat}&longitude=${lon}&current=pm2_5,pm10,us_aqi`;
  const data = await getJson(url);
  const c = data.current || {};
  return { usAqi: c.us_aqi, pm25: c.pm2_5, pm10: c.pm10 };
}

// One date's forecast (travel mode) — the date must be within ~16 days.
export async function fetchTravelForecast(lat, lon, dateIso, { label }) {
  const url =
    `${FORECAST_API}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${dateIso}&end_date=${dateIso}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    ',uv_index_max,wind_speed_10m_max' +
    '&hourly=temperature_2m,precipitation_probability,weather_code' +
    '&timezone=auto&wind_speed_unit=ms';
  const data = await getJson(url);
  return normalizeTravelForecast(data, { label, dateIso });
}

// Archived weather for one date (travel mode) — used for dates too far back
// for the forecast and, a year back, as the "typical" answer for far-future dates.
export async function fetchArchive(lat, lon, dateIso, { label }) {
  const url =
    `${ARCHIVE_API}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${dateIso}&end_date=${dateIso}` +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum' +
    '&timezone=auto';
  const data = await getJson(url);
  return normalizeArchive(data, { label, dateIso });
}
