import type { Scene } from 'phaser';

import { CARD_DEFINITIONS } from '../../data/cards';
import { KEYWORD_METADATA } from '../../data/keywordMetadata';
import type { CardInstance } from '../../types/Card';
import {
    COST_BADGE_DARK,
    COST_BADGE_LIGHT,
    COST_BADGE_R_FULL,
    COST_BADGE_STROKE_COLOR,
    COST_BADGE_STROKE_WIDTH,
    COST_TEXT_STYLE,
    GAME_HEIGHT,
    GAME_WIDTH,
    PILE_VIEW_DEPTH,
    TOOLTIP_BG_RADIUS,
    TOOLTIP_COST_CLEARANCE,
} from './cardLayout';

/**
 * The card-anchored keyword/rule-text/mana-cost tooltip shown on hover for hand, board, and pile
 * cards — keywords and rule text always show the same way regardless of CardDisplayMode, but the
 * mana-cost badge is conditional (see attachKeywordHover/showHelpBox's `showCost`): 'full' mode
 * cards (hand, pile-view) already print their cost on-card, so showing it again here would be
 * redundant — only 'simplified' (board) cards, which never show cost on-card, get it in the
 * tooltip, styled identically to the on-card badge (COST_BADGE_*). Anchored to the hovered card's
 * own bounds (top edge, right side by default) rather than following the cursor — see
 * positionHelpBox. Owns its own Phaser objects (helpBox/helpBoxBg/helpBoxLines) entirely; the only
 * outside dependency is knowing whether the card currently under the pointer is the one mid-drag
 * (see attachKeywordHover), for which the caller supplies a callback rather than this class
 * reaching into CardGame's drag state directly.
 */
export class HelpBoxController
{
    private helpBox: Phaser.GameObjects.Container;
    /** Redrawn (not resized) on every showHelpBox call, since a plain Rectangle can't have rounded corners — see redrawBg. */
    private helpBoxBg: Phaser.GameObjects.Graphics;
    private boxWidth = 0;
    private boxHeight = 0;
    /** Rebuilt fresh on every showHelpBox call — see its own comment for why this can't be one static Text. Widened to GameObject to also hold the tooltip's mana-cost box+text. */
    private helpBoxLines: Phaser.GameObjects.GameObject[] = [];
    /** The card the tooltip is currently anchored to, or null while hidden — see refreshPosition. */
    private currentContainer: Phaser.GameObjects.Container | null = null;

