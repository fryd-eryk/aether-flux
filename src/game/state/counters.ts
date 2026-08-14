import { CARD_DEFINITIONS } from '../data/cards';
import type { CardInstance, EffectAction, EffectValue } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';
import { minionHasTribe } from './tribes';

function opponentOf(id: PlayerId): PlayerId {
    return id === 'player' ? 'opponent' : 'player';
}

/** Reads a live game-state readout for `ownerId` — see CounterKind's doc comment for the full list. */
export function resolveCounter(value: Exclude<EffectValue, number>, ownerId: PlayerId, state: GameState): number {
    const owner = state.players[ownerId];
    const enemy = state.players[opponentOf(ownerId)];
    switch (value.counter) {
        case 'allMinionCount':
            return owner.board.length + enemy.board.length;
        case 'friendlyMinionCount':
            return owner.board.length;
        case 'enemyMinionCount':
            return enemy.board.length;
        case 'friendlyHeroHealth':
            return owner.health;
        case 'enemyHeroHealth':
            return enemy.health;
        case 'allTribeMinionCount': {
            if (!value.tribe) return 0;
            const tribe = value.tribe;
            const matchesTribe = (c: CardInstance) => minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribe);
            return owner.board.filter(matchesTribe).length + enemy.board.filter(matchesTribe).length;
        }
    }
}

/** Resolves a flat number as-is, or a counter reference to `resolveCounter(...) * multiplier + offset`. */
export function resolveEffectValue(value: EffectValue, ownerId: PlayerId, state: GameState): number {
    if (typeof value === 'number') return value;
    return resolveCounter(value, ownerId, state) * (value.multiplier ?? 1) + (value.offset ?? 0);
}

/** The one EffectValue an effect's action "headlines" for `{X}` substitution — damage/heal's amount,
 * buff's attack (falling back to health), draw's count. summon/freeze/silence/destroy have no single magnitude. */
function headlineValue(action: EffectAction): EffectValue | undefined {
    switch (action.kind) {
        case 'damage':
        case 'heal':
            return action.amount;
        case 'buff':
            return action.attack ?? action.health;
        case 'draw':
            return action.count;
        default:
            return undefined;
    }
}

/**
 * Substitutes the literal placeholder `{X}` in a card's rule text with the live-resolved value of
 * its first effect's headline EffectValue — a card author writes `{X}` by hand in `text`; this is
 * the only place that number actually gets computed and inserted. Text with no `{X}` (the common
 * case) is returned unchanged. If `{X}` is present but no effect can supply a value, the literal
 * `{X}` is left in place — see validateCardDefinition.ts, which flags this as an authoring error.
 * Only one `{X}`/one value per card is supported; multi-variable text isn't a goal here.
 */
export function resolveCardText(instance: CardInstance, state: GameState): string {
    const definition = CARD_DEFINITIONS[instance.definitionId];
    if (!definition || !definition.text.includes('{X}')) return definition?.text ?? '';

    for (const effect of definition.effects ?? []) {
        const value = headlineValue(effect.action);
        if (value !== undefined) {
            return definition.text.replaceAll('{X}', String(resolveEffectValue(value, instance.owner, state)));
        }
    }
    return definition.text;
}
