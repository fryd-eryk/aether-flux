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
- **Card display modes** (`CardView.ts`, `createCardContainer`): a `CardDisplayMode` (`'full' | 'simplified' | 'faceDown'`) picks how a card renders, instead of a boolean-multiplying parameter list. Full-bleed art is the lowest z-order layer in both `'full'` and `'simplified'`. `'full'` (hand, deck/graveyard pile view, the played-card spotlight) follows the v2 mockup (`src/refs/card-layout-ref-v2.jpg`): a header bar (title top-left, mana-cost number inset top-right — no overflow) and a footer bar (rarity-colored gradient dot, `rarityMetadata.ts`, + card type on the left, an inset non-overflowing white `"atk/hp"` box on the right, minion-only) are both pre-authored PNGs (`card-header-bg`/`card-footer-bg`, `HEADER_BG_KEY`/`FOOTER_BG_KEY` in `cardLayout.ts`) rather than hand-drawn `Graphics` — their alpha channels already bake in the decorative mana-cost swirl and a "rounded corners descending/ascending down the card's sides" shape, rendered at `CARD_W` via `fitWidth` (a contain-to-width scale, unlike `coverFit`'s crop-to-fill) since both PNGs are authored at the art's native 832px width. A semi-transparent (75% opacity) black rounded description box (keyword labels, bold/colored/description-less, then rule text below — same content/order as before) floats over the art and grows *upward* from a fixed bottom anchor (`DESC_BOX_BOTTOM_Y`, deliberately independent of `FOOTER_BAR_H` so footer sizing tweaks can never shift where the text lands) — its drawn background additionally stretches down past that anchor to the card's bottom edge so it visually continues underneath the footer bar, which is painted afterward (z-order) and hides the overlap. `'simplified'` (battlefield minions only, via `renderBoard`) is unchanged from the original design: a translucent `Graphics.fillGradientStyle` header band behind the title, and the older fused `"atk/hp"` box centered exactly on the bottom-right corner so it deliberately overflows both edges — it drops the cost badge, description box, and footer bar entirely, since a minion's keywords and triggered-effect flavor words (see `triggerMetadata.ts` below) instead render as compact bottom-left pills via `createStatusPills`, to stay clutter-free in the cramped board row. In both modes, the interactive hit area stays the plain `Geom.Rectangle(0, 0, CARD_W, CARD_H)` regardless of any badge/box positioning — deliberately never enlarged to match. `'faceDown'` (opponent's hand + its draw-animation preview) renders the shared card-back texture. `CARD_W`/`CARD_H` are `150x225`, an exact 2:3 ratio matching the 832x1248 art assets — the v2 ref mockup was built at roughly that same resolution (~831x1258), so its own pixel values (e.g. a "25px" corner radius) are scaled down proportionally rather than used literally. On-card text uses a shared `withStroke()` helper for a black outline (legibility over art); the `'full'` mode atk/hp box's text is the one exception (`STAT_FUSED_LIGHT_STYLE`, no stroke) since it sits on an opaque white background where the art-legibility trick isn't needed. Off-card UI chrome (health/mana readouts, pile labels, tooltip body text) is also unstroked.
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
- **Every new rule must be checked against the opponent AI, not just the player-facing path — no exceptions, including cards authored via the Card Creator.** `ai/scoring.ts`/`OpponentAI.ts` are hand-authored heuristics with no automatic awareness of `TurnStateMachine`/`keywordRules.ts` changes — a new keyword, effect kind, or targeting rule can render and enforce perfectly for the player while the AI either ignores it, misplays it, or soft-locks on it, and nothing will error to surface that. This is a standing rule, not a one-off reminder: after adding or editing any card rule, actually watch the AI play a card that exercises it (or trace the new case through `scoring.ts` by hand) before calling the change done. The Card Creator (see below) only ever writes to `cards.ts` — it has no path to `ai/scoring.ts`, so anything authored through it is exactly as exposed to this gap as a hand-edited card.
- **Rarity is a power-level bucket, not flavor.** `CardRarity` (`common | rare | exotic | legendary | mythical`, ascending) drives `deckGenerator.ts`'s proportional random deck-building (16 common / 12 rare / 2 exotic per 30-card deck currently) — a card's rarity should reflect its intended power level and how often it should show up, not just feel. Moving a card between rarity tiers (as opposed to only tuning its stats) is a legitimate, deliberate balance lever.
- Tokens (e.g. `ember-whelp`, summoned rather than drawn) omit `rarity` entirely — this is what keeps `deckGenerator.ts`'s `idsForRarity` from ever drawing them into a generated deck. Don't add a `rarity` to a summon-only token.

## Card Creator

Visual editor for `cards.ts`, at the `/card-creator` route (`src/pages/card-creator.tsx`
→ `src/cardCreator/CardCreatorPage.tsx`, dynamically imported with `ssr: false` like
`index.tsx`/`App.tsx`, since it touches both Phaser and browser-only file APIs). Use
it instead of hand-editing `cards.ts` — see CLAUDE.md's "Card authoring" pointer.
Three-column layout: a card-list sidebar (`CardListSidebar.tsx` — search, New Card)
→ a 33%-width live preview (`PreviewPane.tsx`, Full/Simplified toggle) → the field
form (`CardForm.tsx` + `EffectsEditor.tsx` for the `effects[]` discriminated union).

- **Preview rendering**: a second, independent `Phaser.Game` (`src/game/cardCreatorMain.ts`'s
  `StartCardCreatorPreview`, mounted into its own `<div id="card-creator-preview">` by
  `PreviewPane.tsx`) running only `src/game/scenes/CardCreatorPreview.ts` — not the
  `Boot → Preloader → CardGame` chain, so none of the board/turn machinery loads. It
  preloads just the `'full'` mode header/footer PNGs up front and lazily loads a card's
  own art texture on demand as its `id` changes. `PreviewPane.tsx` debounces form edits
  (150ms) and emits them as an `EventBus` event, `'card-creator:preview-update'`
  (`{ definition, mode }`), which `CardCreatorPreview.handleUpdate` rebuilds the card
  container from. It renders through the exact same `CardView.createCardContainer` the
  real game uses, via a throwaway `CardInstance` built by `fakeCardInstance.ts`'s
  `buildPreviewInstance` (only `currentAttack`/`currentHealth`/`keywords` off a
  `CardInstance` actually feed rendering — everything else on it is a dummy value).
- **The one engine change this required**: `createCardContainer` normally looks up its
  `CardDefinition` from the static `CARD_DEFINITIONS` import by `instance.definitionId`
  — which can't work for a card still being drafted (not saved yet, or mid-edit with
  stale data). It now takes an optional third `definitionOverride?: CardDefinition`
  param that short-circuits that lookup when passed; every pre-existing call site
  (`CardGame`'s `renderHand`/`renderBoard`/reveal/draw-animation, `PileViewController`)
  stays a 2-arg call and is unaffected.
- **Validation**: `validateCardDefinition.ts`, per-field, gates the Save button — id
  uniqueness/shape, cost/attack/health integer rules, minion-only attack/health
  presence, and per-`effects[]`-row rules (amount/count minimums, `chosenRestriction`
  required exactly when `target === 'chosen'`, `summon.definitionId` must resolve).
  Runs again immediately before every save as a belt-and-suspenders check, since no
  `tsc` runs in-browser — this validator is the only structural check that ever exists
  before a write.
- **Saving**: `src/pages/api/card-creator/save.ts`, a small dev-only Next.js API route
  (`useSaveCards.ts` POSTs `{ source }` to it) that `fs.writeFileSync`s straight over
  `src/game/data/cards.ts`. Gated on `process.env.NODE_ENV === 'development'` (403
  otherwise) since it only ever makes sense against a local checkout with `npm run dev`
  running — there's no scenario where writing to the repo's own source tree from a
  deployed server would be meaningful.
  - **Making this coexist with `next.config.mjs`'s `output: 'export'` took two
    corrections, both verified empirically rather than assumed — see the matching
    entry in CLAUDE.md's Gotchas.** First pass assumed `next build` would hard-error
    with a `pages/api` route present and `output: 'export'` set; it doesn't — it just
    warns and drops the route from `dist/`. Second pass then assumed that meant
    `next dev` would work fine too, since it runs a real server regardless of
    `output`; it doesn't — `next dev` actively 404s every API route when `output:
    'export'` is configured, logging `⨯ API Routes cannot be used with "output:
    export"` at startup. The actual fix: `next.config.mjs` exports a **function**
    keyed on `phase` (`PHASE_DEVELOPMENT_SERVER` from `next/constants.js` — the
    explicit `.js` extension matters, see the Gotcha), omitting `output: 'export'`
    only during the dev phase. `npm run dev` then runs as a normal Next.js server
    (API routes fully functional) while `npm run build` still emits `output:
    'export'`'s static `dist/`, which — same as before this whole detour — simply
    excludes the route with a harmless build warning, since it's meaningless in a
    static export anyway.
  - Earlier this used the browser's File System Access API instead
    (`showOpenFilePicker` + `createWritable()`) to sidestep a *believed* API-route
    restriction that turned out to just need the phase-conditional config above; that
    approach worked but was Chrome/Edge-only and needed a one-time native-picker
    permission per session, so it was dropped once the real fix was found.
  - `serializeCardDefinitions.ts` regenerates the whole file from the in-memory
    `CARD_DEFINITIONS` map on every save (rarity-grouped section comments,
    cost-ascending sort within each group, bare-vs-quoted key style, fixed property
    order) — matching `cards.ts`'s existing conventions above, not byte-for-byte, but
    valid and readable.
- **Data ownership**: the in-memory card map is loaded once from the existing
  `import { CARD_DEFINITIONS } from '@/game/data/cards'` (already bundled into the
  client either way) and deep-copied into React state; the API route is a write-only
  target, never read back. If `cards.ts` is hand-edited elsewhere while the tool is
  open, reload the page to pick that up.
- **Does not touch the AI.** The tool only ever writes `cards.ts` — see the AI-sync
  rule directly above; a new keyword/effect authored here needs the same manual
  `ai/scoring.ts`/`OpponentAI.ts` check as one added by hand.

## Assets

Load new assets in `Preloader.preload()` (`this.load.image(...)` /
`this.load.atlas(...)`) via paths like `this.load.image('key', 'foo.png')`
(path is already scoped to `assets/` via `this.load.setPath('assets')`). On
build they're copied into `dist/assets`. Card art and the card-back texture
are keyed by card id — see "Art rendering" above.
