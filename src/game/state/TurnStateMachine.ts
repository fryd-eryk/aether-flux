import { CARD_DEFINITIONS } from '../data/cards';
import { createCardInstance } from '../data/cardFactory';
import { EventBus } from '../EventBus';
import type { CardAura, CardInstance, ChosenTargetRestriction, EffectAction, EffectTrigger, Keyword, TargetSelector, Tribe } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState, PendingTarget, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';
import { resolveEffectValue } from './counters';
import { canDeclareAttack, hasKeyword, isTargetable, tauntRestrictedTargets } from './keywordRules';
import { minionHasTribe, restrictionTribe } from './tribes';

type PendingAction =
    | { type: 'playCard'; instanceId: string }
    | { type: 'attack'; attackerInstanceId: string }
    | { type: 'ability'; instanceId: string; abilityIndex: number };

/** Consumed left-to-right as triggerEffects/executeAbility walk a block's actions[] in order —
 * see collectChosenRestrictions, which builds `ids` in that same traversal order up front.
 * `last` is the most recently resolved *real* (non-reuseTarget) chosen id, for `reuseTarget`
 * actions to read instead of consuming another entry from `ids`. */
type ChosenTargetCursor = { ids: string[]; index: number; last?: string };

/**
 * Pure game-state driver, no Phaser dependency. A Scene forwards player input into
 * playCard/declareAttack/selectTarget/endTurn and listens on EventBus for the
 * 'state:*' events to re-render and sequence animations. RESOLVING is entered and left
 * synchronously here — a Scene wanting to gate input on an animation should track its
 * own "isAnimating" flag off those events rather than relying on the phase value.
 */
export class TurnStateMachine {
    private static readonly MAX_MANA = 10;
    private static readonly MAX_BOARD_SIZE = 7;

    private gameState: GameState;
    private pendingAction?: PendingAction;
    /** Ordered chosen-target restrictions still to prompt for, and the ids already resolved so
     * far — see beginTargeting/collectChosenRestrictions. Reset on every beginTargeting call. */
    private pendingChosenQueue: (ChosenTargetRestriction | undefined)[] = [];
    private pendingChosenTargets: string[] = [];

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
        this.startTurn(this.gameState.activePlayer);
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
        if (!definition || player.mana < definition.cost) {
            console.log('[TurnStateMachine] playCard rejected: unaffordable', { instanceId, definitionId: card.definitionId, cost: definition?.cost, mana: player.mana });
            return;
        }

        if (this.needsChosenTarget({ type: 'playCard', instanceId }, player.id)) {
            console.log('[TurnStateMachine] playCard needs target, entering AwaitingTarget', { instanceId, definitionId: card.definitionId });
            this.beginTargeting({ type: 'playCard', instanceId }, player.id);
            return;
        }

        console.log('[TurnStateMachine] playCard', { instanceId, definitionId: card.definitionId, playerId: player.id, cost: definition.cost, mana: player.mana });
        this.executePlayCard(instanceId);
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

