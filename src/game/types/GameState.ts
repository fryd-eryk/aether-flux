import type { CardInstance, EffectAction } from './Card';
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
    /** The chosen-target EffectAction generating this prompt — absent only for an attack's own
     * first step (who to attack), which isn't itself an EffectAction. Lets the AI dispatch the
     * right scoring heuristic (scoreChosenTarget) for a prompt it may not have declared itself —
     * e.g. a board-wide Channel/Muster/Vigil/Curfew reaction — see ai/OpponentAI.decideOpponentTarget. */
    action?: EffectAction;
    /** False only during the startTurn/Vigil targeting phase, which follows irreversible
     * turn-transition mutations (mana refresh, draw, the prior endTurn/Curfew resolution) that
     * can't be cleanly undone — see TurnStateMachine.cancelTarget. True everywhere else. */
    cancellable: boolean;
    /** 1-based position in the current action's chosen-target prompt sequence, and its total
     * length — an action with N `target: 'chosen'` actions (its own, plus any board-wide reaction
     * they trigger) prompts N times in sequence, one target each, rather than sharing a single
     * target across all of them. See TurnStateMachine.beginTargeting/currentPendingTarget. */
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