    constructor (private scene: Scene, private getDraggedContainer: () => Phaser.GameObjects.Container | null)
    {
        this.helpBoxBg = this.scene.add.graphics();
        this.helpBox = this.scene.add.container(0, 0, [this.helpBoxBg]);
        // Above PILE_VIEW_DEPTH — cards inside the pile-inspect overlay keep their keyword hover,
        // so the tooltip has to clear the overlay it is being read on top of.
        this.helpBox.setDepth(PILE_VIEW_DEPTH + 100);
        this.helpBox.setVisible(false);
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

    /**
     * Wires the card-anchored keyword/text/cost help box to a card container. `showCost` should be
     * true only for 'simplified' (board) cards — see the class doc comment for why 'full' mode
     * (hand, pile-view) never needs it repeated here. A vanilla, cost-less-tooltip card (no
     * keywords, no rule text, and `showCost` false) gets no tooltip at all — nothing to say beyond
     * what's already printed on the card.
     */
    attachKeywordHover (container: Phaser.GameObjects.Container, instance: CardInstance, showCost: boolean): void
    {
        const definition = CARD_DEFINITIONS[instance.definitionId];
        if (!definition) return;
        if (!showCost && instance.keywords.size === 0 && definition.text === '') return;

        // Skip while this card is the one being dragged — see wireDragEvents' dragstart, which
        // hides an already-showing tooltip for it; this stops one from reappearing mid-drag too.
        container.on('pointerover', () => { if (container !== this.getDraggedContainer()) this.showHelpBox(instance, container, showCost); });
        container.on('pointerout', () => this.hideHelpBox());
    }

    /**
     * A plain Phaser Text can't mix styles within one string, so a colored/bold keyword label
     * next to its plain-styled description needs two Text objects per keyword instead of one
     * joined multi-line string — rebuilt every hover since the keyword set differs per card.
     * Always prepends the card's rule text above the keyword rows; `showCost` (see
     * attachKeywordHover) additionally draws a mana-cost badge overflowing the tooltip's top-right
     * corner, with the same gradient-circle-plus-stroke presentation as the on-card badge — see
     * CardView.createHeaderFull.
     */
    showHelpBox (instance: CardInstance, container: Phaser.GameObjects.Container, showCost: boolean): void
    {
        const definition = CARD_DEFINITIONS[instance.definitionId];
        if (!definition) return;

        this.helpBoxLines.forEach((line) => line.destroy());
        this.helpBoxLines = [];

        const margin = 10;
        const maxWidth = 290;
        let cursorY = margin + (showCost ? TOOLTIP_COST_CLEARANCE : 0);
        let maxRight = 0;

        if (definition.text !== '')
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

        if (showCost)
        {
            const badge = this.scene.add.graphics();
            badge.fillGradientStyle(COST_BADGE_LIGHT, COST_BADGE_LIGHT, COST_BADGE_DARK, COST_BADGE_DARK, 1, 1, 1, 1);
            badge.fillCircle(this.boxWidth, 0, COST_BADGE_R_FULL);
            badge.lineStyle(COST_BADGE_STROKE_WIDTH, COST_BADGE_STROKE_COLOR, 1);
            badge.strokeCircle(this.boxWidth, 0, COST_BADGE_R_FULL);
            const badgeText = this.scene.add.text(this.boxWidth, 0, `${definition.cost}`, COST_TEXT_STYLE).setOrigin(0.5);
            this.helpBox.add([badge, badgeText]);
            this.helpBoxLines.push(badge, badgeText);
        }

        this.helpBox.setVisible(true);
        this.currentContainer = container;
        this.positionHelpBox(container);
    }

    hideHelpBox (): void
    {
        this.helpBox.setVisible(false);
        this.currentContainer = null;
    }

    /**
     * Re-anchors the tooltip to `container`'s *current* bounds, but only if it's still the card
     * the tooltip is showing for — a no-op otherwise (including while hidden). Needed because
     * showHelpBox positions once at hover-start using whatever bounds the card has right then, but
     * a hand card's "peek" rise (see renderHand's peekIn tween in CardGame) moves it afterward on
     * its own tween, independent of any pointer event. Call this from that tween's onUpdate so the
     * tooltip tracks the card instead of staying pinned to its pre-peek (lower, near the screen's
     * bottom edge) position for the whole 150ms rise.
     */
    refreshPosition (container: Phaser.GameObjects.Container): void
    {
        if (this.currentContainer !== container) return;
        this.positionHelpBox(container);
    }

    /**
     * Anchored to the hovered card's own on-screen bounds (via getBounds(), so hand-fan rotation
     * and pile-view scaling are both already accounted for) rather than the cursor. Top edge always
     * lines up with the card's top border; horizontally prefers the card's right side, falling back
     * to the left when the tooltip wouldn't fit on the right. If it would still overflow the bottom
     * of the screen, it's nudged upward just enough to keep its full height on-screen — never above
     * the card's own top edge, since that's the tooltip's other fixed alignment.
     */
    private positionHelpBox (container: Phaser.GameObjects.Container): void
    {
        const bounds = container.getBounds();
        const width = this.boxWidth;
        const height = this.boxHeight;
        const gap = 8;

        const fitsRight = bounds.right + gap + width <= GAME_WIDTH;
        const px = fitsRight ? bounds.right + gap : bounds.left - gap - width;

        const py = Math.min(bounds.top, GAME_HEIGHT - height);

        this.helpBox.setPosition(px, py);
    }
}
