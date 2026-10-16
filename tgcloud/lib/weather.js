// Weather data over HTTP: Open-Meteo (keyless, free) for geocoding, forecasts
// and history, its air-quality API for AQI, BigDataCloud to name a shared pin.
import { fetch } from 'sdk';
import {
  normalizeWeather,
  normalizeTravelForecast,
  normalizeArchive,
} from './weather-parse.js';

const GEO_API = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
const AIR_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const ARCHIVE_API = 'https://archive-api.open-meteo.com/v1/archive';
const REVERSE_API = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
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

// The full payload the heartbeat works from: current + 3 days of hourly +
// 7 days of history + 8 days of daily (today included). Times come back in the
// city's own zone (timezone=auto), and so does the UTC offset used by 8 AM.
export async function fetchWeather({ lat, lon, label }) {
  const url =
    `${FORECAST_API}?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
    '&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code' +
    ',wind_speed_10m,relative_humidity_2m,cloud_cover,uv_index,is_day' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
    ',precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max' +
    '&timezone=auto&wind_speed_unit=ms&past_days=7&forecast_days=8';
  const data = await getJson(url);
  return normalizeWeather(data, { label });
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
