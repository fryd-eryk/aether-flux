import type { CardDefinition, CardInstance } from '../types/Card';
import type { PlayerId } from '../types/common';

export function createCardInstance(definition: CardDefinition, owner: PlayerId, zone: CardInstance['zone'] = 'deck'): CardInstance {
    return {
        instanceId: crypto.randomUUID(),
        definitionId: definition.id,
        owner,
        zone,
        currentAttack: definition.attack,
        currentHealth: definition.health,
        maxHealth: definition.health,
        summoningSick: false,
        tapped: false,
        attacksThisTurn: 0,
        keywords: new Set(definition.keywords ?? []),
        frozen: false,
        silenced: false,
        temporaryEffects: [],
        auraKeywords: new Set(),
    };
}

export function buildDeck(
    cardIds: string[],
    owner: PlayerId,
    definitions: Record<string, CardDefinition>,
    zone: CardInstance['zone'] = 'deck'
): CardInstance[] {
    return cardIds.map((id) => {
        const definition = definitions[id];
        if (!definition) {
            throw new Error(`Unknown card definition: ${id}`);
        }
        return createCardInstance(definition, owner, zone);
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
