import { CARD_DEFINITIONS } from '../data/cards';
import { canDeclareAttack, hasKeyword, tauntRestrictedTargets } from '../state/keywordRules';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';
import { computePotentialFaceDamage, scoreAttack, scorePlayCard } from './scoring';
import type { AIAction } from './types';

const PASS_THRESHOLD = 0;

function opponentOf(id: PlayerId): PlayerId {
    return id === 'player' ? 'opponent' : 'player';
}

/**
 * Greedy single-step decision: score every action legally available to the active player right
 * now (playable hand cards, eligible attackers) and return the single best one, or null to pass.
 * No lookahead beyond the explicit lethal check in computePotentialFaceDamage — this mirrors
 * Hearthstone's shipped AI (per Blizzard's GDC "AI Postmortem" talk), which is also a locally
 * greedy scorer rather than a full-turn planner or a minimax/MCTS search.
 *
 * CardGame calls this once per MainIdle re-entry; since executing an action always resolves
 * the state machine back to MainIdle (re-emitting 'state:phase-change'), calling this
 * repeatedly naturally chains a full turn's worth of actions one at a time.
 */
export function decideOpponentAction(state: GameState): AIAction | null {
    const aiId = state.activePlayer;
    const enemyId = opponentOf(aiId);
    const ai = state.players[aiId];
    const enemy = state.players[enemyId];

    const lethalAvailable = computePotentialFaceDamage(state, aiId) >= enemy.health;

    let best: { score: number; action: AIAction } | undefined;

    for (const card of ai.hand) {
        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition || ai.mana < definition.cost) continue; // mirrors TurnStateMachine.playCard's own guard

        const { score, targetId } = scorePlayCard(state, aiId, card, definition, lethalAvailable);
        if (!best || score > best.score) {
            best = { score, action: { kind: 'playCard', instanceId: card.instanceId, targetId } };
        }
    }

    // Mirrors TurnStateMachine.computeValidTargets: if the enemy has any (non-Veiled) Taunt
    // minions, attacks must target one of those — face and non-Taunt minions aren't legal targets
    // at all. tauntUp is derived from tauntRestrictedTargets's own result (which already folds out
    // Veiled minions) rather than the raw board, so this can never disagree with the state machine.
    const legalDefenders = tauntRestrictedTargets(enemy.board);
    const tauntUp = legalDefenders.some((c) => hasKeyword(c, 'taunt'));

    for (const attacker of ai.board) {
        if (!canDeclareAttack(attacker)) continue; // mirrors TurnStateMachine.declareAttack's own guard

        if (!tauntUp) {
            const faceScore = scoreAttack(attacker, 'face', lethalAvailable);
            if (!best || faceScore > best.score) {
                best = { score: faceScore, action: { kind: 'attack', attackerInstanceId: attacker.instanceId, targetId: enemyId } };
            }
        }

        for (const defender of legalDefenders) {
            const score = scoreAttack(attacker, defender, lethalAvailable);
            if (!best || score > best.score) {
                best = { score, action: { kind: 'attack', attackerInstanceId: attacker.instanceId, targetId: defender.instanceId } };
            }
        }
    }

    if (!best || best.score <= PASS_THRESHOLD) return null;
    return best.action;
}
