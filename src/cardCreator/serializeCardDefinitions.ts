import type { CardDefinition, CardEffect, CardRarity, EffectAction } from '../game/types/Card';

/**
 * Regenerates `src/game/data/cards.ts`'s source text from an in-memory
 * `CARD_DEFINITIONS` map. Mirrors that file's existing conventions (rarity-grouped
 * section comments, cost-ascending sort within each group, fixed property order) —
 * see SPEC.md's "Card design conventions" — but doesn't need to byte-for-byte match
 * the original formatting, just produce valid, readable TypeScript.
 */

const RARITY_ORDER: CardRarity[] = ['common', 'rare', 'exotic', 'legendary', 'mythical'];
const RARITY_LABEL: Record<CardRarity, string> = {
    common: 'Common',
    rare: 'Rare',
    exotic: 'Exotic',
    legendary: 'Legendary',
    mythical: 'Mythical',
};

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function indent(level: number): string {
    return '    '.repeat(level);
}

function serializeKey(key: string): string {
    return IDENTIFIER_RE.test(key) ? key : JSON.stringify(key);
}

function serializeEffectAction(action: EffectAction, level: number): string {
    const lines: string[] = [`${indent(level)}kind: ${JSON.stringify(action.kind)},`];

    switch (action.kind) {
        case 'damage':
        case 'heal':
            lines.push(`${indent(level)}amount: ${action.amount},`);
            lines.push(`${indent(level)}target: ${JSON.stringify(action.target)},`);
            if (action.chosenRestriction) {
                lines.push(`${indent(level)}chosenRestriction: ${JSON.stringify(action.chosenRestriction)},`);
            }
            break;
        case 'draw':
            lines.push(`${indent(level)}count: ${action.count},`);
            break;
        case 'buff':
            if (action.attack !== undefined) lines.push(`${indent(level)}attack: ${action.attack},`);
            if (action.health !== undefined) lines.push(`${indent(level)}health: ${action.health},`);
            lines.push(`${indent(level)}target: ${JSON.stringify(action.target)},`);
            if (action.chosenRestriction) {
                lines.push(`${indent(level)}chosenRestriction: ${JSON.stringify(action.chosenRestriction)},`);
            }
            break;
        case 'summon':
            lines.push(`${indent(level)}definitionId: ${JSON.stringify(action.definitionId)},`);
            lines.push(`${indent(level)}count: ${action.count},`);
            break;
    }

    return `{\n${lines.join('\n')}\n${indent(level - 1)}}`;
}

function serializeEffect(effect: CardEffect, level: number): string {
    const actionSrc = serializeEffectAction(effect.action, level + 2);
    return [
        `${indent(level)}{`,
        `${indent(level + 1)}trigger: ${JSON.stringify(effect.trigger)},`,
        `${indent(level + 1)}action: ${actionSrc},`,
        `${indent(level)}}`,
    ].join('\n');
}

function serializeCardDefinition(def: CardDefinition, level: number): string {
    const lines: string[] = [];
    lines.push(`${indent(level)}id: ${JSON.stringify(def.id)},`);
    lines.push(`${indent(level)}name: ${JSON.stringify(def.name)},`);
    lines.push(`${indent(level)}cost: ${def.cost},`);
    lines.push(`${indent(level)}type: ${JSON.stringify(def.type)},`);
    lines.push(`${indent(level)}text: ${JSON.stringify(def.text)},`);
    if (def.attack !== undefined) lines.push(`${indent(level)}attack: ${def.attack},`);
    if (def.health !== undefined) lines.push(`${indent(level)}health: ${def.health},`);
    if (def.keywords && def.keywords.length > 0) {
        lines.push(`${indent(level)}keywords: ${JSON.stringify(def.keywords)},`);
    }
    if (def.effects && def.effects.length > 0) {
        const effectsSrc = def.effects.map((effect) => serializeEffect(effect, level + 1)).join(',\n');
        lines.push(`${indent(level)}effects: [\n${effectsSrc},\n${indent(level)}],`);
    }
    if (def.rarity) lines.push(`${indent(level)}rarity: ${JSON.stringify(def.rarity)},`);

    return lines.join('\n');
}

function serializeGroup(label: string, defs: CardDefinition[], level: number): string {
    const header = `${indent(level)}// --- ${label} ---`;
    const entries = defs
        .slice()
        .sort((a, b) => a.cost - b.cost)
        .map((def) => `${indent(level)}${serializeKey(def.id)}: {\n${serializeCardDefinition(def, level + 1)}\n${indent(level)}},`)
        .join('\n');
    return `${header}\n${entries}`;
}

export function serializeCardDefinitions(cards: Record<string, CardDefinition>): string {
    const all = Object.values(cards);
    const groups: string[] = [];

    for (const rarity of RARITY_ORDER) {
        const defs = all.filter((def) => def.rarity === rarity);
        if (defs.length === 0) continue;
        groups.push(serializeGroup(`${RARITY_LABEL[rarity]} rarity (${defs.length})`, defs, 1));
    }

    const tokens = all.filter((def) => !def.rarity);
    if (tokens.length > 0) {
        groups.push(serializeGroup('Tokens (not collectible — no `rarity`, so deckGenerator.ts never draws them)', tokens, 1));
    }

    const body = groups.join('\n\n');

    return `import type { CardDefinition } from "../types/Card";\n\nexport const CARD_DEFINITIONS: Record<string, CardDefinition> = {\n${body}\n};\n`;
}
