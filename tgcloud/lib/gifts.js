// Gift ideas from a person's interests — offline, deterministic-ish suggestions.
// Pure; randomness injectable for tests.

const INTEREST_IDEAS = {
  coffee: ['a bag of specialty single-origin beans', 'a gooseneck pour-over kettle', 'a genuinely nice travel mug'],
  books: ['a gift card to their favorite bookstore', 'a beautiful edition of a book they love', 'a cozy reading blanket + book light'],
  music: ['a vinyl of an album they love', 'concert tickets (or a voucher)', 'good wireless earbuds'],
  gaming: ['a game from their wishlist', 'a retro mini console', 'an ergonomic gaming mouse'],
  fitness: ['a fitness tracker band', 'a good resistance-band set', 'a session with a personal trainer'],
  running: ['merino running socks', 'a running cap + reflective vest', 'an entry to a fun local race'],
  cooking: ['a cast-iron pan', 'a spice set from a nice brand', 'a cooking class for two'],
  baking: ['a quality stand-mixer accessory', 'fancy vanilla + chocolate to bake with', 'a pretty apron'],
  gardening: ['a starter herb kit', 'a beautiful watering can', 'rare seeds for their garden'],
  travel: ['a compact packing-cube set', 'a scratch map of places they’ve been', 'a nice travel journal'],
  art: ['a quality sketchbook + pens', 'a museum membership', 'an online class with an artist they like'],
  fashion: ['a scarf in their favorite color', 'a timeless leather wallet or belt', 'a gift card to a brand they wear'],
  tech: ['a smart-plug pack', 'a slim power bank', 'a gadget from their wishlist'],
  pets: ['a puzzle feeder for the pet', 'a memory-foam pet bed', 'a custom pet portrait'],
  wine: ['a tasting set of three regions', 'an aerator + nice stoppers', 'a wine-tasting experience'],
  photography: ['a nostalgic instant camera', 'a lens-cleaning kit + strap', 'a photo book of their shots'],
  hiking: ['merino hiking socks', 'a lightweight headlamp', 'a national-park annual pass'],
  movies: ['a movie-night basket (snacks + a classic film)', 'a streaming gift card', 'an art print of a favorite movie'],
  climbing: ['a chalk bag in their style', 'gym day passes', 'a guidebook to local crags'],
};

const GENERIC = [
  'write them a sincere letter — people actually keep these',
  'plan a shared experience (dinner, show, day trip)',
  'a plant with a handwritten note',
  'a book you loved, with a note inside the cover',
  'a really good cozy blanket',
  'a small-batch chocolate or tea sampler',
  'pay for the next meal together',
];

const BY_OCCASION = {
  birthday: ['a framed photo of a great memory together', 'a “coupon book” of experiences you’ll actually do'],
  anniversary: ['a weekend getaway or a dinner reservation somewhere special', 'a photo book of your time together', 'matching keepsakes'],
};

export function suggestGifts(interests, occasion, { count = 5, random = Math.random } = {}) {
  const words = String(interests || '')
    .toLowerCase()
    .split(/[\s,;/]+/)
    .filter(Boolean);
  const matched = [];
  for (const [key, ideas] of Object.entries(INTEREST_IDEAS)) {
    if (words.some((w) => w.length >= 4 && (key.startsWith(w) || w.startsWith(key) || key.includes(w)))) {
      matched.push(...ideas);
    }
  }
  shuffle(matched, random);
  const occasionIdeas = [...(BY_OCCASION[occasion] || [])].filter(() => true);
  const rest = [...shuffle([...GENERIC], random)];
  const out = [];
  for (const idea of [...matched, ...occasionIdeas, ...rest]) {
    if (!out.includes(idea)) out.push(idea);
    if (out.length >= count) break;
  }
  return out;
}

function shuffle(arr, random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
