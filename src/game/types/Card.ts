import type { PlayerId } from './common';

/** 'token' is mechanically a minion (attack/health, board presence, combat) — it's a separate
 * value purely so it's excluded from `deckGenerator.ts` and rendered/labeled distinctly, not
 * because it behaves differently in play. Any `type === 'minion'` check that's about minion
 * *mechanics* (stats, combat, board placement) must also match 'token'; only checks that are
 * specifically about the printed/collectible classification (footer label, Card Creator type
 * badge) should treat it as its own case. */
export type CardType = 'minion' | 'spell' | 'token';

/** Static keyword abilities a minion can have. See CLAUDE.md's card game architecture notes for the full keyword roadmap. */
export type Keyword = 'taunt' | 'charge' | 'divineShield' | 'windfury' | 'lifesteal' | 'veiled' | 'venom' | 'initiative';

/** A minion's family tag(s) — used for tribe-scoped targeting/conditions. See tribeMetadata.ts for display labels and state/tribes.ts for the logic that reads this. Purely additive: a new tribe is just a new union member + a tribeMetadata.ts entry. */
export type Tribe = 'human' | 'elemental' | 'nature' | 'animal' | 'cosmic' | 'holy' | 'underworld' | 'demon';

export type EffectTrigger =
    | 'onPlay'
    | 'onDeath'
    | 'startOfTurn'
    | 'endOfTurn'
    | 'onAttack'
    | 'onDamaged'
    | 'onSpellCast'
    | 'onMinionDeath'
    | 'onMinionCast';

export type TargetSelector =
    | 'self'
    | 'enemyHero'
    | 'friendlyHero'
    | 'chosen'
    | 'allEnemyMinions'
    | 'allFriendlyMinions'
    | 'allMinions'
    | 'allHeroes';

/**
 * Narrows what a `target: 'chosen'` action may be pointed at — e.g. "Deal 2 damage to a
 * minion" must reject the enemy/friendly hero as a target, not just a `chosen` minion or hero.
 * A specific Tribe value narrows further still ("...to a chosen Elemental") — tribes are
 * minion-only, so it implies the same minion-only restriction 'minion' does, plus a tribe match.
 * Ignored for every other TargetSelector, which already resolves to a fixed, unambiguous target.
 */
export type ChosenTargetRestriction = 'minion' | 'hero' | Tribe;

/** Live game-state readouts an EffectValue can scale off — see counters.ts's resolveCounter. */
export type CounterKind = 'allMinionCount' | 'friendlyMinionCount' | 'enemyMinionCount' | 'friendlyHeroHealth' | 'enemyHeroHealth';

/**
 * Either a flat authored number, or a magnitude computed live from game state when the effect
 * resolves ("cast time") — `resolveCounter(...) * (multiplier ?? 1) + (offset ?? 0)`, see
 * counters.ts. No automatic text substitution happens in the Card Creator (it has no live game
 * state to compute against) — an author writes the literal placeholder `{X}` in a card's `text`
 * by hand, and only the real game's renderer (resolveCardText, also in counters.ts) substitutes
 * it with the live-resolved value when the card is actually shown in a match.
 */
export type EffectValue = number | { counter: CounterKind; multiplier?: number; offset?: number };

/**
 * Narrows an `allMinions`/`allEnemyMinions`/`allFriendlyMinions` target to minions of a
 * specific tribe — e.g. "Deal 10 damage to all Elemental minions." Ignored for every other
 * TargetSelector; a single `chosen` target's tribe restriction is `chosenRestriction` instead.
 */
export type EffectAction =
    | { kind: 'damage'; amount: EffectValue; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe }
    | { kind: 'heal'; amount: EffectValue; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe }
    | { kind: 'draw'; count: EffectValue }
    | { kind: 'buff'; attack?: EffectValue; health?: EffectValue; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe }
    | { kind: 'summon'; definitionId: string; count: number }
    | { kind: 'freeze'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe }
    | { kind: 'silence'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe }
    | { kind: 'destroy'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe }
    | { kind: 'grantKeyword'; keyword: Keyword; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction; tribeFilter?: Tribe };

