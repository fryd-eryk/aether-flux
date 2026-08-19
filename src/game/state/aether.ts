import { CARD_DEFINITIONS } from '../data/cards';
import type { AetherCost, ElementalCategory } from '../types/Card';
import type { PlayerState } from '../types/GameState';

/** How many untapped 'generic' Aether `player` currently controls — the pool a card's
 * `AetherCost.generic` amount is paid from. */
export function countUntappedPlain(player: PlayerState): number {
    return player.aetherInPlay.filter((c) => !c.tapped && CARD_DEFINITIONS[c.definitionId]?.aetherCategory === 'generic').length;
}

/** How many `category` Aether `player` controls, tapped or not — elemental thresholds are a
 * pure presence check, never satisfied by tapping/consuming. */
export function countCategory(player: PlayerState, category: ElementalCategory): number {
    return player.aetherInPlay.filter((c) => CARD_DEFINITIONS[c.definitionId]?.aetherCategory === category).length;
}

/** True if `player` can pay `cost` right now — both the generic amount (untapped 'generic'
 * Aether) and, if present, the elemental threshold (category count in play). Undefined `cost`
 * is treated as free — defensive default, every non-Aether CardDefinition has a cost in
 * practice (Card Creator-enforced). */
export function canAffordAetherCost(player: PlayerState, cost: AetherCost | undefined): boolean {
    if (!cost) return true;
    if (countUntappedPlain(player) < cost.generic) return false;
    if (cost.elemental && countCategory(player, cost.elemental.category) < cost.elemental.threshold) return false;
    return true;
}

/** Taps `n` currently-untapped 'generic' Aether to pay a generic cost — tap/untap like a land,
 * never removed from `aetherInPlay`. Caller must have already verified affordability
 * (canAffordAetherCost); this doesn't re-check and silently taps fewer than `n` if short. */
export function payGenericAether(player: PlayerState, n: number): void {
    let remaining = n;
    for (const instance of player.aetherInPlay) {
        if (remaining <= 0) break;
        if (instance.tapped) continue;
        if (CARD_DEFINITIONS[instance.definitionId]?.aetherCategory !== 'generic') continue;
        instance.tapped = true;
        remaining--;
    }
}

/** Untaps every Aether `player` controls — called once per owner at their own beginStartTurn,
 * mirroring the summoningSick/attacksThisTurn clear loop right above it in TurnStateMachine. */
export function untapAllAether(player: PlayerState): void {
    for (const instance of player.aetherInPlay) instance.tapped = false;
}
