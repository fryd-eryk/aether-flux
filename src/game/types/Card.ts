import type { PlayerId } from './common';

export type CardType = 'minion' | 'spell';

/** Static keyword abilities a minion can have. See CLAUDE.md's card game architecture notes for the full keyword roadmap. */
export type Keyword = 'taunt' | 'charge' | 'divineShield' | 'windfury' | 'lifesteal' | 'veiled' | 'venom';

export type EffectTrigger = 'onPlay' | 'onDeath' | 'startOfTurn' | 'endOfTurn' | 'onAttack' | 'onDamaged';

export type TargetSelector =
    | 'self'
    | 'enemyHero'
    | 'friendlyHero'
    | 'chosen'
    | 'allEnemyMinions'
    | 'allFriendlyMinions';

/**
 * Narrows what a `target: 'chosen'` action may be pointed at — e.g. "Deal 2 damage to a
 * minion" must reject the enemy/friendly hero as a target, not just a `chosen` minion or hero.
 * Ignored for every other TargetSelector, which already resolves to a fixed, unambiguous target.
 */
export type ChosenTargetRestriction = 'minion' | 'hero';

export type EffectAction =
    | { kind: 'damage'; amount: number; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction }
    | { kind: 'heal'; amount: number; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction }
    | { kind: 'draw'; count: number }
    | { kind: 'buff'; attack?: number; health?: number; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction }
    | { kind: 'summon'; definitionId: string; count: number }
    | { kind: 'freeze'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction }
    | { kind: 'silence'; target: TargetSelector; chosenRestriction?: ChosenTargetRestriction };

export interface CardEffect {
    trigger: EffectTrigger;
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
    keywords?: Keyword[];
    /** Absent for tokens (e.g. summon-effect targets) — deckGenerator.ts only draws from definitions that have a rarity, so omitting this is what keeps a token out of generated decks. */
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
