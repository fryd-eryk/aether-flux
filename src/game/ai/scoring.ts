import { CARD_DEFINITIONS } from '../data/cards';
import { resolveEffectValue } from '../state/counters';
import { canDeclareAttack, hasKeyword, isTargetable } from '../state/keywordRules';
import { minionHasTribe, restrictionTribe, restrictsToMinion } from '../state/tribes';
import type { CardDefinition, CardInstance, ChosenTargetRestriction, EffectAction } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';

// Mirrors TurnStateMachine's private MAX_BOARD_SIZE — kept in sync manually since it isn't exported.
const MAX_BOARD_SIZE = 7;

function opponentOf(id: PlayerId): PlayerId {
    return id === 'player' ? 'opponent' : 'player';
}

/** True if `effect`'s Momentum(N) condition (if any) is satisfied given `owner`'s cards played so far this turn. */
function momentumSatisfied(effect: { condition?: { type: 'momentum'; minCount: number } }, owner: { cardsPlayedThisTurn: number }): boolean {
    return !effect.condition || owner.cardsPlayedThisTurn >= effect.condition.minCount;
}

/**
 * Total damage the AI could put on the enemy hero this turn if it committed everything to
 * face (all eligible attackers + any affordable direct-damage spell). Comparing this against
 * the enemy's current health is the AI's lethal check — scorePlayCard/scoreAttack use it to
 * heavily favor face damage over trading once lethal is in reach, mirroring how Hearthstone's
 * shipped AI special-cases "can I kill this turn" rather than doing general lookahead.
 */
export function computePotentialFaceDamage(state: GameState, aiId: PlayerId): number {
    const ai = state.players[aiId];
    let total = ai.board.filter(canDeclareAttack).reduce((sum, c) => sum + (c.currentAttack ?? 0), 0);

    for (const card of ai.hand) {
        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition || ai.mana < definition.cost) continue;

        if (definition.type === 'spell') {
            const damageEffect = definition.effects?.find(
                (e) => e.trigger === 'onPlay' && e.action.kind === 'damage' && e.action.target === 'chosen'
            );
            // A minion-restricted damage effect (e.g. Pocket Sand's "to a minion") can never hit face
            // — nor can a tribe-restricted one (tribes are minion-only), see restrictsToMinion.
            if (
                damageEffect &&
                damageEffect.action.kind === 'damage' &&
                !restrictsToMinion(damageEffect.action.chosenRestriction)
            ) {
                total += resolveEffectValue(damageEffect.action.amount, aiId, state);
            }
        } else if (definition.keywords?.includes('charge')) {
            // A Charge minion could be played and swung at face for lethal in the same turn.
            total += definition.attack ?? 0;
        }
    }

    return total;
}

export interface ScoredTarget {
    score: number;
    targetId?: string;
}

/**
 * Rough point value of an effect that doesn't need a chosen target — board-wide or fixed-target
 * (hero/all-minions) damage, heal, buff, draw, summon, across any trigger (onPlay/onDeath/
 * startOfTurn/endOfTurn alike, so a Deathcry or Vigil effect is weighed same as a Battlecry-style
 * one). Chosen-target damage/heal is intentionally excluded here (returns 0) — those are scored
 * precisely by scoreChosenTarget instead, which also picks which target to hit.
 */
