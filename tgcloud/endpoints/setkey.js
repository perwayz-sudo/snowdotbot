// Stores the OpenWeather API key in the database — the one place a secret can
// live without touching this public repo. Set it once with:
//   npx tgcloud run endpoints/setkey '{"key":"..."}'
// (the deploy workflow does this automatically when the OPENWEATHER_KEY
// secret is set). A wrong or missing key can never break the bot: the
// forecast layer simply falls back to Open-Meteo.
import { EndpointError } from 'sdk';
import { setSetting } from '../lib/store.js';
import { fetchWeather } from '../lib/weather.js';

export default async function (input) {
  const key = String(input?.key ?? '').trim();
  if (!/^[0-9a-f]{32}$/i.test(key)) {
    throw new EndpointError('key must be 32 hex characters', { code: 'BAD_KEY' });
  }
  await setSetting('openweather_key', key);

  // Prove the key end-to-end; `source` says which provider answered.
  let check = null;
  try {
    const w = await fetchWeather({ lat: 48.85, lon: 2.35, label: 'probe' });
    check = {
      source: w.source,
      temp: w.current.temp,
      todayIso: w.todayIso,
      days: w.days.length,
      hourly: w.hourly.length,
      tzOffsetMin: w.tzOffsetMin,
    };
  } catch (err) {
    check = { error: String((err && err.message) || err) };
  }
  return { stored: true, check };
}
