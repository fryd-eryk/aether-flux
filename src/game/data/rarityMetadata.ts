import type { CardRarity } from '../types/Card';


/** Display-only light/dark gradient stops for the footer's rarity dot (CardView's createRarityDot), mirroring keywordMetadata.ts's shape. */
export const RARITY_METADATA: Record<CardRarity, { light: number; dark: number }> = {
    common: { light: 0xb8bfc9, dark: 0x7d838c },
    rare: { light: 0x8affa0, dark: 0x2f9e55 },
    exotic: { light: 0xe39cff, dark: 0x9b2fd6 },
    legendary: { light: 0xffe066, dark: 0xe0a700 },
    mythical: { light: 0xff8a5b, dark: 0xd1401a },
};

/** Dot color for `type: 'token'` definitions, which have no rarity — a dead token can surface in the graveyard pile-view, which renders in 'full' mode. */
export const TOKEN_RARITY_COLOR = { light: 0xffffff, dark: 0xc7cdd6 };
