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
}

export interface PlayerState {
    id: PlayerId;
    health: number;
    maxHealth: number;
    mana: number;
    maxMana: number;
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