    /** Pays a board minion's paid-ability mana cost and resolves its action — see PaidAbility's
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
        if (!ability || player.mana < ability.cost) {
            console.log('[TurnStateMachine] activateAbility rejected: unaffordable or missing', { instanceId, abilityIndex, cost: ability?.cost, mana: player.mana });
            return;
        }

        if (this.needsChosenTarget({ type: 'ability', instanceId, abilityIndex }, player.id)) {
            console.log('[TurnStateMachine] activateAbility needs target, entering AwaitingTarget', { instanceId, abilityIndex });
            this.beginTargeting({ type: 'ability', instanceId, abilityIndex }, player.id);
            return;
        }

        console.log('[TurnStateMachine] activateAbility', { instanceId, abilityIndex, playerId: player.id, cost: ability.cost, mana: player.mana });
        this.executeAbility(instanceId, abilityIndex);
    }

    selectTarget(targetId: string): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget || !this.pendingAction) {
            console.log(`[TurnStateMachine] selectTarget rejected: not awaiting target (phase ${this.gameState.phase})`, { targetId });
            return;
        }
        if (!this.gameState.pendingTarget?.validTargetIds.includes(targetId)) {
            console.log('[TurnStateMachine] selectTarget rejected: not a valid target', { targetId, validTargetIds: this.gameState.pendingTarget?.validTargetIds });
            return;
        }

        console.log('[TurnStateMachine] selectTarget', { targetId, pendingAction: this.pendingAction });
        const action = this.pendingAction;
        if (action.type === 'attack') {
            this.executeAttack(action.attackerInstanceId, targetId);
            return;
        }

        this.pendingChosenTargets.push(targetId);
        if (this.pendingChosenTargets.length < this.pendingChosenQueue.length) {
            // More chosen-target actions in this block still need their own target — stay in
            // AwaitingTarget and re-prompt for the next one. setPhase always re-emits
            // 'state:phase-change' even when the phase value doesn't change, so the Scene still
            // re-renders with the next step's valid-target highlighting.
            this.gameState.pendingTarget = this.currentPendingTarget(action, this.gameState.activePlayer);
            this.setPhase(TurnPhase.AwaitingTarget);
            return;
        }

        if (action.type === 'playCard') {
            this.executePlayCard(action.instanceId, this.pendingChosenTargets);
        } else {
            this.executeAbility(action.instanceId, action.abilityIndex, this.pendingChosenTargets);
        }
    }

    cancelTarget(): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget) return;
        const pendingAction = this.pendingAction;
        const activePlayerId = this.gameState.activePlayer;
        console.log('[TurnStateMachine] cancelTarget', { pendingAction });
        this.pendingAction = undefined;
        this.gameState.pendingTarget = undefined;
        this.pendingChosenQueue = [];
        this.pendingChosenTargets = [];
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
        console.log('[TurnStateMachine] endTurn', { playerId: player.id, turnNumber: this.gameState.turnNumber });

        this.setPhase(TurnPhase.TurnEnd);
        for (const card of player.board) {
            this.triggerEffects(card, 'endOfTurn', player.id);
            // A minion frozen on an earlier turn only reaches this point once its own controller's
            // turn (the one it was blocked for) is ending — see keywordRules.canDeclareAttack.
            card.frozen = false;
        }
        this.tickTemporaryEffects();
        this.sweepDeaths();
        // Catch-all (see recalculateAuras' doc comment) — endOfTurn effects can change a counter
        // without any minion dying.
        this.recalculateAuras();

        this.gameState.activePlayer = this.opponentOf(player.id);
        this.gameState.turnNumber += 1;
        this.startTurn(this.gameState.activePlayer);
    }

    // --- resolution ---------------------------------------------------------

    private executePlayCard(instanceId: string, chosenTargetIds: string[] = []): void {
        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.hand.find((c) => c.instanceId === instanceId);
        if (!card) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition) return;

        player.mana -= definition.cost;
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
        this.triggerEffects(card, 'onPlay', player.id, { ids: chosenTargetIds, index: 0 });
        // Counted after this card's own onPlay resolves (so a Momentum effect on the card itself
        // reads "how many were played before it"), but before Channel fires below (so a Channel
        // minion's own Momentum condition correctly counts this card as already played).
        player.cardsPlayedThisTurn += 1;
        this.sweepDeaths();
        if (definition.type !== 'minion' && definition.type !== 'token') {
            // Channel (onSpellCast) — every minion on the caster's own board with a matching
            // effect reacts, distinct from the single-instance onPlay trigger just fired above.
            this.triggerBoardWide('onSpellCast', player.id, player.board);
            this.sweepDeaths();
        } else {
            // Muster (onFriendlyMinionCast) — the mirror image of Channel above, for casting a minion
            // instead of a spell. The played minion is already sitting in player.board by this
            // point (pushed above), so it's filtered out here — otherwise it would react to its
            // own cast, which is exactly what the single-instance onPlay trigger already covers.
            this.triggerBoardWide('onFriendlyMinionCast', player.id, player.board.filter((c) => c.instanceId !== card.instanceId));
            this.sweepDeaths();
        }
        // Catch-all: keeps any dynamic-counter aura (e.g. "+1/+1 per Demon you control") correct
        // even when this action changed a counter (hand/graveyard/deck size, hero health) without
        // changing board membership — the internal calls above only cover membership changes.
        this.recalculateAuras();
        EventBus.emit('state:card-played', { instanceId, playerId: player.id });
        this.finishResolving();
    }

    /** Resolves an already-affordability-checked paid ability. Mana is deducted here (not in
     * activateAbility), matching executePlayCard's pattern so cancelTarget() stays free while a
     * target is still being chosen. Doesn't touch cardsPlayedThisTurn (not "playing a card", so it
     * shouldn't feed Momentum) and doesn't call triggerEffects (no onPlay/Channel/Muster — those
     * are for cards entering play, not an already-in-play minion's activated ability). */
    private executeAbility(instanceId: string, abilityIndex: number, chosenTargetIds: string[] = []): void {
        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.board.find((c) => c.instanceId === instanceId);
        if (!card) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        const ability = definition?.paidAbilities?.[abilityIndex];
        if (!ability) return;

        player.mana -= ability.cost;

        this.setPhase(TurnPhase.Resolving);
        const cursor: ChosenTargetCursor = { ids: chosenTargetIds, index: 0 };
        for (const action of ability.actions) {
            const chosenTargetId = this.resolveChosenCursor(action, cursor);
            this.applyEffectAction(action, player.id, card.instanceId, chosenTargetId);
        }
        this.sweepDeaths();
        this.recalculateAuras();
        EventBus.emit('state:ability-activated', { instanceId, abilityIndex, playerId: player.id });
        this.finishResolving();
    }

