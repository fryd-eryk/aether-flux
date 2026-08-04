import { useRef } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';

function App()
{
    //  Reference to the PhaserGame component (game and scene are exposed), kept for future
    //  React-driven UI (e.g. a deck-list overlay) to reach into the active Phaser scene.
    const phaserRef = useRef<IRefPhaserGame | null>(null);

    return (
        <div id="app">
            <PhaserGame ref={phaserRef} />
        </div>
    )
}

export default App
