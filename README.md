# Bhagya Card (bhagya-card)

AstroLokal "E4 — Fortune Card + 7-Day Streak" retention + astrologer-conversion
experiment, served as a webview inside the AstroLokal app. Built on the
daily-cast playbook patterns (server-authoritative state, stateless pods,
config-driven copy, fire-once wallet credits, self-scheduling daily content).

**The loop:** a new card every day ("it chose me") → escalating streak coins
(10 → 20 → 50) → the card's open question that only a paid consult answers.

## Mechanics

- **A fixed deck of 20 fortune cards.** `deck.cards` in the config is the
  catalogue: `art_key` + `title` + `theme` + `numeral` are a card's identity and
  never change, so there is exactly one illustration per card, forever. Gemini
  chooses which 15 make today's deck and writes only their words — it can never
  invent a card we have no artwork for. Adding a card = one catalogue entry plus
  one illustration. (We say *fortune card*, never *tarot* — `tarot` is on the
  banned-word list.)
- **One card draw per product day.** The user taps one of three face-down
  cards; the revealed card is the seeded deck pick
  (`sha256(user_id + day) % deck size`) — stable across re-opens, different
  from the neighbour's. The tap position is theater, stored for display only.
- **Product day cuts over at 06:00 IST** (`DAY_START_HOUR`, default 6). The
  page silently re-fetches at that boundary rather than showing a countdown.
- **7-day forgiving streak** ("progress, not punishment"): progress counts
  days the user showed up, capped at 7. A missed day never resets it.
  Rewards fire on draws #1, #4, #7 (the plan's D0/D3/D7 chips): 10/20/50
  coins — 80 total, under the 100-coin consult cap. Config:
  `streak.rewards`.
- **Claim** credits the real app wallet via the internal Coin API
  (record-first, fire-once; see below). Unclaimed rewards expire with the
  product day. Post-D7: no more coins, the daily card alone carries the ritual.
- **Consult bridge:** each card ships its own consult nudge and a prefill
  question; the CTA deeplink carries
  `?src=bhagya_card&day=...&card=...&prefill=...` into the existing chat flow.

## Stack

| Piece | Choice |
|---|---|
| Server | Node 24 (LTS) + Express 5, ESM, no framework extras |
| DB | Any Postgres-compliant database via `pg` + one `DATABASE_URL` |
| Migrations | `node-pg-migrate` (official node-postgres tool) — run-once per deploy |
| Client | Single static `public/index.html` (vanilla JS, inline CSS/SVG art) |
| AI content | Gemini REST (`gemini-2.5-flash`), nightly deck of ~15 cards |
| Deploy | Docker (arm64 on Devtron), Kubernetes-ready stateless pods |

## Design

Matches the language of the live Bhagya Score / Daily Dice surfaces: warm peach
gradient, the corner-bracket motif, gold coin chips, the astrologer
chat-bubble nudge, and one sticky CTA. Brand palette exactly as the app uses
it: CTA and Claim are `#F45722` with `#FA9C70` as the pressed state; panels
`#FDD9CE`/`#FEEEE9`; secondary `#FFF9F1`/`#FFEBD2`/`#FFBF6E`.

- **Fonts** — Lora for headings only, Figtree for everything else, self-hosted
  as woff2 in `public/fonts` (~88 KB, six weights). No third-party font
  request, so a slow connection never blocks first paint. **No italics
  anywhere** — `i { font-style: normal }` is set globally because `<i>` is only
  ever used here as a dot.
- **The background is four layers, not one flat colour** — a warm dawn wash
  down the page, a gold aura at the top where the card sits, two off-axis
  blooms so the mid-page does not go dead, and a fine gold-dust dot grid over
  the top so the surface reads as paper. All CSS, no images.
- **Two screens, not six blocks.**
  - *Pre-draw* is one job: eyebrow → "Draw today's card" → "Know what your
    card says about today" → the fan of three → "Tap any card to draw". No
    streak, no CTA — nothing to read, one thing to do.
  - *Post-draw* is one telling, read top to bottom: streak track → **the card**
    → its name → **one** insight → the astrologer bubble → the CTA. Everything
    after the card sits on a single soft panel that the card overlaps from
    above — grounded, but with no inner boxes or divider rules, so it never
    reads as stacked widgets.
- **One insight, not two.** The card's fortune lines are the insight shown
  under the "Daily Insight" chip (`text-wrap: balance` keeps line widths
  even); the `finding`'s open question lives in the astrologer bubble. Showing
  fortune *and* finding read as two near-duplicate paragraphs.
