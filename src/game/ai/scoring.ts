import { CARD_DEFINITIONS } from '../data/cards';
import { resolveEffectValue } from '../state/counters';
import { canDeclareAttack, hasKeyword, isTargetable, tauntRestrictedTargets } from '../state/keywordRules';
import { minionHasTribe, restrictionTribe, restrictsToMinion } from '../state/tribes';
import type { CardDefinition, CardInstance, ChosenTargetRestriction, EffectAction, Keyword, PaidAbility, Tribe } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState } from '../types/GameState';

// Mirrors TurnStateMachine's private MAX_BOARD_SIZE — kept in sync manually since it isn't exported.
const MAX_BOARD_SIZE = 7;

/** Flat point value of a minion having (or being granted) each keyword — shared by scorePlayCard's
 * keywordBonus (a minion printed with the keyword) and grantKeyword scoring below (a minion given
 * the keyword by an effect), so the two stay consistent. lifesteal is 0 here to preserve
 * keywordBonus's pre-existing omission of it — its value is already captured dynamically via
 * scoreAttack's lifestealBonus, not as a flat card-value bonus. */
const KEYWORD_VALUE: Record<Keyword, number> = {
    windfury: 3,
    charge: 3,
    taunt: 2,
    divineShield: 3,
    lifesteal: 0,
    veiled: 2,
    venom: 4,
    initiative: 3,
};

/** Flat discount applied to a `buff`/`grantKeyword` action's value when it carries a `duration` —
 * the AI can only realize a time-limited effect's value for as long as it lasts, unlike a
 * permanent grant, so it shouldn't be valued the same. A flat multiplier, not a precise
 * turn-by-turn calculation, matching KEYWORD_VALUE's own flat-heuristic style. */
const TEMPORARY_EFFECT_DISCOUNT = 0.5;

function opponentOf(id: PlayerId): PlayerId {
    return id === 'player' ? 'opponent' : 'player';
}

/** Sums estimateEffectValue across a whole block's actions[] — the block-level total that fires
 * together, not any single action's value. */
function effectActionsValue(actions: EffectAction[], state: GameState, ownerId: PlayerId, sourceId?: string): number {
    return actions.reduce((sum, action) => sum + estimateEffectValue(action, state, ownerId, sourceId), 0);
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
            const chosenDamageActions = (definition.effects ?? [])
                .filter((e) => e.trigger === 'onPlay')
                .flatMap((e) => e.actions)
                .filter((a) => a.kind === 'damage' && a.target === 'chosen');
            // A minion-restricted damage action (e.g. Pocket Sand's "to a minion") can never hit
            // face — nor can a tribe-restricted one (tribes are minion-only), see restrictsToMinion.
            for (const damageAction of chosenDamageActions) {
                if (damageAction.kind === 'damage' && !restrictsToMinion(damageAction.chosenRestriction)) {
                    total += resolveEffectValue(damageAction.amount, aiId, state);
                }
            }
        } else if (definition.keywords?.includes('charge')) {
            // A Charge minion could be played and swung at face for lethal in the same turn.
            total += definition.attack ?? 0;
        }
    }

    for (const minion of ai.board) {
        if (minion.silenced) continue; // a silenced minion's paid abilities are blocked, see TurnStateMachine.activateAbility
        const definition = CARD_DEFINITIONS[minion.definitionId];
        for (const ability of definition?.paidAbilities ?? []) {
            if (ai.mana < ability.cost) continue;
            // Same minion-restricted/tribe-restricted exclusion as the hand-spell branch above —
            // neither can ever hit face, see TurnStateMachine.computeValidTargets.
            for (const action of ability.actions) {
                if (action.kind === 'damage' && action.target === 'chosen' && !restrictsToMinion(action.chosenRestriction)) {
                    total += resolveEffectValue(action.amount, aiId, state);
                }
            }
        }
    }

    return total;
}

export interface ScoredTarget {
    score: number;
    targetId?: string;
}

/** Board count for AOE scoring, narrowed to `tribeFilter` when the action sets one (see EffectAction.tribeFilter) — otherwise the whole board. */
function tribeFilteredCount(board: CardInstance[], tribeFilter: Tribe | undefined): number {
    if (!tribeFilter) return board.length;
    return board.filter((c) => minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribeFilter)).length;
}

