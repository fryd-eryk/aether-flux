import { CARD_DEFINITIONS } from '../data/cards';
import type { CardDefinition, CardInstance } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';

// Mirrors TurnStateMachine's private MAX_BOARD_SIZE — kept in sync manually since it isn't exported.
const MAX_BOARD_SIZE = 7;

function opponentOf(id: PlayerId): PlayerId {
    return id === 'player' ? 'opponent' : 'player';
}

function canAttack(card: CardInstance): boolean {
    return !card.summoningSick && !card.hasAttackedThisTurn;
}

/**
 * Total damage the AI could put on the enemy hero this turn if it committed everything to
 * face (all eligible attackers + any affordable direct-damage spell). Comparing this against
 * the enemy's current health is the AI's lethal check — scorePlayCard/scoreAttack use it to
 * heavily favor face damage over trading once lethal is in reach, mirroring how Hearthstone's
 * shipped AI special-cases "can I kill this turn" rather than doing general lookahead.
 */
export function computePotentialFaceDamage(state: GameState, aiId: PlayerId): number {
    const ai = state.players[aiId];
    let total = ai.board.filter(canAttack).reduce((sum, c) => sum + (c.currentAttack ?? 0), 0);

    for (const card of ai.hand) {
        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition || definition.type !== 'spell' || ai.mana < definition.cost) continue;
        const damageEffect = definition.effects?.find(
            (e) => e.trigger === 'onPlay' && e.action.kind === 'damage' && e.action.target === 'chosen'
        );
        if (damageEffect && damageEffect.action.kind === 'damage') total += damageEffect.action.amount;
    }

    return total;
}

export interface ScoredTarget {
    score: number;
    targetId?: string;
}

/** Scores playing `card` from hand, resolving the best target for chosen-target spells along the way. */
export function scorePlayCard(
    state: GameState,
    aiId: PlayerId,
    card: CardInstance,
    definition: CardDefinition,
    lethalAvailable: boolean
): ScoredTarget {
    const ai = state.players[aiId];

    if (definition.type === 'minion') {
        if (ai.board.length >= MAX_BOARD_SIZE) return { score: -1 }; // board full: the minion would just be discarded, see TurnStateMachine.executePlayCard

        const stats = (card.currentAttack ?? 0) + (card.currentHealth ?? 0);
        const hasBattlecry = (definition.effects ?? []).some((e) => e.trigger === 'onPlay');
        const overextendPenalty = ai.board.length >= MAX_BOARD_SIZE - 1 ? 5 : 0;
        return { score: stats * 2 + (hasBattlecry ? 3 : 0) - overextendPenalty };
    }

    const onPlay = definition.effects?.find((e) => e.trigger === 'onPlay');
    if (!onPlay) return { score: 0 };

    if (onPlay.action.kind === 'damage' && onPlay.action.target === 'chosen') {
        return scoreDamageSpell(state, aiId, onPlay.action.amount, lethalAvailable);
    }
    if (onPlay.action.kind === 'heal' && onPlay.action.target === 'chosen') {
        return scoreHealSpell(state, aiId, onPlay.action.amount);
    }

    return { score: 0 };
}

function scoreDamageSpell(state: GameState, aiId: PlayerId, amount: number, lethalAvailable: boolean): ScoredTarget {
    const enemyId = opponentOf(aiId);
    const enemy = state.players[enemyId];

    const faceScore = amount * (lethalAvailable ? 100 : 1.5);
    let best: ScoredTarget = { score: faceScore, targetId: enemyId };

    for (const minion of enemy.board) {
        const health = minion.currentHealth ?? 0;
        const value = (minion.currentAttack ?? 0) + health;
        const score = amount >= health ? value * 3 : amount * 0.5;
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    return best;
}

function scoreHealSpell(state: GameState, aiId: PlayerId, amount: number): ScoredTarget {
    const ai = state.players[aiId];
    let best: ScoredTarget = { score: 0 };

    const heroMissing = ai.maxHealth - ai.health;
    const heroScore = Math.min(amount, heroMissing) * 1.5;
    if (heroScore > best.score) best = { score: heroScore, targetId: aiId };

    for (const minion of ai.board) {
        const definition = CARD_DEFINITIONS[minion.definitionId];
        if (!definition?.health) continue;
        const missing = definition.health - (minion.currentHealth ?? 0);
        if (missing <= 0) continue;
        const score = Math.min(amount, missing) * 1.5;
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    return best;
}

/** Scores attacking `target` (a specific enemy minion, or 'face' for the enemy hero) with `attacker`. */
export function scoreAttack(attacker: CardInstance, target: CardInstance | 'face', lethalAvailable: boolean): number {
    if (target === 'face') {
        const attack = attacker.currentAttack ?? 0;
        return attack * (lethalAvailable ? 100 : 1);
    }

    const attackerAttack = attacker.currentAttack ?? 0;
    const attackerHealth = attacker.currentHealth ?? 0;
    const targetAttack = target.currentAttack ?? 0;
    const targetHealth = target.currentHealth ?? 0;

    const defenderDies = attackerAttack >= targetHealth;
    const attackerDies = targetAttack >= attackerHealth;

    const attackerValue = attackerAttack + attackerHealth;
    const targetValue = targetAttack + targetHealth;

    if (defenderDies && !attackerDies) return targetValue * 3; // clean kill, keep the attacker
    if (defenderDies && attackerDies) return targetValue - attackerValue + 5; // even trade, favor when the defender was worth more
    if (!defenderDies && !attackerDies) return -2; // pointless chip damage
    return -10; // suicidal — attacker dies for nothing
}
