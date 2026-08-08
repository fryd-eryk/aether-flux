import { Geom, type Scene } from 'phaser';

import { CARD_DEFINITIONS } from '../../data/cards';
import type { CardInstance } from '../../types/Card';
import type { PlayerId } from '../../types/common';
import type { GameState } from '../../types/GameState';
import type { CardView } from './CardView';
import {
    CARD_H,
    CARD_W,
    CENTER_X,
    CENTER_Y,
    GAME_HEIGHT,
    GAME_WIDTH,
    getPileCards,
    PILE_VIEW_BOTTOM,
    PILE_VIEW_DEPTH,
    PILE_VIEW_GAP,
    PILE_VIEW_MAX_COLUMNS,
    PILE_VIEW_TOP,
    type PileZone,
    PILE_STYLES,
} from './cardLayout';
import type { HelpBoxController } from './HelpBoxController';

/**
 * The full-screen dimmed grid opened by clicking a deck/graveyard pile. Which pile is open
 * (openPileView) is state that has to survive a board rebuild — CardGame's renderNow() tears the
 * overlay down with everything else on every rebuild and calls render() again at its tail, so an
 * open pile keeps showing live contents as cards are drawn or die beneath it (e.g. during the
 * opponent's turn, which rebuilds the board every 600ms). render()/open() take the current
 * GameState as a parameter rather than this class owning a TurnStateMachine reference.
 */
export class PileViewController
{
    private objects: Phaser.GameObjects.GameObject[] = [];
    private openPile?: { playerId: PlayerId; zone: PileZone };

    constructor (private scene: Scene, private cardView: CardView, private helpBox: HelpBoxController) {}

    /** Opens (or switches) the overlay and paints it immediately — called directly rather than via CardGame's deferred requestRender(), since the overlay must appear on the click that opened it. */
    open (playerId: PlayerId, zone: PileZone, state: GameState): void
    {
        this.openPile = { playerId, zone };
        this.render(state);
    }

    close (): void
    {
        this.openPile = undefined;
        this.clear();
    }

    clear (): void
    {
        for (const obj of this.objects) obj.destroy();
        this.objects = [];
    }

    /**
     * Full-screen dimmed grid of whichever pile is currently open, or a no-op when none is.
     * Rebuilt wholesale (never patched) on each call, matching how the board itself renders.
     */
    render (state: GameState): void
    {
        this.clear();
        if (!this.openPile) return;

        this.helpBox.hideHelpBox();

        const { playerId, zone } = this.openPile;
        const style = PILE_STYLES[zone];
        const cards = this.pileViewCards(playerId, zone, state);

        // Interactive so a click anywhere off a card dismisses the view — and, more importantly,
        // so the board underneath cannot be clicked through it. Phaser's InputPlugin is topOnly by
        // default, so this full-screen rect swallows every pointer event below PILE_VIEW_DEPTH.
        const dimmer = this.scene.add.rectangle(CENTER_X, CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82)
            .setDepth(PILE_VIEW_DEPTH)
            .setInteractive();
        dimmer.on('pointerup', () => this.close());
        this.objects.push(dimmer);

        const owner = playerId === 'player' ? 'Your' : "Opponent's";
        const title = this.scene.add.text(CENTER_X, 52, `${owner} ${style.title} — ${cards.length} card${cards.length === 1 ? '' : 's'}`, {
            fontFamily: 'Arial Black', fontSize: '36px', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(PILE_VIEW_DEPTH + 1);
        this.objects.push(title);

        const close = this.scene.add.text(GAME_WIDTH - 48, 52, '✕ Close', {
            fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', backgroundColor: '#3a4a6b',
        }).setOrigin(1, 0).setPadding(16, 9, 16, 9).setDepth(PILE_VIEW_DEPTH + 1).setInteractive({ useHandCursor: true });
        close.on('pointerup', () => this.close());
        this.objects.push(close);

        const hint = this.scene.add.text(CENTER_X, GAME_HEIGHT - 34, 'Click anywhere or press Esc to close', {
            fontFamily: 'Arial', fontSize: '16px', color: '#8fa8d6',
        }).setOrigin(0.5, 1).setDepth(PILE_VIEW_DEPTH + 1);
        this.objects.push(hint);

        if (cards.length === 0)
        {
            const empty = this.scene.add.text(CENTER_X, CENTER_Y, `This ${style.title.toLowerCase()} is empty.`, {
                fontFamily: 'Arial', fontSize: '28px', color: '#b8c4d9', fontStyle: 'italic',
            }).setOrigin(0.5).setDepth(PILE_VIEW_DEPTH + 1);
            this.objects.push(empty);
            return;
        }

        this.renderGrid(cards);
    }

    /**
     * Deck contents are sorted by cost then name so opening your own deck reads as a deck list
     * and does not leak the shuffled draw order. The graveyard keeps its natural array order,
     * which TurnStateMachine appends to on each death/discard — i.e. chronological.
     */
    private pileViewCards (playerId: PlayerId, zone: PileZone, state: GameState): CardInstance[]
    {
        const cards = getPileCards(state.players[playerId], zone);
        if (zone !== 'deck') return cards;

        return [...cards].sort((a, b) =>
        {
            const defA = CARD_DEFINITIONS[a.definitionId];
            const defB = CARD_DEFINITIONS[b.definitionId];
            return defA.cost - defB.cost || defA.name.localeCompare(defB.name);
        });
    }

    /** Lays the cards out in a centered grid, scaled down just far enough that the whole pile fits on one screen — no scrolling, however big the zone gets. */
    private renderGrid (cards: CardInstance[]): void
    {
        const columns = Math.min(PILE_VIEW_MAX_COLUMNS, cards.length);
        const rows = Math.ceil(cards.length / columns);

        const availableW = GAME_WIDTH - 160;
        const availableH = PILE_VIEW_BOTTOM - PILE_VIEW_TOP;
        const scale = Math.min(
            1,
            availableW / (columns * (CARD_W + PILE_VIEW_GAP)),
            availableH / (rows * (CARD_H + PILE_VIEW_GAP)),
        );

        const stepX = (CARD_W + PILE_VIEW_GAP) * scale;
        const stepY = (CARD_H + PILE_VIEW_GAP) * scale;
        const originY = PILE_VIEW_TOP + (availableH - rows * stepY) / 2 + stepY / 2;

        cards.forEach((instance, index) =>
        {
            const row = Math.floor(index / columns);
            const column = index % columns;
            // Centre each row on its own count, so a partial final row sits centered rather than
            // left-aligned under a full one.
            const inRow = Math.min(columns, cards.length - row * columns);

            const card = this.cardView.createCardContainer(instance, 'full');
            card.setPosition(CENTER_X + (column - (inRow - 1) / 2) * stepX, originY + row * stepY);
            card.setScale(scale);
            card.setDepth(PILE_VIEW_DEPTH + 1);
            card.setInteractive(
                // See renderHero in CardGame — top-left-based, not centered. The container's
                // scale applies to the hit area too, so this needs no scale compensation of its own.
                new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                Geom.Rectangle.Contains
            );
            this.helpBox.attachKeywordHover(card, instance);

            this.objects.push(card);
        });
    }
}
