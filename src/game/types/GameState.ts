import type { CardInstance } from './Card';
import type { PlayerId } from './common';

export enum TurnPhase {
    GameStart = 'GAME_START',
    TurnStart = 'TURN_START',
    MainIdle = 'MAIN_IDLE',
    AwaitingTarget = 'AWAITING_TARGET',
    Resolving = 'RESOLVING',
    CheckState = 'CHECK_STATE',
    TurnEnd = 'TURN_END',
    GameOver = 'GAME_OVER',
}

export interface PendingTarget {
    sourceInstanceId: string;
    validTargetIds: string[];
    /** 1-based position in the current play/ability's chosen-target queue, and the queue's total
     * length — a card/ability with N `target: 'chosen'` actions prompts N times in sequence, one
     * target each, rather than sharing a single target across all of them. See
     * TurnStateMachine.beginTargeting/advanceTargeting. */
    step: number;
    totalSteps: number;
}

export interface PlayerState {
    id: PlayerId;
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
    /** Reset to 0 in TurnStateMachine.startTurn; incremented once per card in executePlayCard. Drives Momentum(N) condition gating. */
    cardsPlayedThisTurn: number;
    deck: CardInstance[];
    hand: CardInstance[];
    board: CardInstance[];
    graveyard: CardInstance[];
}

export interface GameState {
    players: Record<PlayerId, PlayerState>;
    activePlayer: PlayerId;
    turnNumber: number;
    phase: TurnPhase;
    pendingTarget?: PendingTarget;
    winner?: PlayerId;
}
