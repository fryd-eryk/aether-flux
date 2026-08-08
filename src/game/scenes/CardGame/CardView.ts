import type { Scene } from 'phaser';

import { CARD_DEFINITIONS } from '../../data/cards';
import { KEYWORD_METADATA } from '../../data/keywordMetadata';
import { distinctTriggers, TRIGGER_METADATA } from '../../data/triggerMetadata';
import type { CardDefinition, CardInstance } from '../../types/Card';
import {
    ATKHP_H,
    ATKHP_W,
    CARD_BACK_KEY,
    CARD_H,
    CARD_W,
    coverFit,
    COST_BADGE_R,
    COST_TEXT_STYLE,
    type CardDisplayMode,
    FOOTER_H,
    HEADER_H,
    KEYWORD_LABEL_BASE_STYLE,
    KEYWORD_SEPARATOR_STYLE,
    MISSING_ASSET_STYLE,
    NAME_STYLE,
    PILL_H,
    PILL_INSET_X,
    PILL_INSET_Y,
    PILL_LABEL_STYLE,
    PILL_PAD_X,
    PILL_ROW_GAP,
    RULE_TEXT_STYLE,
    STAT_FUSED_STYLE,
    TYPE_BANNER_H,
    TYPE_LABEL_STYLE,
} from './cardLayout';

/**
 * Builds a card's visual container in one of CardDisplayMode's three layouts — see the doc
 * comment on that type in cardLayout.ts. Every method here is a pure builder: it reads an
 * instance/definition and returns Phaser objects, without touching any game state or scene
 * bookkeeping outside the container it hands back.
 */
export class CardView
{
    constructor (private scene: Scene) {}

    createCardContainer (instance: CardInstance, mode: CardDisplayMode): Phaser.GameObjects.Container
    {
        const container = this.scene.add.container(0, 0);
        const bg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, mode === 'faceDown' ? 0x24304a : 0x2f3b52).setStrokeStyle(2, 0x8fa8d6);
        container.add(bg);

        if (mode === 'faceDown')
        {
            if (this.scene.textures.exists(CARD_BACK_KEY))
            {
                const back = this.scene.add.image(0, 0, CARD_BACK_KEY);
                coverFit(back, CARD_W, CARD_H);
                container.add(back);
            }
            container.setSize(CARD_W, CARD_H);
            return container;
        }

        const definition = CARD_DEFINITIONS[instance.definitionId];

        // Full-bleed art is the lowest z-order layer in both modes — everything else (gradient
        // header/footer, text, badges) paints on top of it.
        container.add(this.createArtVisual(definition.id, CARD_W, CARD_H, 0));
        container.add(this.createHeaderGradient());

        // Name top-left. Allowed width only needs to dodge the cost badge in 'full' mode —
        // 'simplified' drops the cost badge entirely (see the simplified-only instructions), so
        // its title can run almost the full card width. fitCardName tries hard to keep it on one
        // line (tightening letter spacing, then shrinking font size) before falling back to wrap.
        const nameText = this.scene.add.text(-CARD_W / 2 + 8, -CARD_H / 2 + 8, definition.name, NAME_STYLE).setOrigin(0, 0);
        this.fitCardName(nameText, mode === 'simplified' ? CARD_W - 16 : CARD_W - 60);
        container.add(nameText);

        if (mode === 'simplified')
        {
            // No cost badge, no footer/rule-text/type banner — battlefield row stays art-first.
            // Keywords/triggers instead render as compact bottom-left pills (see
            // createStatusPills), and attack/health mirror the 'full' mode's fused corner box.
            container.add(this.createStatBadge(instance, definition));
            container.add(this.createStatusPills(instance, definition));

            container.setSize(CARD_W, CARD_H);
            return container;
        }

        // mode === 'full' — cost badge centered exactly on the top-right corner so it
        // deliberately overflows both the top and right edges into the background (see the
        // user-facing instructions this layout implements: "mana cost and hp+atk box are
        // slightly off canvas ... intentional visual design"). The interactive hit area stays
        // the plain CARD_W x CARD_H rectangle regardless — set once at the bottom of this method.
        const costBadge = this.scene.add.circle(CARD_W / 2, -CARD_H / 2, COST_BADGE_R, 0x2f6fed);
        const costText = this.scene.add.text(CARD_W / 2, -CARD_H / 2, `${definition.cost}`, COST_TEXT_STYLE).setOrigin(0.5);
        container.add([costBadge, costText]);

        container.add(this.createFooterGradient());

