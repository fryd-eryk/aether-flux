import type { SavedDeck } from '@/game/types/Deck';

/** A blank starting point for the "New Deck" button. */
export function makeBlankDeck(): SavedDeck {
    const now = Date.now();
    return {
        id: crypto.randomUUID(),
        name: '',
        mainDeckIds: [],
        aetherDeckIds: [],
        createdAt: now,
        updatedAt: now,
    };
}

/** Deep-copies a saved deck's id arrays before it enters in-memory editing, so adding/removing
 * cards in the builder never mutates the array a loadDecks() call elsewhere might still hold. */
export function cloneDeckForEditing(deck: SavedDeck): SavedDeck {
    return { ...deck, mainDeckIds: [...deck.mainDeckIds], aetherDeckIds: [...deck.aetherDeckIds] };
}
