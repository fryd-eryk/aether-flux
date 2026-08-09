import type { Keyword } from '../types/Card';

/** Display-only data for rendering keyword badges — kept separate from state/keywordRules.ts, which is pure game logic. */
export const KEYWORD_METADATA: Record<Keyword, { abbr: string; color: number; label: string; description: string }> = {
    taunt: { abbr: 'T', color: 0xd6a83a, label: 'Taunt', description: "Enemies must attack this minion before any other." },
    charge: { abbr: 'C', color: 0xe8823f, label: 'Charge', description: "Can attack the turn it's summoned." },
    divineShield: { abbr: 'DS', color: 0xe8d97a, label: 'Divine Shield', description: 'Ignores the first instance of damage it would take.' },
    windfury: { abbr: 'W', color: 0x4fd6d6, label: 'Windfury', description: 'Can attack twice each turn.' },
    lifesteal: { abbr: 'L', color: 0xa04fd6, label: 'Lifesteal', description: "Damage this minion deals heals its owner's hero." },
    veiled: { abbr: 'VL', color: 0x6a6fd6, label: 'Veiled', description: "Can't be attacked or targeted by spells until it attacks." },
    venom: { abbr: 'VM', color: 0x5fbf4f, label: 'Venom', description: 'Destroys any minion it damages in combat, regardless of the amount.' },
};
