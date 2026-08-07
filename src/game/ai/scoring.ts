import { CARD_DEFINITIONS } from '../data/cards';
import { canDeclareAttack, hasKeyword } from '../state/keywordRules';
import type { CardDefinition, CardInstance, ChosenTargetRestriction, EffectAction } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';

// Mirrors TurnStateMachine's private MAX_BOARD_SIZE — kept in sync manually since it isn't exported.
const MAX_BOARD_SIZE = 7;

function opponentOf(id: PlayerId): PlayerId {
    return id === 'player' ? 'opponent' : 'player';
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
    let total = ai.board.filter(canDeclareAttack).reduce((sum, c) => sum + (c.currentAttack ?? 0), 0);

    for (const card of ai.hand) {
        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition || ai.mana < definition.cost) continue;

        if (definition.type === 'spell') {
            const damageEffect = definition.effects?.find(
                (e) => e.trigger === 'onPlay' && e.action.kind === 'damage' && e.action.target === 'chosen'
            );
            // A minion-restricted damage effect (e.g. Pocket Sand's "to a minion") can never hit face.
            if (
                damageEffect &&
                damageEffect.action.kind === 'damage' &&
                damageEffect.action.chosenRestriction !== 'minion'
            ) {
                total += damageEffect.action.amount;
            }
        } else if (definition.keywords?.includes('charge')) {
            // A Charge minion could be played and swung at face for lethal in the same turn.
            total += definition.attack ?? 0;
        }
    }

    return total;
}

export interface ScoredTarget {
    score: number;
    targetId?: string;
}

/**
 * Rough point value of an effect that doesn't need a chosen target — board-wide or fixed-target
 * (hero/all-minions) damage, heal, buff, draw, summon, across any trigger (onPlay/onDeath/
 * startOfTurn/endOfTurn alike, so a Deathcry or Vigil effect is weighed same as a Battlecry-style
 * one). Chosen-target damage/heal is intentionally excluded here (returns 0) — those are scored
 * precisely by scoreChosenTarget instead, which also picks which target to hit.
 */
function estimateEffectValue(action: EffectAction, state: GameState, aiId: PlayerId): number {
    const ai = state.players[aiId];
    const enemy = state.players[opponentOf(aiId)];

    switch (action.kind) {
        case 'damage':
            if (action.target === 'chosen') return 0;
            return action.amount * (action.target === 'allEnemyMinions' ? Math.max(1, enemy.board.length) : 1);
        case 'heal':
            if (action.target === 'chosen') return 0;
            return action.amount * (action.target === 'allFriendlyMinions' ? Math.max(1, ai.board.length) : 1) * 0.5;
        case 'buff':
            return ((action.attack ?? 0) + (action.health ?? 0)) * (action.target === 'allFriendlyMinions' ? Math.max(1, ai.board.length) : 1);
        case 'draw':
            return action.count * 4;
        case 'summon':
            return action.count * 4;
    }
}

/** Scores + picks a target for the one chosen-target effect a card is allowed (see TurnStateMachine.needsChosenTarget). */
function scoreChosenTarget(state: GameState, aiId: PlayerId, action: EffectAction, lethalAvailable: boolean): ScoredTarget {
    if (action.kind === 'damage') return scoreDamageSpell(state, aiId, action.amount, lethalAvailable, action.chosenRestriction);
    if (action.kind === 'heal') return scoreHealSpell(state, aiId, action.amount);
    return { score: 0 };
}

/** Scores playing `card` from hand, resolving the best target for chosen-target effects along the way. */
export function scorePlayCard(
    state: GameState,
    aiId: PlayerId,
    card: CardInstance,
    definition: CardDefinition,
    lethalAvailable: boolean
): ScoredTarget {
    const ai = state.players[aiId];
    const effects = definition.effects ?? [];
    const onPlayEffects = effects.filter((e) => e.trigger === 'onPlay');
    const chosenEffect = onPlayEffects.find((e) => 'target' in e.action && e.action.target === 'chosen');
    const chosenTarget = chosenEffect ? scoreChosenTarget(state, aiId, chosenEffect.action, lethalAvailable) : undefined;
    const flatEffectValue = effects.reduce((sum, e) => sum + estimateEffectValue(e.action, state, aiId), 0);

    if (definition.type === 'minion') {
        if (ai.board.length >= MAX_BOARD_SIZE) return { score: -1 }; // board full: the minion would just be discarded, see TurnStateMachine.executePlayCard

        const stats = (card.currentAttack ?? 0) + (card.currentHealth ?? 0);
        const overextendPenalty = ai.board.length >= MAX_BOARD_SIZE - 1 ? 5 : 0;
        const keywordBonus =
            (definition.keywords?.includes('windfury') ? 3 : 0) +
            (definition.keywords?.includes('charge') ? 3 : 0) +
            (definition.keywords?.includes('taunt') ? 2 : 0) +
            (definition.keywords?.includes('divineShield') ? 3 : 0);
        const score = stats * 2 + flatEffectValue + (chosenTarget?.score ?? 0) + keywordBonus - overextendPenalty;
        return { score, targetId: chosenTarget?.targetId };
    }

    if (onPlayEffects.length === 0) return { score: 0 };
    return { score: flatEffectValue + (chosenTarget?.score ?? 0), targetId: chosenTarget?.targetId };
}

function scoreDamageSpell(
    state: GameState,
    aiId: PlayerId,
    amount: number,
    lethalAvailable: boolean,
    restriction?: ChosenTargetRestriction
): ScoredTarget {
    const enemyId = opponentOf(aiId);
    const enemy = state.players[enemyId];

    // A minion-restricted effect (e.g. "Deal 2 damage to a minion") isn't a legal way to hit
    // face — see TurnStateMachine.computeValidTargets — so don't seed a face candidate for it.
    // If no minion ends up scoring higher than this, the card just isn't worth playing right now.
    let best: ScoredTarget =
        restriction === 'minion' ? { score: -1 } : { score: amount * (lethalAvailable ? 100 : 1.5), targetId: enemyId };

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
    const lifestealBonus = hasKeyword(attacker, 'lifesteal') ? (attacker.currentAttack ?? 0) * 0.5 : 0;

    if (target === 'face') {
        const attack = attacker.currentAttack ?? 0;
        return attack * (lethalAvailable ? 100 : 1) + lifestealBonus;
    }

    const attackerAttack = attacker.currentAttack ?? 0;
    const attackerHealth = attacker.currentHealth ?? 0;
    const targetAttack = target.currentAttack ?? 0;
    const targetHealth = target.currentHealth ?? 0;

    // Divine Shield absorbs the whole hit rather than dying/killing outright.
    const defenderDies = attackerAttack >= targetHealth && !hasKeyword(target, 'divineShield');
    const attackerDies = targetAttack >= attackerHealth && !hasKeyword(attacker, 'divineShield');

    const attackerValue = attackerAttack + attackerHealth;
    const targetValue = targetAttack + targetHealth;

    if (defenderDies && !attackerDies) return targetValue * 3 + lifestealBonus; // clean kill, keep the attacker
    if (defenderDies && attackerDies) return targetValue - attackerValue + 5 + lifestealBonus; // even trade, favor when the defender was worth more
    if (!defenderDies && !attackerDies) return -2; // pointless chip damage (or a Divine Shield pop with no other upside)
    return -10; // suicidal — attacker dies for nothing
}