/**
 * True if any of `board`'s currently attack-eligible, positive-attack minions would actually die
 * to this AOE right now — i.e. free face damage the AI would permanently forfeit by playing it
 * before swinging. Scoped to "face is currently a legal attack target" (no enemy Taunt up) —
 * mirrors decideOpponentAction's own tauntUp gate (OpponentAI.ts) — since a forced trade into
 * Taunt isn't guaranteed free the way an unblocked face swing is, and this file shouldn't
 * re-derive scoreAttack's own trade-value reasoning here.
 */
function wipesAFreeFaceAttacker(
    state: GameState,
    aiId: PlayerId,
    board: CardInstance[],
    tribeFilter: Tribe | undefined,
    wouldDie: (c: CardInstance) => boolean
): boolean {
    const enemy = state.players[opponentOf(aiId)];
    const tauntUp = tauntRestrictedTargets(enemy.board).some((c) => hasKeyword(c, 'taunt'));
    if (tauntUp) return false;
    return board
        .filter((c) => !tribeFilter || minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribeFilter))
        .filter(canDeclareAttack)
        .filter((c) => (c.currentAttack ?? 0) > 0)
        .some(wouldDie);
}

/**
 * Rough point value of an effect that doesn't need a chosen target — board-wide or fixed-target
 * (hero/all-minions) damage, heal, buff, draw, summon, across any trigger (onPlay/onDeath/
 * startOfTurn/endOfTurn alike, so a Deathcry or Vigil effect is weighed same as a Battlecry-style
 * one). Chosen-target damage/heal is intentionally excluded here (returns 0) — those are scored
 * precisely by scoreChosenTarget instead, which also picks which target to hit.
 */
