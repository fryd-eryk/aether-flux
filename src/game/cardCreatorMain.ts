import { AUTO, Game, Scale } from 'phaser';

import { CardCreatorPreview } from './scenes/CardCreatorPreview';
import { CARD_H, CARD_W } from './scenes/CardGame/cardLayout';

// A generous margin around the card itself so Scale.FIT has room to letterbox instead
// of rendering the card at a cramped native 1:1 pixel scale inside a much wider pane.
const PREVIEW_MARGIN = 60;

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: CARD_W + PREVIEW_MARGIN * 2,
    height: CARD_H + PREVIEW_MARGIN * 2,
    backgroundColor: '#161b26',
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH,
    },
    scene: [
        CardCreatorPreview,
    ],
};

export function StartCardCreatorPreview (parent: string)
{
    return new Game({ ...config, parent });
}
