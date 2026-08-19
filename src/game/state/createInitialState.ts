import { CARD_DEFINITIONS } from '../data/cards';
import { buildDeck, shuffle } from '../data/cardFactory';
import type { PlayerId } from '../types/common';
import type { GameState, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';

function createPlayerState(id: PlayerId, mainDeckIds: string[], aetherDeckIds: string[]): PlayerState {
    return {
        id,
        health: 30,
        maxHealth: 30,
        cardsPlayedThisTurn: 0,
        deck: shuffle(buildDeck(mainDeckIds, id, CARD_DEFINITIONS)),
        hand: [],
        board: [],
        graveyard: [],
        aetherDeck: shuffle(buildDeck(aetherDeckIds, id, CARD_DEFINITIONS, 'aetherDeck')),
        aetherInPlay: [],
        aetherDrawnThisTurn: false,
        aetherPlayedThisTurn: false,
    };
}

export function createInitialState(
    playerMainDeck: string[],
    playerAetherDeck: string[],
    opponentMainDeck: string[],
    opponentAetherDeck: string[]
): GameState {
    return {
        players: {
            player: createPlayerState('player', playerMainDeck, playerAetherDeck),
            opponent: createPlayerState('opponent', opponentMainDeck, opponentAetherDeck),
        },
        activePlayer: 'player',
        turnNumber: 1,
        phase: TurnPhase.GameStart,
    };
}