function estimateEffectValue(action: EffectAction, state: GameState, aiId: PlayerId, sourceId?: string): number {
    const ai = state.players[aiId];
    const enemy = state.players[opponentOf(aiId)];
    // 'allOtherMinions' is exactly 'allMinions' minus the acting instance — precomputed once here
    // so every case below can treat the two targets as the same arithmetic branch, just over a
    // self-excluded board slice. A no-op when sourceId is absent/not on either board (e.g.
    // scorePlayCard scoring a card still in hand, not yet part of ai.board — see its call site).
    const isAllOtherMinions = 'target' in action && action.target === 'allOtherMinions';
    const aiBoard = isAllOtherMinions ? ai.board.filter((c) => c.instanceId !== sourceId) : ai.board;
    const enemyBoard = isAllOtherMinions ? enemy.board.filter((c) => c.instanceId !== sourceId) : enemy.board;
    const hitsAllMinions = isAllOtherMinions || ('target' in action && action.target === 'allMinions');

    switch (action.kind) {
        case 'damage': {
            if (action.target === 'chosen') return 0;
            const amount = resolveEffectValue(action.amount, aiId, state);
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            // Wound (onDamaged): every minion this actually hits (amount > 0, unshielded) that has
            // its own Wound effect also fires it — summed signed from the AI's perspective (see
            // woundValue) alongside the raw damage math below.
            const hitWoundValue = (board: CardInstance[]) =>
                amount > 0
                    ? board
                          .filter((c) => !action.tribeFilter || minionHasTribe(CARD_DEFINITIONS[c.definitionId], action.tribeFilter))
                          .filter((c) => !hasKeyword(c, 'divineShield'))
                          .reduce((sum, c) => sum + woundValue(state, aiId, c), 0)
                    : 0;
            const enemyMinionsHit = action.target === 'allEnemyMinions';
            const friendlyMinionsHit = action.target === 'allFriendlyMinions';
            // A friendly-fire hit that would kill one of the AI's own currently-eligible attackers
            // is deferred (not lost) rather than valued as-is — see wipesAFreeFaceAttacker: the AI
            // should swing that attacker at an open face first, then this AOE scores normally again
            // once it's no longer attack-eligible (decideOpponentAction re-evaluates every action).
            const wouldDie = (c: CardInstance) => !hasKeyword(c, 'divineShield') && (c.currentHealth ?? 0) <= amount;
            if ((hitsAllMinions || friendlyMinionsHit) && wipesAFreeFaceAttacker(state, aiId, aiBoard, action.tribeFilter, wouldDie)) {
                return -Infinity;
            }
            // allMinions/allOtherMinions/allHeroes hit both sides — net the boards against each
            // other (and halve a mutual face hit) rather than a flat per-target count, so the AI
            // disfavors nuking a board/face split that actually favors the enemy. See CLAUDE.md's
            // Apocalypse precedent.
            if (hitsAllMinions) return amount * (enemyCount - aiCount) + hitWoundValue(aiBoard) + hitWoundValue(enemyBoard);
            if (action.target === 'allHeroes') return amount * 0.5;
            return (
                amount * (enemyMinionsHit ? Math.max(1, enemyCount) : 1) +
                (enemyMinionsHit ? hitWoundValue(enemy.board) : 0) +
                (friendlyMinionsHit ? hitWoundValue(ai.board) : 0)
            );
        }
        case 'heal': {
            if (action.target === 'chosen') return 0;
            const amount = resolveEffectValue(action.amount, aiId, state);
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            if (hitsAllMinions) return amount * 0.5 * (aiCount - enemyCount);
            return amount * (action.target === 'allFriendlyMinions' ? Math.max(1, aiCount) : 1) * 0.5;
        }
        case 'buff': {
            if (action.target === 'chosen') return 0;
            let magnitude = resolveEffectValue(action.attack ?? 0, aiId, state) + resolveEffectValue(action.health ?? 0, aiId, state);
            if (action.duration) magnitude *= TEMPORARY_EFFECT_DISCOUNT;
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            if (hitsAllMinions) return magnitude * (aiCount - enemyCount);
            return magnitude * (action.target === 'allFriendlyMinions' ? Math.max(1, aiCount) : 1);
        }
        case 'draw':
            return resolveEffectValue(action.count, aiId, state) * 4;
        case 'summon':
            return action.count * 4;
        case 'freeze': {
            if (action.target === 'chosen') return 0;
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            if (hitsAllMinions) return 3 * (enemyCount - aiCount);
            return 3 * (action.target === 'allEnemyMinions' ? Math.max(1, enemyCount) : 1);
        }
        case 'silence': {
            if (action.target === 'chosen') return 0;
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            if (hitsAllMinions) return 4 * (enemyCount - aiCount);
            return 4 * (action.target === 'allEnemyMinions' ? Math.max(1, enemyCount) : 1);
        }
        case 'destroy': {
            if (action.target === 'chosen') return 0;
            // A permanent, guaranteed removal (bypasses Divine Shield/health entirely) — weighted
            // well above freeze/silence's temporary denial, as a rough stand-in for an average
            // minion's card value. Tunable, same as the 3/4 constants above.
            const DESTROY_WEIGHT = 6;
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            // forceKill bypasses Divine Shield/health entirely, so every eligible attacker it
            // targets dies unconditionally — same deferral as the damage case above.
            const hitsOwnBoard = hitsAllMinions || action.target === 'allFriendlyMinions';
            if (hitsOwnBoard && wipesAFreeFaceAttacker(state, aiId, aiBoard, action.tribeFilter, () => true)) {
                return -Infinity;
            }
            if (hitsAllMinions) return DESTROY_WEIGHT * (enemyCount - aiCount);
            return DESTROY_WEIGHT * (action.target === 'allEnemyMinions' ? Math.max(1, enemyCount) : 1);
        }
        case 'grantKeyword': {
            if (action.target === 'chosen') return 0;
            const value = KEYWORD_VALUE[action.keyword] * (action.duration ? TEMPORARY_EFFECT_DISCOUNT : 1);
            const aiCount = tribeFilteredCount(aiBoard, action.tribeFilter);
            const enemyCount = tribeFilteredCount(enemyBoard, action.tribeFilter);
            // Mirrors 'buff's own AOE weighting exactly — a keyword grant is just a differently-shaped buff.
            if (hitsAllMinions) return value * (aiCount - enemyCount);
            return value * (action.target === 'allFriendlyMinions' ? Math.max(1, aiCount) : 1);
        }
    }
}

/** Approximate value of a `reuseTarget: true` chosen action — it always lands on whatever an
 * earlier chosen action in the same actions[] list already picked (see TurnStateMachine's
 * ChosenTargetCursor.last), so there's no separate target search here, unlike scoreChosenTarget.
 * Assumes that earlier pick was already a reasonable one — a positive-leaning flat estimate for
 * buffs/heals/grants, negative-leaning for damage/removal — same flat-heuristic spirit as
 * estimateEffectValue's AOE branches, just scaled to a single already-committed target. */
