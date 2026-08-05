import { Boot } from './scenes/Boot';
import { CardGame } from './scenes/CardGame';
import { AUTO, Game, Scale } from 'phaser';
import { Preloader } from './scenes/Preloader';

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1920,
    height: 1080,
    parent: 'game-container',
    backgroundColor: '#161b26',
    scale: {
        // Base resolution stays 1920x1080 (16:9); FIT scales it to the parent element while
        // preserving that aspect ratio (letterboxing rather than stretching/cropping), and
        // CENTER_BOTH keeps the letterboxed canvas centered in the parent.
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
    },
    scene: [
        Boot,
        Preloader,
        CardGame
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
