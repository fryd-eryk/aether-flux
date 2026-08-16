import type { CardAura, CardDefinition, CardEffect, EffectAction, EffectValue, PaidAbility } from '../game/types/Card';
import { hasDanglingMarkdownMarker } from '../game/scenes/CardGame/richTextParser';

/**
 * Per-field error messages for a `CardDefinition` draft, keyed by field name (or
 * `effects.<index>.<subfield>` for effect rows). No `tsc` runs in-browser, so this is
 * the only structural check the Card Creator has before writing to disk — see
 * `serializeCardDefinitions.ts`'s caller for the belt-and-suspenders re-check right
 * before every save.
 */
export type FieldErrors = Record<string, string>;

const INVALID_ID_CHARS = /["\n\r]/;

/** Targets a `tribeFilter` can narrow — see EffectAction.tribeFilter in Card.ts. */
const TRIBE_FILTERABLE_TARGETS = ['allMinions', 'allEnemyMinions', 'allFriendlyMinions'];

/** Validates one actions[] list in traversal order, tracking whether an earlier action in the
 * same list already resolved a real (non-reuseTarget) chosen target — reuseTarget on the very
 * first chosen action has nothing to reuse (see TurnStateMachine.collectPendingPrompts). */
function validateActions(actions: EffectAction[], prefix: string, errors: FieldErrors): void {
    let hasEarlierChosenTarget = false;
    actions.forEach((action, index) => {
        validateAction(action, `${prefix}.actions.${index}`, errors, hasEarlierChosenTarget);
        if ('target' in action && action.target === 'chosen' && !('reuseTarget' in action && action.reuseTarget)) {
            hasEarlierChosenTarget = true;
        }
    });
}

function validateEffect(effect: CardEffect, prefix: string, errors: FieldErrors): void {
    if (effect.actions.length === 0) {
        errors[`${prefix}.actions`] = 'Add at least one effect line.';
    }
    validateActions(effect.actions, prefix, errors);
    if (effect.condition && (!Number.isInteger(effect.condition.minCount) || effect.condition.minCount < 1)) {
        errors[`${prefix}.condition`] = 'Momentum count must be a positive integer.';
    }
}

function validateAura(aura: CardAura, prefix: string, errors: FieldErrors): void {
    if (aura.attack === undefined && aura.health === undefined && (!aura.keywords || aura.keywords.length === 0)) {
        errors[`${prefix}.attack`] = 'Set at least one of attack, health, or a keyword.';
    }
    // No min — a negative aura (a debuff, e.g. "enemy minions have -1/-1") is a legitimate case,
    // same reasoning as the `buff` action's own unclamped attack/health.
    if (aura.attack !== undefined) validateEffectValue(aura.attack, prefix, 'attack', errors);
    if (aura.health !== undefined) validateEffectValue(aura.health, prefix, 'health', errors);
}

function validatePaidAbility(ability: PaidAbility, prefix: string, errors: FieldErrors): void {
    if (!Number.isInteger(ability.cost) || ability.cost < 1) {
        errors[`${prefix}.cost`] = 'Cost must be a positive integer.';
    }
    if (ability.actions.length === 0) {
        errors[`${prefix}.actions`] = 'Add at least one effect line.';
    }
    validateActions(ability.actions, prefix, errors);
}

/**
 * A flat EffectValue is validated against `min` (magnitude checks like today); a counter-based
 * one can't be — its actual value depends on live game state — so only its multiplier/offset are
 * checked for being finite numbers when present.
 */
function validateEffectValue(value: EffectValue, prefix: string, field: string, errors: FieldErrors, min?: number): void {
    if (typeof value === 'number') {
        if (min !== undefined && !(value >= min)) errors[`${prefix}.${field}`] = `${field[0].toUpperCase()}${field.slice(1)} must be at least ${min}.`;
        return;
    }
    if (value.multiplier !== undefined && !Number.isFinite(value.multiplier)) {
        errors[`${prefix}.${field}`] = 'Multiplier must be a number.';
    } else if (value.offset !== undefined && !Number.isFinite(value.offset)) {
        errors[`${prefix}.${field}`] = 'Offset must be a number.';
    } else if (value.counter === 'allTribeMinionCount' && !value.tribe) {
        errors[`${prefix}.${field}`] = 'Choose a tribe for this counter.';
    }
}

/** `hasEarlierChosenTarget`: whether an earlier action in the same actions[] list already
 * resolved a real (non-reuseTarget) chosen target — see validateActions. */
function validateAction(action: EffectAction, prefix: string, errors: FieldErrors, hasEarlierChosenTarget: boolean): void {
    if ('reuseTarget' in action && action.reuseTarget) {
        if (action.target !== 'chosen') {
            errors[`${prefix}.reuseTarget`] = 'Only meaningful when target is "chosen".';
        } else if (!hasEarlierChosenTarget) {
            errors[`${prefix}.reuseTarget`] = 'No earlier chosen target in this block to reuse.';
        }
    }

    switch (action.kind) {
        case 'damage':
        case 'heal':
            validateEffectValue(action.amount, prefix, 'amount', errors, 1);
            // chosenRestriction is optional even when target is 'chosen' — omitting it is the
            // documented default ("any minion or hero", e.g. Firebolt/Radiant Light/Minor Heal),
            // not an error. Only flag it as dead data when target isn't 'chosen' at all.
            if (action.target !== 'chosen' && action.chosenRestriction) {
                errors[`${prefix}.chosenRestriction`] = 'Only meaningful when target is "chosen".';
            }
            if (action.tribeFilter && !TRIBE_FILTERABLE_TARGETS.includes(action.target)) {
                errors[`${prefix}.tribeFilter`] = 'Only meaningful for an "all ... minions" target.';
            }
            break;
        case 'draw':
            validateEffectValue(action.count, prefix, 'count', errors, 1);
            break;
        case 'buff':
            if (action.attack === undefined && action.health === undefined) {
                errors[`${prefix}.attack`] = 'Set at least one of attack or health.';
            }
            // No min — a negative buff (debuff) is an intentional, already-shipped case.
            if (action.attack !== undefined) validateEffectValue(action.attack, prefix, 'attack', errors);
            if (action.health !== undefined) validateEffectValue(action.health, prefix, 'health', errors);
            if (action.target !== 'chosen' && action.chosenRestriction) {
                errors[`${prefix}.chosenRestriction`] = 'Only meaningful when target is "chosen".';
            }
            if (action.tribeFilter && !TRIBE_FILTERABLE_TARGETS.includes(action.target)) {
                errors[`${prefix}.tribeFilter`] = 'Only meaningful for an "all ... minions" target.';
            }
            if (action.duration !== undefined && (!Number.isInteger(action.duration) || action.duration < 1)) {
                errors[`${prefix}.duration`] = 'Duration must be a positive integer, or left blank for permanent.';
            }
            break;
        case 'summon':
            if (!action.definitionId) errors[`${prefix}.definitionId`] = 'Pick a card to summon.';
            if (!(action.count >= 1)) errors[`${prefix}.count`] = 'Count must be at least 1.';
            break;
        case 'freeze':
        case 'silence':
        case 'destroy':
            if (action.target !== 'chosen' && action.chosenRestriction) {
                errors[`${prefix}.chosenRestriction`] = 'Only meaningful when target is "chosen".';
            }
            if (action.tribeFilter && !TRIBE_FILTERABLE_TARGETS.includes(action.target)) {
                errors[`${prefix}.tribeFilter`] = 'Only meaningful for an "all ... minions" target.';
            }
            break;
        case 'grantKeyword':
            if (action.target !== 'chosen' && action.chosenRestriction) {
                errors[`${prefix}.chosenRestriction`] = 'Only meaningful when target is "chosen".';
            }
            if (action.tribeFilter && !TRIBE_FILTERABLE_TARGETS.includes(action.target)) {
                errors[`${prefix}.tribeFilter`] = 'Only meaningful for an "all ... minions" target.';
            }
            if (action.duration !== undefined && (!Number.isInteger(action.duration) || action.duration < 1)) {
                errors[`${prefix}.duration`] = 'Duration must be a positive integer, or left blank for permanent.';
            }
            break;
    }
}

export function validateCardDefinition(
    def: CardDefinition,
    allCards: Record<string, CardDefinition>,
    originalId: string | null,
): FieldErrors {
    const errors: FieldErrors = {};

    if (!def.id.trim()) {
        errors.id = 'Id is required.';
    } else if (INVALID_ID_CHARS.test(def.id)) {
        errors.id = 'Id cannot contain quotes or newlines.';
    } else if (
        Object.keys(allCards).some((existingId) => existingId === def.id && existingId !== originalId)
    ) {
        errors.id = 'Another card already uses this id.';
    }

    if (!def.name.trim()) errors.name = 'Name is required.';

    if (!Number.isInteger(def.cost) || def.cost < 1) errors.cost = 'Cost must be a positive integer.';

    if (def.type === 'minion' || def.type === 'token') {
        if (def.attack === undefined || !Number.isInteger(def.attack) || def.attack < 0) {
            errors.attack = 'Attack must be a non-negative integer.';
        }
        if (def.health === undefined || !Number.isInteger(def.health) || def.health < 1) {
            errors.health = 'Health must be a positive integer.';
        }
    } else {
        if (def.attack !== undefined) errors.attack = 'Spells cannot have attack.';
        if (def.health !== undefined) errors.health = 'Spells cannot have health.';
        if (def.tribes && def.tribes.length > 0) errors.tribes = 'Only minions can have tribes.';
        if (def.paidAbilities && def.paidAbilities.length > 0) errors.paidAbilities = 'Only minions can have paid abilities.';
        if (def.auras && def.auras.length > 0) errors.auras = 'Only minions can have an aura.';
    }

    if (def.type === 'token') {
        if (def.rarity) errors.rarity = 'Tokens are not collectible and must not have a rarity.';
    } else if (!def.rarity) {
        errors.rarity = 'Rarity is required.';
    }

    (def.effects ?? []).forEach((effect, index) => {
        validateEffect(effect, `effects.${index}`, errors);
    });

    (def.auras ?? []).forEach((aura, index) => {
        validateAura(aura, `auras.${index}`, errors);
    });

    (def.paidAbilities ?? []).forEach((ability, index) => {
        validatePaidAbility(ability, `paidAbilities.${index}`, errors);
    });

    // {X} is resolved live by counters.ts's resolveCardText from the card's own effects — a card
    // with no effects has nothing to supply a value, so the placeholder would render literally.
    if (def.text.includes('{X}') && (def.effects ?? []).length === 0) {
        errors.text = 'Rule text uses {X} but this card has no effects to supply a value.';
    } else if (hasDanglingMarkdownMarker(def.text)) {
        errors.text = 'Rule text has an unmatched * or ** marker.';
    }

    return errors;
}