function estimateEffectValue(action: EffectAction, state: GameState, aiId: PlayerId): number {
    const ai = state.players[aiId];
    const enemy = state.players[opponentOf(aiId)];

    switch (action.kind) {
        case 'damage': {
            if (action.target === 'chosen') return 0;
            const amount = resolveEffectValue(action.amount, aiId, state);
            // allMinions/allHeroes hit both sides — net the boards against each other (and halve a
            // mutual face hit) rather than a flat per-target count, so the AI disfavors nuking a
            // board/face split that actually favors the enemy. See CLAUDE.md's Apocalypse precedent.
            if (action.target === 'allMinions') return amount * (enemy.board.length - ai.board.length);
            if (action.target === 'allHeroes') return amount * 0.5;
            return amount * (action.target === 'allEnemyMinions' ? Math.max(1, enemy.board.length) : 1);
        }
        case 'heal': {
            if (action.target === 'chosen') return 0;
            const amount = resolveEffectValue(action.amount, aiId, state);
            if (action.target === 'allMinions') return amount * 0.5 * (ai.board.length - enemy.board.length);
            return amount * (action.target === 'allFriendlyMinions' ? Math.max(1, ai.board.length) : 1) * 0.5;
        }
        case 'buff': {
            const magnitude = resolveEffectValue(action.attack ?? 0, aiId, state) + resolveEffectValue(action.health ?? 0, aiId, state);
            if (action.target === 'allMinions') return magnitude * (ai.board.length - enemy.board.length);
            return magnitude * (action.target === 'allFriendlyMinions' ? Math.max(1, ai.board.length) : 1);
        }
        case 'draw':
            return resolveEffectValue(action.count, aiId, state) * 4;
        case 'summon':
            return action.count * 4;
        case 'freeze':
            if (action.target === 'chosen') return 0;
            if (action.target === 'allMinions') return 3 * (enemy.board.length - ai.board.length);
            return 3 * (action.target === 'allEnemyMinions' ? Math.max(1, enemy.board.length) : 1);
        case 'silence':
            if (action.target === 'chosen') return 0;
            if (action.target === 'allMinions') return 4 * (enemy.board.length - ai.board.length);
            return 4 * (action.target === 'allEnemyMinions' ? Math.max(1, enemy.board.length) : 1);
    }
}

/** Scores + picks a target for the one chosen-target effect a card is allowed (see TurnStateMachine.needsChosenTarget). */
function scoreChosenTarget(state: GameState, aiId: PlayerId, action: EffectAction, lethalAvailable: boolean): ScoredTarget {
    if (action.kind === 'damage') {
        return scoreDamageSpell(state, aiId, resolveEffectValue(action.amount, aiId, state), lethalAvailable, action.chosenRestriction);
    }
    if (action.kind === 'heal') return scoreHealSpell(state, aiId, resolveEffectValue(action.amount, aiId, state), action.chosenRestriction);
    if (action.kind === 'freeze') return scoreFreezeSpell(state, aiId, action.chosenRestriction);
    if (action.kind === 'silence') return scoreSilenceSpell(state, aiId, action.chosenRestriction);
    return { score: 0 };
}

/**
 * Value of every Channel (onSpellCast) effect on the AI's own board that would fire if it cast
 * a spell right now — mirrors how a card's own effects are summed in scorePlayCard, just scanned
 * across the board instead of one card's own effects[]. Momentum-gated Channel effects are
 * discounted the same way scorePlayCard discounts a card's own Momentum-gated effects.
 */
function channelBoardValue(state: GameState, aiId: PlayerId): number {
    const ai = state.players[aiId];
    return ai.board.reduce((sum, minion) => {
        if (minion.silenced) return sum;
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const channelEffects = definition?.effects?.filter((e) => e.trigger === 'onSpellCast') ?? [];
        return (
            sum +
            channelEffects.reduce(
                (s, e) => (momentumSatisfied(e, ai) ? s + estimateEffectValue(e.action, state, aiId) : s),
                0
            )
        );
    }, 0);
}

/**
 * Value of every Muster (onMinionCast) effect on the AI's own board that would fire if it played
 * a minion right now — mirrors channelBoardValue's shape for Channel (onSpellCast). No exclude
 * param needed unlike mournBoardValue: the minion being scored is still in hand, not yet on
 * ai.board, at scoring time (TurnStateMachine itself excludes the played instance for the same
 * reason it's naturally absent here — see executePlayCard).
 */
function musterBoardValue(state: GameState, aiId: PlayerId): number {
    const ai = state.players[aiId];
    return ai.board.reduce((sum, minion) => {
        if (minion.silenced) return sum;
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const musterEffects = definition?.effects?.filter((e) => e.trigger === 'onMinionCast') ?? [];
        return (
            sum +
            musterEffects.reduce((s, e) => (momentumSatisfied(e, ai) ? s + estimateEffectValue(e.action, state, aiId) : s), 0)
        );
    }, 0);
}

/**
 * Value of every Mourn (onMinionDeath) effect on the AI's own board (excluding `excludeInstanceId`,
 * the minion whose potential death is being scored) that would fire if one more friendly minion
 * died right now. Used by scoreAttack to weigh a trade that would kill the attacker.
 */
function mournBoardValue(state: GameState, aiId: PlayerId, excludeInstanceId: string): number {
    const ai = state.players[aiId];
    return ai.board.reduce((sum, minion) => {
        if (minion.instanceId === excludeInstanceId || minion.silenced) return sum;
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const mournEffects = definition?.effects?.filter((e) => e.trigger === 'onMinionDeath') ?? [];
        return (
            sum +
            mournEffects.reduce((s, e) => (momentumSatisfied(e, ai) ? s + estimateEffectValue(e.action, state, aiId) : s), 0)
        );
    }, 0);
}

