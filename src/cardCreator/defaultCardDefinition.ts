import type { CardDefinition } from '../game/types/Card';

/** A blank starting point for the "New Card" button — a vanilla 1-cost 1/1 minion, disambiguated against existing ids so New never collides. */
export function makeBlankCard(existingIds: Set<string>): CardDefinition {
    let id = 'new-card';
    let suffix = 2;
    while (existingIds.has(id)) {
        id = `new-card-${suffix}`;
        suffix += 1;
    }

    return {
        id,
        name: 'New Card',
        cost: 1,
        type: 'minion',
        text: '',
        attack: 1,
        health: 1,
    };
}
