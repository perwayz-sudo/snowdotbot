# AGENTS.md

Orientation for AI coding assistants (and humans) working in this project.
This file is auto-loaded by Claude Code, Cursor, and similar tools — keep it short
and true. For the full SDK reference (db, Bot API, fetch), see
[docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).

## What this project is

A **Telegram Mini App bot** running on Telegram's serverless platform. You write
JavaScript modules (database schema, shared library code, update handlers); the
platform runs them in a V8 isolate. The `tgcloud` CLI syncs this local project
with the bot's cloud environment — think `wrangler`/`vercel` + `drizzle-kit`.

There is no server to run locally and no `node_modules` to import from at runtime:
the only things available inside a module are the platform SDK and other modules
in this project.

## Layout

Everything the platform runs lives in the **`tgcloud/`** folder. The rest of the
project root is yours (a mini-app front-end, config, docs).

| Path                  | What it is                                                        |
|-----------------------|-------------------------------------------------------------------|
| `tgcloud/schema.js`   | Database schema — tables as **named exports**. One file.          |
| `tgcloud/lib/`        | Shared modules. Subdirectories allowed (`lib/internal/util.js`).  |
| `tgcloud/handlers/`   | Update handlers, **one level only**. Names match Telegram Bot API update types (`message`, `callback_query`, …). |
| `tgcloud/endpoints/`  | Functions the Mini App calls (`POST /api/<name>`), **one level only**. |
| `tgcloud.jsonc`       | Project config. Its `"static"` block names the build folder hosted as the Mini App. |
| `docs/`               | Reference docs (this project's, for you). Not deployed.           |
| `.tgcloud/`           | CLI state (credentials, snapshot, cached layout). **Never edit or read from here** — it's gitignored machine state. |

Only `.js` files under `tgcloud/` (`schema.js`, `lib/`, `handlers/`, `endpoints/`) are deployed
as code, plus — when `tgcloud.jsonc` names one — the front-end's build folder as
the Mini App's static files. Everything else (Markdown, config, `.tgcloud/`, the
front-end's sources) is local-only. Module names are relative to `tgcloud/`: the
file `tgcloud/handlers/message.js` is the module `handlers/message`.

## Mini App front-end

If the project root holds a front-end (Vite, React, Vue, …), its **build output**
is deployed next to the bot and served as the Mini App at
`https://app<app_id>.tgcloud.ai/` — `push` prints the exact URL.

- `tgcloud.jsonc` → `{ "static": { "source": "dist" } }` — `source` names the
  build folder; the other keys of the `static` object are the serving config
  (e.g. `"spa": true` serves `index.html` for unknown extension-less paths —
  client-side routing; `immutable`, `headers`, `redirects`). `tgcloud init` writes
  the file when it recognizes the front-end; after that it's a normal project
  file. JSON with comments and trailing commas (a project may use a strict-JSON
  `tgcloud.json` instead — never both). `"static": "dist"` is accepted as a
  shorthand for `{ "source": "dist" }`.
  `"static": false` removes the deployed site on the next push.
- **Build before you push.** `push` uploads the folder as it is on disk; it never
  runs the build. `npm run deploy` (build + push) is the safe default.
- The front-end is ordinary browser code with npm packages — none of the
  `tgcloud/` module rules apply to it, and `tgcloud/` modules can't import it.
  It talks to the bot's code only through **endpoints** (below).
- The site is served from the host root, so the bundler's default `base` (`/`)
  is right. Don't add `X-Frame-Options` or a restrictive `frame-ancestors`:
  Telegram Web opens Mini Apps in an iframe.

## Endpoints — the Mini App's server side

`tgcloud/endpoints/<name>.js` is called by the Mini App as `POST /api/<name>` on
the same host as the static site. Use it for anything the front-end can't do
itself: the database, the Bot API, secrets.

- `export default async function (input, ctx)` — `input` is the JSON body (an
  object); the return value goes back as JSON.
- `ctx.initData` is the Mini App's init data **verified by the platform** (same
  shape as `Telegram.WebApp.initDataUnsafe`): `ctx.initData.user` is the caller.
  There is no `ctx.user`. Invalid init data → `401`, the endpoint never runs.
- Refuse with `throw new EndpointError('Out of stock', { code: 'OUT_OF_STOCK' })`
  (`import { EndpointError } from 'sdk'`) → `400`, the Mini App gets
  `description` + `parameters`. Any other exception → generic `500`; never
  rely on its message reaching the client.
- Front-end call: `Telegram.WebApp.Serverless.call('<name>', input, (err, result) => …)`
  from the official `telegram-web-app.js` — it sends the init data; `err` has
  `message` (description), `type` (`'ENDPOINT_ERROR'` for your `EndpointError`)
  and `parameters`. Don't hand-roll `fetch` + init data.
- Names: letters, digits, `_`, not starting with a digit (`getProfile`).
  Scaffold with `npx tgcloud add endpoints/<name>`; test with
  `npx tgcloud run endpoints/<name> '{}' --ctx '{ initData: { user: { id: 1 } } }'`.

