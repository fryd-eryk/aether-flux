import { CARD_DEFINITIONS } from '../data/cards';
import { buildDeck, shuffle } from '../data/cardFactory';
import type { PlayerId } from '../types/common';
import type { GameState, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';

function createPlayerState(id: PlayerId, deckCardIds: string[]): PlayerState {
    return {
        id,
        health: 30,
        maxHealth: 30,
        mana: 0,
        maxMana: 0,
        cardsPlayedThisTurn: 0,
        deck: shuffle(buildDeck(deckCardIds, id, CARD_DEFINITIONS)),
        hand: [],
        board: [],
        graveyard: [],
    };
}

export function createInitialState(playerDeck: string[], opponentDeck: string[]): GameState {
    return {
        players: {
            player: createPlayerState('player', playerDeck),
            opponent: createPlayerState('opponent', opponentDeck),
        },
        activePlayer: 'player',
        turnNumber: 1,
        phase: TurnPhase.GameStart,
    };
}
