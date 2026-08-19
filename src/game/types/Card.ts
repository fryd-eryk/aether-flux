import type { PlayerId } from './common';

/** 'token' is mechanically a minion (attack/health, board presence, combat) — it's a separate
 * value purely so it's excluded from `deckGenerator.ts` and rendered/labeled distinctly, not
 * because it behaves differently in play. Any `type === 'minion'` check that's about minion
 * *mechanics* (stats, combat, board placement) must also match 'token'; only checks that are
 * specifically about the printed/collectible classification (footer label, Card Creator type
 * badge) should treat it as its own case. 'aether' is a resource card (see AetherCost/
 * AetherCategory below, and TurnStateMachine.playAetherCard) — it never goes through playCard/
 * executePlayCard, has no attack/health/rarity/effects, and is excluded by construction (not by
 * an added check) from every site that guards on `type === 'minion' || type === 'token'`. */
export type CardType = 'minion' | 'spell' | 'token' | 'aether';

/** Static keyword abilities a minion can have. See CLAUDE.md's card game architecture notes for the full keyword roadmap. */
export type Keyword = 'taunt' | 'charge' | 'divineShield' | 'windfury' | 'lifesteal' | 'veiled' | 'venom' | 'initiative';

/** A minion's family tag(s) — used for tribe-scoped targeting/conditions. See tribeMetadata.ts for display labels and state/tribes.ts for the logic that reads this. Purely additive: a new tribe is just a new union member + a tribeMetadata.ts entry. */
export type Tribe = 'humanoid' | 'elemental' | 'nature' | 'animal' | 'cosmic' | 'holy' | 'underworld' | 'demon';

export type EffectTrigger =
    | 'onPlay'
    | 'onDeath'
    | 'startOfTurn'
    | 'endOfTurn'
    | 'onAttack'
    | 'onDamaged'
    | 'onSpellCast'
    | 'onFriendlyMinionDeath'
    | 'onFriendlyMinionCast';

export type TargetSelector =
    | 'self'
    | 'enemyHero'
    | 'friendlyHero'
    | 'chosen'
    | 'allEnemyMinions'
    | 'allFriendlyMinions'
    | 'allMinions'
    | 'allOtherMinions'
    | 'allHeroes';

/**
 * Narrows what a `target: 'chosen'` action may be pointed at — e.g. "Deal 2 damage to a
 * minion" must reject the enemy/friendly hero as a target, not just a `chosen` minion or hero.
 * A specific Tribe value narrows further still ("...to a chosen Elemental") — tribes are
 * minion-only, so it implies the same minion-only restriction 'minion' does, plus a tribe match.
 * Ignored for every other TargetSelector, which already resolves to a fixed, unambiguous target.
 */
export type ChosenTargetRestriction = 'minion' | 'hero' | Tribe;

/** Live game-state readouts an EffectValue can scale off — see counters.ts's resolveCounter.
 * 'allTribeMinionCount' counts a chosen tribe across both boards — see EffectValue's `tribe` field. */
export type CounterKind =
    | 'allMinionCount'
    | 'friendlyMinionCount'
    | 'enemyMinionCount'
    | 'friendlyHeroHealth'
    | 'enemyHeroHealth'
    | 'allTribeMinionCount'
    | 'friendlyHandCount'
    | 'enemyHandCount'
    | 'friendlyGraveyardCount'
    | 'enemyGraveyardCount'
    | 'friendlyDeckCount'
    | 'enemyDeckCount';

/**
 * Either a flat authored number, or a magnitude computed live from game state when the effect
 * resolves ("cast time") — `resolveCounter(...) * (multiplier ?? 1) + (offset ?? 0)`, see
 * counters.ts. No automatic text substitution happens in the Card Creator (it has no live game
 * state to compute against) — an author writes the literal placeholder `{X}` in a card's `text`
 * by hand, and only the real game's renderer (resolveCardText, also in counters.ts) substitutes
 * it with the live-resolved value when the card is actually shown in a match. `tribe` is only
 * meaningful (and required) when `counter` is `'allTribeMinionCount'`.
 */
export type EffectValue = number | { counter: CounterKind; multiplier?: number; offset?: number; tribe?: Tribe };

/**
 * Narrows an `allMinions`/`allEnemyMinions`/`allFriendlyMinions` target to minions of a
 * specific tribe — e.g. "Deal 10 damage to all Elemental minions." Ignored for every other
 * TargetSelector; a single `chosen` target's tribe restriction is `chosenRestriction` instead.
 */
export type EffectAction =
    | { kind: 'damage'; amount: EffectValue; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; reuseTarget?: boolean }
    | { kind: 'heal'; amount: EffectValue; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; reuseTarget?: boolean }
    | { kind: 'draw'; count: EffectValue }
    /** `duration` (in turns) makes this a temporary buff — absent means permanent. See TemporaryEffect / TurnStateMachine.tickTemporaryEffects. */
    | { kind: 'buff'; attack?: EffectValue; health?: EffectValue; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; duration?: number; reuseTarget?: boolean }
    | { kind: 'summon'; definitionId: string; count: number }
    | { kind: 'freeze'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; reuseTarget?: boolean }
    | { kind: 'silence'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; reuseTarget?: boolean }
    | { kind: 'destroy'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; reuseTarget?: boolean }
    /** `duration` (in turns) makes this a temporary grant — absent means permanent. See TemporaryEffect / TurnStateMachine.tickTemporaryEffects. */
    | { kind: 'grantKeyword'; keyword: Keyword; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe; duration?: number; reuseTarget?: boolean };