- **The card is the hero.** 204×316 in a gold-foil frame with a deck numeral,
  on a soft translucent plate that frames it like a portrait and overlaps the
  story panel. The streak is a compact 7-node track (coin icon + amount under
  the paying days) that grows a claim row — coin icon | "You won / N coins" |
  orange **Claim** — *only* on the days it owes coins.
- **No countdown on screen.** The page silently reloads itself once 06:00 IST
  passes (server clock), so a phone left open overnight shows the new card.
- **Claiming is a state, not an event.** Redeem → the button becomes an inert
  "Claimed" pill. No coin burst, and the re-render is not marked `fresh`, so
  nothing on the page moves.
- **One CTA, ever.** "Talk to an Astrologer" lives at the end of the story; the
  fixed bottom bar is the same button re-offered once that one scrolls out of
  view (IntersectionObserver), so two are never on screen together.
- **Illustrations** — 20 hand-built placeholder SVGs, one per `art_key`, drawn
  in the brand palette and shown inside the card frame. To swap in real art, set
  `art.baseUrl` in the config: the client then loads `{baseUrl}/{art_key}.{ext}`
  full-bleed and drops its own frame furniture (ticks, numeral, inner plate),
  since a real illustration brings its own composition. No code change.
- **Logo** — `public/logo.png` carries real alpha (the original opaque copy is
  kept at `logo-opaque.png`), so it sits directly on the gradient with no
  plate. It also carries ~10% transparent padding on every side, so the nav
  crops it (`.markBox` overflow + oversized `img`) to sit tight against the
  wordmark; the brand is centred, with the back button on the left.
- **Language** — simple English throughout (copy and card content), pitched at a
  tier-2/3 reader; the Gemini prompt enforces the same register.

## Repo layout

```
bhagya-card/
  public/index.html            # entire client (fan, streak track, reveal, claim)
  public/logo.png              # AstroLokal logo
  public/fonts/                # self-hosted Lora + Figtree woff2
  config/experiment.config.json  # ALL copy + knobs + sample deck + banned-word lint
  src/
    server.js                  # routes, probes, boot, self-scheduling deck publish
    state.js                   # server-authoritative draw/streak/claim (the core)
    pool.js                    # daily deck publish + ensure (advisory-locked)
    gemini.js                  # nightly AI generation w/ strict lint
    coin-api.js                # fire-once wallet credit
    config.js  db.js  day.js   # config load+validate, generic pg client, 06:00-IST day
  scripts/generate-daily-deck.js  # manual backfill/--force CLI
  migrations/                  # node-pg-migrate (one file per schema change)
  Dockerfile  docker-compose.yml  k8s/ (reference manifests)
```

## Run locally

```bash
docker compose up --build
# open http://localhost:3000/?user_id=test-user-1
```

The compose stack runs: postgres 17 → `migrate` (one-shot `npm run migrate:up`)
→ `app` (publishes today's deck at boot from the config sample deck, since no
`GEMINI_API_KEY` is set).

Without Docker: start postgres, `cp .env.example .env`, then
`npm install && npm run migrate:up && npm run dev`.

## API surface

```
GET  /api/session?user_id=X   # full render state (streak, card, reward, copy)
POST /api/draw   {user_id, pick}  # the once-a-day draw (idempotent same-day)
POST /api/claim  {user_id}    # redeem today's streak reward
GET  /healthz  /readyz        # k8s probes (readyz does SELECT 1)
```

Client identity is a raw `user_id` query param — **replace with a signed token
before real traffic** (same open item as daily-cast).

## Database & migrations

Generic Postgres client (`src/db.js`): plain `DATABASE_URL` (+ `PGSSL=require`
for managed PG), no vendor APIs — works on RDS/Cloud SQL/Supabase/Neon/vanilla.

Every schema change is a new `node-pg-migrate` file
(`npm run migrate:create -- my-change`). Applied migrations are recorded in
the `pgmigrations` table, so `npm run migrate:up` is safe to run on every
deploy and each migration executes exactly once per database. On Kubernetes,
run it as the deploy-time Job (`k8s/migrate-job.yaml`) before rolling the
Deployment; on Devtron, first deploy = `npm run migrate:up` in the pod
terminal.