/** Scores playing `card` from hand, resolving the best target for chosen-target effects along the way. */
export function scorePlayCard(
    state: GameState,
    aiId: PlayerId,
    card: CardInstance,
    definition: CardDefinition,
    lethalAvailable: boolean
): ScoredTarget {
    const ai = state.players[aiId];
    const effects = definition.effects ?? [];
    const onPlayEffects = effects.filter((e) => e.trigger === 'onPlay');
    const chosenEffect = onPlayEffects.find((e) => 'target' in e.action && e.action.target === 'chosen');
    // A Momentum-gated chosen-target effect must still resolve a legal target (the state machine
    // prompts for one regardless of whether the condition ends up true), but its score shouldn't
    // count if it won't actually fire.
    const chosenEffectLive = chosenEffect ? momentumSatisfied(chosenEffect, ai) : false;
    const chosenTarget = chosenEffect ? scoreChosenTarget(state, aiId, chosenEffect.action, lethalAvailable) : undefined;
    const chosenScore = chosenEffectLive ? (chosenTarget?.score ?? 0) : 0;
    const flatEffectValue = effects.reduce(
        (sum, e) => (momentumSatisfied(e, ai) ? sum + estimateEffectValue(e.action, state, aiId) : sum),
        0
    );

    if (definition.type === 'minion' || definition.type === 'token') {
        if (ai.board.length >= MAX_BOARD_SIZE) return { score: -1 }; // board full: the minion would just be discarded, see TurnStateMachine.executePlayCard

        const stats = (card.currentAttack ?? 0) + (card.currentHealth ?? 0);
        const overextendPenalty = ai.board.length >= MAX_BOARD_SIZE - 1 ? 5 : 0;
        const keywordBonus =
            (definition.keywords?.includes('windfury') ? 3 : 0) +
            (definition.keywords?.includes('charge') ? 3 : 0) +
            (definition.keywords?.includes('taunt') ? 2 : 0) +
            (definition.keywords?.includes('divineShield') ? 3 : 0) +
            (definition.keywords?.includes('veiled') ? 2 : 0) +
            (definition.keywords?.includes('venom') ? 4 : 0) +
            (definition.keywords?.includes('initiative') ? 3 : 0);
        // Casting this minion also fires Muster on every other board minion with a matching effect.
        const musterValue = musterBoardValue(state, aiId);
        const score = stats * 2 + flatEffectValue + chosenScore + keywordBonus - overextendPenalty + musterValue;
        return { score, targetId: chosenTarget?.targetId };
    }

    // Casting this spell also fires Channel on every board minion with a matching effect.
    const channelValue = channelBoardValue(state, aiId);
    if (onPlayEffects.length === 0 && channelValue === 0) return { score: 0 };
    return { score: flatEffectValue + chosenScore + channelValue, targetId: chosenTarget?.targetId };
}

function scoreDamageSpell(
    state: GameState,
    aiId: PlayerId,
    amount: number,
    lethalAvailable: boolean,
    restriction?: ChosenTargetRestriction
): ScoredTarget {
    const enemyId = opponentOf(aiId);
    const enemy = state.players[enemyId];
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);

    // A minion-restricted effect (e.g. "Deal 2 damage to a minion") isn't a legal way to hit
    // face — nor is a tribe-restricted one (tribes are minion-only) — see TurnStateMachine.
    // computeValidTargets — so don't seed a face candidate for either. -Infinity (rather than a
    // fixed sentinel like -1) guarantees the friendly-minion loop below can still win and set a
    // targetId even when every candidate scores negative — see its comment.
    let best: ScoredTarget =
        restrictsToMinion(restriction) ? { score: -Infinity } : { score: amount * (lethalAvailable ? 100 : 1.5), targetId: enemyId };

    for (const minion of enemy.board.filter(isTargetable).filter(matchesTribe)) {
        const health = minion.currentHealth ?? 0;
        const value = (minion.currentAttack ?? 0) + health;
        const score = amount >= health ? value * 3 : amount * 0.5;
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    // TurnStateMachine.computeValidTargets treats "a minion" (or "a <tribe>") as ANY minion (of
    // that tribe), friendly included — so when the enemy board can't offer a (better) target, the
    // AI must still be able to resolve one of its own, or playCard leaves the state machine stuck
    // in AwaitingTarget forever (nothing else ever calls selectTarget for it — see
    // OpponentAI.decideOpponentAction/runOpponentTurn). Hitting our own minion is modeled as a
    // cost, not a benefit: roughly what the minion is worth if the hit would kill it outright, or
    // half the raw damage as "wasted" chip damage otherwise. scorePlayCard adds this to the card's
    // flat value (e.g. Boneshard Finger's card draw), so the AI ends up genuinely weighing "lose
    // this minion" against "draw a card" instead of freezing. (Unrestricted/hero-restricted damage
    // already always has the enemy-face fallback above, so this loop is scoped to the
    // minion/tribe-restricted case that actually needs it.)
    if (restrictsToMinion(restriction)) {
        for (const minion of ai.board.filter(isTargetable).filter(matchesTribe)) {
            const health = minion.currentHealth ?? 0;
            const value = (minion.currentAttack ?? 0) + health;
            const score = amount >= health ? -value * 3 : -amount * 0.5;
            if (score > best.score) best = { score, targetId: minion.instanceId };
        }
    }

    return best;
}

