# CLAUDE.md

Quick orientation for Claude Code when working in this repo. For file-by-file
architecture, keyword-ability mechanics, card-authoring conventions, and the AI
scoring model, see **[SPEC.md](./SPEC.md)** — read it before making non-trivial
changes inside the card game. SPEC.md's **"Game design theory reference"**
section also has genre-level TCG design theory (mana curves, deck archetypes,
rarity/power-creep tradeoffs, keyword design, faction identity) distinct from
this project's own decisions — consult it for vocabulary/tradeoffs when a card
or mechanic design call comes up, alongside "Game design decisions" below for
what this project has actually already decided.

## Commands

- `npm install` — install dependencies
- `npm run dev` — dev server at http://localhost:8080 (also pings Phaser Studio's anonymous usage endpoint via `log.js`)
- `npm run dev-nolog` — same, without the `log.js` ping
- `npm run build` — production build, output to `dist/` (static export)
- `npm run build-nolog` — same, without the `log.js` ping

## Testing

No automated test suite or lint script is configured (`.eslintrc.json` only
extends `next/core-web-vitals`, not wired to a script). Playwright is
installed as a devDependency for UI verification, but **don't unilaterally
boot the dev server and write Playwright automation scripts to smoke-test a
change — ask first.** Many changes are small enough that the user can smoke-test
them manually, faster than scripting a Playwright pass, often against a dev
server they already have running.

## Git / worktrees

`git push` from a worktree in this environment always hangs — it hits a pending
login/credential-manager prompt that never resolves on its own (confirmed: a
backgrounded push sat with zero output until manually killed). Don't retry it
or wait it out. Commit your work in the worktree, then **stop and tell the
user** the branch/commit is ready — they'll push and merge it into `main`
themselves. Don't attempt the push, and don't try to merge a worktree branch
into `main` as part of finishing a task.

## Architecture

Next.js (`output: 'export'` in production only — see `next.config.mjs`'s
phase-conditional config and the matching Gotchas entry below) renders a
single page (`src/pages/index.tsx`) that dynamically imports `src/App.tsx`
with `ssr: false`
— Phaser requires a browser `window`/canvas, so the whole game tree is
client-only. `App.tsx` mounts `PhaserGame`, which drives a `Phaser.Game`
through `Boot → Preloader → CardGame`; `CardGame` is the only gameplay scene
and renders everything itself (no React UI on top of the canvas yet). See
SPEC.md for the React↔Phaser bridge and the Next.js/Phaser import gotcha.

**Path alias:** `@/*` resolves to `src/*` (see `tsconfig.json`).

