# SPEC.md

Detailed technical reference for this repo — file-by-file architecture, mechanics, and
conventions that aren't needed to orient on every session. Start with `CLAUDE.md` for
quick orientation (commands, the worktree-push hazard, game design decisions, gotchas);
come here when you're actually working inside a specific system this file covers.

## React ↔ Phaser bridge

- `src/PhaserGame.tsx` is the bridge component. It calls `StartGame()` (from
  `src/game/main.ts`) once in `useLayoutEffect` to construct the `Phaser.Game`,
  and exposes `{ game, scene }` to the parent via `forwardRef`.
- `src/game/EventBus.ts` is a shared `Phaser.Events.EventEmitter` used for
  all React↔Phaser communication in both directions (`EventBus.emit(...)` /
  `EventBus.on(...)`). The card game itself also uses it internally — see below.
- A Scene emits `EventBus.emit('current-scene-ready', this)` once ready to be
  driven from React (`CardGame` does this at the end of `create()`).
- This bridge is currently unused by the game itself (kept for future React-driven UI)
  — the game renders entirely inside the Phaser canvas, no React UI on top of it yet.

**Runtime import caveat:** Next.js bundles Phaser's ESM/CJS build, which does
**not** attach a `window.Phaser` global (only Phaser's standalone UMD
`<script>` build does that). Always import runtime values you need (e.g.
`Geom`, `Math`, `Events`) by name from `'phaser'` — `import { Geom } from
'phaser'` — rather than referencing a bare global `Phaser.x`. Referencing
`Phaser.SomeNamespace` as a *type* (e.g. `Phaser.GameObjects.Container` in an
annotation) is fine and doesn't need an import, since that's resolved by
Phaser's ambient `.d.ts` at compile time only.

**Scene flow** (`src/game/main.ts`): `Boot → Preloader → CardGame`.
`Boot`/`Preloader` are a minimal loading scaffold; `Preloader.preload()` loads
card art, the card-back texture, etc. `CardGame` is the only gameplay scene.

## Card game architecture

