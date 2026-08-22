import { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { DeckSelectScreen } from './deckBuilder/components/DeckSelectScreen';
import { setPlayerDeckForMatch } from './game/state/matchSetup';
import type { SavedDeck } from './game/types/Deck';

function App()
{
    //  Reference to the PhaserGame component (game and scene are exposed), kept for future
    //  React-driven UI to reach into the active Phaser scene.
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    // PhaserGame only ever mounts once (see its own useLayoutEffect), so the player's deck must
    // be chosen before that happens — there's no scene.start() data channel through Boot/
    // Preloader/CardGame today. See matchSetup.ts.
    const [deckChosen, setDeckChosen] = useState(false);

    function handleDeckSelected(deck: SavedDeck)
    {
        setPlayerDeckForMatch(deck);
        setDeckChosen(true);
    }

    if (!deckChosen)
    {
        return <DeckSelectScreen onSelect={handleDeckSelected} />;
    }

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
        </div>
    )
}

export default App
