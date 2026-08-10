import { CARD_DEFINITIONS } from '../data/cards';
import { createCardInstance } from '../data/cardFactory';
import { EventBus } from '../EventBus';
import type { CardInstance, ChosenTargetRestriction, EffectAction, EffectTrigger, TargetSelector } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';
import { canDeclareAttack, hasKeyword, isTargetable, tauntRestrictedTargets } from './keywordRules';

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
        if (!attacker || !canDeclareAttack(attacker)) return;

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

        if (definition.type === 'minion') {
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
        this.sweepDeaths();
        EventBus.emit('state:card-played', { instanceId, playerId: player.id });
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

        const attackDamage = attacker.currentAttack ?? 0;
        const damageDealt = this.dealDamage(targetId, attackDamage);
        if (damageDealt > 0 && hasKeyword(attacker, 'lifesteal')) {
            this.heal(player.id, damageDealt);
        }
        if (damageDealt > 0 && hasKeyword(attacker, 'venom') && !this.isPlayerId(targetId)) {
            this.forceKill(targetId);
        }

        if (!this.isPlayerId(targetId)) {
            const defender = this.findMinion(targetId);
            if (defender) {
                const returnDamageDealt = this.dealDamage(attackerInstanceId, defender.instance.currentAttack ?? 0);
                if (returnDamageDealt > 0 && hasKeyword(defender.instance, 'lifesteal')) {
                    this.heal(defender.owner.id, returnDamageDealt);
                }
                if (returnDamageDealt > 0 && hasKeyword(defender.instance, 'venom')) {
                    this.forceKill(attackerInstanceId);
                }
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

    // --- targeting -----------------------------------------------------------

    private beginTargeting(action: PendingAction, ownerId: PlayerId): void {
        this.pendingAction = action;
        this.gameState.pendingTarget = {
            sourceInstanceId: action.type === 'playCard' ? action.instanceId : action.attackerInstanceId,
            validTargetIds: this.computeValidTargets(action, ownerId),
        };
        // A card pulled out of hand gets held at the Scene's spotlight while the player picks a
        // target (see CardGame's targetBeginHandler) — an attacker choosing its target never left
        // the board, so it's excluded here.
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

        const allTargets = [
            ownerId,
            opponentId,
            ...this.gameState.players[ownerId].board.filter(isTargetable).map((c) => c.instanceId),
            ...this.gameState.players[opponentId].board.filter(isTargetable).map((c) => c.instanceId),
        ];

        const restriction = this.chosenTargetRestriction(action.instanceId, ownerId);
        if (restriction === 'minion') return allTargets.filter((id) => !this.isPlayerId(id));
        if (restriction === 'hero') return allTargets.filter((id) => this.isPlayerId(id));
        return allTargets;
    }

    /** The chosenRestriction (if any) of the onPlay effect that's about to prompt targeting for this hand card — see needsChosenTarget, which only enters AwaitingTarget for a card that has exactly one such effect. */
    private chosenTargetRestriction(instanceId: string, ownerId: PlayerId): ChosenTargetRestriction | undefined {
        const card = this.gameState.players[ownerId].hand.find((c) => c.instanceId === instanceId);
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
            case 'freeze': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId);
                for (const targetId of targetIds) this.freezeMinion(targetId);
                break;
            }
            case 'silence': {
                const targetIds = this.resolveTargetIds(action.target, ownerId, chosenTargetId);
                for (const targetId of targetIds) this.silenceMinion(targetId);
                break;
            }
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
            case 'allMinions':
                return [...this.gameState.players[ownerId].board, ...this.gameState.players[opponentId].board].map((c) => c.instanceId);
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
        if (definition?.type === 'minion') {
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

    /** Kills a minion outright regardless of remaining health — used by Venom, after dealDamage has
     * already confirmed the hit actually landed (not absorbed by Divine Shield). */
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

    /** Single pass: moves dead minions to the graveyard and fires their onDeath triggers. Does not cascade further deaths from those triggers — fine given the current effect set has no onDeath actions. */
    private sweepDeaths(): void {
        for (const player of Object.values(this.gameState.players)) {
            const dead = player.board.filter((c) => (c.currentHealth ?? 0) <= 0);
            if (dead.length === 0) continue;

            player.board = player.board.filter((c) => (c.currentHealth ?? 0) > 0);
            for (const card of dead) {
                this.moveToGraveyard(card, player);
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