/** Continuous board-wide selectors an Aura can target — a subset of TargetSelector: no
 * 'chosen'/'self'/hero selectors, since an aura isn't resolved once at cast time, it's
 * re-evaluated live for as long as the source is alive/on board/unsilenced. 'allOtherMinions' is
 * the one deliberate exception to auraApplies' "a source matching its own aura's criteria buffs
 * itself too, no self-exclusion special-casing" rule — every other target here still includes the
 * source in its own aura's effect. */
export type AuraTarget = 'allFriendlyMinions' | 'allEnemyMinions' | 'allMinions' | 'allOtherMinions';

/**
 * A passive, continuously-active stat buff granted by a minion to matching minions on the
 * board, for as long as this minion is alive, on board, and not silenced — e.g. "All Demon
 * you control have +1/+1." Re-evaluated live by TurnStateMachine.recalculateAuras whenever
 * board membership or silence status changes, unlike CardEffect, which is trigger-driven and
 * resolves once. `attack`/`health` may be a live counter (see EffectValue), re-resolved on
 * every recalculation, not just once.
 */
export interface CardAura {
    target: AuraTarget;
    tribeFilter?: Tribe;
    attack?: EffectValue;
    health?: EffectValue;
    keywords?: Keyword[];
}

/** `reuseTarget: true` (only meaningful when `target === 'chosen'`) means this action targets
 * whatever the nearest earlier `target: 'chosen'` action in the same actions[] list resolved to,
 * instead of prompting for a fresh target — e.g. "Target minion gets +1/+2 and Divine Shield"
 * is one prompt, not two. Must not be set on the first chosen-target action in a list (nothing to
 * reuse yet) — see validateCardDefinition.ts and TurnStateMachine.collectPendingPrompts. */

/**
 * A time-limited keyword grant or stat buff riding on a CardInstance, decremented once per
 * endTurn() call (either player's) and reversed/removed at zero — see
 * TurnStateMachine.tickTemporaryEffects. `turnsRemaining: 1` reads as "until end of turn": it
 * expires at the end of the very turn it was granted on.
 */
export type TemporaryEffect =
    | { kind: 'keyword'; keyword: Keyword; turnsRemaining: number }
    | { kind: 'buff'; attack: number; health: number; turnsRemaining: number };

/**
 * Gates whether a CardEffect fires beyond its trigger alone. 'momentum' is "Momentum(N):" —
 * fires only if at least N other cards were already played by this effect's owner earlier this
 * turn (see PlayerState.cardsPlayedThisTurn). A discriminated union since Phase 3's roadmap
 * (SPEC.md) already earmarks a tribe-count condition landing here later.
 */
export type EffectCondition = { type: 'momentum'; minCount: number };

export interface CardEffect {
    trigger: EffectTrigger;
    /** Fire together, in order, whenever `trigger` fires — not independent sub-effects. */
    actions: EffectAction[];
    condition?: EffectCondition;
}

/**
 * A minion/token's activated ability: pay `cost` mana any time during the controller's turn to
 * resolve `actions` in order (prompting for a target first, once per chosen-target action, if
 * any `actions[].target === 'chosen'`). Unlike
 * CardEffect, this isn't trigger-driven — it's a player-initiated, repeatable action gated purely
 * by available mana (no 'once per turn' limiter, and not blocked by summoning sickness, since
 * activating one isn't a combat action — see TurnStateMachine.activateAbility). Card text
 * convention: a `(<cost>):` prefix, e.g. "(2): Deal 1 damage to a minion." — see SPEC.md's "Card
 * design conventions".
 */
export interface PaidAbility {
    cost: number;
    /** Fire together, in order, whenever this ability is activated — not independent sub-abilities. */
    actions: EffectAction[];
}

/** A card's power-level bucket, used by deckGenerator.ts to build proportionate random decks. Ascending rarity/power order. */
export type CardRarity = 'common' | 'rare' | 'exotic' | 'legendary' | 'mythical';

/** The five Aether Deck categories — see SPEC.md's "Resource system roadmap: Aether". 'generic'
 * is the only category that pays a card's `AetherCost.generic` amount; the four elemental
 * categories exist purely to satisfy `AetherCost.elemental` thresholds (a presence check, never
 * tapped/consumed for that) and enter play tapped, unlike 'generic'. */
export type AetherCategory = 'fire' | 'water' | 'earth' | 'air' | 'generic';
export type ElementalCategory = Exclude<AetherCategory, 'generic'>;