function estimateReuseTargetValue(action: EffectAction, state: GameState, aiId: PlayerId): number {
    switch (action.kind) {
        case 'damage':
            return resolveEffectValue(action.amount, aiId, state) * 1.5;
        case 'heal':
            return resolveEffectValue(action.amount, aiId, state);
        case 'buff': {
            let magnitude = resolveEffectValue(action.attack ?? 0, aiId, state) + resolveEffectValue(action.health ?? 0, aiId, state);
            if (action.duration) magnitude *= TEMPORARY_EFFECT_DISCOUNT;
            return magnitude * 2;
        }
        case 'freeze':
            return 3;
        case 'silence':
            return 4;
        case 'destroy':
            return 6;
        case 'grantKeyword':
            return KEYWORD_VALUE[action.keyword] * (action.duration ? TEMPORARY_EFFECT_DISCOUNT : 1);
        default:
            return 0;
    }
}

/** Scores + picks a target for one chosen-target action, dispatching on its `kind` — shared by
 * every caller that needs to resolve a chosen-target prompt, whether ranking a card/ability/attack
 * up front (scorePlayCard/scorePaidAbility/scoreAttackTriggers/channelBoardValue/musterBoardValue)
 * or resolving one reactively off the live GameState.pendingTarget (OpponentAI.decideOpponentTarget). */
export function scoreChosenTarget(state: GameState, aiId: PlayerId, action: EffectAction, lethalAvailable: boolean): ScoredTarget {
    if (action.kind === 'damage') {
        return scoreDamageSpell(state, aiId, resolveEffectValue(action.amount, aiId, state), lethalAvailable, action.chosenRestriction);
    }
    if (action.kind === 'heal') return scoreHealSpell(state, aiId, resolveEffectValue(action.amount, aiId, state), action.chosenRestriction);
    if (action.kind === 'buff') {
        return scoreBuffSpell(
            state,
            aiId,
            resolveEffectValue(action.attack ?? 0, aiId, state),
            resolveEffectValue(action.health ?? 0, aiId, state),
            action.chosenRestriction,
            action.duration
        );
    }
    if (action.kind === 'freeze') return scoreFreezeSpell(state, aiId, action.chosenRestriction);
    if (action.kind === 'silence') return scoreSilenceSpell(state, aiId, action.chosenRestriction);
    if (action.kind === 'destroy') return scoreDestroySpell(state, aiId, action.chosenRestriction);
    if (action.kind === 'grantKeyword') return scoreGrantKeywordSpell(state, aiId, action.keyword, action.chosenRestriction, action.duration);
    return { score: 0 };
}

/** Sums a block's actions[] the way effectActionsValue does, except a `target: 'chosen'` action is
 * valued via scoreChosenTarget (the *best achievable* target's score) instead of
 * estimateEffectValue's flat 0 punt — shared by channelBoardValue/musterBoardValue/boardWideTriggerValue
 * below, none of which pick the actual target themselves (that happens later, reactively, once the
 * real prompt appears — see OpponentAI.decideOpponentTarget). A `reuseTarget: true` action is
 * estimated the same way scorePlayCard/scorePaidAbility do for their own reuseTarget actions. */
function chosenAwareActionsValue(actions: EffectAction[], state: GameState, aiId: PlayerId, lethalAvailable: boolean, sourceId?: string): number {
    return actions.reduce((sum, action) => {
        if (!('target' in action) || action.target !== 'chosen') return sum + estimateEffectValue(action, state, aiId, sourceId);
        if ('reuseTarget' in action && action.reuseTarget) return sum + estimateReuseTargetValue(action, state, aiId);
        return sum + scoreChosenTarget(state, aiId, action, lethalAvailable).score;
    }, 0);
}

/**
 * Value of every Channel (onSpellCast) effect on the AI's own board that would fire if it cast
 * a spell right now — mirrors how a card's own effects are summed in scorePlayCard, just scanned
 * across the board instead of one card's own effects[]. Momentum-gated Channel effects are
 * discounted the same way scorePlayCard discounts a card's own Momentum-gated effects.
 */
