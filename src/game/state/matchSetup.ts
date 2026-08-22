import type { SavedDeck } from '../types/Deck';

/** Hands the player's chosen deck from React (DeckSelectScreen) to Phaser (CardGame.create())
 * across the boot chain, which carries no scene.start() data today. Same "plain module-level
 * singleton" pattern as EventBus. Stores the resolved deck object, not just an id, so an edit/
 * delete elsewhere between selection and match boot can't leave a dangling reference. */
let playerDeckForMatch: SavedDeck | undefined;

export function setPlayerDeckForMatch(deck: SavedDeck): void {
    playerDeckForMatch = deck;
}

export function getPlayerDeckForMatch(): SavedDeck | undefined {
    return playerDeckForMatch;
}