- `src/game/types/` — `Card.ts` (`CardDefinition`, `CardInstance`, effect/target types), `GameState.ts` (`TurnPhase`, `PlayerState`, `GameState`), `common.ts` (`PlayerId`).
- `src/game/data/cards.ts` — authored `CARD_DEFINITIONS`, sorted rarity ASC then cost ASC within each rarity (see "Card design conventions" below for what rarity means for balance/deckbuilding).
- `src/game/data/cardFactory.ts` — turns definitions into deck `CardInstance`s (`createCardInstance`, `buildDeck`, `shuffle`).
- `src/game/data/deckGenerator.ts` — `generateDeck()` builds one independently-random 30-card deck per player at game start, proportionate to `RARITY_COUNTS` (16 common / 12 rare / 2 exotic), capped at `MAX_COPIES` (2) of any single card id. Replaced an earlier flat two-copies-of-everything `STARTER_DECK`.
- `src/game/state/createInitialState.ts` — builds a full `GameState` from two deck lists.
- `src/game/state/TurnStateMachine.ts` — the turn/phase state machine (`playCard`, `declareAttack`, `selectTarget`, `cancelTarget`, `endTurn`). Pure TypeScript, zero Phaser dependency; emits `EventBus` events (`state:phase-change`, `state:card-played`, `state:attack`, `state:card-died`, `state:card-drawn`, `state:game-over`) that `CardGame` listens to. `computeValidTargets` is also where `chosenRestriction` (minion-only / hero-only targeting) is enforced — see "Card design conventions" below. A private `moveToGraveyard` helper (used at all three graveyard-entry points: full-board discard, spell resolution, combat death) resets a minion's `currentAttack`/`currentHealth`/`maxHealth` back to its `CardDefinition` base values before filing it away, so the graveyard pile-inspect view shows printed stats, not stale combat state.
- `src/game/scenes/CardGame.ts` — the only gameplay scene. Renders `TurnStateMachine.state` and forwards input into it; tears down and rebuilds the whole board on every `state:phase-change` event rather than incrementally patching. The opponent's turn is driven by `runOpponentTurn` (called off the `phaseChangeHandler` field's `MainIdle`/opponent branch), which asks `src/game/ai/OpponentAI.ts` for one action at a time and executes it via the same `TurnStateMachine` methods the player uses — see below.
- **Card display modes** (`CardGame.ts`, `createCardContainer`): a `CardDisplayMode` (`'full' | 'simplified' | 'faceDown'`) picks how a card renders, instead of a boolean-multiplying parameter list. Full-bleed art is the lowest z-order layer in both `'full'` and `'simplified'`; everything else paints on top via translucent `Graphics.fillGradientStyle` bands (WebGL-only, but the project's `AUTO` renderer type is effectively always WebGL in real browsers) rather than solid fills. `'full'` (hand, deck/graveyard pile view, the played-card spotlight) shows a gradient header (title + a cost badge centered exactly on the top-right corner, deliberately overflowing both edges) and a gradient footer (keyword labels, bold/colored/description-less, then rule text below), plus a bottom-edge type banner and a fused `"atk/hp"` box centered on the bottom-right corner (also deliberately overflowing). `'simplified'` (battlefield minions only, via `renderBoard`) keeps the header/title and the overflowing atk/hp box but drops the cost badge, footer, rule text, and type banner entirely — a minion's keywords and triggered-effect flavor words (see `triggerMetadata.ts` below) instead render as compact bottom-left pills via `createStatusPills`, to stay clutter-free in the cramped board row. In both modes, the interactive hit area stays the plain `Geom.Rectangle(0, 0, CARD_W, CARD_H)` regardless of the badges' overflow — deliberately never enlarged to match. `'faceDown'` (opponent's hand + its draw-animation preview) renders the shared card-back texture. `CARD_W`/`CARD_H` are `150x225`, an exact 2:3 ratio matching the 832x1248 art assets. On-card text uses a shared `withStroke()` helper for a black outline (legibility over art); off-card UI chrome (health/mana readouts, pile labels, tooltip body text) is unstroked.
- **Art rendering**: `createArtVisual` uses `definition.id` directly as the texture key (no separate `art` field on `CardDefinition` — removed after verifying every entry's `art` duplicated its `id`). Art is fit with `coverFit(image, width, height)` — a CSS `background-size: cover` equivalent that crops the source texture to the target aspect ratio via `setCrop` (in texture pixels) before `setDisplaySize`, so art stretches uniformly instead of distorting. Applied to card art in both display modes and to the card-back texture on face-down cards and the deck pile stack. Falls back to a plain rectangle if the texture failed to load.
- **Deck/graveyard piles & the pile-inspect overlay** (`CardGame.ts`): both off-board zones render through one `renderPile(playerState, zone, y)` (`PileZone = 'deck' | 'graveyard'`), stacked in the `PILE_X` column with each player's graveyard one `PILE_ROW_GAP` from its own deck, on that player's side. The deck pile renders the card-back texture; the graveyard stays on its existing colored-rectangle stack (a graveyard isn't conceptually face-down the way a deck is). Clicking a pile opens a full-screen dimmed grid of its contents. Which pile is open is *scene state* (`openPileView`), not a fire-and-forget overlay: `renderNow()` tears it down with the rest of the board and repaints it at its tail, so an open pile survives the board rebuilds that fire every 600ms during the opponent's turn and keeps showing live contents. Its objects live in `pileViewObjects`, kept separate from `renderedObjects` for that reason. The deck view sorts by cost then name so opening your own deck doesn't leak the shuffled draw order; the graveyard keeps its natural chronological order.
- `src/game/ai/` — the opponent AI. `types.ts` defines `AIAction`. `scoring.ts` has pure, stateless heuristic scoring functions (`scorePlayCard`, `scoreAttack`, `computePotentialFaceDamage` for lethal detection) — these respect the same `chosenRestriction` targeting rules as the player (a minion-restricted damage effect never seeds a face candidate or counts toward lethal). `OpponentAI.ts`'s `decideOpponentAction(state)` scores every legal action available to the active player and returns the single best one (or `null` to pass) — a greedy, single-step scorer with no search/lookahead beyond the explicit lethal check, modeled on Hearthstone's shipped AI design (see Blizzard's 2014 GDC "AI Postmortem" talk). `CardGame` calls `decideOpponentAction` again each time an action resolves back to `MainIdle`, so a full opponent turn is a chain of one-action-at-a-time decisions, paced 600ms apart.

### Keyword abilities

Static minion keywords (`CardDefinition.keywords?: Keyword[]`, `Card.ts`) are a separate mechanism from the trigger+action `effects` system above — keywords are always-on rules modifiers, not one-shot triggered actions. `src/game/state/keywordRules.ts` holds the pure enforcement logic (`hasKeyword`, `canDeclareAttack`, `getMaxAttacks`, `tauntRestrictedTargets`), shared by `TurnStateMachine`, `ai/scoring.ts`/`ai/OpponentAI.ts`, and `CardGame`'s rendering so "can this minion attack / be attacked" logic exists in exactly one place — do not re-derive it locally in a new call site. `CardInstance.keywords` is a runtime `Set<Keyword>` (seeded from the definition, then mutated as consumable keywords like Divine Shield are used up) — code must read `instance.keywords`, not `definition.keywords`, to see a minion's *current* keyword state. `src/game/data/keywordMetadata.ts` holds display-only badge data (`CardGame` renders it under the card name, and colors+bolds each keyword's label — but not its description — in hover tooltips, matching the on-card badge color), kept separate from the pure rules module. `src/game/data/triggerMetadata.ts` mirrors that shape for `EffectTrigger`s (`TRIGGER_METADATA`, label+color only — no rules logic, since triggers aren't a rules concept the way keywords are), plus a `distinctTriggers(effects)` helper; both maps feed `CardGame`'s `createStatusPills` for the `'simplified'` display mode's bottom-left pills.

Implemented so far (Phase 1 of a larger roadmap — see the design conversation this was planned in for the deferred 10): **Taunt** (enemy attacks must target a Taunt minion first — enforced in `TurnStateMachine.computeValidTargets`), **Charge** (ignores summoning sickness — the minion's `summoningSick` flag stays `true` internally even so; only attack-eligibility bypasses it, which is why `CardGame`'s dim-on-summoning-sick check has an explicit Charge exemption), **Divine Shield** (absorbs one full instance of damage, combat *or* spell — enforced once in `TurnStateMachine.dealDamage`, which is why that method returns the damage actually applied rather than `void`), **Windfury** (`CardInstance.attacksThisTurn: number` vs. a max from `getMaxAttacks`, not a boolean — replaced the old `hasAttackedThisTurn` field entirely), **Lifesteal** (heals the dealing minion's controller by whatever `dealDamage` actually applied, so a Divine-Shield-absorbed hit correctly heals for 0).

## Card design conventions

Conventions to follow when authoring or editing entries in `src/game/data/cards.ts`:

- **Trigger flavor text maps 1:1 to `EffectTrigger`**: card `text` uses a fixed flavor word per trigger so players can read a card's timing at a glance — `Anthem:` = `onPlay`, `Deathcry:` = `onDeath`, `Vigil:` = `startOfTurn`, `Curfew:` = `endOfTurn`. Keep new cards' text consistent with this vocabulary rather than inventing new flavor words per trigger.
- **`chosenRestriction` must match the card's own text.** Any effect using `target: 'chosen'` defaults to "any minion or hero" in `TurnStateMachine.computeValidTargets` — a card whose text says "a minion" (e.g. "Deal 3 damage to a minion") must set `chosenRestriction: 'minion'`, or it will silently accept the enemy hero as a legal target despite what it says. This was a real bug (Pocket Sand, Frostbite Bolt, Firelance, Boneshard Finger, Emberheart Shaman all lacked it originally) — when adding a new "to a minion"/"to a hero" effect, set the matching restriction and mirror it in `ai/scoring.ts` (`scoreDamageSpell`, `computePotentialFaceDamage`) so the AI respects the same limitation instead of soft-locking in `AwaitingTarget`.
- **Rarity is a power-level bucket, not flavor.** `CardRarity` (`common | rare | exotic | legendary | mythical`, ascending) drives `deckGenerator.ts`'s proportional random deck-building (16 common / 12 rare / 2 exotic per 30-card deck currently) — a card's rarity should reflect its intended power level and how often it should show up, not just feel. Moving a card between rarity tiers (as opposed to only tuning its stats) is a legitimate, deliberate balance lever.
- Tokens (e.g. `ember-whelp`, summoned rather than drawn) omit `rarity` entirely — this is what keeps `deckGenerator.ts`'s `idsForRarity` from ever drawing them into a generated deck. Don't add a `rarity` to a summon-only token.

## Assets

Load new assets in `Preloader.preload()` (`this.load.image(...)` /
`this.load.atlas(...)`) via paths like `this.load.image('key', 'foo.png')`
(path is already scoped to `assets/` via `this.load.setPath('assets')`). On
build they're copied into `dist/assets`. Card art and the card-back texture
are keyed by card id — see "Art rendering" above.