function channelBoardValue(state: GameState, aiId: PlayerId, lethalAvailable: boolean): number {
    const ai = state.players[aiId];
    return ai.board.reduce((sum, minion) => {
        if (minion.silenced) return sum;
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const channelEffects = definition?.effects?.filter((e) => e.trigger === 'onSpellCast') ?? [];
        return (
            sum +
            channelEffects.reduce(
                (s, e) => (momentumSatisfied(e, ai) ? s + chosenAwareActionsValue(e.actions, state, aiId, lethalAvailable, minion.instanceId) : s),
                0
            )
        );
    }, 0);
}

/**
 * Value of every Muster (onFriendlyMinionCast) effect on the AI's own board that would fire if it played
 * a minion right now — mirrors channelBoardValue's shape for Channel (onSpellCast). No exclude
 * param needed unlike mournBoardValue: the minion being scored is still in hand, not yet on
 * ai.board, at scoring time (TurnStateMachine itself excludes the played instance for the same
 * reason it's naturally absent here — see executePlayCard).
 */
function musterBoardValue(state: GameState, aiId: PlayerId, lethalAvailable: boolean): number {
    const ai = state.players[aiId];
    return ai.board.reduce((sum, minion) => {
        if (minion.silenced) return sum;
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const musterEffects = definition?.effects?.filter((e) => e.trigger === 'onFriendlyMinionCast') ?? [];
        return (
            sum +
            musterEffects.reduce((s, e) => (momentumSatisfied(e, ai) ? s + chosenAwareActionsValue(e.actions, state, aiId, lethalAvailable, minion.instanceId) : s), 0)
        );
    }, 0);
}

/**
 * Value of every Mourn (onFriendlyMinionDeath) effect on the AI's own board (excluding `excludeInstanceId`,
 * the minion whose potential death is being scored) that would fire if one more friendly minion
 * died right now. Used by scoreAttack to weigh a trade that would kill the attacker.
 */
function mournBoardValue(state: GameState, aiId: PlayerId, excludeInstanceId: string): number {
    const ai = state.players[aiId];
    return ai.board.reduce((sum, minion) => {
        if (minion.instanceId === excludeInstanceId || minion.silenced) return sum;
        const definition = CARD_DEFINITIONS[minion.definitionId];
        const mournEffects = definition?.effects?.filter((e) => e.trigger === 'onFriendlyMinionDeath') ?? [];
        return (
            sum +
            mournEffects.reduce((s, e) => (momentumSatisfied(e, ai) ? s + effectActionsValue(e.actions, state, aiId, minion.instanceId) : s), 0)
        );
    }, 0);
}

/**
 * Value of `minion`'s own Wound (onDamaged) effect(s) firing, signed from `aiId`'s perspective —
 * positive when `minion` belongs to the AI (a friendly minion's Wound benefits the AI), negative
 * when it belongs to the enemy (the AI is about to hand the enemy whatever its Wound effect
 * grants). Unlike mournBoardValue/channelBoardValue/musterBoardValue (a whole-board reaction to
 * someone else's event), Wound is the damaged instance's own trigger, so this only looks at the
 * one minion actually being hit — callers are responsible for only calling this when a hit that
 * minion actually lands (see scoreAttack's Initiative-aware landing flags, and the divineShield
 * gate everywhere this is called, since dealDamage never fires Wound on an absorbed hit).
 */
function woundValue(state: GameState, aiId: PlayerId, minion: CardInstance): number {
    if (minion.silenced) return 0;
    const definition = CARD_DEFINITIONS[minion.definitionId];
    const woundEffects = definition?.effects?.filter((e) => e.trigger === 'onDamaged') ?? [];
    if (woundEffects.length === 0) return 0;
    const ownerId = minion.owner;
    const owner = state.players[ownerId];
    const value = woundEffects.reduce(
        (sum, e) => (momentumSatisfied(e, owner) ? sum + effectActionsValue(e.actions, state, ownerId, minion.instanceId) : sum),
        0
    );
    return ownerId === aiId ? value : -value;
}

/** Scores playing `card` from hand, including the best achievable value of every chosen-target
 * action it (or a board-wide Channel/Muster reaction) has — the actual target for each isn't
 * picked here, only for ranking; see decideOpponentTarget for where it's picked reactively once
 * the real prompt appears. */