/**
 * Scores + picks a target for a `heal` effect. Unlike scoreDamageSpell/scoreFreezeSpell/
 * scoreSilenceSpell, a heal has nothing it *wants* to hit once the AI's hero and minions are
 * already topped up — but selectTarget still needs a legal targetId or playCard leaves the state
 * machine stuck in AwaitingTarget forever (see runOpponentTurn in CardGame/index.ts). For the
 * unrestricted/'hero' cases, the AI's own hero is always a legal target and harmless to heal even
 * at full health (hero healing intentionally overheals, see CLAUDE.md), so it seeds `best` as the
 * guaranteed fallback instead of leaving targetId undefined. The 'minion' case mirrors
 * scoreFreezeSpell/scoreSilenceSpell's own -Infinity sentinel + own/enemy-board fallback.
 */
function scoreHealSpell(state: GameState, aiId: PlayerId, amount: number, restriction?: ChosenTargetRestriction): ScoredTarget {
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);
    let best: ScoredTarget = restrictsToMinion(restriction) ? { score: -Infinity } : { score: 0, targetId: aiId };

    if (!restrictsToMinion(restriction)) {
        const heroMissing = ai.maxHealth - ai.health;
        const heroScore = Math.min(amount, heroMissing) * 1.5;
        if (heroScore > best.score) best = { score: heroScore, targetId: aiId };
    }

    if (restriction !== 'hero') {
        for (const minion of ai.board.filter(isTargetable).filter(matchesTribe)) {
            const definition = CARD_DEFINITIONS[minion.definitionId];
            if (!definition?.health) continue;
            const missing = definition.health - (minion.currentHealth ?? 0);
            if (missing <= 0) continue;
            const score = Math.min(amount, missing) * 1.5;
            if (score > best.score) best = { score, targetId: minion.instanceId };
        }
    }

    if (restrictsToMinion(restriction) && best.targetId === undefined) {
        for (const minion of [...ai.board, ...state.players[opponentOf(aiId)].board].filter(isTargetable).filter(matchesTribe)) {
            const score = -1;
            if (score > best.score) best = { score, targetId: minion.instanceId };
        }
    }

    return best;
}

/**
 * Scores + picks a target for a minion-restricted `freeze` effect: prefer denying the enemy's
 * biggest attacker. Mirrors scoreDamageSpell's own-board fallback (never leaves targetId
 * undefined when *any* minion exists anywhere, to avoid soft-locking runOpponentTurn's
 * selectTarget call in AwaitingTarget — see CardGame/index.ts) and its -Infinity sentinel for the
 * genuinely-no-minions-anywhere case, which naturally keeps the card from ever being chosen then.
 */
function scoreFreezeSpell(state: GameState, aiId: PlayerId, restriction?: ChosenTargetRestriction): ScoredTarget {
    const enemy = state.players[opponentOf(aiId)];
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);

    let best: ScoredTarget = { score: -Infinity };
    for (const minion of enemy.board.filter(isTargetable).filter(matchesTribe)) {
        const score = (minion.currentAttack ?? 0) * 2; // denying a bigger attacker is more valuable
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    if (restrictsToMinion(restriction) && best.targetId === undefined) {
        for (const minion of ai.board.filter(isTargetable).filter(matchesTribe)) {
            const score = -1; // mild self-cost, still resolvable rather than leaving no legal target
            if (score > best.score) best = { score, targetId: minion.instanceId };
        }
    }

    return best;
}

