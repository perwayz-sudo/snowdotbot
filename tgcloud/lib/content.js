// Fun content: jokes, riddles, the watch list, slot reels. Pure — no SDK
// imports; randomness is injectable so the logic stays unit-testable.

export const JOKES = [
  'Why don\'t scientists trust atoms? Because they make up everything.',
  'I told my computer I needed a break… now it won\'t stop sending me KitKat ads.',
  'Why did the scarecrow win an award? He was outstanding in his field.',
  'I\'m reading a book about anti-gravity. It\'s impossible to put down.',
  'Why do we never tell secrets on a farm? Because the potatoes have eyes and the corn has ears.',
  'I would tell you a UDP joke, but you might not get it.',
  'Parallel lines have so much in common… it\'s a shame they\'ll never meet.',
  'What do you call a fake noodle? An impasta.',
  'Why did the bicycle fall over? It was two-tired.',
  'I asked the gym trainer if he could teach me to do the splits. He said, "How flexible are you?" I said, "I can\'t make Tuesdays."',
  'How does a penguin build its house? Igloos it together.',
  'My wife told me to stop impersonating a flamingo. I had to put my foot down.',
  'What\'s the best thing about Switzerland? I don\'t know, but the flag is a big plus.',
  'I used to be addicted to the hokey pokey… but I turned myself around.',
  'Why don\'t skeletons fight each other? They don\'t have the guts.',
  'What do you call a bear with no teeth? A gummy bear.',
  'I broke my finger last week. On the other hand, I\'m okay.',
  'Why was the math book sad? Too many problems.',
  'What do you call cheese that isn\'t yours? Nacho cheese.',
  'I only know 25 letters of the alphabet. I don\'t know y.',
  'Why did the coffee file a police report? It got mugged.',
  'What\'s a skeleton\'s favorite instrument? The trom-bone.',
  'I\'m on a seafood diet. I see food and I eat it.',
  'Why do cows wear bells? Because their horns don\'t work.',
  'I\'d tell you a chemistry joke, but I know I wouldn\'t get a reaction.',
];