export function scorePlayCard(
    state: GameState,
    aiId: PlayerId,
    card: CardInstance,
    definition: CardDefinition,
    lethalAvailable: boolean
): number {
    const ai = state.players[aiId];
    const effects = definition.effects ?? [];
    const onPlayEffects = effects.filter((e) => e.trigger === 'onPlay');

    // Best achievable value per `target: 'chosen'` action across every onPlay effect's actions[] —
    // the actual target isn't picked here, only its score for ranking (see decideOpponentTarget for
    // where the real target eventually gets picked, reactively, once the prompt actually appears).
    // A Momentum-gated block's chosen action still contributes to ranking only if the block will
    // actually fire.
    let chosenScore = 0;
    for (const effect of onPlayEffects) {
        if (!momentumSatisfied(effect, ai)) continue;
        for (const action of effect.actions) {
            if (!('target' in action) || action.target !== 'chosen') continue;
            chosenScore +=
                'reuseTarget' in action && action.reuseTarget
                    ? estimateReuseTargetValue(action, state, aiId)
                    : scoreChosenTarget(state, aiId, action, lethalAvailable).score;
        }
    }

    const flatEffectValue = effects.reduce(
        (sum, e) => (momentumSatisfied(e, ai) ? sum + effectActionsValue(e.actions, state, aiId, card.instanceId) : sum),
        0
    );

    if (definition.type === 'minion' || definition.type === 'token') {
        if (ai.board.length >= MAX_BOARD_SIZE) return -1; // board full: the minion would just be discarded, see TurnStateMachine.executePlayCard

        const stats = (card.currentAttack ?? 0) + (card.currentHealth ?? 0);
        const overextendPenalty = ai.board.length >= MAX_BOARD_SIZE - 1 ? 5 : 0;
        const keywordBonus = (definition.keywords ?? []).reduce((sum, keyword) => sum + KEYWORD_VALUE[keyword], 0);
        // Casting this minion also fires Muster on every other board minion with a matching effect.
        const musterValue = musterBoardValue(state, aiId, lethalAvailable);
        return stats * 2 + flatEffectValue + chosenScore + keywordBonus - overextendPenalty + musterValue;
    }

    // Casting this spell also fires Channel on every board minion with a matching effect.
    const channelValue = channelBoardValue(state, aiId, lethalAvailable);
    if (onPlayEffects.length === 0 && channelValue === 0) return 0;
    return flatEffectValue + chosenScore + channelValue;
}

/** Scores activating a board minion's paid ability (see PaidAbility, Card.ts) — mirrors
 * scorePlayCard's chosen-target ranking, just for an already-in-play minion's own ability instead
 * of a hand card's onPlay effects. `sourceId` (the ability-owning minion's own instance id) matters
 * here in a way it doesn't for scorePlayCard's flatEffectValue — unlike a hand card, this minion is
 * already on `ai.board` at scoring time, so an 'allOtherMinions' action needs it to avoid counting
 * itself in its own friendly-board tally. */
