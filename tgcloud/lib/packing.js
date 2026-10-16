// Packing checklist from a destination forecast. Pure — takes the numbers,
// returns sections; the handler fetches the forecast and renders this.
// Wind in m/s, temps in °C, pop = max rain probability (%), uv = max index.

export function buildChecklist({ max, min, pop = 0, precipMm = 0, windMs = 0, uv = 0, days = 1 }) {
  const essentials = [
    'passport / ID (+ photos of it on your phone)',
    'phone + charger + power bank',
    'wallet, cards and a little local cash',
    'any meds, plus basic painkillers',
  ];

  const clothing = [];
  if (max <= 5) {
    clothing.push('thermal base layers', 'heavy winter coat', 'hat, scarf and gloves');
  } else if (max <= 15) {
    clothing.push('warm mid-layers', 'a proper jacket', 'long trousers');
  } else if (max <= 24) {
    clothing.push('light layers — tees + a light sweater', 'jeans or chinos', 'one warmer top for evenings');
  } else {
    clothing.push('breathable shirts / tops', 'shorts or a skirt', 'a sun hat', 'swimwear if there’s a pool or beach');
  }
  if (min <= 0) clothing.push('insulated boots and wool socks', 'gloves and a beanie for the cold snap');
  if (days >= 4) clothing.push('enough socks & underwear (or plan one laundry day)');

  const weather = [];
  if (pop >= 40 || precipMm >= 1) weather.push('compact umbrella', 'waterproof jacket or shoes');
  if (uv >= 6) weather.push('sunscreen SPF 50', 'sunglasses');
  if (windMs >= 8) weather.push('windbreaker (a hat that stays on)');
  if (max <= 2 && (pop >= 40 || min <= 0)) weather.push('waterproof gloves');
  if (!weather.length) weather.push('nothing special — the forecast looks kind');

  const extras = [
    'a refillable water bottle + snacks for transit',
    'tickets / bookings saved offline',
    'a book or downloads for the ride',
  ];

  return [
    { section: 'Essentials', items: essentials },
    { section: 'Clothing', items: clothing },
    { section: weather.length === 1 && weather[0].startsWith('nothing') ? 'Weather' : 'Weather-specific', items: weather },
    { section: 'Extras', items: extras },
  ];
}

export function formatChecklist(place, dateIso, sections, { beyond = false } = {}) {
  const lines = [
    `🧳 Packing checklist — ${place} · ${dateIso}`,
    beyond ? '_(from last year’s data for this date)_' : '',
    '',
  ].filter((l) => l !== '');
  for (const { section, items } of sections) {
    lines.push(`**${section}**`);
    for (const item of items) lines.push(`☐ ${item}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}
