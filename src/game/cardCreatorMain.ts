import { AUTO, Game, Scale } from 'phaser';

import { CardCreatorPreview, RENDER_SCALE } from './scenes/CardCreatorPreview';
import { CARD_H, CARD_W } from './scenes/CardGame/cardLayout';

// A generous margin around the card itself so Scale.FIT has room to letterbox instead
// of rendering the card at a cramped native 1:1 pixel scale inside a much wider pane.
const PREVIEW_MARGIN = 60;

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    // RENDER_SCALE-multiplied so Scale.FIT's CSS stretch to the pane's actual size is
    // usually a downscale rather than an upscale — see CardCreatorPreview.ts's
    // RENDER_SCALE comment for why an un-multiplied 1:1 canvas rendered blurry.
    width: (CARD_W + PREVIEW_MARGIN * 2) * RENDER_SCALE,
    height: (CARD_H + PREVIEW_MARGIN * 2) * RENDER_SCALE,
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
