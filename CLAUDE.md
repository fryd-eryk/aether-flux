# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm install` — install dependencies
- `npm run dev` — dev server at http://localhost:8080 (also pings Phaser Studio's anonymous usage endpoint via `log.js`)
- `npm run dev-nolog` — same, without the `log.js` ping
- `npm run build` — production build, output to `dist/` (static export)
- `npm run build-nolog` — same, without the `log.js` ping

No test suite or lint script is configured (`.eslintrc.json` only extends `next/core-web-vitals`, not wired to a script).

## Architecture

Next.js (`output: 'export'`, see `next.config.mjs`) renders a single page
(`src/pages/index.tsx`) that dynamically imports `src/App.tsx` with `ssr: false`
— Phaser requires a browser `window`/canvas, so the whole game tree is
client-only. `App.tsx` is currently a bare shell that just mounts
`PhaserGame` — the game renders entirely inside the Phaser canvas, no React
UI on top of it yet.

**React ↔ Phaser bridge** (infrastructure, currently unused by the game itself but kept for future React-driven UI):
- `src/PhaserGame.tsx` is the bridge component. It calls `StartGame()` (from
  `src/game/main.ts`) once in `useLayoutEffect` to construct the `Phaser.Game`,
  and exposes `{ game, scene }` to the parent via `forwardRef`.
- `src/game/EventBus.ts` is a shared `Phaser.Events.EventEmitter` used for
  all React↔Phaser communication in both directions (`EventBus.emit(...)` /
  `EventBus.on(...)`). The card game itself also uses it internally — see below.
- A Scene emits `EventBus.emit('current-scene-ready', this)` once ready to be
  driven from React (`CardGame` does this at the end of `create()`).

**Runtime import caveat:** Next.js bundles Phaser's ESM/CJS build, which does
**not** attach a `window.Phaser` global (only Phaser's standalone UMD
`<script>` build does that). Always import runtime values you need (e.g.
`Geom`, `Math`, `Events`) by name from `'phaser'` — `import { Geom } from
'phaser'` — rather than referencing a bare global `Phaser.x`. Referencing
`Phaser.SomeNamespace` as a *type* (e.g. `Phaser.GameObjects.Container` in an
annotation) is fine and doesn't need an import, since that's resolved by
Phaser's ambient `.d.ts` at compile time only.

**Scene flow** (`src/game/main.ts`): `Boot → Preloader → CardGame`.
`Boot`/`Preloader` are a minimal loading scaffold (no assets loaded yet —
`CardGame` currently draws everything procedurally with `add.rectangle`/`add.text`/`add.circle`,
no textures). Add real card art loading in `Preloader.preload()` once it exists.

## Card game architecture

