import { CARD_DEFINITIONS } from '../data/cards';
import { createCardInstance } from '../data/cardFactory';
import { EventBus } from '../EventBus';
import type { CardInstance, EffectAction, EffectTrigger, TargetSelector } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';

type PendingAction =
    | { type: 'playCard'; instanceId: string }
    | { type: 'attack'; attackerInstanceId: string };

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
        if (!attacker || attacker.summoningSick || attacker.hasAttackedThisTurn) return;

        this.beginTargeting({ type: 'attack', attackerInstanceId }, player.id);
    }

    selectTarget(targetId: string): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget || !this.pendingAction) return;
        if (!this.gameState.pendingTarget?.validTargetIds.includes(targetId)) return;

        const action = this.pendingAction;
        if (action.type === 'playCard') {
            this.executePlayCard(action.instanceId, targetId);
        } else {
            this.executeAttack(action.attackerInstanceId, targetId);
        }
    }

    cancelTarget(): void {
        if (this.gameState.phase !== TurnPhase.AwaitingTarget) return;
        this.pendingAction = undefined;
        this.gameState.pendingTarget = undefined;
        this.setPhase(TurnPhase.MainIdle);
    }

    endTurn(): void {
        if (this.gameState.phase !== TurnPhase.MainIdle) return;
        const player = this.gameState.players[this.gameState.activePlayer];

        this.setPhase(TurnPhase.TurnEnd);
        for (const card of player.board) {
            this.triggerEffects(card, 'endOfTurn', player.id);
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

        if (definition.type === 'minion') {
            card.summoningSick = true;
            card.hasAttackedThisTurn = false;
            if (player.board.length < TurnStateMachine.MAX_BOARD_SIZE) {
                card.zone = 'board';
                player.board.push(card);
            } else {
                // Board full: the minion is discarded rather than played, since it has nowhere to be summoned.
                card.zone = 'graveyard';
                player.graveyard.push(card);
            }
        } else {
            card.zone = 'graveyard';
            player.graveyard.push(card);
        }

        this.setPhase(TurnPhase.Resolving);
        this.triggerEffects(card, 'onPlay', player.id, chosenTargetId);
        this.sweepDeaths();
        EventBus.emit('state:card-played', { instanceId, playerId: player.id });
        this.finishResolving();
    }

    private executeAttack(attackerInstanceId: string, targetId: string): void {
        const player = this.gameState.players[this.gameState.activePlayer];
        const attacker = player.board.find((c) => c.instanceId === attackerInstanceId);
        if (!attacker) return;

        this.setPhase(TurnPhase.Resolving);
        attacker.hasAttackedThisTurn = true;

        const attackDamage = attacker.currentAttack ?? 0;
        this.dealDamage(targetId, attackDamage);

        if (!this.isPlayerId(targetId)) {
            const defender = this.findMinion(targetId);
            if (defender) {
                this.dealDamage(attackerInstanceId, defender.instance.currentAttack ?? 0);
            }
        }

        this.sweepDeaths();
        EventBus.emit('state:attack', { attackerInstanceId, targetId });
        this.finishResolving();
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

        for (const card of player.board) {
            card.summoningSick = false;
            card.hasAttackedThisTurn = false;
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

    // --- targeting -----------------------------------------------------------

    private beginTargeting(action: PendingAction, ownerId: PlayerId): void {
        this.pendingAction = action;
        this.gameState.pendingTarget = {
            sourceInstanceId: action.type === 'playCard' ? action.instanceId : action.attackerInstanceId,
            validTargetIds: this.computeValidTargets(action, ownerId),
        };
        this.setPhase(TurnPhase.AwaitingTarget);
    }

    private computeValidTargets(action: PendingAction, ownerId: PlayerId): string[] {
        const opponentId = this.opponentOf(ownerId);
        if (action.type === 'attack') {
            return [opponentId, ...this.gameState.players[opponentId].board.map((c) => c.instanceId)];
        }
        return [
            ownerId,
            opponentId,
            ...this.gameState.players[ownerId].board.map((c) => c.instanceId),
            ...this.gameState.players[opponentId].board.map((c) => c.instanceId),
        ];
    }

    private needsChosenTarget(effects: { action: EffectAction }[] | undefined): boolean {
        return (effects ?? []).some((e) => 'target' in e.action && e.action.target === 'chosen');
    }

    // --- effects ---------------------------------------------------------------

    private triggerEffects(instance: CardInstance, trigger: EffectTrigger, ownerId: PlayerId, chosenTargetId?: string): void {
        const definition = CARD_DEFINITIONS[instance.definitionId];
        const effects = definition?.effects?.filter((e) => e.trigger === trigger) ?? [];
        for (const effect of effects) {
            this.applyEffectAction(effect.action, ownerId, chosenTargetId);
        }
    }

    private applyEffectAction(action: EffectAction, ownerId: PlayerId, chosenTargetId?: string): void {
        switch (action.kind) {
            case 'damage':
            case 'heal':
            case 'buff': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId);
                for (const targetId of targetIds) {
                    if (action.kind === 'damage') this.dealDamage(targetId, action.amount);
                    else if (action.kind === 'heal') this.heal(targetId, action.amount);
                    else this.buff(targetId, action.attack ?? 0, action.health ?? 0);
                }
                break;
            }
            case 'draw':
                for (let i = 0; i < action.count; i++) this.drawCard(ownerId);
                break;
            case 'summon':
                for (let i = 0; i < action.count; i++) this.summonMinion(action.definitionId, ownerId);
                break;
        }
    }

    private resolveTargetIds(selector: TargetSelector, ownerId: PlayerId, chosenTargetId?: string): string[] {
        const opponentId = this.opponentOf(ownerId);
        switch (selector) {
            case 'self':
            case 'friendlyHero':
                return [ownerId];
            case 'enemyHero':
                return [opponentId];
            case 'chosen':
                return chosenTargetId ? [chosenTargetId] : [];
            case 'allFriendlyMinions':
                return this.gameState.players[ownerId].board.map((c) => c.instanceId);
            case 'allEnemyMinions':
                return this.gameState.players[opponentId].board.map((c) => c.instanceId);
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

    private dealDamage(targetId: string, amount: number): void {
        if (this.isPlayerId(targetId)) {
            const player = this.gameState.players[targetId];
            player.health = Math.max(0, player.health - amount);
            return;
        }
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.currentHealth = (found.instance.currentHealth ?? 0) - amount;
        }
    }

    private heal(targetId: string, amount: number): void {
        if (this.isPlayerId(targetId)) {
            const player = this.gameState.players[targetId];
            player.health = player.health + amount;
            return;
        }
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.currentHealth = (found.instance.currentHealth ?? 0) + amount;
        }
    }

    private buff(targetId: string, attack: number, health: number): void {
        const found = this.findMinion(targetId);
        if (found) {
            found.instance.currentAttack = (found.instance.currentAttack ?? 0) + attack;
            found.instance.currentHealth = (found.instance.currentHealth ?? 0) + health;
        }
    }

    /** Single pass: moves dead minions to the graveyard and fires their onDeath triggers. Does not cascade further deaths from those triggers — fine given the current effect set has no onDeath actions. */
    private sweepDeaths(): void {
        for (const player of Object.values(this.gameState.players)) {
            const dead = player.board.filter((c) => (c.currentHealth ?? 0) <= 0);
            if (dead.length === 0) continue;

            player.board = player.board.filter((c) => (c.currentHealth ?? 0) > 0);
            for (const card of dead) {
                card.zone = 'graveyard';
                player.graveyard.push(card);
                EventBus.emit('state:card-died', { instanceId: card.instanceId });
                this.triggerEffects(card, 'onDeath', player.id);
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