    private executeAttack(attackerInstanceId: string, targetId: string): void {
        const player = this.gameState.players[this.gameState.activePlayer];
        const attacker = player.board.find((c) => c.instanceId === attackerInstanceId);
        if (!attacker) return;

        console.log('[TurnStateMachine] executeAttack', { attackerInstanceId, targetId, attack: attacker.currentAttack, health: attacker.currentHealth });
        this.setPhase(TurnPhase.Resolving);
        attacker.attacksThisTurn += 1;
        // Veiled is lost the instant this minion attacks, mirroring how divineShield is consumed
        // in dealDamage. Strike (onAttack) fires unconditionally here, before any damage resolves
        // either way, so it's unaffected by whether the hit lands or either side survives it.
        attacker.keywords.delete('veiled');
        this.triggerEffects(attacker, 'onAttack', player.id);

        const defender = !this.isPlayerId(targetId) ? this.findMinion(targetId) : undefined;
        // Initiative (MTG's First Strike): the side that ALONE has it hits first, and the other
        // side's return hit is skipped if that first hit is lethal. Both-or-neither falls through
        // to the simultaneous exchange below, matching MTG's own first-strike-vs-first-strike ruling.
        const defenderStrikesFirst = !!defender && hasKeyword(defender.instance, 'initiative') && !hasKeyword(attacker, 'initiative');

        if (defenderStrikesFirst && defender) {
            this.resolveCombatHit(defender.instance, defender.owner.id, attackerInstanceId);
            if ((attacker.currentHealth ?? 0) > 0) {
                this.resolveCombatHit(attacker, player.id, targetId);
            }
        } else {
            this.resolveCombatHit(attacker, player.id, targetId);
            if (defender) {
                const attackerWinsInitiative = hasKeyword(attacker, 'initiative') && !hasKeyword(defender.instance, 'initiative');
                if (!attackerWinsInitiative || (defender.instance.currentHealth ?? 0) > 0) {
                    this.resolveCombatHit(defender.instance, defender.owner.id, attackerInstanceId);
                }
            }
        }

        this.sweepDeaths();
        // Catch-all (see recalculateAuras' doc comment) — combat can change hero health without
        // any minion dying, which sweepDeaths' own internal call wouldn't otherwise catch.
        this.recalculateAuras();
        EventBus.emit('state:attack', { attackerInstanceId, targetId });
        this.finishResolving();
    }

