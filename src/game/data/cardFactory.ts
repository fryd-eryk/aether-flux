import type { CardDefinition, CardInstance } from '../types/Card';
import type { PlayerId } from '../types/common';

export function createCardInstance(definition: CardDefinition, owner: PlayerId): CardInstance {
    return {
        instanceId: crypto.randomUUID(),
        definitionId: definition.id,
        owner,
        zone: 'deck',
        currentAttack: definition.attack,
        currentHealth: definition.health,
        maxHealth: definition.health,
        summoningSick: false,
        attacksThisTurn: 0,
        keywords: new Set(definition.keywords ?? []),
        frozen: false,
        silenced: false,
    };
}

export function buildDeck(
    cardIds: string[],
    owner: PlayerId,
    definitions: Record<string, CardDefinition>
): CardInstance[] {
    return cardIds.map((id) => {
        const definition = definitions[id];
        if (!definition) {
            throw new Error(`Unknown card definition: ${id}`);
        }
        return createCardInstance(definition, owner);
    });
}

export function shuffle<T>(items: T[]): T[] {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
