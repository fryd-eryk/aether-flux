import type { Scene } from 'phaser';

import { CARD_DEFINITIONS } from '../../data/cards';
import { KEYWORD_METADATA } from '../../data/keywordMetadata';
import type { CardInstance } from '../../types/Card';
import { ATKHP_BOX_RADIUS, ATKHP_H_FULL, ATKHP_W_FULL, COST_TEXT_STYLE, GAME_HEIGHT, GAME_WIDTH, MANA_BADGE_COLOR, PILE_VIEW_DEPTH, TOOLTIP_BG_RADIUS, TOOLTIP_COST_CLEARANCE } from './cardLayout';

/**
 * The cursor-following keyword/rule-text tooltip shown on hover for hand and board cards — see
 * showHelpBox for the 'extended' variant board minions get. Owns its own Phaser objects
 * (helpBox/helpBoxBg/helpBoxLines) entirely; the only outside dependency is knowing whether the
 * card currently under the pointer is the one mid-drag (see attachKeywordHover), for which the
 * caller supplies a callback rather than this class reaching into CardGame's drag state directly.
 */
export class HelpBoxController
{
    private helpBox: Phaser.GameObjects.Container;
    /** Redrawn (not resized) on every showHelpBox call, since a plain Rectangle can't have rounded corners — see redrawBg. */
    private helpBoxBg: Phaser.GameObjects.Graphics;
    private boxWidth = 0;
    private boxHeight = 0;
    /** Rebuilt fresh on every showHelpBox call — see its own comment for why this can't be one static Text. Widened to GameObject to also hold the extended tooltip's mana-cost box+text. */
    private helpBoxLines: Phaser.GameObjects.GameObject[] = [];

