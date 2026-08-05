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
    const ignoresSummoningSickness = !instance.summoningSick || hasKeyword(instance, 'charge');
    return ignoresSummoningSickness && instance.attacksThisTurn < getMaxAttacks(instance);
}

/** Enemy attacks must target a Taunt minion first if the defending board has any; otherwise the whole board is fair game. */
export function tauntRestrictedTargets(enemyBoard: CardInstance[]): CardInstance[] {
    const tauntMinions = enemyBoard.filter((c) => hasKeyword(c, 'taunt'));
    return tauntMinions.length > 0 ? tauntMinions : enemyBoard;
}