        // Footer content, left-aligned throughout: all active keywords share a single
        // comma-separated line first (bold, colored, no description — the description lives in
        // the hover tooltip instead) — e.g. "Taunt, Divine Shield" — and only once that line is
        // spoken for does the rule text start on the next line below. A running cursor so an
        // absent row doesn't leave a dead gap.
        const footerTop = CARD_H / 2 - TYPE_BANNER_H - FOOTER_H;
        let cursorY = footerTop + 4;

        if (instance.keywords.size > 0)
        {
            container.add(this.createKeywordLabels(instance, cursorY));
            cursorY += 14;
        }

        if (definition.text !== '')
        {
            const ruleText = this.scene.add.text(-CARD_W / 2 + 8, cursorY + 2, definition.text, RULE_TEXT_STYLE)
                .setOrigin(0, 0)
                .setWordWrapWidth(CARD_W - 16, true);
            container.add(ruleText);
        }

        // Type banner: bottom-edge bar, flush to the card's bottom-left/bottom edges.
        // const typeBanner = this.scene.add.rectangle(-CARD_W / 2, CARD_H / 2 - TYPE_BANNER_H, CARD_W, TYPE_BANNER_H, 0x5fbf5f).setOrigin(0, 0);
        const typeText = this.scene.add.text(-CARD_W / 2 + 6, CARD_H / 2 - TYPE_BANNER_H / 2, definition.type === 'minion' ? 'Minion' : 'Spell', TYPE_LABEL_STYLE).setOrigin(0, 0.5);
        container.add([typeText]);

        // Fused atk/hp box added last so it visually overlaps the type banner's bottom-right
        // corner, matching the reference mockup — centered exactly on the corner so it overflows
        // both the bottom and right edges, same treatment as the cost badge above.
        container.add(this.createStatBadge(instance, definition));

