/** A player-authored, persisted deck — see deckStorage.ts for load/save/legality. Card ids may
 * repeat (once per physical copy), same convention as deckGenerator.ts's generated id arrays. */
export interface SavedDeck {
    id: string;
    name: string;
    /** minion/spell card ids only — see deckStorage.ts's isDeckLegal. */
    mainDeckIds: string[];
    /** type: 'aether' card ids only — see deckStorage.ts's isDeckLegal. */
    aetherDeckIds: string[];
    createdAt: number;
    updatedAt: number;
}
