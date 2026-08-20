import { CARD_DEFINITIONS } from '../data/cards';
import { createCardInstance } from '../data/cardFactory';
import { EventBus } from '../EventBus';
import type { CardAura, CardEffect, CardInstance, ChosenTargetRestriction, EffectAction, EffectTrigger, Keyword, TargetSelector, Tribe } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState, PendingTarget, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';
import { canAffordAetherCost, countUntappedPlain, payGenericAether, untapAllAether } from './aether';
import { resolveEffectValue } from './counters';
import { canDeclareAttack, hasKeyword, isTargetable, tauntRestrictedTargets } from './keywordRules';
import { chosenSideOf, isChosenTarget, minionHasTribe, restrictionTribe } from './tribes';

type PendingAction =
    | { type: 'playCard'; instanceId: string }
    | { type: 'attack'; attackerInstanceId: string }
    | { type: 'ability'; instanceId: string; abilityIndex: number }
    | { type: 'endTurn' }
    | { type: 'startTurn' };

/** Consumed left-to-right as triggerEffects/executeAbility walk a block's actions[] in order —
 * see collectPendingPrompts, which builds `ids` in that same traversal order up front.
 * `last` is the most recently resolved *real* (non-reuseTarget) chosen id, for `reuseTarget`
 * actions to read instead of consuming another entry from `ids`. */
type ChosenTargetCursor = { ids: string[]; index: number; last?: string };

/** One still-to-prompt-for chosen target: which source card it belongs to (so the collected id
 * can be routed back to the right per-source ChosenTargetCursor once targeting finishes — see
 * buildCursorMap) and the actual EffectAction generating it (so the UI/AI know what this prompt
 * is, not just its restriction). Built once per beginTargeting call by collectPendingPrompts, in
 * the exact order triggerEffects/triggerBoardWide will later walk them for real. Source order
 * matters for a *different* reason than within a single source's own actions[]: an earlier
 * source's own chosen action (e.g. a spell's own onPlay destroy) can make a later pre-walked
 * source ineligible (dead or silenced) by the time its own trigger actually fires — see SPEC.md's
 * "Board-wide chosen-target triggers" note. Keying the real cursor by source (buildCursorMap),
 * rather than one shared flat FIFO, means that only wastes that one source's own reserved
 * target(s) rather than desyncing every other source's. */
type PendingPrompt = { sourceInstanceId: string; action: Extract<EffectAction, { target: TargetSelector }> };

/** What a suspended Tier-2 resolution generator yields when it hits a `target: 'chosen'` action
 * with no answer already pre-walked into a ChosenTargetCursor — see resolveChosenTargetId,
 * driveResolution. Tier-1 triggers (a card's own onPlay/ability/onAttack, and the board-wide
 * Channel/Muster/Vigil/Curfew reactions) never yield one of these: their answers are always fully
 * collected up front by collectPendingPrompts before resolution starts, so resolveChosenTargetId's
 * fast (cursor-already-has-it) path always applies. onDeath/onDamaged/onFriendlyMinionDeath fire
 * from inside sweepDeaths/dealDamage instead, where the full set of firing sources can only be
 * discovered by resolving an earlier chosen target for real — hence the yield/resume mechanism.
 * `ownerId` is the dying/damaged card's controller, which is who actually gets to answer — it can
 * differ from gameState.activePlayer (e.g. the opponent's attack killing the human's own minion),
 * so it has to travel with the request rather than being inferred downstream. */
type TargetRequest = { sourceInstanceId: string; action: Extract<EffectAction, { target: TargetSelector }>; validTargetIds: string[]; ownerId: PlayerId };

/**
 * Pure game-state driver, no Phaser dependency. A Scene forwards player input into
 * playCard/declareAttack/selectTarget/endTurn and listens on EventBus for the
 * 'state:*' events to re-render and sequence animations. RESOLVING is entered and left
 * synchronously here — a Scene wanting to gate input on an animation should track its
 * own "isAnimating" flag off those events rather than relying on the phase value.
 */
export class TurnStateMachine {
    private static readonly MAX_BOARD_SIZE = 7;

    private gameState: GameState;
    private pendingAction?: PendingAction;
    /** Ordered prompts still to come, and the ids already resolved so far — see
     * beginTargeting/collectPendingPrompts. Reset on every beginTargeting call. */
    private pendingPrompts: PendingPrompt[] = [];
    private pendingChosenTargets: string[] = [];
    /** For a pending 'attack' action only: undefined while the attack's own target (who Nythis
     * hits) is still being chosen, then set once it is — distinguishing that fixed first step from
     * any chosen-target onAttack steps (e.g. Nythis's destroy) that follow it. See
     * currentPendingTarget/selectTarget. */
    private pendingAttackTargetId?: string;
    /** The one in-flight, paused Tier-2 resolution generator, if any — set only while an
     * onDeath/onDamaged/onFriendlyMinionDeath trigger is suspended mid-cascade awaiting a chosen
     * target that couldn't be pre-walked (see resolveChosenTargetId). Undefined the rest of the
     * time, including throughout every Tier-1 (pendingPrompts-driven) targeting flow — selectTarget
     * checks this first to decide which mechanism a click should resume. See driveResolution. */
    private activeResolution?: Generator<TargetRequest, void, string>;

    constructor(initialState: GameState) {
        this.gameState = initialState;
    }

    get state(): Readonly<GameState> {
        return this.gameState;
    }

    /** Draws opening hands and starts the first turn. Both players draw the same amount — no mulligan/coin mechanic. */
    startGame(openingHandSize = 3): void {
        for (const playerId of Object.keys(this.gameState.players) as PlayerId[]) {
            for (let i = 0; i < openingHandSize; i++) {
                this.drawCard(playerId);
            }
        }
        this.beginStartTurn(this.gameState.activePlayer);
    }

