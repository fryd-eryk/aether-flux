import { Scene } from 'phaser';

import { EventBus } from '../EventBus';
import { CardView } from './CardGame/CardView';
import type { CardDisplayMode } from './CardGame/cardLayout';
import type { CardDefinition } from '../types/Card';
import { buildPreviewInstance } from '../../cardCreator/fakeCardInstance';

export interface CardCreatorPreviewUpdate {
    definition: CardDefinition;
    mode: Exclude<CardDisplayMode, 'faceDown'>;
}

// How many internal render pixels the preview uses per CardView "logical" pixel (its
// fixed CARD_W/CARD_H=150x225 coordinate space). Phaser's Scale.FIT stretches the game
// canvas's actual backing pixel buffer via CSS to fill whatever size the pane ends up
// being — rendering at the card's native 150x225 and relying on that CSS stretch alone
// blurs everything (on-card Text is separately kept crisp regardless of this by
// cardLayout.ts's CARD_TEXT_RESOLUTION, baked into every on-card TextStyle — see its
// comment for why; this constant only has to cover images/graphics, which have plenty
// of native resolution already and just need the canvas itself not to be too small).
// Rendering RENDER_SCALE-times bigger internally (see cardCreatorMain.ts) means the
// eventual CSS stretch is usually a *downscale* instead, which browsers do cleanly.
export const RENDER_SCALE = 3;

/**
 * A standalone Scene (own Game instance, see cardCreatorMain.ts) that renders exactly
 * one card via the real CardView, driven by React form data instead of a running
 * TurnStateMachine — see the Card Creator plan. Deliberately skips Boot/Preloader's
 * card-back + every card's art (only the two 'full' mode PNGs are needed up front);
 * a selected/edited card's own art loads lazily in handleUpdate as its id changes.
 */
export class CardCreatorPreview extends Scene
{
    private cardView!: CardView;
    private container: Phaser.GameObjects.Container | null = null;

    constructor ()
    {
        super('CardCreatorPreview');
    }

    preload ()
    {
        this.load.setPath('assets');

        // Same keys/paths as Preloader.ts — must match cardLayout.ts's HEADER_BG_KEY/FOOTER_BG_KEY.
        this.load.image('card-header-bg', 'textures/card-header-bg.png');
        this.load.image('card-footer-bg', 'textures/card-footer-bg.png');
    }

    create ()
    {
        this.cardView = new CardView(this);

        EventBus.on('card-creator:preview-update', this.handleUpdate);
        this.events.once('shutdown', () => EventBus.removeListener('card-creator:preview-update', this.handleUpdate));

        EventBus.emit('card-creator:preview-ready', this);
    }

    private handleUpdate = ({ definition, mode }: CardCreatorPreviewUpdate): void =>
    {
        if (this.textures.exists(definition.id))
        {
            this.rebuild(definition, mode);
            return;
        }

        const folder = definition.type === 'minion' ? 'minions' : 'spells';
        this.load.image(definition.id, `${folder}/${definition.id}.jpg`);
        // 'complete' is Phaser.Loader.Events.COMPLETE's runtime value — using the string
        // literal avoids importing another Phaser namespace by name just for one constant.
        this.load.once('complete', () => this.rebuild(definition, mode));
        this.load.start();
    };

    private rebuild (definition: CardDefinition, mode: Exclude<CardDisplayMode, 'faceDown'>): void
    {
        this.container?.destroy();

        const fakeInstance = buildPreviewInstance(definition);
        this.container = this.cardView.createCardContainer(fakeInstance, mode, definition);
        this.container.setScale(RENDER_SCALE);
        this.container.setPosition(this.cameras.main.centerX, this.cameras.main.centerY);
    }
}