/** A non-Aether card's two-part cost. `generic` is paid by tapping that many untapped 'generic'
 * Aether in play (tap/untap like a land — see TurnStateMachine.payGenericAether via
 * state/aether.ts). `elemental`, if present, is a separately-authored threshold: requires
 * `threshold` Aether *of that category* (any mix of distinct cards) simply present in play,
 * tapped or not — never consumed to satisfy it. See state/aether.ts's canAffordAetherCost. */
export interface AetherCost {
    generic: number;
    elemental?: { category: ElementalCategory; threshold: number };
}

/** Static, authored card data — one entry per unique card, not per copy in a deck. */
export interface CardDefinition {
    id: string;
    name: string;
    /** Absent only for `type: 'aether'` cards, which have no cost of their own — see aetherCategory. */
    cost?: AetherCost;
    type: CardType;
    text: string;
    attack?: number;
    health?: number;
    effects?: CardEffect[];
    /** Minion/token-only passive, continuously-active buffs — see CardAura's doc comment. */
    auras?: CardAura[];
    /** Minion/token-only activated abilities — see PaidAbility's doc comment. */
    paidAbilities?: PaidAbility[];
    keywords?: Keyword[];
    /** Minion-only family tag(s). Rendered only in 'full' card mode's footer (Rarity Dot -> Tribe -> Type) — never in 'simplified' mode. */
    tribes?: Tribe[];
    /** Absent for `type: 'token'` cards (e.g. summon-effect targets) — deckGenerator.ts excludes tokens from generated decks by `type`, not by rarity presence. Required in practice for 'minion'/'spell' cards (the Card Creator enforces this), even though the field itself stays optional. Also absent for `type: 'aether'`. */
    rarity?: CardRarity;
    /** Required in practice only for `type: 'aether'` cards (Card Creator-enforced) — which of the five Aether Deck categories this card is. */
    aetherCategory?: AetherCategory;
    /** 'full' mode only — nudges art to butt against the header/footer's opaque flat bar instead of centering under their tapered/transparent edges. Absent = 'bottom' (default); 'center' must be set explicitly to opt back into the old centered crop. No effect in 'simplified' mode, which has no header/footer bar to align against. */
    artVerticalAlign?: 'top' | 'bottom' | 'center';
}

/** Runtime state for one physical copy of a card as it moves through zones. */
export interface CardInstance {
    instanceId: string;
    definitionId: string;
    owner: PlayerId;
    zone: 'deck' | 'hand' | 'board' | 'graveyard' | 'aetherDeck' | 'aetherInPlay';
    currentAttack?: number;
    currentHealth?: number;
    /** Healing caps at this value. Starts at the definition's base health and rises with health buffs — see TurnStateMachine.buff. Distinct from PlayerState.maxHealth, which heroes can be healed past (intentional, see CLAUDE.md). */
    maxHealth?: number;
    summoningSick: boolean;
    /** Aether-card-only: true while this instance can't pay a generic cost / doesn't yet satisfy
     * an elemental threshold's "presence" check being read as "usable." Deliberately a separate
     * field from `summoningSick` — that field's clearing loop and its only consumer
     * (keywordRules.canDeclareAttack) are both combat-specific, and Aether cards never attack.
     * Untapped on entry for a 'generic' Aether, tapped on entry for an elemental one; tapped to
     * pay a generic cost; untaps automatically at its owner's next beginStartTurn, like a Magic
     * land — never consumed/destroyed by normal cost payment. Meaningless (stays false) on a
     * non-Aether instance. */
    tapped: boolean;
    /** How many times this minion has attacked this turn — compare against getMaxAttacks() from keywordRules, not a hardcoded 1, since Windfury raises the cap. */
    attacksThisTurn: number;
    /** Mutated at runtime as consumable keywords (e.g. divineShield) are used up — distinct from the static CardDefinition.keywords it was seeded from. */
    keywords: Set<Keyword>;
    /** Set by a `freeze` effect; blocks canDeclareAttack until cleared at the end of this minion's controller's next turn — see TurnStateMachine.endTurn. */
    frozen: boolean;
    /** Set by a `silence` effect (which also clears `keywords`); permanently suppresses this instance's own trigger effects going forward — see TurnStateMachine.triggerEffects. */
    silenced: boolean;
    /** Time-limited keyword grants/buffs still counting down — see TemporaryEffect and TurnStateMachine.tickTemporaryEffects. */
    temporaryEffects: TemporaryEffect[];
    /** This instance's current total *received* aura bonus, tracked so recalculateAuras can diff
     * old vs. new and apply just the delta to currentAttack/currentHealth/maxHealth — there's no
     * stored base stat anywhere at runtime, so this is what makes the diff possible. Absent/0 means
     * no active aura bonus. */
    auraAttack?: number;
    auraHealth?: number;
    /** Keywords currently granted purely by an active Aura (see CardAura.keywords), tracked
     * separately from `keywords` itself so recalculateAuras can tell which of this instance's
     * current keywords it's responsible for — needed to know which ones to strip when an aura
     * stops applying (without also stripping a printed or temporarily-granted keyword) and which
     * to leave alone when Silence clears `keywords`, since an aura-granted keyword survives Silence
     * exactly like an aura stat bonus does — see silenceMinion. */
    auraKeywords: Set<Keyword>;
}