**Card game module map** (see SPEC.md for the full breakdown of each):
`src/game/types/Card.ts` + `GameState.ts` (types) → `src/game/data/cards.ts`
(authored card data) → `src/game/data/deckGenerator.ts` (random decks) →
`src/game/state/TurnStateMachine.ts` (pure turn/phase logic, zero Phaser
dependency; `src/game/state/counters.ts` alongside it resolves live
game-state values an effect or rule text can reference — see SPEC.md's
"Dynamic values") → `src/game/scenes/CardGame/` (the gameplay scene, split
across `index.ts`/`CardView.ts`/`HelpBoxController.ts`/`PileViewController.ts`
— renders state, forwards input) → `src/game/ai/OpponentAI.ts` + `scoring.ts`
(opponent's turn).

**Card authoring**: prefer the visual editor at `/card-creator`
(`src/cardCreator/`) over hand-editing `cards.ts` — live 1:1 preview via the
real `CardView` code, type-checked form, saves straight to `cards.ts` via a
dev-only API route (`src/pages/api/card-creator/save.ts`) while `npm run dev`
is running. This is a `pages/api` route in a project whose `next.config.mjs`
sets `output: 'export'` — that's deliberate, not an oversight: see the Gotchas
entry below for why the config is phase-conditional to make this actually
work. See SPEC.md's "Card Creator" section for how it's wired up.

## Game design decisions

Things that look fixable but are deliberate — don't silently "correct" these;
if they need revisiting, that's a game-design call for whoever owns the
design, not a bug fix.

- **Hero healing can overheal past max health; minion healing cannot.** Confirmed,
  intentional. Was accidentally clamped once (while adding Lifesteal, which
  made overheal much easier to trigger) and had to be walked back — don't clamp
  the player branch of `TurnStateMachine.heal`.
- **Apocalypse hits every minion on the board, friendly included** (`Deal 10
  damage to all minions`) — a symmetric, high-risk board wipe, not an
  enemy-only AOE. Don't restrict it to `allEnemyMinions` only.
- **A dead/discarded minion's graveyard entry shows its printed base stats**,
  not whatever buffed/damaged stats it had at the moment it died — reset
  happens in `TurnStateMachine`'s `moveToGraveyard` helper.
- **The board's "simplified" card mode intentionally omits rule text and the
  type banner** to maximize art coverage in the cramped board row. It does
  show compact bottom-left status pills (keywords + triggered-effect flavor
  words like Deathcry) since players need that at a glance mid-combat — full
  descriptions stay hover-tooltip-only. This is a deliberate readability
  tradeoff, not a missing feature to backfill further.
- **A "chosen"-target effect defaults to "any minion or hero."** A card whose
  text says "a minion" (or "a hero") must set `chosenRestriction` to match, or
  it silently accepts illegal targets — see SPEC.md's "Card design
  conventions" before adding a new targeted effect.
- **Every new rule (keyword, effect kind, targeting behavior) must be checked
  against the opponent AI, not just the player-facing path.** `ai/scoring.ts`
  (`scorePlayCard`, `scoreAttack`, `computePotentialFaceDamage`) and
  `OpponentAI.ts` are hand-authored heuristics — they don't infer new mechanics
  from `TurnStateMachine`/`keywordRules.ts` automatically, so the opponent can
  silently misplay (or soft-lock) a new rule that renders and enforces
  correctly for the player. This applies whether the new card/rule was added
  by hand or via the Card Creator (`/card-creator`) — that tool only edits
  `cards.ts`, it never touches `ai/scoring.ts`. Actually watch the AI play the
  new card (or trace it through `scoring.ts` by hand) before considering the
  change done.

## Gotchas & Lessons Learned

Non-obvious pitfalls hit while building this out — check here before re-debugging the same class of issue.

- **Container hit areas must be top-left-based, not centered.** `Phaser.GameObjects.Container.displayOriginX/Y` equals `width/2, height/2` (unlike a Sprite, which defaults to 0,0). Phaser's hit-test (`InputManager.pointWithinHitArea`) always adds `+displayOriginX/Y` to the local point before testing it against a custom hit area. So a Container's custom `hitArea`/`hitAreaCallback` passed to `setInteractive()` must be defined as `Rectangle(0, 0, width, height)` / `Circle(width/2, height/2, radius)` — matching what `setHitAreaFromTexture` auto-generates — **not** centered on the container's local `(0,0)` where the visuals are actually drawn. Getting this wrong doesn't error; it silently shrinks the clickable region to one quadrant of the shape (exactly what happened with the card and hero hit areas in `CardGame.ts`). Calling `setInteractive({...})` with **no** custom hit area is unaffected — Phaser auto-generates the correct rectangle from `container.width/height` in that case, which is why the End Turn/Cancel buttons never had this bug.
- **Silent state-machine rejection reads as "broken UI", not "disabled".** `TurnStateMachine` methods (`playCard`, `declareAttack`, ...) silently no-op on invalid actions (e.g. insufficient mana) — no event, no error. Any UI that lets the player *attempt* an action the state machine will reject (dragging a card, clicking a target) must independently gate on the same condition (e.g. dim + skip wiring interactivity for unaffordable cards in `renderHand`) — otherwise a rejected action is indistinguishable from a genuinely broken drag/click. Apply this same gating pattern to any new player-facing action.
- **No `window.Phaser` runtime global.** Next.js bundles Phaser's ESM/CJS build (via webpack), not the standalone `<script>`-tag UMD build — only the latter sets `window.Phaser`. `tsc` won't catch a bare `Phaser.X` runtime reference either, since Phaser's ambient `.d.ts` declares it as a *type-only* global namespace. Always import runtime values by name (`import { Geom } from 'phaser'`) instead. (`src/App.tsx` in the original Phaser Studio template had this exact bug in its demo "Add Sprite" button — `Phaser.Math.Between` with no import — which is one reason that whole demo was removed rather than fixed.)
- **Don't drive the game loop off `update()`.** A turn-based card game only reacts to player actions, not frame ticks — hence `TurnStateMachine` as a plain, Phaser-independent class, with `CardGame` only rendering `state` and forwarding input into it (see Architecture above). Resist the urge to poll state or animate turn logic inside a Scene's `update()`.
- **`setDisplaySize()` after `setCrop()` scales against the full uncropped frame, not the crop rectangle — silently distorting the image.** `cardLayout.ts`'s `coverFit` (CSS `background-size: cover` for a Phaser Image) crops the source to the target aspect ratio, then used to finish with `image.setDisplaySize(width, height)` — but per Phaser's own `Components/Crop.js` docs, cropping "does not change its size, dimensions" as reported by `image.width`/`.height`, so `setDisplaySize` scales `width`/`height` relative to the *full* frame regardless of any crop, not the visible cropped region. This was invisible for a long time because every caller (card art's fixed 2:3 matching `CARD_W:CARD_H`, the card-back texture) happened to need zero real crop, so it coincidentally came out uniform. The first caller to request a genuinely different aspect ratio (`CardView`'s `artVerticalAlign`, which intentionally asks for a shorter-than-2:3 box) exposed real, visible non-uniform stretching. Fix: after `setCrop`, use `image.setScale(width / cropW)` (equal to `height / cropH` by construction, since the crop's aspect always matches the target's) instead of `setDisplaySize` — uniform regardless of whether a crop actually happened.
- **`output: 'export'` blocks API routes in `next dev`, not just `next build` — and the two fail differently.** Confirmed by actually running both, twice, after getting it wrong both times first: (1) assumed `next build` would hard-error with a `pages/api` route present and `output: 'export'` set — it doesn't, it just prints a warning ("Statically exporting ... disables API routes and middleware") and silently drops the route from `dist/`; (2) having "fixed" that, assumed `next dev` would therefore also just work since it runs a real Node server regardless of `output` — it doesn't either: `next dev` logs `⨯ API Routes cannot be used with "output: export"` at startup and then genuinely 404s every request to that route, even though the module compiles. The fix (`next.config.mjs`) is to export a **function**, not a plain object — Next.js calls it with a `phase` argument (`PHASE_DEVELOPMENT_SERVER` from `next/constants.js`, note the explicit `.js` extension: Node's native ESM loader resolves `next.config.mjs` itself before Next's own resolver is available, and `next/constants` alone 404s under strict ESM resolution) — and only include `output: 'export'` when the phase *isn't* dev. This is what makes the Card Creator's save route (`src/pages/api/card-creator/save.ts`) work under `npm run dev` while `npm run build` still produces a fully static `dist/`. Lesson: when a framework's behavior differs between two commands that both "read the same config," verify each command separately — don't extrapolate from one to the other, twice in a row, like this took.