    constructor (private scene: Scene, private getDraggedContainer: () => Phaser.GameObjects.Container | null)
    {
        this.helpBoxBg = this.scene.add.graphics();
        this.helpBox = this.scene.add.container(0, 0, [this.helpBoxBg]);
        // Above PILE_VIEW_DEPTH — cards inside the pile-inspect overlay keep their keyword hover,
        // so the tooltip has to clear the overlay it is being read on top of.
        this.helpBox.setDepth(PILE_VIEW_DEPTH + 100);
        this.helpBox.setVisible(false);

        this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
        {
            if (this.helpBox.visible) this.positionHelpBox(pointer.x, pointer.y);
        });
    }

    /** Matches the 'full' card layout's description box: black @ 90% opacity, rounded corners, no border. */
    private redrawBg (width: number, height: number): void
    {
        this.boxWidth = width;
        this.boxHeight = height;
        this.helpBoxBg.clear();
        this.helpBoxBg.fillStyle(0x000000, 0.9);
        this.helpBoxBg.fillRoundedRect(0, 0, width, height, TOOLTIP_BG_RADIUS);
    }

    /** Wires the cursor-following keyword help box to a card container. 'extended' (simplified/board cards only) also shows the card's rule text and an overflowing cost badge — see showHelpBox — and drops the "no keywords means no-op" restriction in favor of "no keywords AND no text". */
    attachKeywordHover (container: Phaser.GameObjects.Container, instance: CardInstance, extended: boolean = false): void
    {
        const definition = CARD_DEFINITIONS[instance.definitionId];
        const hasText = extended && !!definition && definition.text !== '';
        if (instance.keywords.size === 0 && !hasText) return;

        // Skip while this card is the one being dragged — see wireDragEvents' dragstart, which
        // hides an already-showing tooltip for it; this stops one from reappearing mid-drag too.
        container.on('pointerover', () => { if (container !== this.getDraggedContainer()) this.showHelpBox(instance, extended); });
        container.on('pointerout', () => this.hideHelpBox());
    }

    /**
     * A plain Phaser Text can't mix styles within one string, so a colored/bold keyword label
     * next to its plain-styled description needs two Text objects per keyword instead of one
     * joined multi-line string — rebuilt every hover since the keyword set differs per card.
     * 'extended' (simplified/board cards only) additionally prepends the card's rule text above
     * the keyword rows and draws a cost badge overflowing the tooltip's top-right corner, with
     * the same presentation as the on-card badge — see CardView.createCardContainer's 'full' mode.
     */
    showHelpBox (instance: CardInstance, extended: boolean = false): void
    {
        this.helpBoxLines.forEach((line) => line.destroy());
        this.helpBoxLines = [];

        const margin = 10;
        const maxWidth = 290;
        const definition = extended ? CARD_DEFINITIONS[instance.definitionId] : undefined;
        const showsCostBadge = extended && !!definition;
        let cursorY = margin + (showsCostBadge ? TOOLTIP_COST_CLEARANCE : 0);
        let maxRight = 0;

        if (definition && definition.text !== '')
        {
            const text = this.scene.add.text(margin, cursorY, definition.text, {
                fontFamily: 'Arial', fontSize: '15px', color: '#ffffff',
                wordWrap: { width: maxWidth },
            }).setOrigin(0, 0);

            this.helpBox.add(text);
            this.helpBoxLines.push(text);

            maxRight = Math.max(maxRight, text.x + text.width);
            cursorY += text.height + 14;
        }

        for (const keyword of instance.keywords)
        {
            const meta = KEYWORD_METADATA[keyword];
            const hex = `#${meta.color.toString(16).padStart(6, '0')}`;

            // Label gets its own line — the description starts fresh on the next one instead of
            // running on immediately after the ":", so a long description always has the tooltip's
            // full width to wrap into rather than whatever's left after the label.
            const label = this.scene.add.text(margin, cursorY, `${meta.label}:`, {
                fontFamily: 'Arial', fontSize: '15px', color: hex, fontStyle: 'bold',
            }).setOrigin(0, 0);
            this.helpBox.add(label);
            this.helpBoxLines.push(label);
            maxRight = Math.max(maxRight, label.x + label.width);
            cursorY += label.height + 2;

            const description = this.scene.add.text(margin, cursorY, meta.description, {
                fontFamily: 'Arial', fontSize: '15px', color: '#ffffff',
                wordWrap: { width: maxWidth },
            }).setOrigin(0, 0);
            this.helpBox.add(description);
            this.helpBoxLines.push(description);
            maxRight = Math.max(maxRight, description.x + description.width);
            cursorY += description.height + 14;
        }

        this.redrawBg(maxRight + margin, cursorY + margin - 4);

        if (showsCostBadge && definition)
        {
            const boxLeft = this.boxWidth - ATKHP_W_FULL / 2;
            const boxTop = -ATKHP_H_FULL / 2;
            const badge = this.scene.add.graphics();
            badge.fillStyle(MANA_BADGE_COLOR, 1);
            badge.fillRoundedRect(boxLeft, boxTop, ATKHP_W_FULL, ATKHP_H_FULL, ATKHP_BOX_RADIUS);
            const badgeText = this.scene.add.text(this.boxWidth, 0, `${definition.cost}`, COST_TEXT_STYLE).setOrigin(0.5);
            this.helpBox.add([badge, badgeText]);
            this.helpBoxLines.push(badge, badgeText);
        }

        this.helpBox.setVisible(true);

        const pointer = this.scene.input.activePointer;
        this.positionHelpBox(pointer.x, pointer.y);
    }

    hideHelpBox (): void
    {
        this.helpBox.setVisible(false);
    }

    private positionHelpBox (x: number, y: number): void
    {
        const offset = 20;
        const width = this.boxWidth;
        const height = this.boxHeight;

        const px = x + offset + width > GAME_WIDTH ? x - offset - width : x + offset;
        const py = y + offset + height > GAME_HEIGHT ? y - offset - height : y + offset;

        this.helpBox.setPosition(px, py);
    }
}
