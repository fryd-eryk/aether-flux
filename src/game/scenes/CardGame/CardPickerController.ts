import { Geom, type Scene } from 'phaser';

import { createCardInstance } from '../../data/cardFactory';
import { CARD_DEFINITIONS } from '../../data/cards';
import { resolveCardText } from '../../state/counters';
import type { CardDefinition } from '../../types/Card';
import type { GameState } from '../../types/GameState';
import type { CardView } from './CardView';
import {
    CARD_H,
    CARD_W,
    CENTER_X,
    createOverlayChrome,
    GAME_WIDTH,
    PILE_VIEW_BOTTOM,
    PILE_VIEW_DEPTH,
    PILE_VIEW_GAP,
    PILE_VIEW_TOP,
} from './cardLayout';
import type { HelpBoxController } from './HelpBoxController';

/**
 * Playtesting-only cheat overlay — see TurnStateMachine.debugAddCard and SPEC.md's
 * "Playtesting-only features" section. A full-screen, scrollable grid of every minion/spell
 * definition in the game (tokens excluded — summon-only, never directly obtainable, the same
 * exclusion deckGenerator.ts applies when building decks); clicking a card conjures a fresh copy
 * straight into the player's hand via onPick, without closing the overlay, so several cards can be
 * picked in a row. Modeled closely on PileViewController's open()/close()/clear()/render() shape
 * (and reuses its overlay chrome via createOverlayChrome), but the card pool here (~70 entries) is
 * far bigger than any single pile ever gets — unlike PileViewController's shrink-to-fit-one-screen
 * grid, this one keeps cards at full size and scrolls instead.
 */
export class CardPickerController
{
    private objects: Phaser.GameObjects.GameObject[] = [];
    private content?: Phaser.GameObjects.Container;
    private isOpen = false;
    private scrollY = 0;
    private maxScroll = 0;

    constructor (
        private scene: Scene,
        private cardView: CardView,
        private helpBox: HelpBoxController,
        private onPick: (definitionId: string) => void
    )
    {
        // Registered once rather than added/removed on open/close — handleWheel no-ops internally
        // while closed, mirroring how CardGame's Esc handler unconditionally calls close() on both
        // this and PileViewController rather than wiring/unwiring listeners per-open.
        this.scene.input.on('wheel', this.handleWheel);
    }

    /** Opens (or re-opens, scrolled back to the top) the overlay and paints it immediately — called directly rather than via CardGame's deferred requestRender(), since the overlay must appear on the click that opened it. */
    open (state: GameState): void
    {
        this.isOpen = true;
        this.scrollY = 0;
        this.render(state);
    }

    close (): void
    {
        this.isOpen = false;
        this.clear();
    }

    clear (): void
    {
        for (const obj of this.objects) obj.destroy();
        this.objects = [];
        this.content = undefined;
    }

    /**
     * Full-screen scrollable grid of every eligible card, or a no-op while closed. Rebuilt
     * wholesale (never patched) on each call, matching PileViewController's render() — content
     * never actually depends on `state` (the card pool is fixed), but this still needs to survive
     * CardGame's teardown/rebuild cycle the same way an open pile view does, so it's wired into the
     * same renderNow()/clearRendered() calls.
     */
    render (state: GameState): void
    {
        this.clear();
        if (!this.isOpen) return;

        this.helpBox.hideHelpBox();

        const chrome = createOverlayChrome(this.scene, 'All Cards — click one to draw a copy (playtesting)', () => this.close());
        this.objects.push(chrome.dimmer, chrome.title, chrome.close, chrome.hint);

        this.renderGrid(state);
    }

    /** Every minion/spell definition, cost then name — the same sort idiom PileViewController.pileViewCards and the Card Creator's CardListSidebar already use for "cards, deck-list order." */
    private eligibleDefinitions (): CardDefinition[]
    {
        return Object.values(CARD_DEFINITIONS)
            .filter((definition) => definition.type !== 'token')
            .sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name));
    }

    /**
     * Fixed-scale grid (no shrink-to-fit, unlike PileViewController.renderGrid) — every card
     * container is a child of one scrollable `content` wrapper, clipped to the overlay's viewport
     * by a GeometryMask and offset by `scrollY` (see handleWheel). Note: the mask clips rendering
     * only, not input hit-testing, so a card scrolled just past the visible edge could in principle
     * still catch a stray click at its now-off-viewport position — an acceptable caveat for a
     * debug-only tool, not worth the extra per-card hit-area clipping to fully close.
     */
    private renderGrid (state: GameState): void
    {
        const definitions = this.eligibleDefinitions();

        const stepX = CARD_W + PILE_VIEW_GAP;
        const stepY = CARD_H + PILE_VIEW_GAP;
        const viewportW = GAME_WIDTH - 160;
        const viewportH = PILE_VIEW_BOTTOM - PILE_VIEW_TOP;
        const columns = Math.max(1, Math.floor(viewportW / stepX));
        const rows = Math.ceil(definitions.length / columns);

        this.maxScroll = Math.max(0, rows * stepY - viewportH);
        this.scrollY = Math.min(this.scrollY, this.maxScroll);

        const content = this.scene.add.container(0, -this.scrollY);
        content.setDepth(PILE_VIEW_DEPTH + 1);

        definitions.forEach((definition, index) =>
        {
            const row = Math.floor(index / columns);
            const column = index % columns;
            // Centre each row on its own count, so a partial final row sits centered rather than
            // left-aligned under a full one — same reasoning as PileViewController.renderGrid.
            const inRow = Math.min(columns, definitions.length - row * columns);

            const instance = createCardInstance(definition, 'player');
            const card = this.cardView.createCardContainer(instance, 'full', undefined, false, false, resolveCardText(instance, state));
            card.setPosition(
                CENTER_X + (column - (inRow - 1) / 2) * stepX,
                PILE_VIEW_TOP + CARD_H / 2 + row * stepY
            );
            card.setInteractive({
                // See renderHero in CardGame — top-left-based, not centered.
                hitArea: new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                hitAreaCallback: Geom.Rectangle.Contains,
                useHandCursor: true,
            });
            // Picker cards render in 'full' mode and already print their cost on-card.
            this.helpBox.attachKeywordHover(card, instance, false, resolveCardText(instance, state));
            // Deliberately doesn't close the overlay — see the class doc comment.
            card.on('pointerup', () => this.onPick(definition.id));

            content.add(card);
        });

        const maskShape = this.scene.add.graphics();
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(80, PILE_VIEW_TOP, viewportW, viewportH);
        maskShape.setVisible(false);
        content.setMask(maskShape.createGeometryMask());

        this.objects.push(content, maskShape);
        this.content = content;
    }

    private handleWheel = (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number): void =>
    {
        if (!this.isOpen || !this.content || this.maxScroll <= 0) return;
        this.scrollY = Math.min(Math.max(this.scrollY + dy, 0), this.maxScroll);
        this.content.y = -this.scrollY;
    };
}
