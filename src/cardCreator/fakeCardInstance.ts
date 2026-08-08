import type { CardDefinition, CardInstance } from '../game/types/Card';

/**
 * A throwaway `CardInstance` for the preview scene — `CardView.createCardContainer`
 * requires one, but only ever reads `currentAttack`/`currentHealth`/`keywords` off it
 * (see CardView.ts); every other field here is dead weight kept just to satisfy the
 * type, seeded with harmless placeholder values.
 */
export function buildPreviewInstance(definition: CardDefinition): CardInstance {
    return {
        instanceId: 'preview',
        definitionId: definition.id,
        owner: 'player',
        zone: 'hand',
        currentAttack: definition.attack,
        currentHealth: definition.health,
        maxHealth: definition.health,
        summoningSick: false,
        attacksThisTurn: 0,
        keywords: new Set(definition.keywords ?? []),
    };
}
