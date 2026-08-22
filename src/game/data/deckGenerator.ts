import type { AetherCategory, CardRarity } from '../types/Card';
import { CARD_DEFINITIONS } from './cards';

/** How many of a 32-card Main Deck come from each rarity. Every rarity that has at least one card defined gets a guaranteed slot, even the rarer legendary/mythical tiers. */
const RARITY_COUNTS: Partial<Record<CardRarity, number>> = {
    common: 16,
    rare: 12,
    exotic: 2,
    legendary: 1,
    mythical: 1,
};

/** Max copies of a single card id allowed in a generated deck — same convention the old flat
 * STARTER_DECK used. Exported so deckStorage.ts's isDeckLegal enforces the same cap on
 * player-built Main Decks. */
export const MAX_COPIES = 2;

function idsForRarity(rarity: CardRarity): string[] {
    return Object.values(CARD_DEFINITIONS)
        // type: 'token' cards are excluded from generated decks regardless of rarity — see
        // Card.ts's CardDefinition.rarity doc comment.
        .filter((definition) => definition.type !== 'token' && definition.rarity === rarity)
        .map((definition) => definition.id);
}

/** Picks `count` card ids at random from `pool`, allowing repeats but capping any single id at MAX_COPIES. */
function pickWithCap(pool: string[], count: number): string[] {
    const picked: string[] = [];
    const copiesById = new Map<string, number>();
    const available = [...pool];

    while (picked.length < count && available.length > 0) {
        const index = Math.floor(Math.random() * available.length);
        const id = available[index];
        const copies = copiesById.get(id) ?? 0;

        if (copies >= MAX_COPIES) {
            available.splice(index, 1);
            continue;
        }

        picked.push(id);
        copiesById.set(id, copies + 1);
        if (copies + 1 >= MAX_COPIES) available.splice(index, 1);
    }

    return picked;
}

/**
 * Builds one randomly-generated 30-card deck, proportionate to the rarities in
 * RARITY_COUNTS (14 common / 12 rare / 2 exotic / 1 legendary / 1 mythical). Called
 * once per player at game start (see CardGame.ts), so each side gets an independently
 * random deck. Card order doesn't matter here — createInitialState shuffles the built
 * deck itself.
 */
export function generateDeck(): string[] {
    return (Object.keys(RARITY_COUNTS) as CardRarity[]).flatMap((rarity) =>
        pickWithCap(idsForRarity(rarity), RARITY_COUNTS[rarity]!)
    );
}

/** How many of an 18-card Aether Deck come from each category — a first-pass balance guess, not
 * final (Aether Deck copy-limits are explicitly deferred, see SPEC.md, so no MAX_COPIES-style cap
 * applies here). 'generic' is weighted highest since it's the only category that pays a card's
 * generic cost. */
const AETHER_CATEGORY_COUNTS: Record<AetherCategory, number> = {
    generic: 8,
    fire: 3,
    water: 3,
    earth: 2,
    air: 2,
};

function idForCategory(category: AetherCategory): string | undefined {
    return Object.values(CARD_DEFINITIONS).find((definition) => definition.type === 'aether' && definition.aetherCategory === category)?.id;
}

/** Builds one randomly-generated 18-card Aether Deck, proportionate to AETHER_CATEGORY_COUNTS.
 * Called once per player at game start alongside generateDeck() — see CardGame.ts. */
export function generateAetherDeck(): string[] {
    return (Object.keys(AETHER_CATEGORY_COUNTS) as AetherCategory[]).flatMap((category) => {
        const id = idForCategory(category);
        return id ? Array(AETHER_CATEGORY_COUNTS[category]).fill(id) : [];
    });
}