/**
 * Gates whether a CardEffect fires beyond its trigger alone. 'momentum' is "Momentum(N):" —
 * fires only if at least N other cards were already played by this effect's owner earlier this
 * turn (see PlayerState.cardsPlayedThisTurn). A discriminated union since Phase 3's roadmap
 * (SPEC.md) already earmarks a tribe-count condition landing here later.
 */
export type EffectCondition = { type: 'momentum'; minCount: number };

export interface CardEffect {
    trigger: EffectTrigger;
    action: EffectAction;
    condition?: EffectCondition;
}

/**
 * A minion/token's activated ability: pay `cost` mana any time during the controller's turn to
 * resolve `action` (prompting for a target first if `action.target === 'chosen'`). Unlike
 * CardEffect, this isn't trigger-driven — it's a player-initiated, repeatable action gated purely
 * by available mana (no 'once per turn' limiter, and not blocked by summoning sickness, since
 * activating one isn't a combat action — see TurnStateMachine.activateAbility). Card text
 * convention: a `(<cost>):` prefix, e.g. "(2): Deal 1 damage to a minion." — see SPEC.md's "Card
 * design conventions".
 */
export interface PaidAbility {
    cost: number;
    action: EffectAction;
}

/** A card's power-level bucket, used by deckGenerator.ts to build proportionate random decks. Ascending rarity/power order. */
export type CardRarity = 'common' | 'rare' | 'exotic' | 'legendary' | 'mythical';

/** Static, authored card data — one entry per unique card, not per copy in a deck. */
export interface CardDefinition {
    id: string;
    name: string;
    cost: number;
    type: CardType;
    text: string;
    attack?: number;
    health?: number;
    effects?: CardEffect[];
    /** Minion/token-only activated abilities — see PaidAbility's doc comment. */
    paidAbilities?: PaidAbility[];
    keywords?: Keyword[];
    /** Minion-only family tag(s). Rendered only in 'full' card mode's footer (Rarity Dot -> Tribe -> Type) — never in 'simplified' mode. */
    tribes?: Tribe[];
    /** Absent for `type: 'token'` cards (e.g. summon-effect targets) — deckGenerator.ts excludes tokens from generated decks by `type`, not by rarity presence. Required in practice for 'minion'/'spell' cards (the Card Creator enforces this), even though the field itself stays optional. */
    rarity?: CardRarity;
    /** 'full' mode only — nudges art to butt against the header/footer's opaque flat bar instead of centering under their tapered/transparent edges. Absent = centered (current behavior). No effect in 'simplified' mode, which has no header/footer bar to align against. */
    artVerticalAlign?: 'top' | 'bottom';
}

/** Runtime state for one physical copy of a card as it moves through zones. */
export interface CardInstance {
    instanceId: string;
    definitionId: string;
    owner: PlayerId;
    zone: 'deck' | 'hand' | 'board' | 'graveyard';
    currentAttack?: number;
    currentHealth?: number;
    /** Healing caps at this value. Starts at the definition's base health and rises with health buffs — see TurnStateMachine.buff. Distinct from PlayerState.maxHealth, which heroes can be healed past (intentional, see CLAUDE.md). */
    maxHealth?: number;
    summoningSick: boolean;
    /** How many times this minion has attacked this turn — compare against getMaxAttacks() from keywordRules, not a hardcoded 1, since Windfury raises the cap. */
    attacksThisTurn: number;
    /** Mutated at runtime as consumable keywords (e.g. divineShield) are used up — distinct from the static CardDefinition.keywords it was seeded from. */
    keywords: Set<Keyword>;
    /** Set by a `freeze` effect; blocks canDeclareAttack until cleared at the end of this minion's controller's next turn — see TurnStateMachine.endTurn. */
    frozen: boolean;
    /** Set by a `silence` effect (which also clears `keywords`); permanently suppresses this instance's own trigger effects going forward — see TurnStateMachine.triggerEffects. */
    silenced: boolean;
}