- `src/game/types/` — `Card.ts` (`CardDefinition`, `CardInstance`, effect/target types), `GameState.ts` (`TurnPhase`, `PlayerState`, `GameState`), `common.ts` (`PlayerId`).
- `src/game/data/cards.ts` — authored `CARD_DEFINITIONS` and a ready-made `STARTER_DECK`.
- `src/game/data/cardFactory.ts` — turns definitions into deck `CardInstance`s (`createCardInstance`, `buildDeck`, `shuffle`).
- `src/game/state/createInitialState.ts` — builds a full `GameState` from two deck lists.
- `src/game/state/TurnStateMachine.ts` — the turn/phase state machine (`playCard`, `declareAttack`, `selectTarget`, `cancelTarget`, `endTurn`). Pure TypeScript, zero Phaser dependency; emits `EventBus` events (`state:phase-change`, `state:card-played`, `state:attack`, `state:card-died`, `state:card-drawn`, `state:game-over`) that `CardGame` listens to.
- `src/game/scenes/CardGame.ts` — the only gameplay scene. Renders `TurnStateMachine.state` and forwards input into it; tears down and rebuilds the whole board on every `state:phase-change` event rather than incrementally patching. The opponent's turn is driven by `runOpponentTurn` (called off the `phaseChangeHandler` field's `MainIdle`/opponent branch), which asks `src/game/ai/OpponentAI.ts` for one action at a time and executes it via the same `TurnStateMachine` methods the player uses — see below.
- **Deck/graveyard piles & the pile-inspect overlay** (`CardGame.ts`): both off-board zones render through one `renderPile(playerState, zone, y)` (`PileZone = 'deck' | 'graveyard'`), stacked in the `PILE_X` column with each player's graveyard one `PILE_ROW_GAP` from its own deck, on that player's side. Clicking a pile opens a full-screen dimmed grid of its contents. Which pile is open is *scene state* (`openPileView`), not a fire-and-forget overlay: `renderNow()` tears it down with the rest of the board and repaints it at its tail, so an open pile survives the board rebuilds that fire every 600ms during the opponent's turn and keeps showing live contents. Its objects live in `pileViewObjects`, kept separate from `renderedObjects` for that reason. The deck view sorts by cost then name so opening your own deck doesn't leak the shuffled draw order; the graveyard keeps its natural chronological order.
- `src/game/ai/` — the opponent AI. `types.ts` defines `AIAction`. `scoring.ts` has pure, stateless heuristic scoring functions (`scorePlayCard`, `scoreAttack`, `computePotentialFaceDamage` for lethal detection). `OpponentAI.ts`'s `decideOpponentAction(state)` scores every legal action available to the active player and returns the single best one (or `null` to pass) — a greedy, single-step scorer with no search/lookahead beyond the explicit lethal check, modeled on Hearthstone's shipped AI design (see Blizzard's 2014 GDC "AI Postmortem" talk). `CardGame` calls `decideOpponentAction` again each time an action resolves back to `MainIdle`, so a full opponent turn is a chain of one-action-at-a-time decisions, paced 600ms apart.

### Keyword abilities

Static minion keywords (`CardDefinition.keywords?: Keyword[]`, `Card.ts`) are a separate mechanism from the trigger+action `effects` system above — keywords are always-on rules modifiers, not one-shot triggered actions. `src/game/state/keywordRules.ts` holds the pure enforcement logic (`hasKeyword`, `canDeclareAttack`, `getMaxAttacks`, `tauntRestrictedTargets`), shared by `TurnStateMachine`, `ai/scoring.ts`/`ai/OpponentAI.ts`, and `CardGame`'s rendering so "can this minion attack / be attacked" logic exists in exactly one place — do not re-derive it locally in a new call site. `CardInstance.keywords` is a runtime `Set<Keyword>` (seeded from the definition, then mutated as consumable keywords like Divine Shield are used up) — code must read `instance.keywords`, not `definition.keywords`, to see a minion's *current* keyword state. `src/game/data/keywordMetadata.ts` holds display-only badge data (`CardGame` renders it under the card name), kept separate from the pure rules module.

Implemented so far (Phase 1 of a larger roadmap — see the design conversation this was planned in for the deferred 10): **Taunt** (enemy attacks must target a Taunt minion first — enforced in `TurnStateMachine.computeValidTargets`), **Charge** (ignores summoning sickness — the minion's `summoningSick` flag stays `true` internally even so; only attack-eligibility bypasses it, which is why `CardGame`'s dim-on-summoning-sick check has an explicit Charge exemption), **Divine Shield** (absorbs one full instance of damage, combat *or* spell — enforced once in `TurnStateMachine.dealDamage`, which is why that method returns the damage actually applied rather than `void`), **Windfury** (`CardInstance.attacksThisTurn: number` vs. a max from `getMaxAttacks`, not a boolean — replaced the old `hasAttackedThisTurn` field entirely), **Lifesteal** (heals the dealing minion's controller by whatever `dealDamage` actually applied, so a Divine-Shield-absorbed hit correctly heals for 0).

**Hero overheal is an intentional, confirmed design choice — do not clamp `TurnStateMachine.heal`'s player branch to `maxHealth`.** It was mistakenly "fixed" once already (while adding Lifesteal, since Lifesteal made overheal much easier to trigger by healing on every successful attack rather than only via a deliberately-cast spell) and had to be walked back. If overheal ever needs revisiting, that's a decision for whoever owns game design, not something to silently correct as a bug.

Minion healing *is* capped, unlike hero healing — `CardInstance.maxHealth` (set from `CardDefinition.health` at creation, raised by health buffs in `TurnStateMachine.buff`) is the ceiling `TurnStateMachine.heal` clamps a minion's `currentHealth` to.

## Assets

`public/assets` is currently empty. Load new assets in `Preloader.preload()`
(`this.load.image(...)` / `this.load.atlas(...)`) via paths like
`this.load.image('key', 'foo.png')` (path is already scoped to `assets/` via
`this.load.setPath('assets')`). On build they're copied into `dist/assets`.

**Path alias:** `@/*` resolves to `src/*` (see `tsconfig.json`).

## Gotchas & Lessons Learned

Non-obvious pitfalls hit while building this out — check here before re-debugging the same class of issue.

- **Container hit areas must be top-left-based, not centered.** `Phaser.GameObjects.Container.displayOriginX/Y` equals `width/2, height/2` (unlike a Sprite, which defaults to 0,0). Phaser's hit-test (`InputManager.pointWithinHitArea`) always adds `+displayOriginX/Y` to the local point before testing it against a custom hit area. So a Container's custom `hitArea`/`hitAreaCallback` passed to `setInteractive()` must be defined as `Rectangle(0, 0, width, height)` / `Circle(width/2, height/2, radius)` — matching what `setHitAreaFromTexture` auto-generates — **not** centered on the container's local `(0,0)` where the visuals are actually drawn. Getting this wrong doesn't error; it silently shrinks the clickable region to one quadrant of the shape (exactly what happened with the card and hero hit areas in `CardGame.ts`). Calling `setInteractive({...})` with **no** custom hit area is unaffected — Phaser auto-generates the correct rectangle from `container.width/height` in that case, which is why the End Turn/Cancel buttons never had this bug.
- **Silent state-machine rejection reads as "broken UI", not "disabled".** `TurnStateMachine` methods (`playCard`, `declareAttack`, ...) silently no-op on invalid actions (e.g. insufficient mana) — no event, no error. Any UI that lets the player *attempt* an action the state machine will reject (dragging a card, clicking a target) must independently gate on the same condition (e.g. dim + skip wiring interactivity for unaffordable cards in `renderHand`) — otherwise a rejected action is indistinguishable from a genuinely broken drag/click. Apply this same gating pattern to any new player-facing action.
- **No `window.Phaser` runtime global.** Next.js bundles Phaser's ESM/CJS build (via webpack), not the standalone `<script>`-tag UMD build — only the latter sets `window.Phaser`. `tsc` won't catch a bare `Phaser.X` runtime reference either, since Phaser's ambient `.d.ts` declares it as a *type-only* global namespace. Always import runtime values by name (`import { Geom } from 'phaser'`) instead. (`src/App.tsx` in the original Phaser Studio template had this exact bug in its demo "Add Sprite" button — `Phaser.Math.Between` with no import — which is one reason that whole demo was removed rather than fixed.)
- **Don't drive the game loop off `update()`.** A turn-based card game only reacts to player actions, not frame ticks — hence `TurnStateMachine` as a plain, Phaser-independent class, with `CardGame` only rendering `state` and forwarding input into it (see Architecture above). Resist the urge to poll state or animate turn logic inside a Scene's `update()`.