// Riddles — answers shown in a spoiler, so the whole message is safe to send.
export const RIDDLES = [
  { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', a: 'An echo' },
  { q: 'The more you take, the more you leave behind. What am I?', a: 'Footsteps' },
  { q: 'What has keys but can\'t open locks?', a: 'A piano' },
  { q: 'What gets wetter the more it dries?', a: 'A towel' },
  { q: 'I\'m tall when I\'m young and short when I\'m old. What am I?', a: 'A candle' },
  { q: 'What has a head and a tail but no body?', a: 'A coin' },
  { q: 'What goes up but never comes down?', a: 'Your age' },
  { q: 'What can travel around the world while staying in a corner?', a: 'A stamp' },
  { q: 'What has many teeth but can\'t bite?', a: 'A comb' },
  { q: 'What has one eye but can\'t see?', a: 'A needle' },
  { q: 'What has hands but can\'t clap?', a: 'A clock' },
  { q: 'What can you catch but not throw?', a: 'A cold' },
  { q: 'What belongs to you but is used more by others?', a: 'Your name' },
  { q: 'I have cities, but no houses; forests, but no trees; and water, but no fish. What am I?', a: 'A map' },
  { q: 'What is full of holes but still holds water?', a: 'A sponge' },
  { q: 'What runs all around a backyard yet never moves?', a: 'A fence' },
  { q: 'What becomes smaller when you turn it upside down?', a: 'The number 9' },
  { q: 'What word is spelled the same forwards, backwards and upside down?', a: 'NOON' },
  { q: 'What is so fragile that saying its name breaks it?', a: 'Silence' },
  { q: 'What can fill a room but takes up no space?', a: 'Light' },
];

// A few picks per genre — a curated catalog (offline, no API keys).
export const WATCH = {
  comedy: [
    { t: 'The Grand Budapest Hotel', y: 2014, tag: 'whimsical caper' },
    { t: 'Superbad', y: 2007, tag: 'teen comedy classic' },
    { t: 'Brooklyn Nine-Nine', y: 2013, tag: 'sitcom, bingeable' },
    { t: 'Groundhog Day', y: 1993, tag: 'time-loop comfort watch' },
    { t: 'Ted Lasso', y: 2020, tag: 'feel-good series' },
    { t: 'What We Do in the Shadows', y: 2014, tag: 'mockumentary' },
  ],
  action: [
    { t: 'Mad Max: Fury Road', y: 2015, tag: 'pure adrenaline' },
    { t: 'John Wick', y: 2014, tag: 'stylish action' },
    { t: 'Top Gun: Maverick', y: 2022, tag: 'crowd pleaser' },
    { t: 'The Raid', y: 2011, tag: 'brutal and brilliant' },
    { t: 'Mission: Impossible – Fallout', y: 2018, tag: 'stunt showcase' },
    { t: 'Spider-Man: Into the Spider-Verse', y: 2018, tag: 'animated action' },
  ],
  scifi: [
    { t: 'Arrival', y: 2016, tag: 'thinking sci-fi' },
    { t: 'Blade Runner 2049', y: 2017, tag: 'slow-burn epic' },
    { t: 'The Expanse', y: 2015, tag: 'hard sci-fi series' },
    { t: 'Everything Everywhere All at Once', y: 2022, tag: 'multiverse chaos' },
    { t: 'Andor', y: 2022, tag: 'gritty Star Wars' },
    { t: 'Interstellar', y: 2014, tag: 'space and feelings' },
  ],
  thriller: [
    { t: 'Parasite', y: 2019, tag: 'dark and sharp' },
    { t: 'Gone Girl', y: 2014, tag: 'twisty' },
    { t: 'Sicario', y: 2015, tag: 'tense throughout' },
    { t: 'Mindhunter', y: 2017, tag: 'true-crime series' },
    { t: 'Prisoners', y: 2013, tag: 'grim mystery' },
    { t: 'The Night Agent', y: 2023, tag: 'binge spy drama' },
  ],
  drama: [
    { t: 'The Shawshank Redemption', y: 1994, tag: 'all-timer' },
    { t: 'Manchester by the Sea', y: 2016, tag: 'quiet heartbreak' },
    { t: 'Succession', y: 2018, tag: 'sharp family saga' },
    { t: 'Marriage Story', y: 2019, tag: 'raw and honest' },
    { t: 'Chernobyl', y: 2019, tag: 'gripping miniseries' },
    { t: 'Whiplash', y: 2014, tag: 'intense' },
  ],
  animation: [
    { t: 'Spirited Away', y: 2001, tag: 'Ghibli magic' },
    { t: 'Arcane', y: 2021, tag: 'stunning series' },
    { t: 'The Incredibles', y: 2004, tag: 'family superheroes' },
    { t: 'Your Name', y: 2016, tag: 'romance, gorgeous' },
    { t: 'Spider-Man: Across the Spider-Verse', y: 2023, tag: 'visual fireworks' },
    { t: 'Bluey', y: 2018, tag: 'genuinely for everyone' },
  ],
  horror: [
    { t: 'Get Out', y: 2017, tag: 'smart horror' },
    { t: 'Hereditary', y: 2018, tag: 'deeply unsettling' },
    { t: 'The Haunting of Hill House', y: 2018, tag: 'gothic series' },
    { t: 'A Quiet Place', y: 2018, tag: 'high tension' },
    { t: 'Train to Busan', y: 2016, tag: 'zombie thriller' },
    { t: 'The Others', y: 2001, tag: 'classic ghost story' },
  ],
  romance: [
    { t: 'Before Sunrise', y: 1995, tag: 'one night, all talk' },
    { t: 'Pride & Prejudice', y: 2005, tag: 'costume romance' },
    { t: 'Normal People', y: 2020, tag: 'intimate series' },
    { t: 'About Time', y: 2013, tag: 'sweet with a twist' },
    { t: 'Past Lives', y: 2023, tag: 'gentle and aching' },
    { t: 'Notting Hill', y: 1999, tag: 'classic comfort' },
  ],
  documentary: [
    { t: 'Free Solo', y: 2018, tag: 'grip the armrest' },
    { t: 'Planet Earth II', y: 2016, tag: 'nature, beautifully shot' },
    { t: 'The Last Dance', y: 2020, tag: 'sports saga' },
    { t: 'My Octopus Teacher', y: 2020, tag: 'gentle wonder' },
    { t: 'Jiro Dreams of Sushi', y: 2011, tag: 'craft and obsession' },
    { t: '13th', y: 2016, tag: 'sharp and important' },
  ],
};

export const WATCH_GENRES = Object.keys(WATCH);

// Pretty labels for the buttons and message text.
export const WATCH_LABELS = {
  comedy: '😂 Comedy',
  action: '💥 Action',
  scifi: '🚀 Sci-fi',
  thriller: '🕵️ Thriller',
  drama: '🎭 Drama',
  animation: '🎨 Animation',
  horror: '👻 Horror',
  romance: '💕 Romance',
  documentary: '🌍 Docs',
};

export function randomFrom(arr, random = Math.random) {
  return arr[Math.floor(random() * arr.length)];
}

// Deterministic "riddle of the day": everyone gets the same one on the same
// date, and it cycles through the list evenly.
export function riddleOfDay(dateIso) {
  const dayNumber = Math.floor(Date.parse(dateIso + 'T12:00Z') / 86400000);
  const i = ((dayNumber % RIDDLES.length) + RIDDLES.length) % RIDDLES.length;
  return RIDDLES[i];
}

const REELS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣'];

export function slotsSpin(random = Math.random) {
  const reels = [0, 1, 2].map(() => REELS[Math.floor(random() * REELS.length)]);
  const [a, b, c] = reels;
  let outcome = 'lose';
  if (a === b && b === c) outcome = 'jackpot';
  else if (a === b || b === c || a === c) outcome = 'small';
  return { reels, outcome };
}