        container.setSize(CARD_W, CARD_H);
        return container;
    }

    /** Top gradient band behind the title, in both non-face-down modes. WebGL-only Phaser feature; this project's AUTO renderer type is effectively always WebGL in real browsers. */
    private createHeaderGradient (): Phaser.GameObjects.Graphics
    {
        const gfx = this.scene.add.graphics();
        gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.85, 0.85, 0.1, 0.1);
        gfx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, HEADER_H);
        return gfx;
    }

    /** Bottom gradient band behind 'full' mode's keyword/rule-text footer. */
    private createFooterGradient (): Phaser.GameObjects.Graphics
    {
        const gfx = this.scene.add.graphics();
        gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7, 0.7, 0.8, 0.8);
        gfx.fillRect(-CARD_W / 2, CARD_H / 2 - TYPE_BANNER_H - FOOTER_H, CARD_W, FOOTER_H);
        return gfx;
    }

    /** Fused "atk/hp" box, minion-only — a single small dark-red box replacing the old separate attack/health circles, centered exactly on the card's bottom-right corner so it deliberately overflows both edges (same treatment as the 'full' mode cost badge). Shared by both display modes. */
    private createStatBadge (instance: CardInstance, definition: CardDefinition): Phaser.GameObjects.GameObject[]
    {
        if (definition.type !== 'minion') return [];

        const box = this.scene.add.rectangle(CARD_W / 2, CARD_H / 2, ATKHP_W, ATKHP_H, 0xb0413e).setStrokeStyle(2, 0x1a1a1a);
        const text = this.scene.add.text(CARD_W / 2, CARD_H / 2, `${instance.currentAttack ?? 0}/${instance.currentHealth ?? 0}`, STAT_FUSED_STYLE).setOrigin(0.5);
        return [box, text];
    }

    /** Card art — the actual image if its texture loaded, otherwise a black box with small gray "MISSING ASSET" text (most cards have no art asset yet; see Preloader.preload). Sized/positioned by the caller so it can cover just the inset art zone ('full' mode) or the whole card ('simplified' mode). */
    private createArtVisual (art: string, width: number, height: number, centerY: number): Phaser.GameObjects.GameObject[]
    {
        if (this.scene.textures.exists(art))
        {
            const image = this.scene.add.image(0, centerY, art);
            coverFit(image, width, height);
            return [image];
        }

        const box = this.scene.add.rectangle(0, centerY, width, height, 0x000000).setStrokeStyle(1, 0x333333);
        const label = this.scene.add.text(0, centerY, 'MISSING ASSET', MISSING_ASSET_STYLE).setOrigin(0.5).setWordWrapWidth(width - 16, true);
        return [box, label];
    }

    /**
     * Full keyword names for a minion's active keywords — bold, colored per KEYWORD_METADATA,
     * flowed left-to-right on one shared, left-aligned line ("Taunt, Divine Shield") rather than
     * one row each, so the rule text below only has to start a new line once. Iterates
     * instance.keywords (runtime, mutable) rather than the card's static definition.keywords — a
     * consumed keyword like divineShield must stop rendering once popped, and the definition
     * never changes to reflect that.
     */
    private createKeywordLabels (instance: CardInstance, startY: number): Phaser.GameObjects.GameObject[]
    {
        const keywords = [...instance.keywords];
        if (keywords.length === 0) return [];

        const startX = -CARD_W / 2 + 8;
        const objects: Phaser.GameObjects.GameObject[] = [];
        let cursorX = startX;

        keywords.forEach((keyword, index) =>
        {
            const meta = KEYWORD_METADATA[keyword];
            const hex = `#${meta.color.toString(16).padStart(6, '0')}`;
            const label = this.scene.add.text(cursorX, startY, meta.label, { ...KEYWORD_LABEL_BASE_STYLE, color: hex }).setOrigin(0, 0);
            objects.push(label);
            cursorX += label.width;

            if (index < keywords.length - 1)
            {
                const separator = this.scene.add.text(cursorX, startY, ', ', KEYWORD_SEPARATOR_STYLE).setOrigin(0, 0);
                objects.push(separator);
                cursorX += separator.width;
            }
        });

        return objects;
    }

    /**
     * Tries to keep a card title on one line before ever resorting to word-wrap: shrinks font
     * size step by step first, re-measuring after each change, then — only once at the smallest
     * readable size and still too wide — nudges letter spacing slightly tighter. Font size leads
     * because a large negative letter-spacing visibly collides adjacent glyphs (tried -1.5px:
     * "Riverstone Golem" rendered with letters overlapping into illegible smears); a small -0.5px
     * nudge at the floor size doesn't have that problem. Only falls back to wrapping if neither
     * gets the name to fit — narrow cards would otherwise chop long names mid-word constantly.
     */
    private fitCardName (text: Phaser.GameObjects.Text, maxWidth: number): void
    {
        if (text.width <= maxWidth) return;

        const minFontSize = 9;
        const mildLetterSpacing = -0.5;

        for (let fontSize = 14; fontSize >= minFontSize; fontSize -= 1)
        {
            text.setFontSize(fontSize);
            if (text.width <= maxWidth) return;
        }

        text.setLetterSpacing(mildLetterSpacing);
        if (text.width <= maxWidth) return;

        text.setLetterSpacing(0);
        text.setWordWrapWidth(maxWidth, true);
    }

    /**
     * 'simplified' mode's compact bottom-left status pills — one per active keyword
     * (instance.keywords, same "currently active" source as createKeywordLabels) plus one per
     * distinct triggered-effect flavor word (Anthem/Deathcry/Vigil/Curfew, via
     * distinctTriggers(definition.effects)) — everything a player needs to know about this
     * minion before trading it in combat, without the full rule text. Flows left-to-right,
     * wrapping to a second row above the first if a pill would run into the atk/hp box's
     * reserved bottom-right corner.
     */
    private createStatusPills (instance: CardInstance, definition: CardDefinition): Phaser.GameObjects.GameObject[]
    {
        const entries = [
            ...[...instance.keywords].map((keyword) => KEYWORD_METADATA[keyword]),
            ...distinctTriggers(definition.effects).map((trigger) => TRIGGER_METADATA[trigger]),
        ];
        if (entries.length === 0) return [];

        const objects: Phaser.GameObjects.GameObject[] = [];
        const startX = -CARD_W / 2 + PILL_INSET_X;
        const rowLimitX = CARD_W / 2 - ATKHP_W / 2 - PILL_INSET_X;
        let cursorX = startX;
        let cursorY = CARD_H / 2 - PILL_INSET_Y - PILL_H;

        for (const { label, color } of entries)
        {
            const text = this.scene.add.text(0, 0, label, PILL_LABEL_STYLE).setOrigin(0, 0.5);
            const pillWidth = text.width + PILL_PAD_X * 2;

            if (cursorX + pillWidth > rowLimitX && cursorX > startX)
            {
                cursorX = startX;
                cursorY -= PILL_H + PILL_ROW_GAP;
            }

            const pill = this.scene.add.rectangle(cursorX, cursorY + PILL_H / 2, pillWidth, PILL_H, color).setOrigin(0, 0.5);
            text.setPosition(cursorX + PILL_PAD_X, cursorY + PILL_H / 2);
            objects.push(pill, text);
            cursorX += pillWidth + PILL_ROW_GAP;
        }

        return objects;
    }
}
