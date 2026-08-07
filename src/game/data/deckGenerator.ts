import type { CardTier } from '../types/Card';
import { CARD_DEFINITIONS } from './cards';

/** How many of a 30-card deck come from each tier — mirrors the 50-card set's own 25:20:5 split. */
const TIER_COUNTS: Record<CardTier, number> = {
    standard: 15,
    moderateHigh: 12,
    reallyStrong: 3,
};

/** Max copies of a single card id allowed in a generated deck — same convention the old flat STARTER_DECK used. */
const MAX_COPIES = 2;

function idsForTier(tier: CardTier): string[] {
    return Object.values(CARD_DEFINITIONS)
        .filter((definition) => definition.tier === tier)
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
 * Builds one randomly-generated 30-card deck, proportionate to the three power tiers
 * (15 standard / 12 moderate-high / 3 really strong). Called once per player at game
 * start (see CardGame.ts), so each side gets an independently random deck. Card order
 * doesn't matter here — createInitialState shuffles the built deck itself.
 */
export function generateDeck(): string[] {
    return (Object.keys(TIER_COUNTS) as CardTier[]).flatMap((tier) =>
        pickWithCap(idsForTier(tier), TIER_COUNTS[tier])
    );
}
