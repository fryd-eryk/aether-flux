import type { CardInstance, Keyword } from '../types/Card';

/**
 * Pure keyword-ability rules shared by the state machine, the AI, and rendering, so
 * "can this minion attack" / "who can be attacked" logic exists in exactly one place.
 */

export function hasKeyword(instance: CardInstance, keyword: Keyword): boolean {
    return instance.keywords.has(keyword);
}

export function getMaxAttacks(instance: CardInstance): number {
    return hasKeyword(instance, 'windfury') ? 2 : 1;
}

export function canDeclareAttack(instance: CardInstance): boolean {
    if (instance.frozen) return false;
    const ignoresSummoningSickness = !instance.summoningSick || hasKeyword(instance, 'charge');
    return ignoresSummoningSickness && instance.attacksThisTurn < getMaxAttacks(instance);
}

/** Veiled minions can't be attacked or targeted by spells at all until they attack. */
export function isTargetable(instance: CardInstance): boolean {
    return !hasKeyword(instance, 'veiled');
}

/**
 * Enemy attacks must target a Taunt minion first if the defending (non-Veiled) board has any;
 * otherwise every non-Veiled minion is fair game. Veiled minions are excluded before the Taunt
 * check runs, so a hypothetical Veiled+Taunt minion never "walls" attacks it can't itself receive
 * — callers should derive taunt-up-ness from this function's own return value (see
 * TurnStateMachine.computeValidTargets / OpponentAI.decideOpponentAction) rather than
 * recomputing it from the raw board, so the two can never disagree about who's attackable.
 */
export function tauntRestrictedTargets(enemyBoard: CardInstance[]): CardInstance[] {
    const targetable = enemyBoard.filter(isTargetable);
    const tauntMinions = targetable.filter((c) => hasKeyword(c, 'taunt'));
    return tauntMinions.length > 0 ? tauntMinions : targetable;
}
