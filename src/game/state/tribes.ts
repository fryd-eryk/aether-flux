import type { CardDefinition, ChosenTargetRestriction, Tribe } from '../types/Card';
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
