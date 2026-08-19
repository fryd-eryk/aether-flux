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
- `src/game/data/deckGenerator.ts` — `generateDeck()` builds one independently-random 30-card deck per player at game start, proportionate to `RARITY_COUNTS` (14 common / 12 rare / 2 exotic / 1 legendary / 1 mythical — every rarity with at least one card defined gets a guaranteed slot), capped at `MAX_COPIES` (2) of any single card id. Replaced an earlier flat two-copies-of-everything `STARTER_DECK`.
- `src/game/state/createInitialState.ts` — builds a full `GameState` from two deck lists.
- `src/game/state/TurnStateMachine.ts` — the turn/phase state machine (`playCard`, `declareAttack`, `selectTarget`, `cancelTarget`, `endTurn`). Pure TypeScript, zero Phaser dependency; emits `EventBus` events (`state:phase-change`, `state:card-played`, `state:attack`, `state:card-died`, `state:card-drawn`, `state:game-over`) that `CardGame` listens to. `computeValidTargets` is also where `chosenRestriction` (minion-only / hero-only targeting) is enforced — see "Card design conventions" below. A private `moveToGraveyard` helper (used at all three graveyard-entry points: full-board discard, spell resolution, combat death) resets a minion's `currentAttack`/`currentHealth`/`maxHealth` back to its `CardDefinition` base values before filing it away, so the graveyard pile-inspect view shows printed stats, not stale combat state.
- `src/game/state/counters.ts` — pure helpers (no Phaser dependency, same spirit as `keywordRules.ts` below) that resolve a live game-state value: `resolveCounter`/`resolveEffectValue` for an effect's magnitude, `resolveCardText` for a `{X}` placeholder in a card's rule text — see "Dynamic values (counters)" below.
- `src/game/scenes/CardGame/` — the only gameplay scene, split across `index.ts` (the `CardGame` Scene class itself: renders `TurnStateMachine.state` and forwards input into it; tears down and rebuilds the whole board on every `state:phase-change` event rather than incrementally patching), `CardView.ts` (pure card-container builder, see "Card display modes" below), `HelpBoxController.ts` (the hover tooltip), and `PileViewController.ts` (the deck/graveyard pile-inspect overlay, see below). The opponent's turn is driven by `index.ts`'s `runOpponentTurn` (called off the `phaseChangeHandler` field's `MainIdle`/opponent branch), which asks `src/game/ai/OpponentAI.ts` for one action at a time and executes it via the same `TurnStateMachine` methods the player uses — see below.
- **Card display modes** (`CardView.ts`, `createCardContainer`): a `CardDisplayMode` (`'full' | 'simplified' | 'faceDown'`) picks how a card renders, instead of a boolean-multiplying parameter list. Full-bleed art is the lowest z-order layer in both `'full'` and `'simplified'`. `'full'` (hand, deck/graveyard pile view, the played-card spotlight) follows the v2 mockup (`src/refs/card-layout-ref-v2.jpg`): a header bar (title top-left, a gradient-circle mana-cost badge centered on the top-right corner so it deliberately overflows both edges — bringing back the pre-v2 badge treatment, just with a highlight/shadow gradient fill instead of flat color) and a footer bar (rarity-colored gradient dot, `rarityMetadata.ts`, + card type on the left, the corner-overflowing `"atk/hp"` badge on the right, minion-only — see below) share one pre-authored PNG (`card-header-footer-bg`, `HEADER_FOOTER_BG_KEY` in `cardLayout.ts`) rather than hand-drawn `Graphics` — its alpha channel bakes in a "rounded corners descending down the card's sides" shape, rendered at `CARD_W` via `fitWidth` (a contain-to-width scale, unlike `coverFit`'s crop-to-fill) since it's authored at the art's native 832px width; the footer renders the same texture flipped vertically (`Image.setFlipY`) rather than a second file, mirroring the header's descending corners into ascending ones. The mana-cost badge and the footer's rarity dot both approximate a radial highlight with a diagonal 4-corner `Graphics.fillGradientStyle` fill, since Phaser has no native radial-gradient fill. A semi-transparent (75% opacity) black rounded description box (keyword labels, bold/colored/description-less, then rule text below — same content/order as before) floats over the art and grows *upward* from a fixed bottom anchor (`DESC_BOX_BOTTOM_Y`, deliberately independent of `HEADER_FOOTER_CONTENT_H` so footer sizing tweaks can never shift where the text lands) — its drawn background additionally stretches down past that anchor to the card's bottom edge so it visually continues underneath the footer bar, which is painted afterward (z-order) and hides the overlap. `createCardContainer`/`createDescriptionBox` take an optional trailing `resolvedText?: string` that, when passed, is shown in place of `definition.text` — this is how a `{X}` placeholder in rule text ends up substituted with its live value (see "Dynamic values (counters)" below) without `CardView` itself ever touching `GameState`: every real-game call site (`CardGame/index.ts`'s `renderHand`/`renderBoard`/reveal/draw-animation, `PileViewController`) resolves the text first via `counters.ts`'s `resolveCardText` and passes the result in; omitting the param (as the Card Creator preview does) falls back to `definition.text` verbatim, `{X}` and all — `CardView` stays a pure builder with no game-state awareness either way. `HelpBoxController.attachKeywordHover`/`showHelpBox` take the identical optional param for the same reason, since the hover tooltip also prints rule text. `'simplified'` (battlefield minions only, via `renderBoard`) keeps a translucent `Graphics.fillGradientStyle` header band behind the title, but drops the cost badge, description box, and footer PNG entirely — a minion's keywords and triggered-effect flavor words (see `triggerMetadata.ts` below) instead render as compact bottom-left pills via `createStatusPills`, to stay clutter-free in the cramped board row. The `"atk/hp"` badge (`CardView.createStatBadge`, `ATKHP_BADGE_R`/`ATKHP_BADGE_COLOR` in `cardLayout.ts`) is shared verbatim by both modes — a flat-white circle centered exactly on the card's bottom-right corner so it deliberately overflows both edges, the same corner-badge treatment the mana-cost circle gets on the opposite corner; its health digits alone switch to `STAT_FUSED_LIGHT_WOUNDED_STYLE`'s red when the minion is wounded (`currentHealth !== maxHealth`). The card-anchored hover tooltip (`HelpBoxController`) always shows keywords/rule text the same way regardless of mode, but only draws a mana-cost badge (styled identically to the on-card one) for `'simplified'` cards — `'full'` mode (hand, pile-view) already prints cost on-card, so repeating it in the tooltip would be redundant; `attachKeywordHover`'s `showCost` parameter is what each call site (`renderHand`, `renderBoard`, `PileViewController`) sets accordingly. In both modes, the interactive hit area stays the plain `Geom.Rectangle(0, 0, CARD_W, CARD_H)` regardless of any badge/box positioning — deliberately never enlarged to match. `'faceDown'` (opponent's hand + its draw-animation preview) renders the shared card-back texture. `CARD_W`/`CARD_H` are `150x225`, an exact 2:3 ratio matching the 832x1248 art assets — the v2 ref mockup was built at roughly that same resolution (~831x1258), so its own pixel values (e.g. a "25px" corner radius) are scaled down proportionally rather than used literally. On-card text uses a shared `withStroke()` helper for a black outline (legibility over art); the `'full'` mode atk/hp box's text is the one exception (`STAT_FUSED_LIGHT_STYLE`, no stroke) since it sits on an opaque white background where the art-legibility trick isn't needed. Off-card UI chrome (health/mana readouts, pile labels, tooltip body text) is also unstroked.
- **Art rendering**: `createArtVisual` uses `definition.id` directly as the texture key (no separate `art` field on `CardDefinition` — removed after verifying every entry's `art` duplicated its `id`). Art is fit with `coverFit(image, width, height)` — a CSS `background-size: cover` equivalent that crops the source texture to the target aspect ratio via `setCrop` (in texture pixels) before `setDisplaySize`, so art stretches uniformly instead of distorting. Applied to card art in both display modes and to the card-back texture on face-down cards and the deck pile stack. Falls back to a plain rectangle if the texture failed to load.
- **Deck/graveyard piles & the pile-inspect overlay** (`CardGame.ts`): both off-board zones render through one `renderPile(playerState, zone, y)` (`PileZone = 'deck' | 'graveyard'`), stacked in the `PILE_X` column with each player's graveyard one `PILE_ROW_GAP` from its own deck, on that player's side. The deck pile renders the card-back texture; the graveyard stays on its existing colored-rectangle stack (a graveyard isn't conceptually face-down the way a deck is). Clicking a pile opens a full-screen dimmed grid of its contents. Which pile is open is *scene state* (`openPileView`), not a fire-and-forget overlay: `renderNow()` tears it down with the rest of the board and repaints it at its tail, so an open pile survives the board rebuilds that fire every 600ms during the opponent's turn and keeps showing live contents. Its objects live in `pileViewObjects`, kept separate from `renderedObjects` for that reason. The deck view sorts by cost then name so opening your own deck doesn't leak the shuffled draw order; the graveyard keeps its natural chronological order.
- `src/game/ai/` — the opponent AI. `types.ts` defines `AIAction`. `scoring.ts` has pure, stateless heuristic scoring functions (`scorePlayCard`, `scoreAttack`, `computePotentialFaceDamage` for lethal detection) — these respect the same `chosenRestriction` targeting rules as the player (a minion-restricted damage effect never seeds a face candidate or counts toward lethal). `OpponentAI.ts`'s `decideOpponentAction(state)` scores every legal action available to the active player and returns the single best one (or `null` to pass) — a greedy, single-step scorer with no search/lookahead beyond the explicit lethal check, modeled on Hearthstone's shipped AI design (see Blizzard's 2014 GDC "AI Postmortem" talk). `CardGame` calls `decideOpponentAction` again each time an action resolves back to `MainIdle`, so a full opponent turn is a chain of one-action-at-a-time decisions, paced 600ms apart.

### Keyword abilities

Static minion keywords (`CardDefinition.keywords?: Keyword[]`, `Card.ts`) are a separate mechanism from the trigger+action `effects` system above — keywords are always-on rules modifiers, not one-shot triggered actions. `src/game/state/keywordRules.ts` holds the pure enforcement logic (`hasKeyword`, `canDeclareAttack`, `getMaxAttacks`, `tauntRestrictedTargets`), shared by `TurnStateMachine`, `ai/scoring.ts`/`ai/OpponentAI.ts`, and `CardGame`'s rendering so "can this minion attack / be attacked" logic exists in exactly one place — do not re-derive it locally in a new call site. `CardInstance.keywords` is a runtime `Set<Keyword>` (seeded from the definition, then mutated as consumable keywords like Divine Shield are used up) — code must read `instance.keywords`, not `definition.keywords`, to see a minion's *current* keyword state. `src/game/data/keywordMetadata.ts` holds display-only badge data (`CardGame` renders it under the card name, and colors+bolds each keyword's label — but not its description — in hover tooltips, matching the on-card badge color), kept separate from the pure rules module. `src/game/data/triggerMetadata.ts` mirrors that shape for `EffectTrigger`s (`TRIGGER_METADATA`, label+color only — no rules logic, since triggers aren't a rules concept the way keywords are), plus a `distinctTriggers(effects)` helper; both maps feed `CardGame`'s `createStatusPills` for the `'simplified'` display mode's bottom-left pills.

Implemented so far (Phases 1–2a of a larger roadmap — see the design conversation this was planned in for the deferred 10): **Taunt** (enemy attacks must target a Taunt minion first — enforced in `TurnStateMachine.computeValidTargets`), **Charge** (ignores summoning sickness — the minion's `summoningSick` flag stays `true` internally even so; only attack-eligibility bypasses it, which is why `CardGame`'s dim-on-summoning-sick check has an explicit Charge exemption), **Divine Shield** (absorbs one full instance of damage, combat *or* spell — enforced once in `TurnStateMachine.dealDamage`, which is why that method returns the damage actually applied rather than `void`), **Windfury** (`CardInstance.attacksThisTurn: number` vs. a max from `getMaxAttacks`, not a boolean — replaced the old `hasAttackedThisTurn` field entirely), **Lifesteal** (heals the dealing minion's controller by whatever `dealDamage` actually applied, so a Divine-Shield-absorbed hit correctly heals for 0), **Veiled** (can't be attacked or targeted by spells until it attacks, then loses Veiled the instant it does — folded into `keywordRules.tauntRestrictedTargets`/`isTargetable` rather than a parallel filter, so a hypothetical Veiled+Taunt minion can't "wall" attacks it can't itself receive), **Venom** (any combat damage this minion deals destroys the target minion outright, regardless of amount — checked in `executeAttack` against `dealDamage`'s returned damage-dealt amount, so a Divine-Shield-absorbed hit correctly doesn't trigger it, mirroring how Lifesteal reads that same value).

Two triggers joined the original Anthem/Deathcry/Vigil/Curfew set in Phase 2a: **Strike** (`onAttack`) fires unconditionally the instant an attack is declared, before either side's `dealDamage` call, so it's unaffected by whether the hit lands or either side survives it; **Wound** (`onDamaged`) fires from inside `dealDamage` itself — a single choke point covering combat *and* spell damage alike — whenever a minion takes damage, pre-death: it fires on any damage that actually lands, even lethal damage that's about to send the minion to `sweepDeaths`, independent of any follow-up like Venom retroactively killing the same minion afterward. `ai/scoring.ts`'s `woundValue` mirrors this into scoring — signed from the AI's perspective (positive if the wounded minion is the AI's own, negative if it's the enemy's) — and is folded into `scoreAttack` (using Initiative-aware `attackerTakesHit`/`targetTakesHit` landing flags, since an Initiative-skipped swing never lands and so never wounds), `scoreDamageSpell`'s chosen-target loops, and `estimateEffectValue`'s board-wide `damage` case; all three gate it on the hit actually landing (`amount > 0`, no Divine Shield). Two effect-action kinds joined damage/heal/draw/buff/summon: **freeze** (target can't attack on its next turn — a `CardInstance.frozen` flag read by `canDeclareAttack`, cleared in `endTurn`'s existing per-active-player-board loop, so a minion frozen on turn N stays blocked through the whole of its controller's next turn) and **silence** (strips *everything the target's own card text grants* — clears its `keywords` Set and permanently suppresses all of that instance's own trigger effects going forward, Deathcry included, via a persistent `CardInstance.silenced` flag guarded once at the top of `triggerEffects`; does not undo already-applied stat buffs or clear `frozen`, since neither is "the card's own printed text"). Silencing a minion also swaps its board status pills for a single "Silenced" pill (`CardView.createStatusPills`) rather than letting them go blank, since blank would look identical to a plain vanilla minion.

`buff` and `grantKeyword` actions can also carry an optional `duration?: number` (in turns) instead of applying permanently — `duration: 1` reads as "until end of turn." Unlike Freeze's clear (which only sweeps the *active* player's board, since Freeze only ever targets the eventual attacker), a temporary buff/grant is tracked per-instance in `CardInstance.temporaryEffects: TemporaryEffect[]` and decremented by `TurnStateMachine.tickTemporaryEffects`, called from `endTurn` for *both* players' boards every turn — necessary because a `chosen`-target debuff (e.g. "-1/-1 until end of turn") can legally land on an enemy minion as a combat trick, not just a friendly one. A temporary buff's expiry reuses the same private `buff` method with negated amounts (no new reversal logic); a temporary keyword's expiry only deletes it from `instance.keywords` if it isn't also present in the card's printed `CardDefinition.keywords` and no other still-active temporary grant of the same keyword remains on that instance — it does *not* guard against a keyword also granted *permanently* by a separate effect, since a permanent `grantKeyword` call leaves no tracking record to check against (no shipped card does this today). `ai/scoring.ts` applies a flat `TEMPORARY_EFFECT_DISCOUNT` (0.5x) to a duration-bearing `buff`/`grantKeyword` action's value everywhere `KEYWORD_VALUE`/magnitude is scored, so the AI doesn't value a same-turn-only grant as highly as a permanent one — see "Game design decisions" in CLAUDE.md, which also notes this is the one intentional, opt-in exception to this project's "damage persists, no automatic end-of-turn reset" convention (below): it only fires for effects explicitly authored with a `duration`, not a general reset rule.

Phase 2b/2c then added four more, growing the rules vocabulary toward combo-style interactions rather than static effects. **Momentum(N)** is the combo primitive: `CardEffect.condition?: { type: 'momentum'; minCount: number }` gates whether `triggerEffects` applies that specific effect, firing only if at least N cards were already played by its owner earlier this turn (card-text flavor: `Momentum(N):`, e.g. `riverstone-golem`'s "Momentum(1): Draw a card."). `PlayerState.cardsPlayedThisTurn` resets to 0 in `startTurn` and increments in `executePlayCard` — deliberately *after* the played card's own effects resolve but *before* any board-wide trigger that card's play sets off, so a Momentum-gated effect on the card itself reads "how many were played before it," while a Momentum-gated Channel effect on another minion correctly counts the just-cast spell as already played. `ai/scoring.ts`'s `momentumSatisfied` discounts a Momentum-gated effect's value to 0 unless `state.players[aiId].cardsPlayedThisTurn` already clears the threshold at scoring time — no extra plumbing needed in `OpponentAI.ts` itself, since it re-scores off fresh live `GameState` on every call anyway.

Three triggers followed, all dispatched through a new `triggerBoardWide(trigger, ownerId, board)` helper — the first triggers in the codebase that fire because of *someone else's* event rather than for the instance the event happened to. **Channel** (`onSpellCast`) — whenever the controller casts any spell, every minion on their own board with a Channel effect fires; dispatched from `executePlayCard`'s spell branch, after the spell's own `onPlay` trigger. **Mourn** (`onFriendlyMinionDeath`) — whenever a friendly minion dies, every other minion on that board with a Mourn effect fires; dispatched from `sweepDeaths`, once per dying minion, over the board with that minion already removed. Because a Mourn effect can itself deal damage and kill further minions, `sweepDeaths` re-sweeps in a loop until a pass produces no new deaths, rather than the single pass that sufficed before Mourn existed. **Muster** (`onFriendlyMinionCast`) mirrors Channel for casting a *minion* instead of a spell — dispatched from `executePlayCard`'s minion branch — but needs one thing Channel doesn't: since the played minion is already sitting in `player.board` by the time triggers resolve (pushed there before `triggerEffects` runs), the `triggerBoardWide('onFriendlyMinionCast', ...)` scan explicitly excludes it, or it would fire its own Muster effect off its own cast (already covered by its own `onPlay`/Anthem trigger). Muster still fires even when the minion is discarded for a full board, since the mana was spent and the card was cast either way. All three are threaded into `ai/scoring.ts` — `channelBoardValue`/`musterBoardValue`/`mournBoardValue` sum the board-wide payoff into `scorePlayCard`/`scoreAttack` the same way a card's own effects are valued, each respecting `momentumSatisfied` for any Momentum-gated board effect they scan over.

### Keyword & trigger roadmap (not yet implemented)

Two items remain from the original growth-the-vocabulary proposal this section used to fully describe as a roadmap — Momentum, Channel, Mourn, and Muster above are what shipped from it; these two are what's left:

- Keyword **Resonance X** — an aura: while this minion is alive, the
  controller's damage-dealing *spells* deal X more damage. Needs
  `applyEffectAction`'s damage case to know whether the source card was a
  spell (not a combat hit or another minion's effect) and to sum `Resonance`
  across the controller's live board at resolution time — the first
  aura-style (recomputed-on-the-fly) keyword in the codebase, versus today's
  all-instantaneous ones. A prior planning pass scoped this and then
  deliberately cut it before implementation — see "Dynamic values
  (counters)" below for what shipped instead: an effect can already scale
  off a live minion *count*, just not specifically off "how many Resonance
  minions are on the board."
- **Deckbuilding identity, down the line.** `Tribe` (`src/game/types/Card.ts`)
  and `CardDefinition.tribes?: Tribe[]` are implemented — a minion-only,
  multi-valued tag (`humanoid | elemental | nature | animal | cosmic | holy |
  underworld`, purely additive: a new tribe is a new union member plus a
  `TRIBE_METADATA` entry in `src/game/data/tribeMetadata.ts`), rendered in
  'full' mode's footer (Rarity Dot → Tribe → Type, `CardView.createFooterBar`)
  and, for 'simplified' (board) cards, in the hover tooltip next to the
  mana-cost badge (`HelpBoxController.showHelpBox`) — mirroring the
  `state/tribes.ts` / `data/tribeMetadata.ts` split `counters.ts` /
  `counterMetadata.ts` already established. `ChosenTargetRestriction` also
  accepts a `Tribe` now, so a chosen-target effect can read "...to a chosen
  Elemental" (see "Card design conventions" below). `EffectAction` also has
  an optional `tribeFilter?: Tribe` (not a new `TargetSelector` — it composes
  with the existing `allMinions`/`allEnemyMinions`/`allFriendlyMinions`
  selectors), so a board-wide effect can read "Destroy all Elemental
  minions" (`target: 'allMinions', tribeFilter: 'elemental'`) or, side-
  restricted, "all enemy Elemental minions" (`target: 'allEnemyMinions'`)
  with the same field. `TurnStateMachine.resolveTargetIds` filters by it when
  set; `ai/scoring.ts`'s `estimateEffectValue` narrows its board counts by it
  too (via `tribeFilteredCount`) so the AI values a tribe-scoped wipe against
  how many minions it actually hits. Still unbuilt: a tribe-count style
  `EffectCondition` (letting a card read "for each `<tribe>` you control")
  and a `deckGenerator.ts` hook for archetype-aware deckbuilding.

### Dynamic values (counters)

A `CardEffect`'s numeric magnitude doesn't have to be a flat, hand-authored
number — `damage`/`heal`'s `amount`, `draw`'s `count`, and `buff`'s
`attack`/`health` are typed as `EffectValue = number | { counter: CounterKind;
multiplier?: number; offset?: number; tribe?: Tribe }` (`Card.ts`).
`CounterKind` covers twelve live readouts: `allMinionCount`/
`friendlyMinionCount`/`enemyMinionCount`, `friendlyHeroHealth`/
`enemyHeroHealth`, `allTribeMinionCount` (a chosen tribe's minion count
across both boards — the only kind that reads the `tribe` field, and the only
one requiring a Card Creator sub-choice beyond the kind itself),
`friendlyHandCount`/`enemyHandCount`, `friendlyGraveyardCount`/
`enemyGraveyardCount`, and `friendlyDeckCount`/`enemyDeckCount`.
`summon.count` deliberately stays a plain `number` — a board-count-scaled
summon count wasn't a requested use case and would be an unusual design;
trivial to extend later if needed.

`src/game/state/counters.ts` is the pure resolver (no Phaser dependency,
same shape as `keywordRules.ts`): `resolveCounter(value, ownerId, state)`
(takes the full counter object, not just its `CounterKind`, since
`allTribeMinionCount` also needs `value.tribe`) reads the live value off
`GameState`; `resolveEffectValue(value, ownerId, state)` passes a plain
number through as-is, or computes
`resolveCounter(...) * (multiplier ?? 1) + (offset ?? 0)` for a counter
reference. `TurnStateMachine.applyEffectAction` resolves a `EffectValue`
**once per action invocation**, before its per-target loop — not once per
card, not re-resolved per target — and clamps the resolved value with
`Math.max(0, ...)` for `damage`/`heal` only (a counter-based amount could
mathematically resolve negative, e.g. a large negative `offset`, which would
otherwise silently invert `dealDamage` into a heal; a negative resolved
`buff` is left unclamped, since a debuff is already an intentional,
shipped case). `ai/scoring.ts` threads `resolveEffectValue` into every site
that used to read these fields as a plain number (`computePotentialFaceDamage`,
`estimateEffectValue`, `scoreChosenTarget`'s dispatch into
`scoreDamageSpell`/`scoreHealSpell`) — no changes needed in `OpponentAI.ts`
itself, same reasoning as Momentum above.

**`{X}` in rule text** is the display half: a card author writes the literal
placeholder `{X}` by hand in `CardDefinition.text` (e.g.
`test-counter-heal`'s "Restore {X} Health to your hero, where X is the
number of minions on the board."), and `counters.ts`'s
`resolveCardText(instance, state)` substitutes it with the live-resolved
value of that card's *first* effect whose headline `EffectValue` isn't a
plain number when the card is actually rendered in a match — see "Card
display modes" above for how `CardView`/`HelpBoxController` receive that
already-resolved string via an optional `resolvedText` param rather than
touching `GameState` themselves. Only one `{X}`/one value per card is
supported — this is deliberately not a general templating language. The
Card Creator has no live board/HP to compute against, so it never attempts
to resolve `{X}` — the preview shows it literally, by design, not as a gap;
see "Card Creator" below.

## Resource system roadmap: Aether (not yet implemented)

A full replacement for the current mana system, designed in a brainstorm/
research session, not yet built. Nothing below exists in code today — `mana`/
`maxMana`, the `TurnStateMachine.MAX_MANA = 10` auto-ramp, and the flat
`CardDefinition.cost: number` (`Card.ts:171`) are all still what's live; this
section is the target design for when that gets replaced outright, not an
addition alongside it. It also assumes a proper custom deckbuilding UI exists
(currently: `deckGenerator.ts` builds one random 30-card deck per player at
game start, no player-facing deckbuilder) — that's a co-requisite, not
optional, since the whole system is deckbuilding-driven.

**Two decks.** A player's deck splits into a **Main Deck (32)** — every card
type except the resource cards, structurally what `cards.ts`/`deckGenerator.ts`
build today — and an **Aether Deck (18)**, built from any mix of five
categories: **Fire, Water, Earth, Air** (the four "Elemental" Aethers) and
plain **Aether** (generic, colorless). Each turn a player draws one card from
the Main Deck (mandatory, same cadence as today) and *may* draw one from the
Aether Deck (optional — skip it when the hand's already full of castable
cards, which is the main lever against resource-flood). At most one Aether
card can be played per turn, unless a card explicitly says otherwise (mirrors
Magic's one-land-per-turn rule).

**Entering play.** Plain Aether enters ready (usable the turn it's played).
Elemental Aether enters tapped 90° — unusable the turn it enters, functionally
a summoning-sickness equivalent for resource cards, distinct from an Elemental
Aether being consumed (see below).

**Cost model: `N (M<Element>)`.** A card's cost has two independent parts:
- **N — generic Aether cost.** Paid by tapping N plain-Aether cards in play.
  Tap/untap, like a Magic land: a tapped Aether stays a permanent, untapping
  automatically next turn rather than being destroyed or discarded — so the
  resource pool's ceiling is simply "how many Aether you've drawn and played
  over the game," not an auto-ramping counter.
- **M<Element> — an elemental threshold**, independent of N and separately
  authored per card (not derived from N). Requires M *category-count* Aether
  of that element in play — any mix of distinct Fire Aether cards counts
  toward a Fire threshold, not M copies of one specific card. Elemental Aether
  is never tapped or consumed to satisfy a threshold — it's a pure presence
  check, which is also why it's a real target for removal (see below): an
  opponent can strip a threshold gate without touching the caster's mana.

**Elemental Aether cards have their own design space**, not just gatekeeping:
- **A paid ability**, costed in generic Aether (e.g. "Pay (2): deal 1 damage
  to the enemy hero"). This is a direct fit for the existing `PaidAbility`
  system (`Card.ts:158-162`, resolved in `TurnStateMachine.ts` around line
  163/395) — an Aether card is just another `CardDefinition` with an ability
  slot, paid from the same pool minions already pay from.
- **A category-count-scaled, tiered static Aura** — e.g. "1 Fire Aether in
  play: Elemental minions get +1/+0. 2: your spells deal +1 damage. 4: your
  minions have Charge." This is close to, but not identical to, what already
  exists: `CardDefinition.auras` + `TurnStateMachine.recalculateAuras`
  (`TurnStateMachine.ts:1040-1098`) is a real recompute-and-diff aura engine —
  magnitude already resolves through `resolveEffectValue` (so it can already
  reference a live `CounterKind`), and keyword grants already interact
  correctly with Silence via `auraKeywords`. Two things it doesn't do yet:
  (1) its source-scanning loop only reads `sourcePlayer.board` (minions) —
  an Aether card sitting in its own zone wouldn't be scanned as an aura
  source without extending that loop to an Aether zone; (2) each `aura` entry
  applies unconditionally whenever its source is in play — there's no
  per-aura threshold gate yet, so "only active at 2+ Fire in play, not at 1"
  needs the same kind of `condition` gate `CardEffect.condition` already has
  for Momentum (`{ type: 'momentum'; minCount: number }`), generalized to a
  category-count condition and a new `CounterKind` (e.g.
  `friendlyElementAetherCount`) for it to read. Worth noting this is the same
  gap flagged for the cut **Resonance** keyword in the roadmap above — "the
  first aura-style (recomputed-on-the-fly) keyword" language there undersold
  it slightly (a *static*, unconditional recompute-and-diff aura engine does
  exist), but a *conditionally-gated* aura is new either way, so Resonance and
  Aether's tiered auras would likely share the same underlying engine work if
  both get built.

**Tribal payoff already exists.** `Tribe` includes `'elemental'`
(`Card.ts:15`), with a live precedent (`cards.ts:640`'s "Elemental Spray")
using `tribeFilter` to scope a board-wide effect to Elemental minions. Any
"your Elemental minions get +X" Aether aura or "deal damage per Elemental
minion" effect is composing existing systems (`tribeFilter`, `tribeMetadata.ts`,
`allTribeMinionCount`), not inventing a new one.

**Destroying an Aether in play** is a viable, explicitly double-edged removal
target (no mana-cost penalty for hitting it, unlike hitting a minion) — per-
effect authored, not a universal rule: some effects should return the
destroyed Aether to the top of its owner's Aether Deck (a known, telegraphed
redraw — the owner can choose whether to prioritize redrawing it), others
should shuffle it back in (adds real re-draw variance, can help or hurt either
player). Land-destruction-style effects are historically high-variance/
low-fun in TCGs when unconstrained (see "Game design theory reference" below)
— worth staying deliberate about how many, how strong, and how recoverable
these are once actual cards get authored.

**What replaces what:** `PlayerState.mana`/`maxMana` and the whole
`beginStartTurn` auto-ramp go away entirely — replaced by tracking each
player's Aether Deck, Main Deck draw *and* optional Aether draw per turn, and
per-instance tapped state for every Aether card in play (plain and Elemental
alike). Every existing card's flat `cost: number` needs re-authoring into the
two-part shape. `deckGenerator.ts`'s proportional random-deck builder stops
being useful for real constructed play once decks are player-built — the plan
for the interim (before a real deckbuilder UI ships) is to hand-author the AI
opponent's deck directly rather than keep random generation as a stand-in.

**Deferred to a further pass** (noted, not designed yet): mulligan rules for
Aether ratio (does a bad opening Aether draw get a mulligan-style redo?),
Aether-fetch effects (search-for-a-specific-element tools, the main lever
against color screw once this ships), and copy-limits for the Aether Deck
(how many copies of one named Aether card a 18-card Aether Deck may run — this
directly gates whether a "4 of the same category in play" tier is reachable
through normal draws, since category-count doesn't require same-card copies
but a thin Aether Deck still needs *some* per-card cap to avoid degenerate
mono-Aether builds).

## Card design conventions

Conventions to follow when authoring or editing entries in `src/game/data/cards.ts`:

- **Trigger flavor text maps 1:1 to `EffectTrigger`**: card `text` uses a fixed flavor word per trigger so players can read a card's timing at a glance — `Anthem:` = `onPlay`, `Deathcry:` = `onDeath`, `Vigil:` = `startOfTurn`, `Curfew:` = `endOfTurn`, `Strike:` = `onAttack`, `Wound:` = `onDamaged`, `Channel:` = `onSpellCast`, `Mourn:` = `onFriendlyMinionDeath`, `Muster:` = `onFriendlyMinionCast`. Keep new cards' text consistent with this vocabulary rather than inventing new flavor words per trigger.
- **`{X}` in rule text resolves to the card's first effect's headline value at render time** — see "Dynamic values (counters)" above. Substitutes whatever that value resolves to, flat or counter-based, so it's only really worth writing when that value *is* counter-based (a flat one would just print a redundant fixed number). Writing `{X}` on a card with no effects at all leaves the literal `{X}` in the text and is flagged by the Card Creator's validator.
- **Paid Ability rule text uses a `(<cost>):` prefix**, distinct from the trigger flavor words above — a paid ability isn't triggered by any `EffectTrigger` at all; it's a player-initiated action the controller can pay `PlayerState.mana` to activate any number of times during their turn, gated purely by affordability (no "once per turn" limiter, and not blocked by summoning sickness — activating one isn't a combat action, see `TurnStateMachine.activateAbility`). `CardDefinition.paidAbilities?: PaidAbility[]` (`{ cost: number; action: EffectAction }`, `Card.ts`) is deliberately a separate field from `effects[]` for this reason, not a new `EffectTrigger` value — minion/token-only, same as `attack`/`health`/`tribes`. The renderer replaces the `(<cost>):` prefix with an inline gradient-circle cost pip (see `richText.ts`'s `layoutRichText`/`splitPipSegments`) in both the full-card rule text box and the hover tooltip, purely as a display convenience — it does not parse the number back out and cross-check it against the structured `paidAbilities[].cost`. Like `chosenRestriction` below, the two are independently hand-authored and must be kept in sync by hand.
- **`chosenRestriction` must match the card's own text.** Any effect using `target: 'chosen'` defaults to "any minion or hero" in `TurnStateMachine.computeValidTargets` — a card whose text says "a minion" (e.g. "Deal 3 damage to a minion") must set `chosenRestriction: 'minion'`, or it will silently accept the enemy hero as a legal target despite what it says. This was a real bug (Pocket Sand, Frostbite Bolt, Firelance, Boneshard Finger, Emberheart Shaman all lacked it originally) — when adding a new "to a minion"/"to a hero" effect, set the matching restriction and mirror it in `ai/scoring.ts` (`scoreDamageSpell`, `computePotentialFaceDamage`) so the AI respects the same limitation instead of soft-locking in `AwaitingTarget`.
- **Tribes are minion-only and 'full'-mode-footer-only.** `CardDefinition.tribes` should never be set on a `type: 'spell'` card (`validateCardDefinition.ts` flags it; the Card Creator hides the Tribes section for spells and strips it on switching a draft to spell) and never renders in 'simplified' (board) mode's card face — board cards surface tribes through the hover tooltip instead (`HelpBoxController.ts`), not the card itself. `ChosenTargetRestriction` also accepts a `Tribe` value now (a further narrowing of `'minion'`, since tribes are minion-only) — same as any other targeting behavior, extending it further (e.g. a tribe-count `EffectCondition`) must stay in sync across `TurnStateMachine.computeValidTargets` and all five `scoreXSpell` functions (`scoreDamageSpell`/`scoreHealSpell`/`scoreFreezeSpell`/`scoreSilenceSpell`/`scoreDestroySpell`) in `ai/scoring.ts`, per the AI-sync rule below. `EffectAction.tribeFilter` is the board-wide counterpart (narrows `allMinions`/`allEnemyMinions`/`allFriendlyMinions` instead of a single chosen target) — keep it in sync across `TurnStateMachine.resolveTargetIds` and `ai/scoring.ts`'s `estimateEffectValue`/`tribeFilteredCount` instead, since it never goes through the chosen-target path.
- **`allOtherMinions` is `allMinions` minus the acting instance itself** — available as a `TargetSelector` (triggered effects, paid abilities) and as an `AuraTarget`, e.g. "Anthem: deals 1 damage to all other minions," "All other minions have Charge," "(2): Deal 1 damage to all other minions." `TurnStateMachine.resolveTargetIds`/`auraApplies` implement it by filtering the `allMinions` population against the already-available source instance id — every other board-wide target selector deliberately still includes the source in its own effect (see `auraApplies`'s doc comment), this is the one exception. `ai/scoring.ts` threads an optional `sourceId` parameter through `estimateEffectValue`/`effectActionsValue`/`chosenAwareActionsValue`/`scorePaidAbility` so AOE valuation correctly excludes the source from its own board's count — load-bearing specifically for a paid ability (whose owning minion is already on `ai.board` at scoring time), a no-op for a hand card's `onPlay` effects (not yet on board at scoring time either way). `theredas-the-plaguewoven`'s Wound effect uses this to stop its own board-wide damage from re-triggering its own `onDamaged` — see the self-recursion note in the generator-chain bullet above, now resolved.
- **`destroy` kills a minion outright, bypassing Divine Shield and all normal damage/health math.** Unlike `damage`, it never reduces `currentHealth` by an amount and never checks/consumes Divine Shield — it calls `TurnStateMachine.forceKill` directly (the same primitive Venom uses for its "damage that lands still kills outright" follow-up), which just sets `currentHealth = 0`. Shaped like `freeze`/`silence` (target + optional `chosenRestriction`/`tribeFilter`, no amount) — never targets a hero (`forceKill`'s `findMinion` lookup simply won't find one, so a hero-targeted `destroy` silently no-ops, same accepted gap as freeze/silence). Any future change to how kills/death are resolved must keep `forceKill` in sync, since `destroy` and Venom both depend on it.
- **Chosen-target triggers beyond onPlay/paid-ability (onAttack/Strike, onSpellCast/Channel, onFriendlyMinionCast/Muster, startOfTurn/Vigil, endOfTurn/Curfew) are all pre-walked and prompted for *before* the triggering action resolves anything**, exactly like a card's own onPlay chosen actions always have been — never mid-resolution. `TurnStateMachine.collectPendingPrompts` is the single function that walks every one of these for a given `PendingAction` (including the sourceless `'endTurn'`/`'startTurn'` variants, which gate `endTurn()`/`beginStartTurn()` the same way `playCard`/`declareAttack` already gated on `needsChosenTarget`), returning a flat, ordered list of `PendingPrompt`s (`{ sourceInstanceId, action }`) rather than a single shared restriction queue — because once a prompt sequence can span *multiple source minions* (a board-wide Channel/Muster/Vigil/Curfew reaction, not just the one card/attacker declaring the action), an *earlier* prompt's resolution (e.g. a spell's own onPlay `destroy`) can make a *later* pre-walked source ineligible (dead or silenced) by the time its own trigger actually fires. `TurnStateMachine.buildCursorMap` keys the real execution-time `ChosenTargetCursor` by source instance (not one shared FIFO) specifically so that case degrades gracefully — the ineligible source's own reserved target(s) just go unused, rather than shifting every other source's ids by one position and corrupting them. This is a known, accepted, currently-unreachable limitation (needs two interacting board-wide chosen-target cards on the same trigger; only Sky Titan exists today) — not something to build further machinery for. Reactive, damage/death-cascade-dependent triggers (onDeath/Deathcry, onDamaged/Wound, onFriendlyMinionDeath/Mourn) can't use this pre-walk approach — the set of firing instances for those can only be discovered by resolving an earlier chosen target for real — and are handled by a separate, generator-based mechanism instead; see the next bullet.
- **onDeath/Deathcry, onDamaged/Wound, and onFriendlyMinionDeath/Mourn resolve via a resumable generator chain layered *underneath* the pre-walk model above, not a second copy of it.** These fire from inside `TurnStateMachine.sweepDeaths`/`dealDamage`, whose firing set can only be discovered by resolving an earlier chosen target for real (a Deathcry's own damage might kill a second minion whose Deathcry also needs a target, and so on) — there's no way to enumerate them up front the way `collectPendingPrompts` does for the pre-walked triggers. Every function in the call chain that can transitively reach one of these three triggers — `executePlayCard`/`executeAbility`/`executeAttack`/`executeEndTurn`/`executeStartTurn`, `sweepDeaths`, `triggerEffects`/`triggerBoardWide`, `applyEffectAction`, `dealDamage` — is a `function*` generator, `yield*`-chained down the same call graph these already had. The one substitution point is `resolveChosenTargetId` (replaces the old `resolveChosenCursor`): a `target: 'chosen'` action whose `ChosenTargetCursor` already has the answer (the pre-walked Tier-1 case) consumes it synchronously, same as before generators existed — a generator that never needs a live prompt resolves to `done` on its very first `.next()`, so this is a no-op change for every existing card. One with nothing pre-walked (always true for these three triggers) computes valid targets fresh against the *live* board and `yield`s a `TargetRequest { sourceInstanceId, action, validTargetIds }`, resuming with the real answer once the player (or `ai/OpponentAI.ts`'s `decideOpponentTarget`, unchanged) answers it. `TurnStateMachine.driveResolution` owns the suspend/resume handshake: it holds the one in-flight generator on `activeResolution`, and `selectTarget` checks that field first to route a click into it directly, bypassing the Tier-1 `pendingPrompts`/`pendingAction` machinery entirely for this path. The populated `PendingTarget` is the same shape either way (`cancellable: false` always, matching Vigil's existing precedent — the damage/death that raised the prompt already happened, no clean undo; `step`/`totalSteps` always `1`/`1`, since an open-ended cascade's total length isn't knowable up front), so `CardGame/index.ts`'s rendering and `decideOpponentTarget`/`drainOpponentTargeting` needed **no changes at all** — both already operate generically on `state.pendingTarget`. `triggerBoardWide`, uniformly for every trigger it serves (Tier-1 and Tier-2 alike), re-fetches each source instance via `findMinion` immediately before firing it rather than trusting the snapshot taken at loop start — a strict improvement over the "invalidated pre-walked source" edge case two bullets up, since a source that died from an earlier prompt's own resolution during the same walk is now correctly skipped rather than merely degrading gracefully. `driveResolution` guards its `activeResolution` cleanup with an identity check (`if (this.activeResolution === gen) ...`) rather than clearing unconditionally, because `executeEndTurn`'s generator body ends with a *plain* (non-`yield*`) call to `beginStartTurn` for the new active player's own Vigil — which can itself drive a second, independent `executeStartTurn` generator via a nested `driveResolution` call before the outer one's own `.next()` returns `done`; the identity check stops that outer completion from clobbering a still-genuinely-paused inner one. Explicitly out of scope for this mechanism: AI upfront lookahead into Deathcry/Wound/Mourn value when ranking which card to play or attack with — the AI still scores a Tier-2 prompt correctly once it actually appears (same `scoreChosenTarget` dispatch, no new code), it just doesn't chase that value when deciding what to play in the first place, consistent with the project's existing greedy, lookahead-free AI design.
- **`PendingTarget` (`GameState.ts`) carries `action?: EffectAction` and `cancellable: boolean`** alongside `sourceInstanceId`/`validTargetIds`/`step`/`totalSteps`. `action` is the actual `EffectAction` generating the current prompt (absent only for attack's own first step, who to attack, which isn't itself an `EffectAction`) — this is what lets the AI (`ai/OpponentAI.ts`'s `decideOpponentTarget`) resolve *any* prompt reactively via `scoreChosenTarget`, including one it didn't itself declare (a board-wide reaction). `cancellable` is `false` only during the Vigil (`startTurn`) targeting phase — by that point mana has already refreshed and a card's already been drawn for the turn, so there's no clean "undo"; every other phase, including Curfew (`endTurn`, where nothing has mutated yet), stays cancellable. The Scene's Cancel button (`updateCancelButton`) and `TurnStateMachine.cancelTarget` both gate on this flag — no other Scene-side targeting UI needed any changes, since it was already entirely generic over `pendingTarget`.
- **The opponent AI resolves every chosen-target prompt reactively, not via a precomputed target list.** `ai/OpponentAI.ts`'s `decideOpponentTarget(state)` reads the live `state.pendingTarget.action` and calls `scoreChosenTarget` directly — the same function `scorePlayCard`/`scorePaidAbility`/`scoreAttackTriggers` already use internally to rank *which* action to take (they still compute a chosen action's best-achievable score for ranking, they just no longer thread the actual target id through `AIAction`). `CardGame/index.ts`'s `drainOpponentTargeting()` calls this in a loop — `while (phase === AwaitingTarget && activePlayer === 'opponent') selectTarget(decideOpponentTarget(state))` — after `runOpponentTurn` issues any action, after the opponent's own pass-triggered `endTurn()`, and after the *player's* own End Turn button handler (since ending the player's turn can flip `activePlayer` to `'opponent'` mid-call and land straight in the opponent's own Vigil targeting phase, which nothing else would ever resume). This replaced the earlier per-action precomputed `targetIds`/`chosenTargetIds` list on `AIAction` (built by hand-mirroring `TurnStateMachine`'s pre-walk order) — reactive resolution is required anyway for prompts the AI doesn't declare itself, and removes the risk of the AI's own traversal order silently drifting from the engine's.
- **Every new rule must be checked against the opponent AI, not just the player-facing path — no exceptions, including cards authored via the Card Creator.** `ai/scoring.ts`/`OpponentAI.ts` are hand-authored heuristics with no automatic awareness of `TurnStateMachine`/`keywordRules.ts` changes — a new keyword, effect kind, or targeting rule can render and enforce perfectly for the player while the AI either ignores it, misplays it, or soft-locks on it, and nothing will error to surface that. This is a standing rule, not a one-off reminder: after adding or editing any card rule, actually watch the AI play a card that exercises it (or trace the new case through `scoring.ts` by hand) before calling the change done. The Card Creator (see below) only ever writes to `cards.ts` — it has no path to `ai/scoring.ts`, so anything authored through it is exactly as exposed to this gap as a hand-edited card.
- **Rarity is a power-level bucket, not flavor.** `CardRarity` (`common | rare | exotic | legendary | mythical`, ascending) drives `deckGenerator.ts`'s proportional random deck-building (14 common / 12 rare / 2 exotic / 1 legendary / 1 mythical per 30-card deck currently, guaranteeing every rarity at least one slot) — a card's rarity should reflect its intended power level and how often it should show up, not just feel. Moving a card between rarity tiers (as opposed to only tuning its stats) is a legitimate, deliberate balance lever.
- Tokens (e.g. `ember-fledgling`, summoned rather than drawn) use `type: "token"` instead of `"minion"`/`"spell"` and omit `rarity` entirely — `deckGenerator.ts`'s `idsForRarity` excludes any `type: "token"` definition from generated decks. `type: "token"` is mechanically identical to `"minion"` everywhere else (attack/health, board placement, combat, Muster/Mourn triggers) — see `CardType`'s doc comment in `Card.ts` for the full list of call sites that treat it as minion-equivalent. Don't add a `rarity` to a token (the Card Creator's validator flags it).

## Card Creator

Visual editor for `cards.ts`, at the `/card-creator` route (`src/pages/card-creator.tsx`
→ `src/cardCreator/CardCreatorPage.tsx`, dynamically imported with `ssr: false` like
`index.tsx`/`App.tsx`, since it touches both Phaser and browser-only file APIs). Use
it instead of hand-editing `cards.ts` — see CLAUDE.md's "Card authoring" pointer.
Three-column layout: a card-list sidebar (`CardListSidebar.tsx` — search, New Card)
→ a 33%-width live preview (`PreviewPane.tsx`, Full/Simplified toggle) → the field
form (`CardForm.tsx` + `EffectsEditor.tsx` for the `effects[]` discriminated union).
`EffectsEditor.tsx`'s `EffectValueInput` component (used for damage/heal `amount`,
draw `count`, buff `attack`/`health`) is the Fixed/Counter toggle for an
`EffectValue` field — Counter mode adds a dropdown sourced from
`src/game/data/counterMetadata.ts` (mirrors `keywordMetadata.ts`/`triggerMetadata.ts`'s
shape) plus optional multiplier/offset inputs. It only ever *records* which counter
is picked — see the next bullet for why it can't show a computed number.

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
  There's no board, no opponent, no HP anywhere in this pipeline — deliberately, not
  a gap to fill in — so a `{X}` placeholder in rule text always renders literally
  here (`CardCreatorPreview.rebuild` calls `createCardContainer` without the
  optional `resolvedText` param, same as the pre-counters 3-arg call). See "Dynamic
  values (counters)" above.
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
  An `EffectValue` field's magnitude check only applies to the flat-number case — a
  counter-based value can't be sanity-checked at design time, since its actual number
  depends on live game state; `multiplier`/`offset` are still checked for being finite
  numbers when present. Also flags rule text containing `{X}` on a card with no
  effects at all, since `resolveCardText` would have nothing to substitute (see "Card
  design conventions" and "Dynamic values (counters)" above). Runs again immediately
  before every save as a belt-and-suspenders check, since no `tsc` runs in-browser —
  this validator is the only structural check that ever exists before a write.
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

## Playtesting-only features

Deliberate cheats, left in on purpose to speed up playtesting and debugging.
**Remove all of these before the game ships** — none are gated behind a
dev-only flag, so as written they'd otherwise ship live to players.

- **Opponent's deck is visible.** `CardGame`'s `renderPile` renders a
  clickable pile for *both* players' decks (not just each player's own), and
  `PileViewController.open`/`render` place no restriction on `playerId` — so
  clicking the opponent's deck pile opens the same full pile-inspect overlay
  as your own, showing their entire remaining deck list. To remove: restrict
  `renderPile`'s deck-zone call (`CardGame`'s `renderNow`) to the player's own
  deck, or otherwise stop the opponent's deck pile from being interactive/
  openable.
- **"Draw Card" button conjures any card in the game into your hand.** A
  bottom-right-corner button (`CardGame.createDrawCardButton`, purple-themed
  to read as a debug control rather than a real gameplay button — distinct
  from End Turn's blue/Cancel's red) opens `CardPickerController`
  (`src/game/scenes/CardGame/CardPickerController.ts`): a full-screen,
  scrollable grid of every `minion`/`spell` card definition in the game
  (`type: 'token'` cards excluded — summon-only, never directly obtainable,
  the same exclusion `deckGenerator.ts` applies when building decks), sorted
  cost then name. Clicking a card calls
  `TurnStateMachine.debugAddCard(playerId, definitionId)`, which conjures a
  *brand-new* `CardInstance` of that definition (via `createCardInstance`,
  the same factory `summonMinion` uses to conjure a fresh instance onto the
  board) straight into hand — no deck involvement at all, unlike a real draw
  or the deck-view draw cheat this replaced (see below). No phase/turn
  gating, callable any time. The overlay deliberately doesn't close on pick,
  so several cards can be loaded into hand in a row.

  Modeled closely on `PileViewController`'s `open`/`close`/`clear`/`render`
  shape, and reuses its full-screen dimmer/title/close-button/hint chrome via
  a shared `createOverlayChrome(scene, title, onDismiss)` helper in
  `cardLayout.ts` (the one piece of literal duplication between the two that
  was worth factoring out — everything else, including the grid layout
  itself, differs too much to share: the card pool here is ~70 entries, far
  more than any single pile ever holds, so unlike `PileViewController`'s
  shrink-to-fit-one-screen grid, this one keeps cards at full `CARD_W`×
  `CARD_H` size and scrolls instead, via a `GeometryMask`-clipped content
  container and a `'wheel'` input listener registered once in the
  constructor (no-ops while closed, rather than being wired/unwired per
  open). That mask clips rendering only, not input hit-testing, so a card
  scrolled just past the visible edge could in principle still catch a stray
  click — an accepted caveat for a debug-only tool.

  `debugAddCard` fires no `'state:phase-change'` (same reasoning as the old
  cheat), so the `onPick` callback `CardGame` passes into
  `CardPickerController`'s constructor also calls `CardGame`'s own
  `requestRender()` right after — without it, nothing schedules the
  `renderNow()` that re-lays the hand fan and rewires the new card's
  interactivity (the "hand looks displaced until end turn" bug from the
  cheat this replaced). To remove: delete
  `TurnStateMachine.debugAddCard`, `CardPickerController.ts`,
  `CardGame.createDrawCardButton`/its field/its `create()` wiring, the
  `cardPicker.clear()`/`cardPicker.render()` calls in
  `clearRendered()`/`renderNow()`, the Esc handler's `cardPicker.close()`
  call, and (optionally — harmless if left) `createOverlayChrome` in
  `cardLayout.ts` if `PileViewController` is inlined back to building its own
  chrome directly.

  This replaced an earlier version of this cheat: clicking a card inside
  your own deck-inspect overlay drew that exact card
  (`TurnStateMachine.debugDrawCard(playerId, instanceId)`, pulling an
  *existing* instance out of the deck by id). That deck-view click-to-draw
  wiring has been fully reverted — your own deck view is read-only again,
  identical to the graveyard/opponent-deck views.
- **"Full Mana" button fills your mana to 10/10.** Sits immediately to Draw
  Card's left (`CardGame.createFullManaButton`, same row/size/purple
  palette, reading as a matching pair of debug tools). Calls
  `TurnStateMachine.debugSetMaxMana(playerId)`, which sets both `mana` and
  `maxMana` straight to `TurnStateMachine.MAX_MANA` (10) — no phase/turn
  gating, same as `debugAddCard`. Unlike `debugAddCard`, this emits no event
  and touches no animation queue (a mana change has nothing to fly across
  the screen), so the button's click handler just calls `CardGame`'s
  `requestRender()` directly, which runs `renderNow()` synchronously (nothing
  is animating at the time this fires) and refreshes the mana readout text.
  To remove: delete `TurnStateMachine.debugSetMaxMana` and
  `CardGame.createFullManaButton`/its field/its `create()` wiring.

## Assets

Load new assets in `Preloader.preload()` (`this.load.image(...)` /
`this.load.atlas(...)`) via paths like `this.load.image('key', 'foo.png')`
(path is already scoped to `assets/` via `this.load.setPath('assets')`). On
build they're copied into `dist/assets`. Card art and the card-back texture
are keyed by card id — see "Art rendering" above.

## Game design theory reference

General trading-card-game design theory, researched from Magic: The
Gathering's public design column (Mark Rosewater, "Making Magic"/"Drive to
Work") and Hearthstone's public developer commentary, plus academic/community
analysis. This is genre theory, not a description of this codebase — nothing
here is implemented and none of it prescribes what this project should do.
Consult it when making deliberate design calls (new keyword, new archetype,
rarity/curve tuning) the same way you'd consult a textbook: as a vocabulary
and a set of known tradeoffs, not a checklist to satisfy.

### Mana curve

The "mana curve" is the distribution of a deck's cards across cost, usually
graphed as a bar chart (cost on X, card count on Y). A healthy constructed
curve is bottom-heavy — many cheap cards, fewer expensive ones — because a
player who can't act on curve early falls behind on tempo/board state before
the game's back half matters. Archetype determines curve shape: aggro decks
skew hard toward 1–3 cost with almost nothing above 5; control decks flatten
the curve and lean on a handful of expensive finishers; midrange sits between
the two. A deck's curve is a resource-availability problem independent of any
individual card's power — even a format with only "fair" cards needs curve
variety, or every game plays out identically (all early plays, then a stall).

### Player psychographics: Timmy, Johnny, Spike

Rosewater's shorthand for the three reasons people play (used inside WotC to
sanity-check that a new set/mechanic has something for everyone, not a
literal player taxonomy):
- **Timmy** plays for the experience — big creatures, big spells, splashy
  swingy moments. Design for Timmy with raw scale and "wow" plays.
- **Johnny** plays to express creativity — wants to build something
  idiosyncratic, pull off an unusual combo or deck nobody else would think of.
  Design for Johnny with combo pieces, synergy hooks, and build-around cards.
- **Spike** plays to win and prove skill — wants efficient, optimal, high
  floor/ceiling tools. Design for Spike with tight numbers and skill-testing
  decisions.
A set (or a single card pool) that only serves one of the three will feel
thin to the other two player bases even if it's mechanically sound.

### Deck archetypes: aggro / midrange / control (/ combo)

The three (or four) grand strategies decks pursue, treated as a rough
rock-paper-scissors: aggro beats control (kills before the control deck
stabilizes), control beats midrange (out-values it once past the midgame),
midrange beats aggro (survives the early rush and outsizes it). This is a
tendency, not a hard law — good deckbuilding and play skill routinely invert
individual matchups.
- **Aggro**: cheap, aggressively-statted threats, race-focused, low card
  quality tolerance in exchange for speed; wants to end the game before its
  own late-game weakness (empty hand, small bodies) matters.
- **Midrange**: efficient two-way cards (good rate *and* good value), plays
  a board-control early game and an aggressive mid/late game; wins by being
  good at both halves of the game rather than great at either.
- **Control**: card-advantage and removal-dense early game purely to survive,
  small number of high-impact finishers; wants the game to go long because
  its endgame tools outclass anyone else's.
- **Combo**: a small critical mass of cards that, once assembled, win
  immediately or generate an overwhelming effect — distinct from a merely
  "synergistic" deck (see below) because a combo deck's plan is usually
  binary (assembled vs not) rather than cumulative. Combo decks trade
  resilience (losing one piece can strand the whole plan) for a ceiling no
  fair deck can match; design tension is keeping the combo's *assembly cost*
  (mana, card slots, setup turns) high enough that it isn't just "the best
  deck," since an unbounded combo with no real cost to enable will eclipse
  every other archetype the moment it's found.

### Card advantage vs. tempo vs. board state

Three distinct axes decks compete on, and most cards trade off between them
rather than winning on all three:
- **Card advantage** — having more resources (cards in hand/available)
  than the opponent, usually from draw effects or 2-for-1s (one card that
  answers two of theirs). Compounds over a long game; control decks live here.
- **Tempo** — spending resources efficiently to affect the board *right
  now*, even at a raw card-count loss. A cheap removal spell that trades
  down a card but stops a lethal attacker is a tempo play, not a card-
  advantage play. Aggro decks live here.
- **Board state / life total** — the actual physical position (creatures in
  play, life remaining) independent of cards in hand. A player can be down
  on cards but ahead on board, or vice versa; games are frequently decided
  by a player correctly reading which axis actually matters *this turn*
  rather than always taking "the free card."
A card that's individually inefficient on rate (bad tempo) can still be
correct if its value compounds (card advantage), and vice versa — evaluating
a card in isolation from the archetype/gameplan it belongs to is a common
design and deckbuilding mistake.

### Synergy, combo, and "engine" design

Synergy is any case where two cards are worth more together than the sum of
playing them separately; a combo is the extreme, binary case of synergy
(assembled = win/blowout, unassembled = nothing). Between those two poles
sits the "engine" — a small package that, once online, generates repeatable
value each turn (e.g. a sacrifice outlet + a "whenever a friendly minion
dies" payoff, MTG's "Aristocrats" pattern). Design implications:
- Pure synergy decks degrade gracefully if one piece is removed; pure combo
  decks are fragile — losing the key piece can strand the whole plan. This
  fragility is a legitimate balance lever: a combo can be allowed to be
  extremely powerful *because* it's easy to disrupt, whereas a resilient
  synergy package needs to be kept weaker card-for-card.
- Tribal/typal synergy (MTG's creature types, Hearthstone's minion types —
  Beast, Dragon, Murloc, etc.) is the most common horizontal-design lever:
  cheap to print (just tag existing card shapes with a type + a handful of
  payoff cards) and gives deckbuilders an explicit axis to build around
  without new rules text on every card. This project's SPEC.md "Phase 3"
  roadmap entry (a `CardDefinition.tribe?` tag) is exactly this pattern.

### Power level, rarity, and power creep

**Rarity-as-power vs. rarity-as-specialization.** The naive rarity model
("the stronger the card, the rarer it is") rewards whoever owns the most
copies of the game (collection size / spending power) rather than skill, and
alienates newer/casual players who can't access the strongest tools. The
alternative — used successfully by some digital CCGs after backlash from the
naive model — inverts this: broadly, bluntly useful cards should be
*common* (so every deck has access to solid basics), and rarity should track
*specialization/complexity* instead of raw power. A rare card is one that's
excellent in the right deck and mediocre outside it, not one that's simply
better in a vacuum. This project's SPEC.md "rarity is a power-level bucket,
not flavor" convention already leans toward the naive model (higher rarity
≈ stronger); worth keeping in mind as a known, named tradeoff rather than an
unexamined default if rarity balance ever gets revisited.

**The vanilla test.** A "vanilla" card has no text, only cost/stats — the
tool for sanity-checking a costed card's stat-only power level before
counting its text as a bonus. In MTG limited-design terms, roughly one point
of power+toughness per mana spent is baseline at low cost, trending stingier
per-mana as cost rises (a costed 2-drop "bear" is a 2/2; a 4-drop is
measured against ~7 combined stat points, not 8, and so on) — the curve
*bends*, it isn't linear. A card with text should generally undershoot the
vanilla stat baseline for its cost, with the gap "paid for" by the ability;
a card that hits full vanilla stats *and* has relevant text is either a
built-in bargain (fine for a rarity/complexity payoff) or a sign the ability
was underpriced.

**Power creep.** New card pools tend to drift stronger over time because
"better than what's already out" is an easy design shortcut and a strong
commercial pull (new cards need to feel worth acquiring). Two failure modes:
- **Vertical power creep** — new cards are just strictly better versions of
  old ones (same effect, lower cost / bigger stats). This is the actively
  harmful kind: it invalidates the existing card pool outright and the power
  spiral has no natural ceiling.
- **Horizontal power creep** (the preferred lever) — new cards are powerful
  only in combination with a specific archetype/synergy/tag, not in a
  vacuum. This keeps old generically-good cards relevant (they're still the
  generically-good option) while still giving new cards a reason to exist,
  and the "power" is bounded by how well the deck around it is built rather
  than compounding unboundedly release over release.

### Keyword and mechanic design

A keyword (Taunt, Charge, Divine Shield, ...) is compression: shorthand for
rules text that would otherwise have to be spelled out on every card that
needs it. Design considerations that generalize past any one game:
- **Evergreen vs. set-specific.** Some keywords are meant to appear in every
  release forever (the load-bearing verbs of the game); others are meant to
  headline one release and then rotate out, keeping the game's texture
  fresh without bloating the keyword list every new player has to learn.
  Not every keyword needs to be permanent, and treating a niche/narrow
  keyword as evergreen by default is a common overreach.
- **Ability space and rarity of self-reference.** A mechanic that only makes
  sense in small doses (needs a low density of copies to avoid degenerate
  loops, or only works as a splashy rare payoff rather than a common building
  block) should be costed/rarity-gated to match — printing a build-around
  mechanic at common density either forces every deck into it or does
  nothing, neither of which is the intent.
- **Signpost cards.** In draft-based games, a signpost is a single
  above-rate card that visibly telegraphs "these two things go together" to
  teach an archetype to players who haven't read a strategy guide. The
  underlying idea — one clearly-labeled card per intended archetype, priced
  a little generously specifically *because* its job is legibility, not
  raw efficiency — applies to any card pool that wants players to discover
  build-arounds without external documentation, draft or not.
- **Every new keyword must be checked against automated/AI play, not just
  the human-facing rules text**, if the game has any AI-controlled
  opponent — a lesson already codified for this project (see CLAUDE.md's
  "Every new rule must be checked against the opponent AI").

### Faction/class identity (color pie, Hearthstone classes)

Both MTG's five-color pie and Hearthstone's per-class kit are the same idea
at different granularity: a permanent, curated list of *what a given faction
is and isn't allowed to do*, maintained deliberately rather than left
implicit. Concretely:
- Identity is defined by exclusion as much as inclusion — a faction's
  strengths only read as strengths if there are things it's *bad* at (MTG:
  colors have named strengths and named weaknesses relative to each other;
  Hearthstone: each class explicitly documents what it struggles with, e.g.
  a class strong at wide boards but weak at answering a single huge threat).
  A faction with no weakness has no identity, just a longer card list.
  Fantasy-first, mechanics-second: identity starts from "what does this
  faction feel like to play" (aggressive warrior, controlling wizard,
  value-grinding druid) and mechanics are chosen to serve that feeling, not
  the reverse.
- A shared council/reference (MTG's "Council of Colors") exists specifically
  to catch "this effect doesn't belong to this faction" as a genuine design
  error, the same category of bug as a rules-text mistake — worth treating
  faction identity (if this project ever adds one, e.g. a hero-class system)
  as a constraint to check new cards against, not just a flavor label.

### Physical-game vs. digital-native design constraints

Rules that make sense in a paper game don't automatically transfer to a
digital one, and vice versa — worth naming explicitly since this project is
digital-only and free to diverge from paper-TCG conventions where they don't
serve it:
- **Damage persistence.** MTG (paper-legacy) heals all creature damage back
  to full at end of turn — a rule that exists partly because paper has no
  memory of "this creature took 2 damage" without a marker/counter system.
  Hearthstone (digital-native) lets damage persist turn to turn since the
  client tracks it for free — this makes removal and trades permanent and
  materially changes combat math (a creature that survived a fight is
  *wounded*, not reset). This project already follows the
  digital-native/Hearthstone convention (damage persists; see
  `TurnStateMachine`) — worth knowing that's a deliberate genre fork, not
  the "default" TCG behavior. The one intentional exception is a `buff`/
  `grantKeyword` effect explicitly authored with a `duration` (see "Keyword
  abilities" above) — that's opt-in, per-effect reset, not a general
  end-of-turn healing rule.
- **Turn-exclusive vs. reactive play.** MTG's instant-speed/interaction
  during the opponent's turn makes both players' turns interactive; games
  without that (Hearthstone, this project) are more solitaire-like on each
  individual turn, trading interactivity for a much lower rules-complexity
  ceiling (no stack, no priority passing) — a legitimate simplicity/depth
  tradeoff, not a lesser version of the interactive model.
- **RNG tolerance.** Digital-native designs generally tolerate more
  randomness (random discover/generate effects, random damage spread) than
  paper design does, partly because paper's higher stakes-per-game (physical
  cards, tournament grinding) make variance feel more punishing, and partly
  because a digital client can present random choices (e.g. "pick 1 of 3")
  in a way paper physically cannot.

### Rule of cool / restrictions breed creativity

Two related Rosewater maxims worth keeping as defaults when a design
decision is otherwise a toss-up:
- **Restrictions breed creativity** — an open-ended design space ("make
  anything") is *harder* to design well than a constrained one; a concrete
  restriction (a keyword's exact wording, a faction's exact exclusions, a
  card's exact rarity slot) is a creative prompt, not just a limitation.
  When stuck designing a new card/mechanic, adding a constraint is usually
  more productive than removing one.
- **Rule of cool** — a card that feels great to play (splashy, thematic,
  memorable) earns some slack on strict efficiency, *as long as* that slack
  is intentional and bounded (see Timmy above) rather than an excuse for
  uncosted power. The two failure directions are a game that's all cold
  efficiency and no personality, and a game that's all flavor with no
  underlying rigor — both are real failure modes, not just one.
