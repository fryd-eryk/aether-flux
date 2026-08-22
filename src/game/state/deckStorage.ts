import { MAX_COPIES } from '../data/deckGenerator';
import { CARD_DEFINITIONS } from '../data/cards';
import type { SavedDeck } from '../types/Deck';

export const MAIN_DECK_SIZE = 32;
export const AETHER_DECK_SIZE = 18;

const STORAGE_KEY = 'aether-flux:decks';
const STORAGE_VERSION = 1;

interface DeckStoreV1 {
    version: 1;
    decks: SavedDeck[];
}

function isSavedDeck(value: unknown): value is SavedDeck {
    if (typeof value !== 'object' || value === null) return false;
    const d = value as Record<string, unknown>;
    return (
        typeof d.id === 'string' &&
        typeof d.name === 'string' &&
        Array.isArray(d.mainDeckIds) && d.mainDeckIds.every((id) => typeof id === 'string') &&
        Array.isArray(d.aetherDeckIds) && d.aetherDeckIds.every((id) => typeof id === 'string') &&
        typeof d.createdAt === 'number' &&
        typeof d.updatedAt === 'number'
    );
}

/** Reads every saved deck from localStorage. Never throws — corrupt/missing/legacy-shaped data,
 * or an individual malformed entry, is dropped rather than discarding the whole store. */
export function loadDecks(): SavedDeck[] {
    if (typeof window === 'undefined') return [];

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw) as Partial<DeckStoreV1>;
        if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.decks)) return [];
        return parsed.decks.filter(isSavedDeck);
    } catch {
        return [];
    }
}

function persist(decks: SavedDeck[]): void {
    if (typeof window === 'undefined') return;
    const store: DeckStoreV1 = { version: STORAGE_VERSION, decks };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Inserts a new deck or overwrites the existing one with the same id, then persists. */
export function saveDeck(deck: SavedDeck): void {
    const decks = loadDecks();
    const index = decks.findIndex((d) => d.id === deck.id);
    if (index === -1) decks.push(deck);
    else decks[index] = deck;
    persist(decks);
}

export function deleteDeck(id: string): void {
    persist(loadDecks().filter((d) => d.id !== id));
}

/** A deck is legal to select for a match when it's exactly at size, every id resolves to the
 * right CardType, and the Main Deck respects the same MAX_COPIES cap generated decks use. The
 * Aether Deck has no copy cap — see SPEC.md's "Resource system roadmap: Aether". */
export function isDeckLegal(deck: SavedDeck): boolean {
    if (deck.mainDeckIds.length !== MAIN_DECK_SIZE) return false;
    if (deck.aetherDeckIds.length !== AETHER_DECK_SIZE) return false;

    const mainCopies = new Map<string, number>();
    for (const id of deck.mainDeckIds) {
        const definition = CARD_DEFINITIONS[id];
        if (!definition || (definition.type !== 'minion' && definition.type !== 'spell')) return false;
        const copies = (mainCopies.get(id) ?? 0) + 1;
        if (copies > MAX_COPIES) return false;
        mainCopies.set(id, copies);
    }

    for (const id of deck.aetherDeckIds) {
        const definition = CARD_DEFINITIONS[id];
        if (!definition || definition.type !== 'aether') return false;
    }

    return true;
}

/** Picks one deck at random. Callers must pass a non-empty array — at match-start time the pool
 * always contains at least the player's own just-selected legal deck. */
export function pickRandomLegalDeck(decks: SavedDeck[]): SavedDeck {
    return decks[Math.floor(Math.random() * decks.length)];
}
