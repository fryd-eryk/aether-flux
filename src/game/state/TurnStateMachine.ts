import { CARD_DEFINITIONS } from '../data/cards';
import { createCardInstance } from '../data/cardFactory';
import { EventBus } from '../EventBus';
import type { CardInstance, ChosenTargetRestriction, EffectAction, EffectTrigger, Keyword, TargetSelector, Tribe } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';
import { resolveEffectValue } from './counters';
import { canDeclareAttack, hasKeyword, isTargetable, tauntRestrictedTargets } from './keywordRules';
import { minionHasTribe, restrictionTribe } from './tribes';

type PendingAction =
    | { type: 'playCard'; instanceId: string }
    | { type: 'attack'; attackerInstanceId: string }
    | { type: 'ability'; instanceId: string; abilityIndex: number };

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
        if (this.gameState.phase !== TurnPhase.MainIdle) return;

        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.hand.find((c) => c.instanceId === instanceId);
        if (!card) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        if (!definition || player.mana < definition.cost) return;

        if (this.needsChosenTarget(definition.effects?.filter((e) => e.trigger === 'onPlay'))) {
            this.beginTargeting({ type: 'playCard', instanceId }, player.id);
            return;
        }

        this.executePlayCard(instanceId);
    }

    declareAttack(attackerInstanceId: string): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) return;

        const player = this.gameState.players[this.gameState.activePlayer];
        const attacker = player.board.find((c) => c.instanceId === attackerInstanceId);
        if (!attacker || !canDeclareAttack(attacker)) return;

        this.beginTargeting({ type: 'attack', attackerInstanceId }, player.id);
    }

    /** Pays a board minion's paid-ability mana cost and resolves its action — see PaidAbility's
     * doc comment (Card.ts) for why this is deliberately unrestricted by summoning sickness/attack
     * state, unlike declareAttack. Silenced minions can't activate (their own text is suppressed,
     * same principle as CardInstance.silenced already applies to trigger effects). */
    activateAbility(instanceId: string, abilityIndex: number): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) return;

        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.board.find((c) => c.instanceId === instanceId);
        if (!card || card.silenced) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        const ability = definition?.paidAbilities?.[abilityIndex];
        if (!ability || player.mana < ability.cost) return;

        if (this.needsChosenTarget([{ action: ability.action }])) {
            this.beginTargeting({ type: 'ability', instanceId, abilityIndex }, player.id);
            return;
        }

        this.executeAbility(instanceId, abilityIndex);
    }

    selectTarget(targetId: string): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget || !this.pendingAction) return;
        if (!this.gameState.pendingTarget?.validTargetIds.includes(targetId)) return;

        const action = this.pendingAction;
        if (action.type === 'playCard') {
            this.executePlayCard(action.instanceId, targetId);
        } else if (action.type === 'attack') {
            this.executeAttack(action.attackerInstanceId, targetId);
        } else {
            this.executeAbility(action.instanceId, action.abilityIndex, targetId);
        }
    }

    cancelTarget(): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget) return;
        const pendingAction = this.pendingAction;
        const activePlayerId = this.gameState.activePlayer;
        this.pendingAction = undefined;
        this.gameState.pendingTarget = undefined;
        // Only a card pulled out of hand (not an attacker choosing its target) gets the Scene's
        // held-at-spotlight treatment — see beginTargeting's matching emit below.
        if (pendingAction?.type === 'playCard') {
            EventBus.emit('state:target-cancelled', { instanceId: pendingAction.instanceId, playerId: activePlayerId });
        }
        this.setPhase(TurnPhase.MainIdle);
    }

    endTurn(): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) return;
        const player = this.gameState.players[this.gameState.activePlayer];

        this.setPhase(TurnPhase.TurnEnd);
        for (const card of player.board) {
            this.triggerEffects(card, 'endOfTurn', player.id);
            // A minion frozen on an earlier turn only reaches this point once its own controller's
            // turn (the one it was blocked for) is ending — see keywordRules.canDeclareAttack.
            card.frozen = false;
        }
        this.sweepDeaths();

        this.gameState.activePlayer = this.opponentOf(player.id);
        this.gameState.turnNumber += 1;
        this.startTurn(this.gameState.activePlayer);
    }

    // --- resolution ---------------------------------------------------------

    private executePlayCard(instanceId: string, chosenTargetId?: string): void {
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
            } else {
                // Board full: the minion is discarded rather than played, since it has nowhere to be summoned.
                this.moveToGraveyard(card, player);
            }
        } else {
            this.moveToGraveyard(card, player);
        }

        this.setPhase(TurnPhase.Resolving);
        this.triggerEffects(card, 'onPlay', player.id, chosenTargetId);
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
            // Muster (onMinionCast) — the mirror image of Channel above, for casting a minion
            // instead of a spell. The played minion is already sitting in player.board by this
            // point (pushed above), so it's filtered out here — otherwise it would react to its
            // own cast, which is exactly what the single-instance onPlay trigger already covers.
            this.triggerBoardWide('onMinionCast', player.id, player.board.filter((c) => c.instanceId !== card.instanceId));
            this.sweepDeaths();
        }
        EventBus.emit('state:card-played', { instanceId, playerId: player.id });
        this.finishResolving();
    }

    /** Resolves an already-affordability-checked paid ability. Mana is deducted here (not in
     * activateAbility), matching executePlayCard's pattern so cancelTarget() stays free while a
     * target is still being chosen. Doesn't touch cardsPlayedThisTurn (not "playing a card", so it
     * shouldn't feed Momentum) and doesn't call triggerEffects (no onPlay/Channel/Muster — those
     * are for cards entering play, not an already-in-play minion's activated ability). */
    private executeAbility(instanceId: string, abilityIndex: number, chosenTargetId?: string): void {
        const player = this.gameState.players[this.gameState.activePlayer];
        const card = player.board.find((c) => c.instanceId === instanceId);
        if (!card) return;

        const definition = CARD_DEFINITIONS[card.definitionId];
        const ability = definition?.paidAbilities?.[abilityIndex];
        if (!ability) return;

        player.mana -= ability.cost;

        this.setPhase(TurnPhase.Resolving);
        this.applyEffectAction(ability.action, player.id, chosenTargetId);
        this.sweepDeaths();
        EventBus.emit('state:ability-activated', { instanceId, abilityIndex, playerId: player.id });
        this.finishResolving();
    }

    private executeAttack(attackerInstanceId: string, targetId: string): void {
        const player = this.gameState.players[this.gameState.activePlayer];
        const attacker = player.board.find((c) => c.instanceId === attackerInstanceId);
        if (!attacker) return;

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
        this.gameState.pendingTarget = {
            sourceInstanceId: action.type === 'attack' ? action.attackerInstanceId : action.instanceId,
            validTargetIds: this.computeValidTargets(action, ownerId),
        };
        // A card pulled out of hand gets held at the Scene's spotlight while the player picks a
        // target (see CardGame's targetBeginHandler) — an attacker choosing its target never left
        // the board, and neither does a board minion activating a paid ability, so both are
        // excluded here.
        if (action.type === 'playCard') {
            EventBus.emit('state:target-begin', { instanceId: action.instanceId, playerId: ownerId });
        }
        this.setPhase(TurnPhase.AwaitingTarget);
    }

    private computeValidTargets(action: PendingAction, ownerId: PlayerId): string[] {
        const opponentId = this.opponentOf(ownerId);
        if (action.type === 'attack') {
            const enemyBoard = this.gameState.players[opponentId].board;
            // Veiled minions are folded out inside tauntRestrictedTargets itself, so tauntUp must be
            // derived from its result rather than the raw board — see keywordRules.tauntRestrictedTargets.
            const attackable = tauntRestrictedTargets(enemyBoard);
            const tauntUp = attackable.some((c) => hasKeyword(c, 'taunt'));
            const attackableMinionIds = attackable.map((c) => c.instanceId);
            return tauntUp ? attackableMinionIds : [opponentId, ...attackableMinionIds];
        }

        const friendlyMinions = this.gameState.players[ownerId].board.filter(isTargetable);
        const enemyMinions = this.gameState.players[opponentId].board.filter(isTargetable);
        const allMinions = [...friendlyMinions, ...enemyMinions];

        const restriction = this.chosenTargetRestriction(action as Exclude<PendingAction, { type: 'attack' }>, ownerId);
        const tribe = restrictionTribe(restriction);
        if (tribe) return allMinions.filter((c) => minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribe)).map((c) => c.instanceId);
        if (restriction === 'minion') return allMinions.map((c) => c.instanceId);
        if (restriction === 'hero') return [ownerId, opponentId];
        return [ownerId, opponentId, ...allMinions.map((c) => c.instanceId)];
    }

    /** The chosenRestriction (if any) of the effect/ability that's about to prompt targeting —
     * see needsChosenTarget, which only enters AwaitingTarget for a source that has exactly one
     * chosen-target action. A 'playCard' action looks at the hand card's onPlay effects; an
     * 'ability' action looks at the board minion's own paidAbilities entry instead. */
    private chosenTargetRestriction(action: Exclude<PendingAction, { type: 'attack' }>, ownerId: PlayerId): ChosenTargetRestriction | undefined {
        if (action.type === 'ability') {
            const card = this.gameState.players[ownerId].board.find((c) => c.instanceId === action.instanceId);
            const definition = card ? CARD_DEFINITIONS[card.definitionId] : undefined;
            const ability = definition?.paidAbilities?.[action.abilityIndex];
            return ability && 'chosenRestriction' in ability.action ? ability.action.chosenRestriction : undefined;
        }
        const card = this.gameState.players[ownerId].hand.find((c) => c.instanceId === action.instanceId);
        const definition = card ? CARD_DEFINITIONS[card.definitionId] : undefined;
        const chosenEffect = definition?.effects?.find(
            (e) => e.trigger === 'onPlay' && 'target' in e.action && e.action.target === 'chosen'
        );
        return chosenEffect && 'chosenRestriction' in chosenEffect.action ? chosenEffect.action.chosenRestriction : undefined;
    }

    private needsChosenTarget(effects: { action: EffectAction }[] | undefined): boolean {
        return (effects ?? []).some((e) => 'target' in e.action && e.action.target === 'chosen');
    }

    // --- effects ---------------------------------------------------------------

    private triggerEffects(instance: CardInstance, trigger: EffectTrigger, ownerId: PlayerId, chosenTargetId?: string): void {
        // Silence permanently suppresses all of this instance's own effects, Deathcry included —
        // one guard here covers every trigger dispatch site, current and future.
        if (instance.silenced) return;
        const definition = CARD_DEFINITIONS[instance.definitionId];
        const effects = definition?.effects?.filter((e) => e.trigger === trigger) ?? [];
        const cardsPlayedThisTurn = this.gameState.players[ownerId].cardsPlayedThisTurn;
        for (const effect of effects) {
            // Momentum(N): skip this effect unless at least N cards were already played by its
            // owner earlier this turn — a single choke point, same pattern as the silenced guard above.
            if (effect.condition?.type === 'momentum' && cardsPlayedThisTurn < effect.condition.minCount) continue;
            this.applyEffectAction(effect.action, ownerId, chosenTargetId);
        }
    }

    /** Fires `trigger` for every minion in `board` via the ordinary single-instance triggerEffects —
     * the shared shape for board-wide triggers (Channel/onSpellCast, Mourn/onMinionDeath) that react
     * to *another* card's event rather than their own. */
    private triggerBoardWide(trigger: EffectTrigger, ownerId: PlayerId, board: CardInstance[]): void {
        for (const card of board) {
            this.triggerEffects(card, trigger, ownerId);
        }
    }

    private applyEffectAction(action: EffectAction, ownerId: PlayerId, chosenTargetId?: string): void {
        switch (action.kind) {
            case 'damage':
            case 'heal': {
                // Resolved once for the whole action (not re-resolved per target, and not clamped
                // until here) — a counter-based amount could mathematically resolve negative (e.g.
                // a large negative offset), which would silently invert dealDamage into a heal or
                // vice versa without this floor.
                const amount = Math.max(0, resolveEffectValue(action.amount, ownerId, this.gameState));
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId, action.tribeFilter);
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
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.buff(targetId, attack, health);
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
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.freezeMinion(targetId);
                break;
            }
            case 'silence': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.silenceMinion(targetId);
                break;
            }
            case 'destroy': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.forceKill(targetId);
                break;
            }
            case 'grantKeyword': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId, action.tribeFilter);
                for (const targetId of targetIds) this.grantKeyword(targetId, action.keyword);
                break;
            }
        }
    }

    private resolveTargetIds(selector: TargetSelector, ownerId: PlayerId, chosenTargetId?: string, tribeFilter?: Tribe): string[] {
        const opponentId = this.opponentOf(ownerId);
        const matchesTribe = (c: CardInstance) => !tribeFilter || minionHasTribe(CARD_DEFINITIONS[c.definitionId], tribeFilter);
        switch (selector) {
            case 'self':
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
    }

    // --- damage / death --------------------------------------------------------

    /** Moves a card to its owner's graveyard, resetting a minion's stats back to its definition's base attack/health — a dead or discarded minion shouldn't keep displaying whatever damage/buffs it had at the moment it left play. */
    private moveToGraveyard(card: CardInstance, player: PlayerState): void {
        const definition = CARD_DEFINITIONS[card.definitionId];
        if (definition?.type === 'minion' || definition?.type === 'token') {
            card.currentAttack = definition.attack;
            card.currentHealth = definition.health;
            card.maxHealth = definition.health;
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
            return before - player.health;
        }
        const found = this.findMinion(targetId);
        if (!found) return 0;

        if (hasKeyword(found.instance, 'divineShield')) {
            found.instance.keywords.delete('divineShield');
            return 0;
        }
        found.instance.currentHealth = (found.instance.currentHealth ?? 0) - amount;
        // Wound (onDamaged) — a single choke point covering combat and spell damage alike. Fires
        // on "survived the raw damage amount", independent of any follow-up like Venom retroactively
        // killing the same minion afterward (see executeAttack).
        if (amount > 0 && found.instance.currentHealth > 0) {
            this.triggerEffects(found.instance, 'onDamaged', found.owner.id);
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

    /** Clears the target's keywords and permanently suppresses its own future trigger effects — see triggerEffects. */
    private silenceMinion(targetId: string): void {
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.keywords.clear();
            found.instance.silenced = true;
        }
    }

    /** Player healing is uncapped by design (overheal past maxHealth is intentional — see CLAUDE.md). Minion healing caps at currentHealth's tracked ceiling, maxHealth, since a minion has no player-style "overheal" concept. */
    private heal(targetId: string, amount: number): void {
        if (this.isPlayerId(targetId)) {
            const player = this.gameState.players[targetId];
            player.health = player.health + amount;
            return;
        }
        const found = this.findMinion(targetId);
        if (found) {
            const cap = found.instance.maxHealth ?? found.instance.currentHealth ?? 0;
            found.instance.currentHealth = Math.min(cap, (found.instance.currentHealth ?? 0) + amount);
        }
    }

    private buff(targetId: string, attack: number, health: number): void {
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.currentAttack = (found.instance.currentAttack ?? 0) + attack;
            found.instance.currentHealth = (found.instance.currentHealth ?? 0) + health;
            // A health buff raises the healing ceiling too, not just current health, so a later heal can restore up to the new buffed max.
            found.instance.maxHealth = (found.instance.maxHealth ?? 0) + health;
        }
    }

    private grantKeyword(targetId: string, keyword: Keyword): void {
        const found = this.findMinion(targetId);
        if (found) found.instance.keywords.add(keyword);
    }

    /** Moves dead minions to the graveyard, fires their onDeath triggers, and fires Mourn
     * (onMinionDeath) on each surviving friendly minion per death. Repeats until a pass produces
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
                    this.moveToGraveyard(card, player);
                    EventBus.emit('state:card-died', { instanceId: card.instanceId });
                    this.triggerEffects(card, 'onDeath', player.id);
                    this.triggerBoardWide('onMinionDeath', player.id, player.board);
                }
            }
        }
    }

    private checkWinCondition(): boolean {
        const dead = Object.values(this.gameState.players).find((p) => p.health <= 0);
        if (!dead) return false;

        this.gameState.winner = this.opponentOf(dead.id);
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