## Module system — the rules that bite

- **Import project modules by relative path WITH the `.js` extension; import
  the SDK by name.** (from `tgcloud/handlers/message.js`:)
  - ✅ `import { users } from '../schema.js'`
  - ✅ `import { addItem } from '../lib/cart.js'`
  - ✅ `import { db, api, fetch } from 'sdk'` / `import { eq, sql } from 'sdk/db'`
  - ❌ `import { users } from '../schema'` → a relative import must end in `.js`
  - ❌ `import x from '../../src/x.js'` → nothing outside `tgcloud/` is reachable
  - A module's *name* is its path inside `tgcloud/` without `.js` (`lib/cart`);
    `tgcloud run` takes it, and `from 'lib/cart'` (no extension) also resolves —
    but write relative imports.
- **No filesystem, no npm packages** at runtime. Only `sdk` (and its submodules
  like `sdk/db`) and your own project modules exist.
- A handler module's `export default` is what the platform invokes, with the
  update's **payload** as the first argument — for `handlers/message` that's the
  `Message` (i.e. `update.message`), for `handlers/callback_query` the
  `CallbackQuery`, and so on. The full `Update` (with `update_id`) is on the
  second argument: `ctx.update`. An endpoint's `export default` gets
  `(input, ctx)` — see *Endpoints* above.

## Platform SDK (`import … from 'sdk'`)

- **`db`** — the database (query builder + schema DSL). Full API: [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md).
- **`api`** — the Telegram Bot API. `api.<method>({...})` (e.g. `api.sendMessage`,
  `api.getMe`) returns the **unwrapped** result and **throws `BotApiError`** on
  failure (`import { BotApiError } from 'sdk'`; it has `.code`/`.description`/`.parameters`).
- **`fetch`** — outbound HTTP, web-`fetch`-like (`res.status/ok`, `res.json()`,
  `res.text()`, streaming via `for await`, redirects followed).
- **`EndpointError`** — the one way an endpoint refuses a call (see *Endpoints*).

## Database — the rules that bite

Full API in [docs/tgcloud-sdk.md](docs/tgcloud-sdk.md). The non-obvious parts:

- **Every DB call is async — always `await`.** `.all()`, `.get()`, `.values()`,
  `.run()`, `db.$count()` and the raw `db.run/all/get` all return Promises.
- **No foreign keys.** `.references()` and `foreignKey()` **throw at declaration**
  — the runtime runs with FKs off, so they'd be silently inert. Enforce integrity
  in application code (delete children before parents, etc.).
- **Drops happen only via `.deprecated('reason')`** on a column/table/index.
  Deleting the declaration does *not* drop anything.
- **Type changes aren't automatic** — do them by hand with `db.run(...)`.

## Deploy & migrate workflow

**Deploying never touches the database.** Schema sync is a separate, explicit step.

The CLI is a local dev-dependency, so run it with `npx tgcloud <command>` (or use
the `npm run` scripts in package.json — e.g. `npm run deploy`):

```
npx tgcloud status     # what changed locally vs the cloud
npx tgcloud push       # deploy modules (and the static build) to the cloud
npx tgcloud migrate    # apply tgcloud/schema.js changes to the database (interactive)
npx tgcloud run <module> [args]   # execute a handler or endpoint server-side
npx tgcloud pull       # bring the local project in line with the cloud
npx tgcloud login      # link this project to a bot
npx tgcloud webhook    # show the bot's webhook and whether it matches your handlers
```

After you change `tgcloud/schema.js`, `push` reports what the DB *would* change but applies
nothing — run `npx tgcloud migrate` to actually apply it.

The platform manages the bot's webhook for you, derived from your deployed
`handlers/*`, and refreshes it on `push`. If it ever drifts — e.g. someone called
`setWebhook` with the raw bot token — `npx tgcloud webhook` shows the mismatch and
`npx tgcloud webhook sync` repairs it.

## This project — the personal bot (weather + toolkit)

A personal Telegram bot on the serverless platform: a weather report/alerts app
plus a small toolkit (fun commands, reminders, travel/money helpers). Weather
work is throttled and sized: one small (48 h) Open-Meteo fetch serves a burst
of interactions, the big payload is only fetched when the report / Friday
preview / Sunday recap can fire, and the AQI call rides in parallel. The
reminder extras (birthdays, Memory Lane, overdue friends) ride the same
heartbeat. Telegram Serverless has **no cron** — the user chose a *git-based*
one: a GitHub Actions workflow runs `npx tgcloud run endpoints/pulse` every
30 minutes, so the 08:00 report arrives with no chat activity.

