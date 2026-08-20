import type { CardDefinition, ChosenTargetRestriction, TargetSelector, Tribe } from '../types/Card';
import { TRIBE_METADATA } from '../data/tribeMetadata';

export function isTribe(value: string): value is Tribe {
    return value in TRIBE_METADATA;
}

export function minionHasTribe(definition: CardDefinition | undefined, tribe: Tribe): boolean {
    return definition?.tribes?.includes(tribe) ?? false;
}

/** True when `restriction` narrows a chosen target to minions only — either the plain 'minion' restriction or any specific tribe (tribes are minion-only). */
export function restrictsToMinion(restriction: ChosenTargetRestriction | undefined): boolean {
    return restriction === 'minion' || (restriction !== undefined && isTribe(restriction));
}

/** The tribe a chosen-target restriction narrows to, if any (undefined for 'minion'/'hero'/unset). */
export function restrictionTribe(restriction: ChosenTargetRestriction | undefined): Tribe | undefined {
    return restriction !== undefined && isTribe(restriction) ? restriction : undefined;
}

/** True for 'chosen' and its side-restricted siblings 'friendlyChosen'/'enemyChosen' — all three need
 * an interactive player/AI pick narrowed by chosenRestriction, unlike every other TargetSelector which
 * resolves to a fixed target with no prompt. */
export function isChosenTarget(target: TargetSelector): boolean {
    return target === 'chosen' || target === 'friendlyChosen' || target === 'enemyChosen';
}

/** Which side 'friendlyChosen'/'enemyChosen' restricts the pick to, relative to the acting player — undefined for plain 'chosen' (either side) and every non-chosen selector. */
export function chosenSideOf(target: TargetSelector): 'friendly' | 'enemy' | undefined {
    if (target === 'friendlyChosen') return 'friendly';
    if (target === 'enemyChosen') return 'enemy';
    return undefined;
}