    playCard(instanceId: string): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) {
            console.log(`[TurnStateMachine] playCard rejected: wrong phase (${this.gameState.phase})`, { instanceId });
            return;
        }

        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.hand.find((c) => c.instanceId === instanceId);
        if (!card) {
            console.log('[TurnStateMachine] playCard rejected: card not in hand', { instanceId, playerId: player.id });
            return;
        }

        const definition = CARD_DEFINITIONS[card.definitionId];
        // Aether cards have their own play method (playAetherCard) — no cost, no targeting, goes
        // to aetherInPlay instead of board/graveyard. Reject here rather than let it fall through.
        if (!definition || definition.type === 'aether' || !canAffordAetherCost(player, definition.cost)) {
            console.log('[TurnStateMachine] playCard rejected: unaffordable or wrong type', { instanceId, definitionId: card.definitionId, cost: definition?.cost, type: definition?.type });
            return;
        }

        if (this.collectPendingPrompts({ type: 'playCard', instanceId }, player.id).length > 0) {
            console.log('[TurnStateMachine] playCard needs target, entering AwaitingTarget', { instanceId, definitionId: card.definitionId });
            this.beginTargeting({ type: 'playCard', instanceId }, player.id);
            return;
        }

        console.log('[TurnStateMachine] playCard', { instanceId, definitionId: card.definitionId, playerId: player.id, cost: definition.cost });
        this.driveResolution(this.executePlayCard(instanceId));
    }

    /** Optional, at most once per turn — the "may draw an Aether" half of the turn's draw step
     * (the Main Deck draw in beginStartTurn is mandatory and unconditional; this is a separate,
     * player-initiated action). Reuses drawCard's own 'state:card-drawn' emit (same idiom
     * debugAddCard already established: any card entering hand from *somewhere*, not just the
     * Main Deck, plays the same fly-to-hand animation) rather than a bespoke event — the Aether
     * card then sits in hand like any other card until playAetherCard moves it out. No
     * 'state:phase-change' fires (this isn't a phase transition), so the caller must trigger its
     * own re-render, same as debugAddCard's callers already do. */
    drawAether(playerId: PlayerId): void {
        if (this.gameState.phase !== TurnPhase.MainIdle || this.gameState.activePlayer !== playerId) {
            console.log(`[TurnStateMachine] drawAether rejected: wrong phase/turn (${this.gameState.phase})`, { playerId });
            return;
        }

        const player = this.gameState.players[playerId];
        if (player.aetherDrawnThisTurn) {
            console.log('[TurnStateMachine] drawAether rejected: already drawn this turn', { playerId });
            return;
        }

        const card = player.aetherDeck.pop();
        if (!card) {
            console.log('[TurnStateMachine] drawAether rejected: Aether Deck empty', { playerId });
            return;
        }
        card.zone = 'hand';
        player.hand.push(card);
        player.aetherDrawnThisTurn = true;
        EventBus.emit('state:card-drawn', { playerId, instanceId: card.instanceId });
    }

    /** Plays an Aether card out of hand into aetherInPlay — at most one per turn, mirrors Magic's
     * one-land-per-turn. Deliberately synchronous (no generator/targeting machinery): Aether
     * cards have no cost, no effects, no onPlay trigger this pass — they just change zone and,
     * for an elemental category, enter tapped. No 'state:phase-change' fires here either — same
     * caller-must-re-render note as drawAether. */
    playAetherCard(instanceId: string): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) {
            console.log(`[TurnStateMachine] playAetherCard rejected: wrong phase (${this.gameState.phase})`, { instanceId });
            return;
        }

        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.hand.find((c) => c.instanceId === instanceId);
        if (!card) {
            console.log('[TurnStateMachine] playAetherCard rejected: card not in hand', { instanceId });
            return;
        }

        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition || definition.type !== 'aether') {
            console.log('[TurnStateMachine] playAetherCard rejected: not an Aether card', { instanceId, type: definition?.type });
            return;
        }

        if (player.aetherPlayedThisTurn) {
            console.log('[TurnStateMachine] playAetherCard rejected: already played this turn', { instanceId });
            return;
        }

        player.hand = player.hand.filter((c) => c.instanceId !== instanceId);
        card.zone = 'aetherInPlay';
        card.tapped = definition.aetherCategory !== 'generic';
        player.aetherInPlay.push(card);
        player.aetherPlayedThisTurn = true;
        console.log('[TurnStateMachine] playAetherCard', { instanceId, definitionId: card.definitionId, playerId: player.id, tapped: card.tapped });
        EventBus.emit('state:aether-played', { instanceId, playerId: player.id });
    }

    declareAttack(attackerInstanceId: string): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) {
            console.log(`[TurnStateMachine] declareAttack rejected: wrong phase (${this.gameState.phase})`, { attackerInstanceId });
            return;
        }

        const player = this.gameState.players[this.gameState.activePlayer];
        const attacker = player.board.find((c) => c.instanceId === attackerInstanceId);
        if (!attacker || !canDeclareAttack(attacker)) {
            console.log('[TurnStateMachine] declareAttack rejected: not eligible to attack', { attackerInstanceId, found: !!attacker });
            return;
        }

        console.log('[TurnStateMachine] declareAttack, entering AwaitingTarget', { attackerInstanceId, playerId: player.id });
        this.beginTargeting({ type: 'attack', attackerInstanceId }, player.id);
    }

    /** Pays a board minion's paid-ability generic-Aether cost and resolves its action — see PaidAbility's
     * doc comment (Card.ts) for why this is deliberately unrestricted by summoning sickness/attack
     * state, unlike declareAttack. Silenced minions can't activate (their own text is suppressed,
     * same principle as CardInstance.silenced already applies to trigger effects). */
    activateAbility(instanceId: string, abilityIndex: number): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) {
            console.log(`[TurnStateMachine] activateAbility rejected: wrong phase (${this.gameState.phase})`, { instanceId, abilityIndex });
            return;
        }

        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.board.find((c) => c.instanceId === instanceId);
        if (!card || card.silenced) {
            console.log('[TurnStateMachine] activateAbility rejected: not found or silenced', { instanceId, abilityIndex, found: !!card, silenced: card?.silenced });
            return;
        }

        const definition = CARD_DEFINITIONS[card.definitionId];
        const ability = definition?.paidAbilities?.[abilityIndex];
        if (!ability || countUntappedPlain(player) < ability.cost) {
            console.log('[TurnStateMachine] activateAbility rejected: unaffordable or missing', { instanceId, abilityIndex, cost: ability?.cost });
            return;
        }

        if (this.collectPendingPrompts({ type: 'ability', instanceId, abilityIndex }, player.id).length > 0) {
            console.log('[TurnStateMachine] activateAbility needs target, entering AwaitingTarget', { instanceId, abilityIndex });
            this.beginTargeting({ type: 'ability', instanceId, abilityIndex }, player.id);
            return;
        }

        console.log('[TurnStateMachine] activateAbility', { instanceId, abilityIndex, playerId: player.id, cost: ability.cost });
        this.driveResolution(this.executeAbility(instanceId, abilityIndex));
    }

    selectTarget(targetId: string): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget) {
            console.log(`[TurnStateMachine] selectTarget rejected: not awaiting target (phase ${this.gameState.phase})`, { targetId });
            return;
        }
        if (!this.gameState.pendingTarget?.validTargetIds.includes(targetId)) {
            console.log('[TurnStateMachine] selectTarget rejected: not a valid target', { targetId, validTargetIds: this.gameState.pendingTarget?.validTargetIds });
            return;
        }

        if (this.activeResolution) {
            // A Tier-2 (onDeath/onDamaged/onFriendlyMinionDeath) prompt raised mid-cascade — resume
            // the paused generator with this answer directly, bypassing the Tier-1 pendingAction/
            // pendingPrompts machinery below entirely (this flow never used it — see beginTargeting).
            console.log('[TurnStateMachine] selectTarget (resolution)', { targetId });
            this.driveResolution(this.activeResolution, targetId);
            return;
        }

        if (!this.pendingAction) {
            console.log('[TurnStateMachine] selectTarget rejected: no pending action', { targetId });
            return;
        }

        console.log('[TurnStateMachine] selectTarget', { targetId, pendingAction: this.pendingAction });
        const action = this.pendingAction;
        if (action.type === 'attack') {
            if (this.pendingAttackTargetId === undefined) {
                // Step 1: who Nythis (or any attacker) hits. If its onAttack effect(s) also need a
                // chosen target (see collectPendingPrompts), stay in AwaitingTarget and advance to
                // that step instead of resolving immediately.
                this.pendingAttackTargetId = targetId;
                if (this.pendingPrompts.length > 0) {
                    this.gameState.pendingTarget = this.currentPendingTarget(action, this.gameState.activePlayer);
                    this.setPhase(TurnPhase.AwaitingTarget);
                    return;
                }
                this.driveResolution(this.executeAttack(action.attackerInstanceId, targetId));
                return;
            }

            // Step 2+: the attacker's own chosen-target onAttack effect(s) (e.g. Nythis's destroy).
            this.pendingChosenTargets.push(targetId);
            if (this.pendingChosenTargets.length < this.pendingPrompts.length) {
                this.gameState.pendingTarget = this.currentPendingTarget(action, this.gameState.activePlayer);
                this.setPhase(TurnPhase.AwaitingTarget);
                return;
            }
            this.driveResolution(this.executeAttack(action.attackerInstanceId, this.pendingAttackTargetId, this.buildCursorMap(this.pendingChosenTargets)));
            return;
        }

        this.pendingChosenTargets.push(targetId);
        if (this.pendingChosenTargets.length < this.pendingPrompts.length) {
            // More prompts still need their own target — stay in AwaitingTarget and re-prompt for
            // the next one. setPhase always re-emits 'state:phase-change' even when the phase
            // value doesn't change, so the Scene still re-renders with the next step's
            // valid-target highlighting.
            this.gameState.pendingTarget = this.currentPendingTarget(action, this.gameState.activePlayer);
            this.setPhase(TurnPhase.AwaitingTarget);
            return;
        }

        const cursors = this.buildCursorMap(this.pendingChosenTargets);
        if (action.type === 'playCard') {
            this.driveResolution(this.executePlayCard(action.instanceId, cursors));
        } else if (action.type === 'ability') {
            this.driveResolution(this.executeAbility(action.instanceId, action.abilityIndex, cursors));
        } else if (action.type === 'endTurn') {
            this.driveResolution(this.executeEndTurn(cursors));
        } else {
            this.driveResolution(this.executeStartTurn(cursors));
        }
    }

    cancelTarget(): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget) return;
        if (this.gameState.pendingTarget?.cancellable === false) {
            console.log('[TurnStateMachine] cancelTarget rejected: not cancellable at this step');
            return;
        }
        const pendingAction = this.pendingAction;
        const activePlayerId = this.gameState.activePlayer;
        console.log('[TurnStateMachine] cancelTarget', { pendingAction });
        this.pendingAction = undefined;
        this.gameState.pendingTarget = undefined;
        this.pendingPrompts = [];
        this.pendingChosenTargets = [];
        this.pendingAttackTargetId = undefined;
        // Only a card pulled out of hand (not an attacker choosing its target) gets the Scene's
        // held-at-spotlight treatment — see beginTargeting's matching emit below.
        if (pendingAction?.type === 'playCard') {
            EventBus.emit('state:target-cancelled', { instanceId: pendingAction.instanceId, playerId: activePlayerId });
        }
        this.setPhase(TurnPhase.MainIdle);
    }

    endTurn(): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) {
            console.log(`[TurnStateMachine] endTurn rejected: wrong phase (${this.gameState.phase})`);
            return;
        }
        const player = this.gameState.players[this.gameState.activePlayer];

        if (this.collectPendingPrompts({ type: 'endTurn' }, player.id).length > 0) {
            console.log('[TurnStateMachine] endTurn needs target (Curfew), entering AwaitingTarget', { playerId: player.id });
            this.beginTargeting({ type: 'endTurn' }, player.id);
            return;
        }

        console.log('[TurnStateMachine] endTurn', { playerId: player.id, turnNumber: this.gameState.turnNumber });
        this.driveResolution(this.executeEndTurn(new Map()));
    }

    /** Curfew (endOfTurn) resolves here, once any of its own chosen targets are already in hand —
     * see endTurn. Ends by handing off to beginStartTurn for the new active player's own Vigil
     * (startOfTurn) targeting phase, chained the same way. A generator (see driveResolution) since
     * triggerBoardWide/sweepDeaths can now suspend mid-resolution for a Tier-2 chosen target — the
     * plain `beginStartTurn` call at the tail is a nested, independent resolution of its own, not
     * part of this generator's own yield* chain (see driveResolution's doc comment on why its
     * `done` handling has to tolerate that). */
    private *executeEndTurn(cursors: Map<string, ChosenTargetCursor>): Generator<TargetRequest, void, string> {
        const player = this.gameState.players[this.gameState.activePlayer];
        this.setPhase(TurnPhase.TurnEnd);
        yield* this.triggerBoardWide('endOfTurn', player.id, player.board, cursors);
        for (const card of player.board) {
            // A minion frozen on an earlier turn only reaches this point once its own controller's
            // turn (the one it was blocked for) is ending — see keywordRules.canDeclareAttack.
            card.frozen = false;
        }
        this.tickTemporaryEffects();
        yield* this.sweepDeaths();
        // Catch-all (see recalculateAuras' doc comment) — endOfTurn effects can change a counter
        // without any minion dying.
        this.recalculateAuras();

        this.gameState.activePlayer = this.opponentOf(player.id);
        this.gameState.turnNumber += 1;
        this.beginStartTurn(this.gameState.activePlayer);
    }

    // --- resolution ---------------------------------------------------------

    private *executePlayCard(instanceId: string, cursors: Map<string, ChosenTargetCursor> = new Map()): Generator<TargetRequest, void, string> {
        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.hand.find((c) => c.instanceId === instanceId);
        if (!card) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition) return;

        payGenericAether(player, definition.cost?.generic ?? 0);
        player.hand = player.hand.filter((c) => c.instanceId !== instanceId);

        if (definition.type === 'minion' || definition.type === 'token') {
            card.summoningSick = true;
            card.attacksThisTurn = 0;
            if (player.board.length < TurnStateMachine.MAX_BOARD_SIZE) {
                card.zone = 'board';
                player.board.push(card);
                this.recalculateAuras();
            } else {
                // Board full: the minion is discarded rather than played, since it has nowhere to be summoned.
                this.moveToGraveyard(card, player);
            }
        } else {
            this.moveToGraveyard(card, player);
        }

        this.setPhase(TurnPhase.Resolving);
        // Emitted here, before any yield point below, rather than at this generator's tail (where
        // it used to sit, alongside finishResolving) — see executeAttack's matching comment for why:
        // CardGame's cardPlayedHandler needs to flip the Scene's isAnimating flag true before
        // onPlay/Channel/Muster's own onDeath/onDamaged cascade gets a chance to suspend this
        // generator for a Tier-2 chosen target, or requestRender()'s fallback flush hijacks the
        // card's own play animation out from under it once phase flips to AwaitingTarget.
        EventBus.emit('state:card-played', { instanceId, playerId: player.id });
        yield* this.triggerEffects(card, 'onPlay', player.id, cursors.get(instanceId));
        // Counted after this card's own onPlay resolves (so a Momentum effect on the card itself
        // reads "how many were played before it"), but before Channel fires below (so a Channel
        // minion's own Momentum condition correctly counts this card as already played).
        player.cardsPlayedThisTurn += 1;
        yield* this.sweepDeaths();
        if (definition.type !== 'minion' && definition.type !== 'token') {
            // Channel (onSpellCast) — every minion on the caster's own board with a matching
            // effect reacts, distinct from the single-instance onPlay trigger just fired above.
            yield* this.triggerBoardWide('onSpellCast', player.id, player.board, cursors);
            yield* this.sweepDeaths();
        } else {
            // Muster (onFriendlyMinionCast) — the mirror image of Channel above, for casting a minion
            // instead of a spell. The played minion is already sitting in player.board by this
            // point (pushed above), so it's filtered out here — otherwise it would react to its
            // own cast, which is exactly what the single-instance onPlay trigger already covers.
            yield* this.triggerBoardWide('onFriendlyMinionCast', player.id, player.board.filter((c) => c.instanceId !== card.instanceId), cursors);
            yield* this.sweepDeaths();
        }
        // Catch-all: keeps any dynamic-counter aura (e.g. "+1/+1 per Demon you control") correct
        // even when this action changed a counter (hand/graveyard/deck size, hero health) without
        // changing board membership — the internal calls above only cover membership changes.
        this.recalculateAuras();
        this.finishResolving();
    }

    /** Resolves an already-affordability-checked paid ability. Generic Aether is tapped here (not in
     * activateAbility), matching executePlayCard's pattern so cancelTarget() stays free while a
     * target is still being chosen. Doesn't touch cardsPlayedThisTurn (not "playing a card", so it
     * shouldn't feed Momentum) and doesn't call triggerEffects (no onPlay/Channel/Muster — those
     * are for cards entering play, not an already-in-play minion's activated ability). */
    private *executeAbility(instanceId: string, abilityIndex: number, cursors: Map<string, ChosenTargetCursor> = new Map()): Generator<TargetRequest, void, string> {
        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.board.find((c) => c.instanceId === instanceId);
        if (!card) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        const ability = definition?.paidAbilities?.[abilityIndex];
        if (!ability) return;

        payGenericAether(player, ability.cost);

        this.setPhase(TurnPhase.Resolving);
        const cursor: ChosenTargetCursor = cursors.get(instanceId) ?? { ids: [], index: 0 };
        for (const action of ability.actions) {
            const chosenTargetId = yield* this.resolveChosenTargetId(card.instanceId, action, player.id, cursor);
            yield* this.applyEffectAction(action, player.id, card.instanceId, chosenTargetId);
        }
        yield* this.sweepDeaths();
        this.recalculateAuras();
        EventBus.emit('state:ability-activated', { instanceId, abilityIndex, playerId: player.id });
        this.finishResolving();
    }

    private *executeAttack(attackerInstanceId: string, targetId: string, cursors: Map<string, ChosenTargetCursor> = new Map()): Generator<TargetRequest, void, string> {
        const player = this.gameState.players[this.gameState.activePlayer];
        const attacker = player.board.find((c) => c.instanceId === attackerInstanceId);
        if (!attacker) return;

        console.log('[TurnStateMachine] executeAttack', { attackerInstanceId, targetId, attack: attacker.currentAttack, health: attacker.currentHealth });
        this.setPhase(TurnPhase.Resolving);
        // Emitted here, before any yield point below, rather than at this generator's tail (where
        // it used to sit, alongside finishResolving) — CardGame's attackHandler enqueues the lunge/
        // hit/death-fade animation synchronously off this event, which flips the Scene's isAnimating
        // flag true before returning. That has to happen before onDamaged (inside resolveCombatHit's
        // dealDamage) or onDeath (sweepDeaths) gets a chance to suspend this generator for a Tier-2
        // chosen target (e.g. this attacker's own Deathcry) — otherwise the resulting AwaitingTarget
        // phase-change reaches CardGame's requestRender() while isAnimating is still false, and its
        // fallback flush (meant for actions with no animation of their own) hijacks the buffered
        // damage/death events out from under the attack animation, skipping the lunge entirely. See
        // CardGame/index.ts's requestRender/attackHandler.
        EventBus.emit('state:attack', { attackerInstanceId, targetId });
        attacker.attacksThisTurn += 1;
        // Veiled is lost the instant this minion attacks, mirroring how divineShield is consumed
        // in dealDamage. Strike (onAttack) fires unconditionally here, before any damage resolves
        // either way, so it's unaffected by whether the hit lands or either side survives it.
        attacker.keywords.delete('veiled');
        yield* this.triggerEffects(attacker, 'onAttack', player.id, cursors.get(attackerInstanceId));

        const defender = !this.isPlayerId(targetId) ? this.findMinion(targetId) : undefined;
        // Initiative (MTG's First Strike): the side that ALONE has it hits first, and the other
        // side's return hit is skipped if that first hit is lethal. Both-or-neither falls through
        // to the simultaneous exchange below, matching MTG's own first-strike-vs-first-strike ruling.
        const defenderStrikesFirst = !!defender && hasKeyword(defender.instance, 'initiative') && !hasKeyword(attacker, 'initiative');

        if (defenderStrikesFirst && defender) {
            yield* this.resolveCombatHit(defender.instance, defender.owner.id, attackerInstanceId);
            if ((attacker.currentHealth ?? 0) > 0) {
                yield* this.resolveCombatHit(attacker, player.id, targetId);
            }
        } else {
            yield* this.resolveCombatHit(attacker, player.id, targetId);
            if (defender) {
                const attackerWinsInitiative = hasKeyword(attacker, 'initiative') && !hasKeyword(defender.instance, 'initiative');
                if (!attackerWinsInitiative || (defender.instance.currentHealth ?? 0) > 0) {
                    yield* this.resolveCombatHit(defender.instance, defender.owner.id, attackerInstanceId);
                }
            }
        }

        yield* this.sweepDeaths();
        // Catch-all (see recalculateAuras' doc comment) — combat can change hero health without
        // any minion dying, which sweepDeaths' own internal call wouldn't otherwise catch.
        this.recalculateAuras();
        this.finishResolving();
    }

    /** One side's combat swing (attacker's hit or defender's return hit) plus its Lifesteal/Venom
     * follow-ups — factored out so Initiative can reorder or skip a side's hit in executeAttack
     * without duplicating this logic. */
    private *resolveCombatHit(source: CardInstance, sourceOwnerId: PlayerId, targetId: string): Generator<TargetRequest, void, string> {
        const damageDealt = yield* this.dealDamage(targetId, source.currentAttack ?? 0);
        if (damageDealt > 0 && hasKeyword(source, 'lifesteal')) {
            this.heal(sourceOwnerId, damageDealt);
        }
        if (damageDealt > 0 && hasKeyword(source, 'venom') && !this.isPlayerId(targetId)) {
            this.forceKill(targetId);
        }
    }

    private finishResolving(): void {
        this.pendingAction = undefined;
        this.gameState.pendingTarget = undefined;
        this.pendingAttackTargetId = undefined;
        this.setPhase(TurnPhase.CheckState);
        if (this.checkWinCondition()) return;
        this.setPhase(TurnPhase.MainIdle);
    }

    /** Aether untap/sickness-reset/draw (none of which depend on targeting) up front, then checks
     * whether the new active player's board has a chosen-target Vigil (startOfTurn) effect to
     * prompt for before actually resolving it — see executeStartTurn. */
    private beginStartTurn(playerId: PlayerId): void {
        this.setPhase(TurnPhase.TurnStart);
        const player = this.gameState.players[playerId];
        console.log('[TurnStateMachine] beginStartTurn', { playerId, turnNumber: this.gameState.turnNumber });

        player.cardsPlayedThisTurn = 0;
        player.aetherDrawnThisTurn = false;
        player.aetherPlayedThisTurn = false;
        untapAllAether(player);

        for (const card of player.board) {
            card.summoningSick = false;
            card.attacksThisTurn = 0;
        }

        this.drawCard(playerId);

        if (this.collectPendingPrompts({ type: 'startTurn' }, playerId).length > 0) {
            console.log('[TurnStateMachine] startTurn needs target (Vigil), entering AwaitingTarget', { playerId });
            this.beginTargeting({ type: 'startTurn' }, playerId);
            return;
        }

        this.driveResolution(this.executeStartTurn(new Map()));
    }

    /** Vigil (startOfTurn) resolves here, once any of its own chosen targets are already in hand —
     * see beginStartTurn. Not cancellable (see PendingTarget.cancellable) — by this point Aether has
     * already untapped and a card's already been drawn for the turn, so there's no clean "undo". */
    private *executeStartTurn(cursors: Map<string, ChosenTargetCursor>): Generator<TargetRequest, void, string> {
        const player = this.gameState.players[this.gameState.activePlayer];
        yield* this.triggerBoardWide('startOfTurn', player.id, player.board, cursors);
        yield* this.sweepDeaths();
        // Catch-all — a startOfTurn effect (e.g. hero damage/heal) can change a counter an aura's
        // magnitude depends on without any minion dying.
        this.recalculateAuras();

        if (this.checkWinCondition()) return;
        this.setPhase(TurnPhase.MainIdle);
    }

    private drawCard(playerId: PlayerId): void {
        const player = this.gameState.players[playerId];
        const card = player.deck.pop();
        if (!card) return; // Empty deck: fatigue damage is out of scope for this scaffold.
        card.zone = 'hand';
        player.hand.push(card);
        EventBus.emit('state:card-drawn', { playerId, instanceId: card.instanceId });
    }

    /**
     * Playtesting-only cheat: conjures a brand-new copy of any card definition in the game
     * straight into a player's hand — no deck involvement at all, unlike drawCard. Reuses
     * createCardInstance (the same factory summonMinion uses to conjure a fresh instance onto the
     * board) for a proper fresh instanceId/stats, and drawCard's own 'state:card-drawn' emit so the
     * existing fly-to-hand animation plays unmodified. No phase/turn gating, unlike every other
     * player-facing method here — it's meant to be callable at any time from the debug card-picker
     * overlay. See SPEC.md's "Playtesting-only features" section — remove this (and
     * CardPickerController) before release.
     */
    debugAddCard(playerId: PlayerId, definitionId: string): void {
        const definition = CARD_DEFINITIONS[definitionId];
        if (!definition) return;

        const player = this.gameState.players[playerId];
        const card = createCardInstance(definition, playerId);
        card.zone = 'hand';
        player.hand.push(card);
        EventBus.emit('state:card-drawn', { playerId, instanceId: card.instanceId });
    }

    /**
     * Playtesting-only cheat: conjures a handful of untapped Aether straight into aetherInPlay —
     * five 'generic' (enough to afford most costs at once) plus one of each elemental category —
     * bypassing both the Aether Deck and the normal enters-tapped rule for elemental Aether (a
     * deliberate cheat convenience, not a bug: createCardInstance's tapped default is already
     * `false`, so nothing needs overriding). No phase/turn gating, same as debugAddCard —
     * callable any time from the "Full Aether" button. No event to emit here (unlike
     * debugAddCard/drawCard) since there's no animation tied to an Aether change — CardGame's
     * button callback just calls requestRender() directly to refresh the board/HUD. See SPEC.md's
     * "Playtesting-only features" section — remove this before release.
     */
    debugFillAether(playerId: PlayerId): void {
        const player = this.gameState.players[playerId];
        const ids = ['aether-generic', 'aether-generic', 'aether-generic', 'aether-generic', 'aether-generic', 'aether-fire', 'aether-water', 'aether-earth', 'aether-air'];
        for (const id of ids) {
            const definition = CARD_DEFINITIONS[id];
            if (!definition) continue;
            player.aetherInPlay.push(createCardInstance(definition, playerId, 'aetherInPlay'));
        }
    }

    // --- targeting -----------------------------------------------------------

    private beginTargeting(action: PendingAction, ownerId: PlayerId): void {
        this.pendingAction = action;
        this.pendingChosenTargets = [];
        this.pendingAttackTargetId = undefined;
        this.pendingPrompts = this.collectPendingPrompts(action, ownerId);
        this.gameState.pendingTarget = this.currentPendingTarget(action, ownerId);
        // A card pulled out of hand gets held at the Scene's spotlight while the player picks a
        // target (see CardGame's targetBeginHandler) — an attacker choosing its target never left
        // the board, and neither does a board minion activating a paid ability, so both are
        // excluded here.
        if (action.type === 'playCard') {
            EventBus.emit('state:target-begin', { instanceId: action.instanceId, playerId: ownerId });
        }
        this.setPhase(TurnPhase.AwaitingTarget);
    }

    /** Valid targets (plus step/totalSteps/action/cancellable) for whichever slot targeting is
     * currently on — the attacker's fixed single slot, or the current head of pendingPrompts.
     * Callable both when first entering AwaitingTarget and when advancing to the next prompt
     * within the same action (see selectTarget). */
    private currentPendingTarget(action: PendingAction, ownerId: PlayerId): PendingTarget {
        const cancellable = action.type !== 'startTurn';
        if (action.type === 'attack') {
            const totalSteps = 1 + this.pendingPrompts.length;
            if (this.pendingAttackTargetId === undefined) {
                return {
                    sourceInstanceId: action.attackerInstanceId,
                    validTargetIds: this.computeAttackTargets(ownerId),
                    step: 1,
                    totalSteps,
                    cancellable,
                    ownerId,
                };
            }
            const prompt = this.pendingPrompts[this.pendingChosenTargets.length];
            return {
                sourceInstanceId: prompt.sourceInstanceId,
                validTargetIds: this.computeValidTargetsForRestriction(prompt.action.chosenRestriction, ownerId, chosenSideOf(prompt.action.target)),
                action: prompt.action,
                step: 1 + this.pendingChosenTargets.length + 1,
                totalSteps,
                cancellable,
                ownerId,
            };
        }

        const prompt = this.pendingPrompts[this.pendingChosenTargets.length];
        return {
            sourceInstanceId: prompt.sourceInstanceId,
            validTargetIds: this.computeValidTargetsForRestriction(prompt.action.chosenRestriction, ownerId, chosenSideOf(prompt.action.target)),
            action: prompt.action,
            step: this.pendingChosenTargets.length + 1,
            totalSteps: this.pendingPrompts.length,
            ownerId,
            cancellable,
        };
    }

    private computeAttackTargets(ownerId: PlayerId): string[] {
        const opponentId = this.opponentOf(ownerId);
        const enemyBoard = this.gameState.players[opponentId].board;
        // Veiled minions are folded out inside tauntRestrictedTargets itself, so tauntUp must be
        // derived from its result rather than the raw board — see keywordRules.tauntRestrictedTargets.
        const attackable = tauntRestrictedTargets(enemyBoard);
        const tauntUp = attackable.some((c) => hasKeyword(c, 'taunt'));
        const attackableMinionIds = attackable.map((c) => c.instanceId);
        return tauntUp ? attackableMinionIds : [opponentId, ...attackableMinionIds];
    }

    private computeValidTargetsForRestriction(
        restriction: ChosenTargetRestriction | undefined,
        ownerId: PlayerId,
        side?: 'friendly' | 'enemy'
    ): string[] {
        const opponentId = this.opponentOf(ownerId);
        const friendlyMinions = this.gameState.players[ownerId].board.filter(isTargetable);
        const enemyMinions = this.gameState.players[opponentId].board.filter(isTargetable);
        const minions = side === 'friendly' ? friendlyMinions : side === 'enemy' ? enemyMinions : [...friendlyMinions, ...enemyMinions];
        const heroes = side === 'friendly' ? [ownerId] : side === 'enemy' ? [opponentId] : [ownerId, opponentId];

        const tribe = restrictionTribe(restriction);
        if (tribe) return minions.filter((c) => minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribe)).map((c) => c.instanceId);
        if (restriction === 'minion') return minions.map((c) => c.instanceId);
        if (restriction === 'hero') return heroes;
        return [...heroes, ...minions.map((c) => c.instanceId)];
    }

    /** Every prompt still needed for `action`, in the exact order triggerEffects/triggerBoardWide/
     * executeAbility will later walk them — one prompt per `target: 'chosen'` action, not one
     * prompt shared across a whole block/card (see selectTarget). Deliberately ignores `condition`
     * (Momentum) — a Momentum-gated chosen action still gets prompted for up front even if it goes
     * unused because the condition ends up false at resolution time (see triggerEffects's matching
     * cursor-advance-even-when-skipped comment). A `reuseTarget: true` action is excluded entirely
     * — it isn't its own prompt, it reads the nearest earlier action's resolved id at execution
     * time instead (see ChosenTargetCursor.last).
     *
     * A 'playCard'/'attack' action's own single source (the played card / the attacker) is walked
     * first, exactly as before; 'playCard' additionally walks every OTHER non-silenced board
     * minion's matching board-wide reaction (Channel for a spell, Muster for a minion/token — both
     * read `player.board` before the card is added to it, so no self-exclusion special-casing is
     * needed). 'endTurn'/'startTurn' are pure board-wide passes (Curfew/Vigil respectively) with no
     * single source of their own. A silenced source is skipped everywhere (mirrors triggerEffects'
     * own guard) so nothing prompts for a target that would go unused. */
    private collectPendingPrompts(action: PendingAction, ownerId: PlayerId): PendingPrompt[] {
        const needsPrompt = (a: EffectAction): a is Extract<EffectAction, { target: TargetSelector }> =>
            'target' in a && isChosenTarget(a.target) && !('reuseTarget' in a && a.reuseTarget);
        const promptsFor = (sourceInstanceId: string, effects: CardEffect[] | undefined): PendingPrompt[] =>
            (effects ?? []).flatMap((e) => e.actions).filter(needsPrompt).map((a) => ({ sourceInstanceId, action: a }));
        const boardWidePrompts = (trigger: EffectTrigger, board: CardInstance[]): PendingPrompt[] =>
            board
                .filter((c) => !c.silenced)
                .flatMap((c) => promptsFor(c.instanceId, CARD_DEFINITIONS[c.definitionId]?.effects?.filter((e) => e.trigger === trigger)));

        switch (action.type) {
            case 'ability': {
                const card = this.gameState.players[ownerId].board.find((c) => c.instanceId === action.instanceId);
                const definition = card ? CARD_DEFINITIONS[card.definitionId] : undefined;
                const ability = definition?.paidAbilities?.[action.abilityIndex];
                return (ability?.actions ?? []).filter(needsPrompt).map((a) => ({ sourceInstanceId: action.instanceId, action: a }));
            }
            case 'playCard': {
                const card = this.gameState.players[ownerId].hand.find((c) => c.instanceId === action.instanceId);
                const definition = card ? CARD_DEFINITIONS[card.definitionId] : undefined;
                if (!definition) return [];
                const own = promptsFor(action.instanceId, definition.effects?.filter((e) => e.trigger === 'onPlay'));
                const boardWide =
                    definition.type === 'minion' || definition.type === 'token'
                        ? boardWidePrompts('onFriendlyMinionCast', this.gameState.players[ownerId].board)
                        : boardWidePrompts('onSpellCast', this.gameState.players[ownerId].board);
                return [...own, ...boardWide];
            }
            case 'attack': {
                const attacker = this.gameState.players[ownerId].board.find((c) => c.instanceId === action.attackerInstanceId);
                if (!attacker || attacker.silenced) return [];
                return promptsFor(action.attackerInstanceId, CARD_DEFINITIONS[attacker.definitionId]?.effects?.filter((e) => e.trigger === 'onAttack'));
            }
            case 'endTurn':
                return boardWidePrompts('endOfTurn', this.gameState.players[ownerId].board);
            case 'startTurn':
                return boardWidePrompts('startOfTurn', this.gameState.players[ownerId].board);
        }
    }

    /** Zips the fully-collected `ids` (one per pendingPrompts entry, same order) back apart by
     * source, building the per-source cursor map triggerEffects/triggerBoardWide will consume from
     * — see PendingPrompt's doc comment for why per-source (not one shared FIFO) matters. */
    private buildCursorMap(ids: string[]): Map<string, ChosenTargetCursor> {
        const map = new Map<string, ChosenTargetCursor>();
        this.pendingPrompts.forEach((prompt, i) => {
            const cursor = map.get(prompt.sourceInstanceId) ?? { ids: [], index: 0 };
            cursor.ids.push(ids[i]);
            map.set(prompt.sourceInstanceId, cursor);
        });
        return map;
    }

    // --- effects ---------------------------------------------------------------

    /** A generator (see driveResolution) so a `target: 'chosen'` action with no pre-walked answer
     * (always true for onDeath/onDamaged/onFriendlyMinionDeath — see resolveChosenTargetId) can
     * suspend mid-block for a real one. Defaults `cursor` to a fresh, empty one for exactly that
     * case — every Tier-1 call site already passes its own pre-populated cursor. */
    private *triggerEffects(instance: CardInstance, trigger: EffectTrigger, ownerId: PlayerId, cursor?: ChosenTargetCursor): Generator<TargetRequest, void, string> {
        // Silence permanently suppresses all of this instance's own effects, Deathcry included —
        // one guard here covers every trigger dispatch site, current and future.
        if (instance.silenced) return;
        const definition = CARD_DEFINITIONS[instance.definitionId];
        const effects = definition?.effects?.filter((e) => e.trigger === trigger) ?? [];
        const cardsPlayedThisTurn = this.gameState.players[ownerId].cardsPlayedThisTurn;
        const activeCursor: ChosenTargetCursor = cursor ?? { ids: [], index: 0 };
        for (const effect of effects) {
            // Momentum(N): skip this effect's actions unless at least N cards were already played
            // by its owner earlier this turn — a single choke point, same pattern as the silenced
            // guard above.
            const satisfied = effect.condition?.type !== 'momentum' || cardsPlayedThisTurn >= effect.condition.minCount;
            for (const action of effect.actions) {
                // The chosen-target queue (collectPendingPrompts) is built ignoring Momentum, so
                // the cursor must still advance (for a real, non-reuseTarget chosen action) here even
                // when this block is skipped below — otherwise every chosen action after a skipped
                // Momentum block would silently consume the wrong id.
                const chosenTargetId = yield* this.resolveChosenTargetId(instance.instanceId, action, ownerId, activeCursor);
                if (!satisfied) continue;
                yield* this.applyEffectAction(action, ownerId, instance.instanceId, chosenTargetId);
            }
        }
    }

    /** Resolves (and, for a fresh non-reuseTarget action, advances) `cursor` for one action —
     * shared by triggerEffects and executeAbility so both walk actions[] the same way, and unified
     * across Tier-1 and Tier-2 triggers alike. `cursor.ids`/`index` already fully populated
     * (Tier-1, pre-walked via collectPendingPrompts/buildCursorMap before this call chain started)
     * means the fast path below consumes the next id synchronously without ever yielding, exactly
     * as before Tier-2 existed. A chosen-target action with nothing left pre-walked (always true
     * for Tier-2 — onDeath/onDamaged/onFriendlyMinionDeath fire from inside sweepDeaths/dealDamage,
     * whose firing set can't be known ahead of resolution) computes valid targets fresh against the
     * live board and `yield`s a TargetRequest instead, resuming with the real answer once
     * driveResolution/selectTarget deliver it — same graceful "no legal targets" no-op as today if
     * none exist. Either path writes through the same cursor object, so `reuseTarget: true` actions
     * read `cursor.last` correctly regardless of which path produced it. */
    private *resolveChosenTargetId(sourceInstanceId: string, action: EffectAction, ownerId: PlayerId, cursor: ChosenTargetCursor): Generator<TargetRequest, string | undefined, string> {
        if (!('target' in action) || !isChosenTarget(action.target)) return undefined;
        if ('reuseTarget' in action && action.reuseTarget) return cursor.last;

        if (cursor.index < cursor.ids.length) {
            const chosenTargetId = cursor.ids[cursor.index++];
            cursor.last = chosenTargetId;
            return chosenTargetId;
        }

        const validTargetIds = this.computeValidTargetsForRestriction(action.chosenRestriction, ownerId, chosenSideOf(action.target));
        if (validTargetIds.length === 0) return undefined;
        const chosenTargetId: string = yield { sourceInstanceId, action, validTargetIds, ownerId };
        cursor.ids.push(chosenTargetId);
        cursor.index++;
        cursor.last = chosenTargetId;
        return chosenTargetId;
    }

    /** Fires `trigger` for every minion in `board` via the ordinary single-instance triggerEffects,
     * each looking up its own cursor (if any) from `cursors` by instanceId — the shared shape for
     * board-wide triggers (Channel/onSpellCast, Muster/onFriendlyMinionCast, Vigil/startOfTurn,
     * Curfew/endOfTurn, and Mourn/onFriendlyMinionDeath) that react to another card's event rather
     * than their own. `board` is only used to snapshot which instance ids to walk — each one is
     * re-looked-up fresh via findMinion right before firing, so a source that died from an
     * *earlier* prompt's own resolution during this same walk (Tier-2) or a same-cascade sweep
     * (Tier-1's documented "invalidated pre-walked source" edge case) is correctly skipped rather
     * than firing against stale data. Omitting `cursors` (as sweepDeaths' onDeath/
     * onFriendlyMinionDeath calls do) routes every chosen action through resolveChosenTargetId's
     * live-prompt path instead of silently no-op-ing, per this trigger's Tier-2 wiring. */
    private *triggerBoardWide(trigger: EffectTrigger, ownerId: PlayerId, board: CardInstance[], cursors?: Map<string, ChosenTargetCursor>): Generator<TargetRequest, void, string> {
        for (const instanceId of board.map((c) => c.instanceId)) {
            const instance = this.findMinion(instanceId)?.instance;
            if (!instance) continue;
            yield* this.triggerEffects(instance, trigger, ownerId, cursors?.get(instance.instanceId));
        }
    }

    private *applyEffectAction(action: EffectAction, ownerId: PlayerId, sourceId: string, chosenTargetId?: string): Generator<TargetRequest, void, string> {
        switch (action.kind) {
            case 'damage':
            case 'heal': {
                // Resolved once for the whole action (not re-resolved per target, and not clamped
                // until here) — a counter-based amount could mathematically resolve negative (e.g.
                // a large negative offset), which would silently invert dealDamage into a heal or
                // vice versa without this floor.
                const amount = Math.max(0, resolveEffectValue(action.amount, ownerId, this.gameState));
                const targetIds = this.resolveTargetIds(action.target, ownerId, sourceId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) {
                    if (action.kind === 'damage') yield* this.dealDamage(targetId, amount);
                    else this.heal(targetId, amount);
                }
                break;
            }
            case 'buff': {
                // Not clamped — a negative buff (debuff) is an intentional, already-shipped case.
                const attack = resolveEffectValue(action.attack ?? 0, ownerId, this.gameState);
                const health = resolveEffectValue(action.health ?? 0, ownerId, this.gameState);
                const targetIds = this.resolveTargetIds(action.target, ownerId, sourceId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.buff(targetId, attack, health, action.duration);
                break;
            }
            case 'draw': {
                const count = Math.max(0, resolveEffectValue(action.count, ownerId, this.gameState));
                for (let i = 0; i < count; i++) this.drawCard(ownerId);
                break;
            }
            case 'summon':
                for (let i = 0; i < action.count; i++) this.summonMinion(action.definitionId, ownerId);
                break;
            case 'freeze': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, sourceId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.freezeMinion(targetId);
                break;
            }
            case 'silence': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, sourceId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.silenceMinion(targetId);
                break;
            }
            case 'destroy': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, sourceId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.forceKill(targetId);
                break;
            }
            case 'grantKeyword': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, sourceId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.grantKeyword(targetId, action.keyword, action.duration);
                break;
            }
        }
    }

    private resolveTargetIds(selector: TargetSelector, ownerId: PlayerId, sourceId: string, chosenTargetId?: string, tribeFilter?: Tribe): string[] {
        const opponentId = this.opponentOf(ownerId);
        const matchesTribe = (c: CardInstance) => !tribeFilter || minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribeFilter);
        switch (selector) {
            case 'self':
                return [sourceId];
            case 'friendlyHero':
                return [ownerId];
            case 'enemyHero':
                return [opponentId];
            case 'chosen':
            case 'friendlyChosen':
            case 'enemyChosen':
                return chosenTargetId ? [chosenTargetId] : [];
            case 'allFriendlyMinions':
                return this.gameState.players[ownerId].board.filter(matchesTribe).map((c) => c.instanceId);
            case 'allEnemyMinions':
                return this.gameState.players[opponentId].board.filter(matchesTribe).map((c) => c.instanceId);
            case 'allMinions':
                return [...this.gameState.players[ownerId].board, ...this.gameState.players[opponentId].board]
                    .filter(matchesTribe)
                    .map((c) => c.instanceId);
            case 'allOtherMinions':
                return [...this.gameState.players[ownerId].board, ...this.gameState.players[opponentId].board]
                    .filter(matchesTribe)
                    .filter((c) => c.instanceId !== sourceId)
                    .map((c) => c.instanceId);
            case 'allOtherFriendlyMinions':
                return this.gameState.players[ownerId].board
                    .filter(matchesTribe)
                    .filter((c) => c.instanceId !== sourceId)
                    .map((c) => c.instanceId);
            case 'allHeroes':
                return [ownerId, opponentId];
            default:
                return [];
        }
    }

    private summonMinion(definitionId: string, ownerId: PlayerId): void {
        const definition = CARD_DEFINITIONS[definitionId];
        const player = this.gameState.players[ownerId];
        if (!definition || player.board.length >= TurnStateMachine.MAX_BOARD_SIZE) return;

        const instance = createCardInstance(definition, ownerId);
        instance.zone = 'board';
        instance.summoningSick = true;
        player.board.push(instance);
        this.recalculateAuras();
    }

    // --- damage / death --------------------------------------------------------

    /** Moves a card to its owner's graveyard, resetting a minion's stats back to its definition's base attack/health — a dead or discarded minion shouldn't keep displaying whatever damage/buffs it had at the moment it left play. */
    private moveToGraveyard(card: CardInstance, player: PlayerState): void {
        const definition = CARD_DEFINITIONS[card.definitionId];
        if (definition?.type === 'minion' || definition?.type === 'token') {
            card.currentAttack = definition.attack;
            card.currentHealth = definition.health;
            card.maxHealth = definition.health;
            card.auraAttack = 0;
            card.auraHealth = 0;
            card.auraKeywords.clear();
        }
        card.zone = 'graveyard';
        player.graveyard.push(card);
    }

    /** Returns the amount of damage actually applied (0 if absorbed by Divine Shield), so callers
     * (e.g. Lifesteal) can react to what really landed. A generator (see driveResolution) since
     * the Wound (onDamaged) trigger it fires can suspend for a chosen target. */
    private *dealDamage(targetId: string, amount: number): Generator<TargetRequest, number, string> {
        if (this.isPlayerId(targetId)) {
            const player = this.gameState.players[targetId];
            const before = player.health;
            player.health = Math.max(0, player.health - amount);
            const applied = before - player.health;
            if (applied > 0) EventBus.emit('state:damaged', { targetId });
            return applied;
        }
        const found = this.findMinion(targetId);
        if (!found) return 0;

        if (hasKeyword(found.instance, 'divineShield')) {
            found.instance.keywords.delete('divineShield');
            return 0;
        }
        found.instance.currentHealth = (found.instance.currentHealth ?? 0) - amount;
        // Wound (onDamaged) — a single choke point covering combat and spell damage alike. Fires
        // pre-death: any damage that lands triggers it, even lethal damage that's about to send
        // this minion to sweepDeaths — independent of any follow-up like Venom retroactively
        // killing the same minion afterward (see executeAttack).
        if (amount > 0) {
            yield* this.triggerEffects(found.instance, 'onDamaged', found.owner.id);
            EventBus.emit('state:damaged', { targetId });
        }
        return amount;
    }

    /** Kills a minion outright regardless of remaining health, bypassing Divine Shield entirely (no
     * keyword check at all, unlike dealDamage) — used by Venom (after dealDamage has already
     * confirmed the hit actually landed) and by the `destroy` effect kind. */
    private forceKill(instanceId: string): void {
        const found = this.findMinion(instanceId);
        if (found) found.instance.currentHealth = 0;
    }

    private freezeMinion(targetId: string): void {
        const found = this.findMinion(targetId);
        if (found) found.instance.frozen = true;
    }

    /** Clears the target's keywords (printed and temporarily-granted alike) and permanently
     * suppresses its own future trigger effects — see triggerEffects. Also stops it granting any
     * Aura it has (recalculateAuras skips silenced sources) — a silenced minion *receiving* an aura
     * keeps both the stat bonus and any Keyword the aura grants, matching each other: only what
     * this minion's own text/temporary grants provide is cleared, not what an outside Aura
     * currently supplies (`auraKeywords`, kept as-is here — recalculateAuras owns adding/removing
     * from it as the aura landscape actually changes, not Silence). */
    private silenceMinion(targetId: string): void {
        const found = this.findMinion(targetId);
        if (found) {
            const instance = found.instance;
            instance.keywords = new Set([...instance.keywords].filter((k) => instance.auraKeywords.has(k)));
            instance.silenced = true;
            this.recalculateAuras();
        }
    }

    /** Player healing is uncapped by design (overheal past maxHealth is intentional — see CLAUDE.md). Minion healing caps at currentHealth's tracked ceiling, maxHealth, since a minion has no player-style "overheal" concept. */
    private heal(targetId: string, amount: number): void {
        if (this.isPlayerId(targetId)) {
            const player = this.gameState.players[targetId];
            const before = player.health;
            player.health = player.health + amount;
            if (player.health - before > 0) EventBus.emit('state:healed', { targetId });
            return;
        }
        const found = this.findMinion(targetId);
        if (found) {
            const cap = found.instance.maxHealth ?? found.instance.currentHealth ?? 0;
            const before = found.instance.currentHealth ?? 0;
            found.instance.currentHealth = Math.min(cap, before + amount);
            if ((found.instance.currentHealth ?? 0) - before > 0) EventBus.emit('state:healed', { targetId });
        }
    }

    /** `duration` (in turns) additionally tracks this as a TemporaryEffect for tickTemporaryEffects
     * to reverse later — expiry reuses this same method with negated amounts and no `duration`,
     * relying on the same unclamped-subtraction symmetry a debuff already does. */
    private buff(targetId: string, attack: number, health: number, duration?: number): void {
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.currentAttack = (found.instance.currentAttack ?? 0) + attack;
            found.instance.currentHealth = (found.instance.currentHealth ?? 0) + health;
            // A health buff raises the healing ceiling too, not just current health, so a later heal can restore up to the new buffed max.
            found.instance.maxHealth = (found.instance.maxHealth ?? 0) + health;
            if (duration) found.instance.temporaryEffects.push({ kind: 'buff', attack, health, turnsRemaining: duration });
        }
    }

    private grantKeyword(targetId: string, keyword: Keyword, duration?: number): void {
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.keywords.add(keyword);
            if (duration) found.instance.temporaryEffects.push({ kind: 'keyword', keyword, turnsRemaining: duration });
        }
    }

    /** Whether `aura` (granted by `source`) reaches `recipient` — target selector resolved relative
     * to `source`'s own owner (auras are source-relative, not viewer-relative), plus tribeFilter. A
     * source matching its own aura's criteria buffs itself too, no self-exclusion special-casing —
     * the literal reading of "All Demon you control" — except 'allOtherMinions'/'allOtherFriendlyMinions',
     * the two targets that are deliberately self-excluding by design (the latter is just the
     * single-board version of the former). */
    private auraApplies(aura: CardAura, source: CardInstance, recipient: CardInstance): boolean {
        if (aura.tribeFilter && !minionHasTribe(CARD_DEFINITIONS[recipient.definitionId], aura.tribeFilter)) return false;
        switch (aura.target) {
            case 'allFriendlyMinions':
                return recipient.owner === source.owner;
            case 'allEnemyMinions':
                return recipient.owner !== source.owner;
            case 'allMinions':
                return true;
            case 'allOtherMinions':
                return recipient.instanceId !== source.instanceId;
            case 'allOtherFriendlyMinions':
                return recipient.owner === source.owner && recipient.instanceId !== source.instanceId;
        }
    }

    /** Recomputes every board minion's total *received* aura bonus from scratch and applies just the
     * delta to currentAttack/currentHealth/maxHealth (the same three fields buff() mutates) — there's
     * no stored base stat anywhere at runtime (see CardInstance's doc comments), so a full
     * recompute-and-diff against the previous total (auraAttack/auraHealth) is how a continuously-
     * active Aura stays correct as board membership, silence status, or a live counter it depends on
     * changes. Keywords (auraKeywords) get the same recompute-and-diff treatment as a Set: newly
     * granted keywords are added, and a keyword that's no longer granted is removed *unless* it's
     * still printed on the definition or still covered by a surviving (non-aura) temporary grant —
     * mirrors tickTemporaryEffects' own printed/stillGranted carve-out, so an aura going away never
     * strips a keyword some other legitimate source is still providing. A silenced source contributes
     * nothing (its auras stop granting, stat or keyword alike); a silenced recipient still receives
     * both normally — see silenceMinion's doc comment. Called after every state change that could
     * affect an aura's presence or magnitude: see call sites in executePlayCard, summonMinion,
     * sweepDeaths, silenceMinion, and once more at the end of every public execute-* action / endTurn
     * as a catch-all for counters (e.g. hero health) that can change without a board-membership
     * change. */
    private recalculateAuras(): void {
        const boards = Object.values(this.gameState.players);
        for (const recipientPlayer of boards) {
            for (const recipient of recipientPlayer.board) {
                let newAttack = 0;
                let newHealth = 0;
                const newKeywords = new Set<Keyword>();
                for (const sourcePlayer of boards) {
                    for (const source of sourcePlayer.board) {
                        if (source.silenced) continue;
                        for (const aura of CARD_DEFINITIONS[source.definitionId]?.auras ?? []) {
                            if (!this.auraApplies(aura, source, recipient)) continue;
                            newAttack += resolveEffectValue(aura.attack ?? 0, source.owner, this.gameState);
                            newHealth += resolveEffectValue(aura.health ?? 0, source.owner, this.gameState);
                            for (const keyword of aura.keywords ?? []) newKeywords.add(keyword);
                        }
                    }
                }

                const deltaAttack = newAttack - (recipient.auraAttack ?? 0);
                const deltaHealth = newHealth - (recipient.auraHealth ?? 0);
                if (deltaAttack !== 0 || deltaHealth !== 0) {
                    recipient.currentAttack = (recipient.currentAttack ?? 0) + deltaAttack;
                    recipient.currentHealth = (recipient.currentHealth ?? 0) + deltaHealth;
                    recipient.maxHealth = (recipient.maxHealth ?? 0) + deltaHealth;
                }
                recipient.auraAttack = newAttack;
                recipient.auraHealth = newHealth;

                const recipientDefinition = CARD_DEFINITIONS[recipient.definitionId];
                for (const keyword of newKeywords) {
                    if (!recipient.auraKeywords.has(keyword)) recipient.keywords.add(keyword);
                }
                for (const keyword of recipient.auraKeywords) {
                    if (newKeywords.has(keyword)) continue;
                    const printed = recipientDefinition?.keywords?.includes(keyword) ?? false;
                    const stillGranted = recipient.temporaryEffects.some((e) => e.kind === 'keyword' && e.keyword === keyword);
                    if (!printed && !stillGranted) recipient.keywords.delete(keyword);
                }
                recipient.auraKeywords = newKeywords;
            }
        }
    }

    /** Decrements every board minion's TemporaryEffect list by one turn (called once per endTurn(),
     * either player's, so a duration of N survives N endTurn() calls) and reverses/removes any that
     * hit zero. Sweeps both players' boards, unlike the frozen-clear loop above, since a temporary
     * debuff (e.g. "-1/-1 until end of turn") can legally target an enemy minion as a combat trick.
     * Known limitation: if the same keyword is ever granted to one instance both permanently (no
     * duration) and temporarily, expiring the temporary grant strips the keyword regardless — a
     * permanent grantKeyword call leaves no tracking record to check against. No shipped card does
     * this today. */
    private tickTemporaryEffects(): void {
        for (const player of Object.values(this.gameState.players)) {
            for (const card of player.board) {
                if (card.temporaryEffects.length === 0) continue;
                const decremented = card.temporaryEffects.map((e) => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }));
                const surviving = decremented.filter((e) => e.turnsRemaining > 0);
                const expiring = decremented.filter((e) => e.turnsRemaining <= 0);
                const definition = CARD_DEFINITIONS[card.definitionId];
                for (const effect of expiring) {
                    if (effect.kind === 'buff') {
                        this.buff(card.instanceId, -effect.attack, -effect.health);
                    } else {
                        const printed = definition?.keywords?.includes(effect.keyword) ?? false;
                        const stillGranted = surviving.some((e) => e.kind === 'keyword' && e.keyword === effect.keyword);
                        if (!printed && !stillGranted) card.keywords.delete(effect.keyword);
                    }
                }
                card.temporaryEffects = surviving;
            }
        }
    }

    /** Moves dead minions to the graveyard, fires their onDeath triggers, and fires Mourn
     * (onFriendlyMinionDeath) on each surviving friendly minion per death. Repeats until a pass produces
     * no new deaths — Mourn can itself deal damage and kill further minions, so a single pass is
     * no longer sufficient now that Mourn exists (bounded: board size is finite, nothing revives).
     * A generator (see driveResolution) since a chosen-target Deathcry/Mourn can suspend for a real
     * target — resuming picks the `while`/inner `for` loop back up exactly where it paused, and the
     * already-computed `dead` array for that pass stays valid across the pause (it was captured
     * before any trigger fired, from cards already removed from `player.board`). */
    private *sweepDeaths(): Generator<TargetRequest, void, string> {
        let sweptAny = true;
        while (sweptAny) {
            sweptAny = false;
            for (const player of Object.values(this.gameState.players)) {
                const dead = player.board.filter((c) => (c.currentHealth ?? 0) <= 0);
                if (dead.length === 0) continue;

                sweptAny = true;
                player.board = player.board.filter((c) => (c.currentHealth ?? 0) > 0);
                for (const card of dead) {
                    console.log('[TurnStateMachine] card died', { instanceId: card.instanceId, definitionId: card.definitionId, ownerId: player.id });
                    this.moveToGraveyard(card, player);
                    EventBus.emit('state:card-died', { instanceId: card.instanceId, playerId: player.id });
                    yield* this.triggerEffects(card, 'onDeath', player.id);
                    yield* this.triggerBoardWide('onFriendlyMinionDeath', player.id, player.board);
                }
            }
        }
        // Every board-removal path in this codebase funnels through here, so this single call
        // covers all of them (combat deaths, spell/effect kills, onDamaged-triggered deaths).
        this.recalculateAuras();
    }

    private checkWinCondition(): boolean {
        const dead = Object.values(this.gameState.players).find((p) => p.health <= 0);
        if (!dead) return false;

        this.gameState.winner = this.opponentOf(dead.id);
        console.log('[TurnStateMachine] game over', { winner: this.gameState.winner, loserHealth: dead.health });
        this.setPhase(TurnPhase.GameOver);
        EventBus.emit('state:game-over', { winner: this.gameState.winner });
        return true;
    }

    // --- helpers ---------------------------------------------------------------

    /** Advances a resolution generator (an executeX call, once entered — see the driveResolution
     * call sites in playCard/activateAbility/endTurn/beginStartTurn/selectTarget) to its next
     * suspension point or completion. `resumeValue` is the just-clicked target id when resuming a
     * paused Tier-2 prompt (see selectTarget); omitted for the initial call that starts a fresh
     * generator running. A generator that finishes (`done: true`) has already run its own tail
     * (recalculateAuras/checkWin/setPhase/finishResolving) exactly where today's code always has —
     * this method only owns the suspend/resume handshake, not any resolution logic itself.
     *
     * The `this.activeResolution === gen` check on completion (rather than unconditionally
     * clearing) matters for one specific case: executeEndTurn's generator body ends by plainly
     * calling `beginStartTurn`, which — for the new active player's own Vigil — may itself drive a
     * *second*, independent `executeStartTurn` generator via a nested driveResolution call, all
     * before the outer executeEndTurn generator's own `.next()` call (still in progress here)
     * returns `done: true`. If that inner call suspended (its own Tier-2 prompt), `activeResolution`
     * already correctly points at the inner generator by the time control returns here — the
     * identity check stops the outer completion from clobbering it. If the inner call didn't
     * suspend (no Tier-2 prompt, or it routed into the Tier-1 pendingPrompts/beginTargeting path
     * instead, which never touches `activeResolution` at all), `activeResolution` still correctly
     * equals `gen`, so the outer completion clears it as normal. */
    private driveResolution(gen: Generator<TargetRequest, void, string>, resumeValue?: string): void {
        const result = resumeValue !== undefined ? gen.next(resumeValue) : gen.next();
        if (result.done) {
            if (this.activeResolution === gen) this.activeResolution = undefined;
            return;
        }
        this.activeResolution = gen;
        const { sourceInstanceId, action, validTargetIds, ownerId } = result.value;
        this.gameState.pendingTarget = { sourceInstanceId, validTargetIds, action, ownerId, cancellable: false, step: 1, totalSteps: 1 };
        this.setPhase(TurnPhase.AwaitingTarget);
    }

    private setPhase(phase: TurnPhase): void {
        this.gameState.phase = phase;
        EventBus.emit('state:phase-change', phase, this.gameState);
    }

    private opponentOf(id: PlayerId): PlayerId {
        return id === 'player' ? 'opponent' : 'player';
    }

    private isPlayerId(id: string): id is PlayerId {
        return id === 'player' || id === 'opponent';
    }

    private findMinion(instanceId: string): { instance: CardInstance; owner: PlayerState } | undefined {
        for (const owner of Object.values(this.gameState.players)) {
            const instance = owner.board.find((c) => c.instanceId === instanceId);
            if (instance) return { instance, owner };
        }
        return undefined;
    }
}
