import { CARD_DEFINITIONS } from '../data/cards';
import { canAffordAetherCost, countUntappedPlain } from '../state/aether';
import { canDeclareAttack, hasKeyword, tauntRestrictedTargets } from '../state/keywordRules';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';
import { computePotentialFaceDamage, scoreAttack, scoreAttackTriggers, scoreChosenTarget, scoreDrawAether, scorePaidAbility, scorePlayAetherCard, scorePlayCard } from './scoring';
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
        if (!definition || definition.type === 'aether' || !canAffordAetherCost(ai, definition.cost)) continue; // mirrors TurnStateMachine.playCard's own guard

        const score = scorePlayCard(state, aiId, card, definition, lethalAvailable);
        if (!best || score > best.score) {
            best = { score, action: { kind: 'playCard', instanceId: card.instanceId } };
        }
    }

    // Resource-management decisions — a new category with no lookahead of their own, competing
    // in this same greedy best-tracking loop (see TurnStateMachine.drawAether/playAetherCard for
    // the legality these mirror).
    if (!ai.aetherPlayedThisTurn) {
        const unplayedAether = ai.hand.find((c) => CARD_DEFINITIONS[c.definitionId]?.type === 'aether');
        if (unplayedAether) {
            const score = scorePlayAetherCard();
            if (!best || score > best.score) {
                best = { score, action: { kind: 'playAetherCard', instanceId: unplayedAether.instanceId } };
            }
        }
    }
    if (!ai.aetherDrawnThisTurn && ai.aetherDeck.length > 0) {
        const score = scoreDrawAether(state, aiId);
        if (!best || score > best.score) {
            best = { score, action: { kind: 'drawAether' } };
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

        // Fires unconditionally on declaring this attack, regardless of who it's aimed at (see
        // TurnStateMachine.executeAttack) — a fixed addend per attacker. Its own chosen target(s)
        // (e.g. Nythis's destroy pick) aren't decided here — see decideOpponentTarget.
        const triggerScore = scoreAttackTriggers(state, aiId, attacker, lethalAvailable);

        if (!tauntUp) {
            const faceScore = scoreAttack(state, aiId, attacker, 'face', lethalAvailable) + triggerScore;
            if (!best || faceScore > best.score) {
                best = { score: faceScore, action: { kind: 'attack', attackerInstanceId: attacker.instanceId, targetId: enemyId } };
            }
        }

        for (const defender of legalDefenders) {
            const score = scoreAttack(state, aiId, attacker, defender, lethalAvailable) + triggerScore;
            if (!best || score > best.score) {
                best = { score, action: { kind: 'attack', attackerInstanceId: attacker.instanceId, targetId: defender.instanceId } };
            }
        }
    }

    // Board minions' paid abilities — unlike playCard/attack, not gated by summoning sickness (see
    // PaidAbility's doc comment, Card.ts) or an attack-count budget, only by mana. Re-scored every
    // time this function is called (once per MainIdle re-entry, per the doc comment above), so an
    // ability the AI activates now naturally gets re-evaluated for another activation, another
    // card play, or an attack afterward — no separate "extra action" bookkeeping needed.
    for (const minion of ai.board) {
        if (minion.silenced) continue; // mirrors TurnStateMachine.activateAbility's own guard
        const definition = CARD_DEFINITIONS[minion.definitionId];
        (definition?.paidAbilities ?? []).forEach((ability, abilityIndex) => {
            if (countUntappedPlain(ai) < ability.cost) return; // mirrors TurnStateMachine.activateAbility's own guard
            const score = scorePaidAbility(state, aiId, ability, lethalAvailable, minion.instanceId);
            if (!best || score > best.score) {
                best = { score, action: { kind: 'activateAbility', instanceId: minion.instanceId, abilityIndex } };
            }
        });
    }

    if (!best || best.score <= PASS_THRESHOLD) {
        console.log('[OpponentAI] passing', { aiId, bestScore: best?.score });
        return null;
    }
    console.log('[OpponentAI] decided action', { aiId, score: best.score, action: best.action });
    return best.action;
}

/**
 * Resolves the AI's currently-pending target prompt (state.pendingTarget) reactively, whatever
 * declared it — the played card/ability/attacker's own chosen-target action, or a board-wide
 * Channel/Muster/Vigil/Curfew reaction the AI didn't itself choose to trigger (e.g. the opponent's
 * own Vigil phase, which can begin synchronously inside either player's endTurn() call — see
 * CardGame/index.ts's drainOpponentTargeting). Unlike decideOpponentAction, this doesn't rank
 * alternatives — it just picks the best target for the one prompt currently up, via the exact same
 * scoreChosenTarget dispatch scorePlayCard/scorePaidAbility/scoreAttackTriggers already use for
 * ranking, so the two never disagree about what a given chosen action is worth. Returns undefined
 * only for attack's own first step (who to attack), which isn't itself an EffectAction and is
 * decided during ranking above instead — callers handle that step separately.
 */
export function decideOpponentTarget(state: GameState): string | undefined {
    const pendingTarget = state.pendingTarget;
    if (!pendingTarget?.action) return undefined;
    // pendingTarget.ownerId (the card's actual controller), not state.activePlayer — a Tier-2
    // (onDeath/onDamaged/onFriendlyMinionDeath) prompt can belong to the AI even mid-player-turn
    // (e.g. the player's attack kills the AI's own Deathcry minion) — see PendingTarget's doc
    // comment (GameState.ts) and drainOpponentTargeting (CardGame/index.ts).
    const aiId = pendingTarget.ownerId;
    const enemy = state.players[opponentOf(aiId)];
    const lethalAvailable = computePotentialFaceDamage(state, aiId) >= enemy.health;
    return scoreChosenTarget(state, aiId, pendingTarget.action, lethalAvailable).targetId;
}