/**
 * Scores + picks a target for a minion-restricted `silence` effect: prefer the enemy's most
 * keyword/effect-laden minion (nothing to gain silencing a vanilla stat stick). Same own-board
 * fallback and -Infinity sentinel as scoreFreezeSpell/scoreDamageSpell, for the same reason.
 */
function scoreSilenceSpell(state: GameState, aiId: PlayerId, restriction?: ChosenTargetRestriction): ScoredTarget {
    const enemy = state.players[opponentOf(aiId)];
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);

    let best: ScoredTarget = { score: -Infinity };
    for (const minion of enemy.board.filter(isTargetable).filter(matchesTribe)) {
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const hasKeywords = minion.keywords.size > 0;
        const hasEffects = (definition?.effects?.length ?? 0) > 0;
        if (!hasKeywords && !hasEffects) continue; // nothing worth silencing
        const value = (minion.currentAttack ?? 0) + (minion.currentHealth ?? 0);
        const score = value * (hasKeywords && hasEffects ? 2 : 1);
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    if (restrictsToMinion(restriction) && best.targetId === undefined) {
        for (const minion of [...enemy.board, ...ai.board].filter(isTargetable).filter(matchesTribe)) {
            const score = -5;
            if (score > best.score) best = { score, targetId: minion.instanceId };
        }
    }

    return best;
}

/** Scores attacking `target` (a specific enemy minion, or 'face' for the enemy hero) with `attacker`. */
export function scoreAttack(
    state: GameState,
    aiId: PlayerId,
    attacker: CardInstance,
    target: CardInstance | 'face',
    lethalAvailable: boolean
): number {
    const lifestealBonus = hasKeyword(attacker, 'lifesteal') ? (attacker.currentAttack ?? 0) * 0.5 : 0;

    if (target === 'face') {
        const attack = attacker.currentAttack ?? 0;
        return attack * (lethalAvailable ? 100 : 1) + lifestealBonus;
    }

    const attackerAttack = attacker.currentAttack ?? 0;
    const attackerHealth = attacker.currentHealth ?? 0;
    const targetAttack = target.currentAttack ?? 0;
    const targetHealth = target.currentHealth ?? 0;

    // Divine Shield absorbs the whole hit rather than dying/killing outright. Venom makes any
    // unshielded hit lethal regardless of the stat comparison.
    let defenderDies = (attackerAttack >= targetHealth || hasKeyword(attacker, 'venom')) && !hasKeyword(target, 'divineShield');
    let attackerDies = (targetAttack >= attackerHealth || hasKeyword(target, 'venom')) && !hasKeyword(attacker, 'divineShield');
    // Initiative (First Strike): whichever side ALONE has it hits first — if that hit is lethal,
    // the other side never swings back, so its own "dies" flag no longer applies. Mirrors
    // TurnStateMachine.executeAttack's resolution order exactly.
    const attackerHasInitiative = hasKeyword(attacker, 'initiative');
    const targetHasInitiative = hasKeyword(target, 'initiative');
    if (defenderDies && attackerHasInitiative && !targetHasInitiative) {
        attackerDies = false;
    }
    if (attackerDies && targetHasInitiative && !attackerHasInitiative) {
        defenderDies = false;
    }
    // Mourn (onMinionDeath): the attacker's own death (if this trade kills it) also fires Mourn on
    // the rest of the AI's board — a best-effort nudge to the trade math, not full lookahead.
    const mournBonus = attackerDies ? mournBoardValue(state, aiId, attacker.instanceId) : 0;

    const attackerValue = attackerAttack + attackerHealth;
    const targetValue = targetAttack + targetHealth;

    if (defenderDies && !attackerDies) return targetValue * 3 + lifestealBonus; // clean kill, keep the attacker
    if (defenderDies && attackerDies) return targetValue - attackerValue + 5 + lifestealBonus + mournBonus; // even trade, favor when the defender was worth more
    if (!defenderDies && !attackerDies) return -2; // pointless chip damage (or a Divine Shield pop with no other upside)
    return -10 + mournBonus; // suicidal — attacker dies for nothing (partially offset if it Mourns)
}
