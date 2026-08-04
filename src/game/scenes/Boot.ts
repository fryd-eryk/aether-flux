import { Scene } from 'phaser';

export class Boot extends Scene
{
    constructor ()
    {
        super('Boot');
    }

    preload ()
    {
        //  The Boot Scene is typically used to load in any assets you require for your Preloader,
        //  such as a small logo or background. Nothing needed yet — add card art loads here later.
    }

    create ()
    {
        this.scene.start('Preloader');
    }
}
