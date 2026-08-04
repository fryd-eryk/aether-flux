import type { PlayerId } from './common';

export type CardType = 'minion' | 'spell';

export type EffectTrigger = 'onPlay' | 'onDeath' | 'startOfTurn' | 'endOfTurn';

export type TargetSelector =
    | 'self'
    | 'enemyHero'
    | 'friendlyHero'
    | 'chosen'
    | 'allEnemyMinions'
    | 'allFriendlyMinions';

export type EffectAction =
    | { kind: 'damage'; amount: number; target: TargetSelector }
    | { kind: 'heal'; amount: number; target: TargetSelector }
    | { kind: 'draw'; count: number }
    | { kind: 'buff'; attack?: number; health?: number; target: TargetSelector }
    | { kind: 'summon'; definitionId: string; count: number };

export interface CardEffect {
    trigger: EffectTrigger;
    action: EffectAction;
}

/** Static, authored card data — one entry per unique card, not per copy in a deck. */
export interface CardDefinition {
    id: string;
    name: string;
    cost: number;
    type: CardType;
    art: string;
    text: string;
    attack?: number;
    health?: number;
    effects?: CardEffect[];
}

/** Runtime state for one physical copy of a card as it moves through zones. */
export interface CardInstance {
    instanceId: string;
    definitionId: string;
    owner: PlayerId;
    zone: 'deck' | 'hand' | 'board' | 'graveyard';
    currentAttack?: number;
    currentHealth?: number;
    summoningSick: boolean;
    hasAttackedThisTurn: boolean;
}
