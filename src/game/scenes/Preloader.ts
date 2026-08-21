import { Scene } from 'phaser';

import { CARD_DEFINITIONS } from '../data/cards';
import { ART_FOLDER_BY_TYPE, CARD_BACK_AETHER_KEY, CARD_BACK_KEY, loadFrozenTexture, loadHeaderFooterBg } from './CardGame/cardLayout';
import { ensureCardFontsLoaded } from '../fonts';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        const centerX = this.cameras.main.centerX;
        const centerY = this.cameras.main.centerY;

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(centerX, centerY, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(centerX - 230, centerY, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        this.load.setPath('assets');

        // Each card's id maps to a jpg under a type-named subfolder. Most don't have an
        // asset yet — a failed load just fires a per-file loaderror and leaves the texture
        // absent, which createCardContainer's this.textures.exists() check falls back on.
        for (const definition of Object.values(CARD_DEFINITIONS))
        {
            const folder = ART_FOLDER_BY_TYPE[definition.type];
            this.load.image(definition.id, `${folder}/${definition.id}.jpg`);
        }

        // Shared face-down texture — key must match CardGame.ts's CARD_BACK_KEY.
        this.load.image(CARD_BACK_KEY, 'card-back/default.jpg');
        // Distinct face-down texture for `type: 'aether'` cards — see CardView's createCardContainer.
        this.load.image(CARD_BACK_AETHER_KEY, 'card-back/aether.jpg');

        loadHeaderFooterBg(this);
        loadFrozenTexture(this);
    }

    async create ()
    {
        //  When all the assets have loaded, it's often worth creating global objects here that the rest of the game can use.
        //  For example, you can define global animations here, so we can use them in other scenes.

        await ensureCardFontsLoaded();
        this.scene.start('CardGame');
    }
}
