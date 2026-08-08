import type { CardDefinition, EffectAction } from '../game/types/Card';

/**
 * Per-field error messages for a `CardDefinition` draft, keyed by field name (or
 * `effects.<index>.<subfield>` for effect rows). No `tsc` runs in-browser, so this is
 * the only structural check the Card Creator has before writing to disk — see
 * `serializeCardDefinitions.ts`'s caller for the belt-and-suspenders re-check right
 * before every save.
 */
export type FieldErrors = Record<string, string>;

const INVALID_ID_CHARS = /["\n\r]/;

function validateAction(action: EffectAction, prefix: string, errors: FieldErrors): void {
    switch (action.kind) {
        case 'damage':
        case 'heal':
            if (!(action.amount >= 1)) errors[`${prefix}.amount`] = 'Amount must be at least 1.';
            // chosenRestriction is optional even when target is 'chosen' — omitting it is the
            // documented default ("any minion or hero", e.g. Firebolt/Radiant Light/Minor Heal),
            // not an error. Only flag it as dead data when target isn't 'chosen' at all.
            if (action.target !== 'chosen' && action.chosenRestriction) {
                errors[`${prefix}.chosenRestriction`] = 'Only meaningful when target is "chosen".';
            }
            break;
        case 'draw':
            if (!(action.count >= 1)) errors[`${prefix}.count`] = 'Count must be at least 1.';
            break;
        case 'buff':
            if (action.attack === undefined && action.health === undefined) {
                errors[`${prefix}.attack`] = 'Set at least one of attack or health.';
            }
            if (action.target !== 'chosen' && action.chosenRestriction) {
                errors[`${prefix}.chosenRestriction`] = 'Only meaningful when target is "chosen".';
            }
            break;
        case 'summon':
            if (!action.definitionId) errors[`${prefix}.definitionId`] = 'Pick a card to summon.';
            if (!(action.count >= 1)) errors[`${prefix}.count`] = 'Count must be at least 1.';
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

    if (def.type === 'minion') {
        if (def.attack === undefined || !Number.isInteger(def.attack) || def.attack < 0) {
            errors.attack = 'Attack must be a non-negative integer.';
        }
        if (def.health === undefined || !Number.isInteger(def.health) || def.health < 1) {
            errors.health = 'Health must be a positive integer.';
        }
    } else {
        if (def.attack !== undefined) errors.attack = 'Spells cannot have attack.';
        if (def.health !== undefined) errors.health = 'Spells cannot have health.';
    }

    (def.effects ?? []).forEach((effect, index) => {
        validateAction(effect.action, `effects.${index}`, errors);
    });

    return errors;
}
