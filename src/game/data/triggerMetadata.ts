import type { CardEffect, EffectTrigger } from '../types/Card';

/** Display-only data for the simplified board card's status pills — flavor-word label + color per EffectTrigger, mirroring keywordMetadata.ts's shape. Labels match SPEC.md's "Trigger flavor text" convention used verbatim in cards.ts's `text` strings. */
export const TRIGGER_METADATA: Record<EffectTrigger, { color: number; label: string }> = {
    onPlay: { color: 0x4f8fd6, label: 'Anthem' },
    onDeath: { color: 0xc23b5a, label: 'Deathcry' },
    startOfTurn: { color: 0x3fbf7f, label: 'Vigil' },
    endOfTurn: { color: 0x5c7080, label: 'Curfew' },
    onAttack: { color: 0xd6543f, label: 'Strike' },
    onDamaged: { color: 0x9c4f3f, label: 'Wound' },
};

/** Distinct triggers present in a card's effects, in first-seen order — a card with two onPlay effects still yields one "Anthem" entry. */
export function distinctTriggers(effects: CardEffect[] | undefined): EffectTrigger[]
{
    if (!effects || effects.length === 0) return [];
    return [...new Set(effects.map((effect) => effect.trigger))];
}