Tables: `deck_days` / `deck_cards` (the day's shared deck),
`user_streaks` (forgiving progress, row-locked on draw),
`user_daily_draws` (one row per user-day = structural one-draw-a-day, reward +
redemption state), `coin_credit_attempts` (fire-once gate + audit trail).

## Daily deck (Gemini)

Self-scheduling, no CronJob: every pod ensures today's deck at boot, every
5 minutes, and on demand per request; publishes are serialized with
`pg_advisory_xact_lock` and generation happens *before* the transaction.

**Nightly pre-generation:** within `DECK_PREGEN_HOURS` (default 4) of the
06:00 IST cutover, the same 5-minute tick generates and publishes
*tomorrow's* deck ahead of time — so the deck is written each night and the
cutover flips onto content that already exists instead of making the first
morning visitor wait on a Gemini call.

Pipeline validation (never trust the model): 10–20 cards, every `art_key` from
the catalogue with its `title` and `theme` copied verbatim, no duplicate
`art_key`, no theme more than 3×, `prefill_question` names the title verbatim,
per-field length caps, banned-word + valence lint. **Failure mode = serve
yesterday's deck**, then the config `sampleDeck` — stale beats broken.

`recentTitleDays` is a prompt *preference*, not a reject: with a fixed 20-card
catalogue and a 15-card deck, demanding no overlap with the last 3 days would be
unsatisfiable. Freshness comes from the words, which are rewritten daily.

Art is never generated: a card's `art_key` indexes the fixed illustration set.

## In-app webview

- **Back:** the top-left back button calls `history.back()` when the webview
  has history, otherwise it fires `nav.backDeeplink` (config, default
  `astrolokal://home`) so the app shell takes the user back to where they
  came from. "Talk to an Astrologer" is the consult deeplink
  (`astrolokal://consult/chat?src=…&day=…&card=…&prefill=…`) — the app's own
  navigation handles the return.
- **Safe areas:** `viewport-fit=cover` + `env(safe-area-inset-top)` on the
  nav and `env(safe-area-inset-bottom)` on both the page bottom and the
  sticky CTA bar, so notches, the iOS home indicator, and Android
  gesture/3-button navigation never cover content. The pre-draw screen sizes
  with `100dvh` (with a `vh` fallback), which tracks the webview's real
  visible height as Android bars show/hide.

## Coin API

`POST {COIN_API_URL}` (HTTP Basic, array body, `userId` numeric, `amount`
"10.00"-string, returns 202-async). It has **no idempotency** — at-most-once
is enforced here via the UNIQUE `idempotency_key` insert gate in
`coin_credit_attempts`; failed attempts are never auto-refired and form the
reconciliation worklist. Leave `COIN_API_URL` unset for the stub ledger.
Dev purpose allowlist: `promo`/`refund` only — we use `refund` (flag to
finance, same as daily-cast).

Contract-verified against a recording mock (2026-07-30): 10 parallel claim
requests produced exactly **one** API call, shaped
`[{"userId": 777001, "amount": "10.00", "purpose": "refund", "description":
"Bhagya Card streak reward 2026-07-30", "source": "bhagya_card"}]` with the
correct Basic auth header; the other nine returned `alreadyClaimed`. The
amount always comes from the server's own `user_daily_draws.reward` row —
the client never submits an amount, and credentials/URL live only in env
(Devtron secret), never in the page.

## Deploy (Devtron dev, condensed)

1. App `astro-bhagya-card`, public https repo, container repo
   `dev/astro-bhagya-card`, **target platform arm64**.
2. Lokal Deployment chart; port 3000 everywhere; probes **httpGet**
   `/readyz` + `/healthz` (not tcp); Istio host
   `dev-astro-bhagya-card.astrolokal.com`.
3. GUI secret `astro-bhagya-card` with `DATABASE_URL`, `PGSSL=require`,
   `COIN_API_URL/USER/PASS`, `GEMINI_API_KEY`; `envFrom` into the workload.
4. Remember the root-commit git-sensor bug: push a second commit before the
   first build.
5. First deploy: `npm run migrate:up` in the pod terminal (deck then
   self-publishes).
6. Config is baked into the image unless you mount a ConfigMap and set
   `EXPERIMENT_CONFIG_PATH` — copy changes otherwise need a rebuild.

## Verification checklist

- [ ] `/readyz` ok; with no `user_id` the page shows the "Please log in"
      card (no retry button — retrying without an identity cannot succeed).
- [ ] Draw → card revealed + 10 coins on day 1; re-open shows the same card
      (seeded + persisted); second draw request returns `alreadyDrawn`.
- [ ] Claim pays once; double-tap → `alreadyClaimed: true`, no second credit;
      `coin_credit_attempts` row status ok; coins land in the app wallet
      (202 ≠ credited — verify in wallet).
- [ ] Streak rail advances; miss a day (simulate) → progress holds, no reset.
- [ ] Draws #4 and #7 pay 20/50; day 8 draw pays 0 and shows the post-D7 note.
- [ ] Consult CTA carries `src`, `day`, `card`, `prefill`.
- [ ] After the 06:00 IST cutover a fresh deck publishes (check logs for
      `[deck] published`) and an open page re-fetches into the new card.
- [ ] Gemini path: `npm run deck:generate -- --day=<tomorrow>` prints
      `content generated by Gemini`; lint failure re-serves yesterday's deck.