- **`tgcloud/handlers/message.js`** — every command and message. Weather:
  `/start /help /menu /city /report /rain /air /uv /workout /sky /commute
  /limits /weather /stop` + location sharing. Fun: `/roll /coin /flip /slots
  /joke /riddle /blackjack /poker /watch /poll`. Reminders: `/event /events
  /contact /contacted /crm /memory` (a sent photo/video is saved and replayed
  on its anniversary). Social: `/confess` (group admins enable; DMs post
  anonymously). Money/travel: `/trip /spent /budget /pack`. The tappable
  **menu bar** comes from `lib/menu.js`: button labels arrive as plain text and
  are translated back into commands; `/start`, `/help` and `/menu` (re)attach
  the bar (they also register Telegram's ☰ command list via `setMyCommands`),
  `/menu hide` removes it. The trailing `heartbeat(sub)` must stay last; paths
  that already sent a fresh report set `heartbeatDone`.
- **`lib/menu.js`** — the menu bar: reply-keyboard layouts, the label → action
  map, and the ☰ `setMyCommands` lists (private + group variants). Pure.
- **`tgcloud/handlers/callback_query.js`** — inline-button taps: blackjack
  (`bj:hit` / `bj:stand`, owner-only, edits the message in place and deletes the
  game when done) and the `/watch` genre picker (`watch:<genre>[:again]`).
- **`lib/heartbeat.js`** — the scheduler: decides what is due right now (report
  from `SEND_HOUR`; rain within `RAIN_LOOKAHEAD_MIN`; temperature limits;
  stargazing after `STAR_HOUR`; Friday preview; Sunday recap; then the extras —
  event reminders, Memory Lane replays, the weekly CRM nudge), builds the texts
  and records each send in `seen` (`{ "<event>:<stamp>": unixMs }`, pruned to 5
  days — CRM keys are kept 40 days since they repeat weekly). And it is
  *cheap*: `heartbeatPlan` decides from the cached offset alone whether the run
  can be skipped (< `HEARTBEAT_MIN_INTERVAL_MIN` since the last one with
  nothing time-critical due — anchored by `seen['hb']`) and whether the small
  or full payload is needed; on report runs the AQI fetch rides in parallel.
  Weather fetch failures only skip the weather part; reminders still go out.
- **`lib/schedule.js`** — those hours/days + city-local date math, plus
  `heartbeatPlan` (throttle + full-vs-quick payload decision). Pure.
- **`lib/insights.js`** — rain windows, clothing advice, UV/AQI categories,
  workout window, stargazing check, temperature alerts, commute pick. Pure.
- **`lib/reminders.js`** — `/event add` parsing, occurrence math (recurring
  `MM-DD` vs one-off `YYYY-MM-DD`), the due lists for events/memories/contacts.
  Pure.
- **`lib/content.js`** — jokes, riddles, the offline watch catalog, slot reels;
  `riddleOfDay` is deterministic by date. Pure.
- **`lib/cards.js`** — blackjack logic + message rendering. Pure.
- **`lib/gifts.js`** — interests → gift ideas. Pure.
- **`lib/packing.js`** — forecast numbers → packing checklist + its text. Pure.
- **`lib/moon.js`** — offline moon phase (no API). Pure.
- **`lib/travel.js`** — `/weather`-style query parsing + date math. Pure.
- **`lib/format.js`** — every message text. Pure. The report's original block
  follows the user's spec exactly — extras go *below* the 3-day forecast, never
  reformat the block itself.
- **`lib/weather.js` / `lib/weather-parse.js`** — Open-Meteo forecast in two
  sizes: `quick` (48 h, no history — every on-demand command: /rain, /air, /uv,
  /workout, /sky, /commute and the alert checks) and full (current + 3 days
  hourly + 7 days history + 8 days daily — the report's 3-day list, the Friday
  preview, the Sunday recap). City-local times. Plus air quality, travel/
  archive calls; BigDataCloud reverse geocode. All keyless. `weather-parse` is
  pure; `weather.js` touches the network only.
- **`lib/store.js`** — all database access: `subscribers` (+ `saveHeartbeat`,
  `setTrip`), `events`, `expenses`, `memories`, `contacts`, `games`,
  `confessions`.
- **`endpoints/pulse.js` + `npm run pulse`** — runs the heartbeat for every
  subscriber: `npx tgcloud run endpoints/pulse` sends the local modules to the
  cloud and runs them there (no deploy needed). The heartbeat's `seen` map
  dedupes, so running it often is safe.
- **`.github/workflows/pulse.yml`** — the "git-based cron": GitHub Actions runs
  the pulse every 30 minutes so the 08:00 report and alerts arrive with no chat
  activity. Auth is the repo secret **`TGCLOUD_TOKEN`** (BotFather → bot →
  Serverless → CLI Access). GitHub cron is UTC and can lag a few minutes; the
  dedupe makes that harmless. (Windows Task Scheduler + `npm run pulse` remains
  the no-GitHub alternative.)

`schema`, `schedule`, `insights`, `moon`, `travel`, `format`, `content`,
`cards`, `poker`, `gifts`, `packing`, `reminders`, `menu` and `weather-parse`
are pure (no SDK imports) and unit-tested in plain Node; keep new logic there
when possible so it stays testable.
