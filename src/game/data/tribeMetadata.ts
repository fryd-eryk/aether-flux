import type { Tribe } from "../types/Card";

/** Display-only labels for the Card Creator's tribe picker and CardView's footer — kept separate from state/tribes.ts, 
 * which is pure game logic. Adding a tribe: add the literal to Tribe (types/Card.ts) and an entry here; 
 * nothing else needs to change to make it choosable/renderable. */
export const TRIBE_METADATA: Record<Tribe, { label: string }> = {
    human: { label: "Human" },
    elemental: { label: "Elemental" },
    nature: { label: "Nature" },
    animal: { label: "Animal" },
    cosmic: { label: "Cosmic" },
    holy: { label: "Holy" },
    underworld: { label: "Underworld" },
    demon: { label: "Demon" },
};