export function scorePaidAbility(state: GameState, aiId: PlayerId, ability: PaidAbility, lethalAvailable: boolean, sourceId?: string): number {
    let score = 0;
    for (const action of ability.actions) {
        if ('target' in action && action.target === 'chosen') {
            if ('reuseTarget' in action && action.reuseTarget) {
                score += estimateReuseTargetValue(action, state, aiId);
                continue;
            }
            score += scoreChosenTarget(state, aiId, action, lethalAvailable).score;
        } else {
            score += estimateEffectValue(action, state, aiId, sourceId);
        }
    }
    return score;
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
        // Wound (onDamaged): a shielded hit never lands, so it never fires.
        const wound = amount > 0 && !hasKeyword(minion, 'divineShield') ? woundValue(state, aiId, minion) : 0;
        const score = (amount >= health ? value * 3 : amount * 0.5) + wound;
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
            const wound = amount > 0 && !hasKeyword(minion, 'divineShield') ? woundValue(state, aiId, minion) : 0;
            const score = (amount >= health ? -value * 3 : -amount * 0.5) + wound;
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
 * Scores + picks a target for a `buff` effect with a chosen target: like scoreGrantKeywordSpell,
 * a buff benefits whoever receives it, so this prefers the AI's own biggest surviving minion —
 * magnitude (attack+health) weighted the same way as estimateEffectValue's own non-chosen buff
 * case, plus the same stats*0.2 tiebreaker scoreGrantKeywordSpell uses to favor an already-bigger
 * minion. Same -Infinity sentinel + enemy-board fallback as scoreGrantKeywordSpell, so a card
 * whose own value (e.g. Forced Coronation's paired silence) is still worth playing doesn't
 * soft-lock AwaitingTarget when the AI's board is empty.
 */
function scoreBuffSpell(
    state: GameState,
    aiId: PlayerId,
    attack: number,
    health: number,
    restriction?: ChosenTargetRestriction,
    duration?: number
): ScoredTarget {
    const enemy = state.players[opponentOf(aiId)];
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);
    const magnitude = (attack + health) * (duration ? TEMPORARY_EFFECT_DISCOUNT : 1);

    let best: ScoredTarget = { score: -Infinity };
    for (const minion of ai.board.filter(isTargetable).filter(matchesTribe)) {
        const stats = (minion.currentAttack ?? 0) + (minion.currentHealth ?? 0);
        const score = magnitude * 2 + stats * 0.2;
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    if (restrictsToMinion(restriction) && best.targetId === undefined) {
        for (const minion of enemy.board.filter(isTargetable).filter(matchesTribe)) {
            const score = -magnitude; // buffing the enemy is a genuine cost, not a freebie
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
 * Scores + picks a target for a minion-restricted `destroy` effect: prefer the enemy's most
 * valuable minion by full stats, weighted as a guaranteed kill (mirrors scoreDamageSpell's own
 * "amount >= health" kill weighting, since destroy always kills regardless of health/Divine
 * Shield). Same own-board fallback and -Infinity sentinel as scoreFreezeSpell/scoreSilenceSpell.
 */
function scoreDestroySpell(state: GameState, aiId: PlayerId, restriction?: ChosenTargetRestriction): ScoredTarget {
    const enemy = state.players[opponentOf(aiId)];
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);

    let best: ScoredTarget = { score: -Infinity };
    for (const minion of enemy.board.filter(isTargetable).filter(matchesTribe)) {
        const score = ((minion.currentAttack ?? 0) + (minion.currentHealth ?? 0)) * 3;
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    if (restrictsToMinion(restriction) && best.targetId === undefined) {
        for (const minion of ai.board.filter(isTargetable).filter(matchesTribe)) {
            const score = -((minion.currentAttack ?? 0) + (minion.currentHealth ?? 0)) * 3;
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

/**
 * Scores + picks a target for a `grantKeyword` effect: unlike scoreFreeze/Silence/DestroySpell
 * (removal effects that hunt the *enemy* board), granting a keyword benefits whoever receives it,
 * so this prefers the AI's own best surviving minion that doesn't already have the keyword
 * (nothing to gain re-granting Divine Shield to a minion that already has it). Same -Infinity
 * sentinel as the other scoreXSpell functions, but the roles are flipped for the own-board
 * fallback: since there's no legal target here that's actively *good* for the AI when its own
 * board is empty, the fallback searches the enemy board instead (a genuine cost, mirroring how
 * scoreDamageSpell's fallback treats hitting your own minion as a cost) purely so a card whose
 * own stats/other effects are still worth playing doesn't get stuck in AwaitingTarget with no
 * resolvable target at all.
 */
function scoreGrantKeywordSpell(
    state: GameState,
    aiId: PlayerId,
    keyword: Keyword,
    restriction?: ChosenTargetRestriction,
    duration?: number
): ScoredTarget {
    const enemy = state.players[opponentOf(aiId)];
    const ai = state.players[aiId];
    const tribe = restrictionTribe(restriction);
    const matchesTribe = (minion: CardInstance) => !tribe || minionHasTribe(CARD_DEFINITIONS[minion.definitionId], tribe);
    const value = KEYWORD_VALUE[keyword] * (duration ? TEMPORARY_EFFECT_DISCOUNT : 1);

    let best: ScoredTarget = { score: -Infinity };
    for (const minion of ai.board.filter(isTargetable).filter(matchesTribe)) {
        if (minion.keywords.has(keyword)) continue; // already has it — nothing to gain
        const stats = (minion.currentAttack ?? 0) + (minion.currentHealth ?? 0);
        const score = value * 2 + stats * 0.2;
        if (score > best.score) best = { score, targetId: minion.instanceId };
    }

    if (restrictsToMinion(restriction) && best.targetId === undefined) {
        for (const minion of enemy.board.filter(isTargetable).filter(matchesTribe)) {
            const score = -value; // handing the enemy a keyword is a genuine cost, not a freebie
            if (score > best.score) best = { score, targetId: minion.instanceId };
        }
    }

    return best;
}

/**
 * Scores + picks target(s) for `attacker`'s own `onAttack` effect(s) (e.g. Nythis's "When Nythis
 * attacks, destroy target minion") — separate from scoreAttack's combat-trade math below, since
 * these fire unconditionally on declaring the attack regardless of who's being attacked (see
 * TurnStateMachine.executeAttack). Callers add this to the relevant scoreAttack result — see
 * OpponentAI.decideOpponentAction. The actual target isn't picked here (see decideOpponentTarget).
 * A silenced attacker's onAttack effects never fire (see TurnStateMachine.triggerEffects' guard),
 * so nothing is scored for one.
 */
export function scoreAttackTriggers(state: GameState, aiId: PlayerId, attacker: CardInstance, lethalAvailable: boolean): number {
    if (attacker.silenced) return 0;
    const definition = CARD_DEFINITIONS[attacker.definitionId];
    const onAttackEffects = definition?.effects?.filter((e) => e.trigger === 'onAttack') ?? [];

    return onAttackEffects.reduce(
        (sum, effect) =>
            momentumSatisfied(effect, state.players[aiId])
                ? sum + chosenAwareActionsValue(effect.actions, state, aiId, lethalAvailable, attacker.instanceId)
                : sum,
        0
    );
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
    // Raw (pre-Initiative-skip) lethality, captured before the mutations below — used only to work
    // out which swings actually land (see attackerTakesHit/targetTakesHit), independent of whether
    // a landed swing proves lethal.
    const rawDefenderDies = defenderDies;
    const rawAttackerDies = attackerDies;
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
    // Mourn (onFriendlyMinionDeath): the attacker's own death (if this trade kills it) also fires Mourn on
    // the rest of the AI's board — a best-effort nudge to the trade math, not full lookahead.
    const mournBonus = attackerDies ? mournBoardValue(state, aiId, attacker.instanceId) : 0;

    // Wound (onDamaged) fires pre-death on any landed, unshielded hit — including a lethal one —
    // so it's evaluated off whether each swing actually lands, not off the dies flags above (an
    // Initiative-skipped swing never lands at all, but a landed non-lethal or lethal swing both
    // fire it). Mirrors TurnStateMachine.executeAttack's exact resolution order: attackerTakesHit
    // is target's return swing landing on attacker (skipped only when attacker alone has Initiative
    // and its hit was raw-lethal); targetTakesHit is attacker's own swing landing on target
    // (skipped only when target alone has Initiative and its first hit was raw-lethal).
    const attackerTakesHit = !(rawDefenderDies && attackerHasInitiative && !targetHasInitiative);
    const targetTakesHit = !(rawAttackerDies && targetHasInitiative && !attackerHasInitiative);
    const targetWounded = targetTakesHit && attackerAttack > 0 && !hasKeyword(target, 'divineShield');
    const attackerWounded = attackerTakesHit && targetAttack > 0 && !hasKeyword(attacker, 'divineShield');
    const woundBonus = (targetWounded ? woundValue(state, aiId, target) : 0) + (attackerWounded ? woundValue(state, aiId, attacker) : 0);

    const attackerValue = attackerAttack + attackerHealth;
    const targetValue = targetAttack + targetHealth;

    if (defenderDies && !attackerDies) return targetValue * 3 + lifestealBonus + woundBonus; // clean kill, keep the attacker
    if (defenderDies && attackerDies) return targetValue - attackerValue + 5 + lifestealBonus + mournBonus + woundBonus; // even trade, favor when the defender was worth more
    if (!defenderDies && !attackerDies) return -2 + woundBonus; // pointless chip damage (or a Divine Shield pop with no other upside)
    return -10 + mournBonus + woundBonus; // suicidal — attacker dies for nothing (partially offset if it Mourns)
}