    /** One side's combat swing (attacker's hit or defender's return hit) plus its Lifesteal/Venom
     * follow-ups — factored out so Initiative can reorder or skip a side's hit in executeAttack
     * without duplicating this logic. */
    private resolveCombatHit(source: CardInstance, sourceOwnerId: PlayerId, targetId: string): void {
        const damageDealt = this.dealDamage(targetId, source.currentAttack ?? 0);
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
        this.setPhase(TurnPhase.CheckState);
        if (this.checkWinCondition()) return;
        this.setPhase(TurnPhase.MainIdle);
    }

    private startTurn(playerId: PlayerId): void {
        this.setPhase(TurnPhase.TurnStart);
        const player = this.gameState.players[playerId];
        console.log('[TurnStateMachine] startTurn', { playerId, turnNumber: this.gameState.turnNumber, maxMana: Math.min(TurnStateMachine.MAX_MANA, player.maxMana + 1) });

        player.maxMana = Math.min(TurnStateMachine.MAX_MANA, player.maxMana + 1);
        player.mana = player.maxMana;
        player.cardsPlayedThisTurn = 0;

        for (const card of player.board) {
            card.summoningSick = false;
            card.attacksThisTurn = 0;
        }

        this.drawCard(playerId);

        for (const card of player.board) {
            this.triggerEffects(card, 'startOfTurn', playerId);
        }
        this.sweepDeaths();
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
     * Playtesting-only cheat: pulls one specific card out of a player's deck by id and puts it
     * straight into their hand, bypassing the random top-of-deck draw. No phase/turn gating,
     * unlike every other player-facing method here — it's meant to be callable at any time from
     * the deck-inspect overlay. Reuses drawCard's own 'state:card-drawn' emit so the existing fly-
     * to-hand animation plays unmodified. See SPEC.md's "Playtesting-only features" section —
     * remove this (and PileViewController's wiring to it) before release.
     */
    debugDrawCard(playerId: PlayerId, instanceId: string): void {
        const player = this.gameState.players[playerId];
        const index = player.deck.findIndex((c) => c.instanceId === instanceId);
        if (index === -1) return;

        const [card] = player.deck.splice(index, 1);
        card.zone = 'hand';
        player.hand.push(card);
        EventBus.emit('state:card-drawn', { playerId, instanceId: card.instanceId });
    }

    // --- targeting -----------------------------------------------------------

    private beginTargeting(action: PendingAction, ownerId: PlayerId): void {
        this.pendingAction = action;
        this.pendingChosenTargets = [];
        this.pendingChosenQueue = action.type === 'attack' ? [] : this.collectChosenRestrictions(action, ownerId);
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

    /** Valid targets (plus step/totalSteps) for whichever slot targeting is currently on — the
     * attacker's fixed single slot, or the current head of pendingChosenQueue. Callable both when
     * first entering AwaitingTarget and when advancing to the next chosen-target prompt within
     * the same play/ability (see selectTarget). */
    private currentPendingTarget(action: PendingAction, ownerId: PlayerId): PendingTarget {
        if (action.type === 'attack') {
            return {
                sourceInstanceId: action.attackerInstanceId,
                validTargetIds: this.computeAttackTargets(ownerId),
                step: 1,
                totalSteps: 1,
            };
        }

        const restriction = this.pendingChosenQueue[this.pendingChosenTargets.length];
        return {
            sourceInstanceId: action.instanceId,
            validTargetIds: this.computeValidTargetsForRestriction(restriction, ownerId),
            step: this.pendingChosenTargets.length + 1,
            totalSteps: this.pendingChosenQueue.length,
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

    private computeValidTargetsForRestriction(restriction: ChosenTargetRestriction | undefined, ownerId: PlayerId): string[] {
        const opponentId = this.opponentOf(ownerId);
        const friendlyMinions = this.gameState.players[ownerId].board.filter(isTargetable);
        const enemyMinions = this.gameState.players[opponentId].board.filter(isTargetable);
        const allMinions = [...friendlyMinions, ...enemyMinions];

        const tribe = restrictionTribe(restriction);
        if (tribe) return allMinions.filter((c) => minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribe)).map((c) => c.instanceId);
        if (restriction === 'minion') return allMinions.map((c) => c.instanceId);
        if (restriction === 'hero') return [ownerId, opponentId];
        return [ownerId, opponentId, ...allMinions.map((c) => c.instanceId)];
    }

    /** Every `target: 'chosen'` action's restriction across the relevant actions[] list(s), in
     * the exact order triggerEffects/executeAbility will later walk them — one target prompt per
     * entry, not one prompt shared across the whole block/card (see selectTarget). A 'playCard'
     * action walks the hand card's onPlay effects in array order, then each effect's actions in
     * array order; an 'ability' action walks one paidAbilities entry's actions. Deliberately
     * ignores `condition` (Momentum) — a Momentum-gated chosen action still gets prompted for up
     * front even if it goes unused because the condition ends up false at resolution time (see
     * triggerEffects's matching cursor-advance-even-when-skipped comment). A `reuseTarget: true`
     * action is excluded entirely — it isn't its own prompt, it reads the nearest earlier action's
     * resolved id at execution time instead (see ChosenTargetCursor.last). */
    private collectChosenRestrictions(action: Exclude<PendingAction, { type: 'attack' }>, ownerId: PlayerId): (ChosenTargetRestriction | undefined)[] {
        const needsPrompt = (a: EffectAction): a is Extract<EffectAction, { target: TargetSelector }> =>
            'target' in a && a.target === 'chosen' && !('reuseTarget' in a && a.reuseTarget);
        if (action.type === 'ability') {
            const card = this.gameState.players[ownerId].board.find((c) => c.instanceId === action.instanceId);
            const definition = card ? CARD_DEFINITIONS[card.definitionId] : undefined;
            const ability = definition?.paidAbilities?.[action.abilityIndex];
            return (ability?.actions ?? []).filter(needsPrompt).map((a) => a.chosenRestriction);
        }
        const card = this.gameState.players[ownerId].hand.find((c) => c.instanceId === action.instanceId);
        const definition = card ? CARD_DEFINITIONS[card.definitionId] : undefined;
        const onPlayEffects = definition?.effects?.filter((e) => e.trigger === 'onPlay') ?? [];
        return onPlayEffects.flatMap((e) => e.actions).filter(needsPrompt).map((a) => a.chosenRestriction);
    }

    private needsChosenTarget(action: Exclude<PendingAction, { type: 'attack' }>, ownerId: PlayerId): boolean {
        return this.collectChosenRestrictions(action, ownerId).length > 0;
    }

    // --- effects ---------------------------------------------------------------

    private triggerEffects(instance: CardInstance, trigger: EffectTrigger, ownerId: PlayerId, cursor?: ChosenTargetCursor): void {
        // Silence permanently suppresses all of this instance's own effects, Deathcry included —
        // one guard here covers every trigger dispatch site, current and future.
        if (instance.silenced) return;
        const definition = CARD_DEFINITIONS[instance.definitionId];
        const effects = definition?.effects?.filter((e) => e.trigger === trigger) ?? [];
        const cardsPlayedThisTurn = this.gameState.players[ownerId].cardsPlayedThisTurn;
        for (const effect of effects) {
            // Momentum(N): skip this effect's actions unless at least N cards were already played
            // by its owner earlier this turn — a single choke point, same pattern as the silenced
            // guard above.
            const satisfied = effect.condition?.type !== 'momentum' || cardsPlayedThisTurn >= effect.condition.minCount;
            for (const action of effect.actions) {
                // The chosen-target queue (collectChosenRestrictions) is built ignoring Momentum, so
                // the cursor must still advance (for a real, non-reuseTarget chosen action) here even
                // when this block is skipped below — otherwise every chosen action after a skipped
                // Momentum block would silently consume the wrong id.
                const chosenTargetId = this.resolveChosenCursor(action, cursor);
                if (!satisfied) continue;
                this.applyEffectAction(action, ownerId, instance.instanceId, chosenTargetId);
            }
        }
    }

    /** Resolves (and, for a fresh non-reuseTarget action, advances) the chosen-target cursor for
     * one action — shared by triggerEffects and executeAbility so both walk actions[] the same
     * way. Returns undefined for a non-chosen action or when there's no cursor (board-wide
     * triggers never prompt for a target). */
    private resolveChosenCursor(action: EffectAction, cursor?: ChosenTargetCursor): string | undefined {
        if (!cursor || !('target' in action) || action.target !== 'chosen') return undefined;
        if ('reuseTarget' in action && action.reuseTarget) return cursor.last;
        const chosenTargetId = cursor.ids[cursor.index++];
        cursor.last = chosenTargetId;
        return chosenTargetId;
    }

    /** Fires `trigger` for every minion in `board` via the ordinary single-instance triggerEffects —
     * the shared shape for board-wide triggers (Channel/onSpellCast, Mourn/onFriendlyMinionDeath) that react
     * to *another* card's event rather than their own. */
    private triggerBoardWide(trigger: EffectTrigger, ownerId: PlayerId, board: CardInstance[]): void {
        for (const card of board) {
            this.triggerEffects(card, trigger, ownerId);
        }
    }

    private applyEffectAction(action: EffectAction, ownerId: PlayerId, sourceId: string, chosenTargetId?: string): void {
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
                    if (action.kind === 'damage') this.dealDamage(targetId, amount);
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
                return chosenTargetId ? [chosenTargetId] : [];
            case 'allFriendlyMinions':
                return this.gameState.players[ownerId].board.filter(matchesTribe).map((c) => c.instanceId);
            case 'allEnemyMinions':
                return this.gameState.players[opponentId].board.filter(matchesTribe).map((c) => c.instanceId);
            case 'allMinions':
                return [...this.gameState.players[ownerId].board, ...this.gameState.players[opponentId].board]
                    .filter(matchesTribe)
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

    /** Returns the amount of damage actually applied (0 if absorbed by Divine Shield), so callers (e.g. Lifesteal) can react to what really landed. */
    private dealDamage(targetId: string, amount: number): number {
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
            this.triggerEffects(found.instance, 'onDamaged', found.owner.id);
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
     * the literal reading of "All Demon you control". */
    private auraApplies(aura: CardAura, source: CardInstance, recipient: CardInstance): boolean {
        if (aura.tribeFilter && !minionHasTribe(CARD_DEFINITIONS[recipient.definitionId], aura.tribeFilter)) return false;
        switch (aura.target) {
            case 'allFriendlyMinions':
                return recipient.owner === source.owner;
            case 'allEnemyMinions':
                return recipient.owner !== source.owner;
            case 'allMinions':
                return true;
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
     * no longer sufficient now that Mourn exists (bounded: board size is finite, nothing revives). */
    private sweepDeaths(): void {
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
                    this.triggerEffects(card, 'onDeath', player.id);
                    this.triggerBoardWide('onFriendlyMinionDeath', player.id, player.board);
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
