import type { Scene } from "phaser";

import { CARD_DEFINITIONS } from "../../data/cards";
import { KEYWORD_METADATA } from "../../data/keywordMetadata";
import { RARITY_METADATA, UNRANKED_RARITY_COLOR } from "../../data/rarityMetadata";
import { distinctTriggers, TRIGGER_METADATA } from "../../data/triggerMetadata";
import type { CardDefinition, CardInstance } from "../../types/Card";
import {
    ATKHP_BOX_RADIUS,
    ATKHP_H_FULL,
    ATKHP_INSET,
    ATKHP_W_FULL,
    CARD_BACK_KEY,
    CARD_H,
    CARD_W,
    coverFit,
    COST_TEXT_STYLE,
    type CardDisplayMode,
    DESC_BOX_BOTTOM_Y,
    DESC_BOX_INSET_X,
    DESC_BOX_KEYWORD_LINE_H,
    DESC_BOX_LINE_GAP,
    DESC_BOX_PAD_Y,
    DESC_BOX_RADIUS,
    fitWidth,
    FOOTER_BAR_H,
    FOOTER_BG_KEY,
    HEADER_BG_KEY,
    HEADER_CONTENT_H_FULL,
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
    RARITY_DOT_INSET,
    RARITY_DOT_R,
    RULE_TEXT_STYLE,
    STAT_FUSED_LIGHT_STYLE,
    STAT_FUSED_LIGHT_WOUNDED_STYLE,
    TYPE_LABEL_STYLE,
} from "./cardLayout";

/**
 * Builds a card's visual container in one of CardDisplayMode's three layouts — see the doc
 * comment on that type in cardLayout.ts. Every method here is a pure builder: it reads an
 * instance/definition and returns Phaser objects, without touching any game state or scene
 * bookkeeping outside the container it hands back.
 */
export class CardView {
    constructor(private scene: Scene) {}

    createCardContainer(instance: CardInstance, mode: CardDisplayMode, definitionOverride?: CardDefinition): Phaser.GameObjects.Container {
        const container = this.scene.add.container(0, 0);
        const bg = this.scene.add.rectangle(0, 0, CARD_W, CARD_H, 0x000000).setStrokeStyle(2, 0x000000);
        container.add(bg);

        if (mode === "faceDown") {
            if (this.scene.textures.exists(CARD_BACK_KEY)) {
                const back = this.scene.add.image(0, 0, CARD_BACK_KEY);
                coverFit(back, CARD_W, CARD_H);
                container.add(back);
            }
            container.setSize(CARD_W, CARD_H);
            return container;
        }

        const definition = definitionOverride ?? CARD_DEFINITIONS[instance.definitionId];

        // Full-bleed art is the lowest z-order layer in both modes — everything else (header/footer,
        // text, badges) paints on top of it. artVerticalAlign only applies in 'full' mode — see its
        // doc comment on CardDefinition and artBoxFor's below.
        const artBox = mode === "full" ? this.artBoxFor(definition.artVerticalAlign) : { height: CARD_H, centerY: 0 };
        container.add(this.createArtVisual(definition.id, CARD_W, artBox.height, artBox.centerY));

        if (mode === "simplified") {
            container.add(this.createHeaderGradient());

            // Name centered, full card width — no cost badge to dodge.
            const nameText = this.scene.add.text(0, -CARD_H / 2 + 2, definition.name, NAME_STYLE).setOrigin(0.5, 0);
            this.fitCardName(nameText, CARD_W);
            container.add(nameText);

            // No cost badge, no description box/footer bar — battlefield row stays art-first.
            // Keywords/triggers instead render as compact bottom-left pills (see
            // createStatusPills), and attack/health uses the overflowing corner box.
            container.add(this.createStatBadge(instance, definition));
            container.add(this.createStatusPills(instance, definition));

            container.setSize(CARD_W, CARD_H);
            return container;
        }

        // mode === 'full' (v2 layout, src/refs/card-layout-ref-v2.jpg): a solid header bar (title +
        // an inset mana-cost number, no overflow), a description box that floats over the art and
        // grows upward from a fixed bottom anchor, and a solid footer bar (rarity dot + type, inset
        // atk/hp box). The interactive hit area stays the plain CARD_W x CARD_H rectangle regardless
        // of any of this — set once at the bottom of this method.
        container.add(this.createHeaderFull(definition));

        const nameText = this.scene.add.text(-CARD_W / 2 + 3, -CARD_H / 2 - 1, definition.name, NAME_STYLE).setOrigin(0, 0);
        this.fitCardName(nameText, CARD_W - 23);
        container.add(nameText);

        container.add(this.createDescriptionBox(instance, definition));
        container.add(this.createFooterBar(instance, definition));

        container.setSize(CARD_W, CARD_H);
        return container;
    }

    /** Top gradient band behind the title, in both non-face-down modes. WebGL-only Phaser feature; this project's AUTO renderer type is effectively always WebGL in real browsers. */
    private createHeaderGradient(): Phaser.GameObjects.Graphics {
        const gfx = this.scene.add.graphics();
        gfx.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.9, 0.9, 0, 0);
        gfx.fillRect(-CARD_W / 2, -CARD_H / 2, CARD_W, HEADER_H * 2);
        return gfx;
    }

    /**
     * 'full' mode's header: the pre-authored card-header-bg PNG (its alpha channel already bakes in
     * the decorative mana-cost swirl *and* the "rounded corners descending down the card's sides"
     * shape — see cardLayout.ts's comment above HEADER_BG_KEY) rendered at CARD_W via fitWidth, plus
     * the mana-cost number on top, inset (no more corner-overflowing circle badge). Title text is
     * added by the caller, matching 'simplified' mode's nameText handling.
     */
    private createHeaderFull(definition: CardDefinition): Phaser.GameObjects.GameObject[] {
        const objects: Phaser.GameObjects.GameObject[] = [];
        const headerCenterY = -CARD_H / 2 + HEADER_CONTENT_H_FULL / 2;

        if (this.scene.textures.exists(HEADER_BG_KEY)) {
            const bg = this.scene.add.image(0, -CARD_H / 2, HEADER_BG_KEY).setOrigin(0.5, 0);
            fitWidth(bg, CARD_W);
            objects.push(bg);
        } else {
            objects.push(this.scene.add.rectangle(0, headerCenterY, CARD_W, HEADER_CONTENT_H_FULL, 0x000000));
        }

        const costText = this.scene.add.text(CARD_W / 2 - 3, headerCenterY, `${definition.cost}`, COST_TEXT_STYLE).setOrigin(1, 0.5);
        objects.push(costText);

        return objects;
    }

    /**
     * 'full' mode's description box: keyword line (if any) then rule text, same content/order as
     * before, inside a black-@-75%-opacity rounded box that floats over the art. The box's *content*
     * (text) is pinned to a fixed bottom anchor (DESC_BOX_BOTTOM_Y) and grows upward — rule text is
     * created first (off-screen Y) purely to measure its wrapped height, since that's the one piece
     * of content whose height isn't a fixed constant, then everything is positioned top-down from the
     * computed box top so the last line always lands at the same on-card position regardless of how
     * much text a card has. The box's *drawn background*, separately, is stretched all the way down
     * to the card's bottom edge (past DESC_BOX_BOTTOM_Y) so it visually continues underneath the
     * footer bar — createFooterBar is added after this in createCardContainer, so its opaque PNG
     * paints over that extension and hides it, rather than the box appearing to stop short right at
     * the footer's edge. Renders nothing if the card has neither keywords nor rule text.
     */
    private createDescriptionBox(instance: CardInstance, definition: CardDefinition): Phaser.GameObjects.GameObject[] {
        const hasKeywords = instance.keywords.size > 0;
        const hasText = definition.text !== "";
        if (!hasKeywords && !hasText) return [];

        // Built up front (at a provisional y=0 baseline for the keywords — see createKeywordLabels)
        // purely to measure how tall each piece of content actually is, since neither the keyword
        // block's row count nor the rule text's wrapped line count is a fixed constant.
        const keywords = hasKeywords ? this.createKeywordLabels(instance) : { objects: [], lineCount: 0 };
        let ruleText: Phaser.GameObjects.Text | null = null;
        let contentHeight = keywords.lineCount * DESC_BOX_KEYWORD_LINE_H;

        if (hasText) {
            ruleText = this.scene.add
                .text(-CARD_W / 2 + 8, 0, definition.text, RULE_TEXT_STYLE)
                .setOrigin(0, 0)
                .setWordWrapWidth(CARD_W - 16, true);
            contentHeight += (hasKeywords ? DESC_BOX_LINE_GAP : 0) + ruleText.height;
        }

        const boxHeight = contentHeight + DESC_BOX_PAD_Y * 2;
        const boxTop = DESC_BOX_BOTTOM_Y - boxHeight;

        const box = this.scene.add.graphics();
        box.fillStyle(0x000000, 0.75);
        box.fillRoundedRect(-CARD_W / 2 + DESC_BOX_INSET_X, boxTop, CARD_W - DESC_BOX_INSET_X * 2, CARD_H / 2 - boxTop, DESC_BOX_RADIUS);

        const objects: Phaser.GameObjects.GameObject[] = [box];
        let cursorY = boxTop + DESC_BOX_PAD_Y;

        if (hasKeywords) {
            keywords.objects.forEach((obj) => { obj.y += cursorY; });
            objects.push(...keywords.objects);
            cursorY += keywords.lineCount * DESC_BOX_KEYWORD_LINE_H + DESC_BOX_LINE_GAP;
        }

        if (ruleText) {
            ruleText.setY(cursorY);
            objects.push(ruleText);
        }

        return objects;
    }

    /** 'full' mode's footer: the pre-authored card-footer-bg PNG (rounded corners ascending up the card's sides baked into its alpha channel, mirroring the header's shape) holding the rarity dot + card type (left) and an inset (non-overflowing) atk/hp box (right, minion-only). */
    private createFooterBar(instance: CardInstance, definition: CardDefinition): Phaser.GameObjects.GameObject[] {
        const footerCenterY = CARD_H / 2 - FOOTER_BAR_H / 2;
        const objects: Phaser.GameObjects.GameObject[] = [];

        if (this.scene.textures.exists(FOOTER_BG_KEY)) {
            const bg = this.scene.add.image(0, CARD_H / 2, FOOTER_BG_KEY).setOrigin(0.5, 1);
            fitWidth(bg, CARD_W);
            objects.push(bg);
        } else {
            objects.push(this.scene.add.rectangle(0, footerCenterY, CARD_W, FOOTER_BAR_H, 0x000000));
        }

        const dotX = -CARD_W / 2 + RARITY_DOT_INSET;
        const { light, dark } = definition.rarity ? RARITY_METADATA[definition.rarity] : UNRANKED_RARITY_COLOR;
        const dot = this.scene.add.graphics();
        dot.fillGradientStyle(light, light, dark, dark, 1, 1, 1, 1);
        dot.fillCircle(dotX, footerCenterY, RARITY_DOT_R);
        objects.push(dot);

        const typeText = this.scene.add.text(dotX + RARITY_DOT_R + 3, footerCenterY, definition.type === "minion" ? "Minion" : "Spell", TYPE_LABEL_STYLE).setOrigin(0, 0.5);
        objects.push(typeText);

        objects.push(...this.createStatBadgeInset(instance, definition, footerCenterY));

        return objects;
    }

    /**
     * The atk/hp stat box shared by both modes — an opaque white rounded rect (ATKHP_W_FULL x
     * ATKHP_H_FULL) at the given top-left position, with "atk/hp" rendered as three separate Text
     * objects (attack, "/", health) rather than one string so the health digits alone can switch to
     * STAT_FUSED_LIGHT_WOUNDED_STYLE's red when the minion is wounded (currentHealth !== maxHealth)
     * — Phaser Text has no inline multi-color rich-text support, so this is the same
     * multiple-objects-with-a-running-cursor technique createKeywordLabels uses. Callers position
     * this differently: createStatBadgeInset ('full' mode) keeps it fully inset from the corner,
     * createStatBadge ('simplified' mode) centers it exactly on the corner so it still overflows
     * both edges, just by less than it used to now that the box itself is smaller. Minion-only.
     */
    private createStatBox(instance: CardInstance, definition: CardDefinition, boxLeft: number, boxTop: number): Phaser.GameObjects.GameObject[] {
        if (definition.type !== "minion") return [];

        const boxCenterY = boxTop + ATKHP_H_FULL / 2;
        const currentAttack = instance.currentAttack ?? 0;
        const currentHealth = instance.currentHealth ?? 0;
        const wounded = currentHealth !== (instance.maxHealth ?? currentHealth);

        const box = this.scene.add.graphics();
        box.fillStyle(0xffffff, 1);
        box.fillRoundedRect(boxLeft, boxTop, ATKHP_W_FULL, ATKHP_H_FULL, ATKHP_BOX_RADIUS);

        const atkText = this.scene.add.text(0, boxCenterY, `${currentAttack}`, STAT_FUSED_LIGHT_STYLE).setOrigin(0, 0.5);
        const slashText = this.scene.add.text(0, boxCenterY, "/", STAT_FUSED_LIGHT_STYLE).setOrigin(0, 0.5);
        const hpText = this.scene.add.text(0, boxCenterY, `${currentHealth}`, wounded ? STAT_FUSED_LIGHT_WOUNDED_STYLE : STAT_FUSED_LIGHT_STYLE).setOrigin(0, 0.5);

        let cursorX = boxLeft + ATKHP_W_FULL / 2 - (atkText.width + slashText.width + hpText.width) / 2;
        atkText.setX(cursorX);
        cursorX += atkText.width;
        slashText.setX(cursorX);
        cursorX += slashText.width;
        hpText.setX(cursorX);

        return [box, atkText, slashText, hpText];
    }

    /** 'full' mode's atk/hp box — inset from the card's bottom-right corner (not overflowing it, unlike 'simplified' mode's createStatBadge). */
    private createStatBadgeInset(instance: CardInstance, definition: CardDefinition, footerCenterY: number): Phaser.GameObjects.GameObject[] {
        const boxLeft = CARD_W / 2 - ATKHP_INSET - ATKHP_W_FULL;
        const boxTop = footerCenterY - ATKHP_H_FULL / 2;
        return this.createStatBox(instance, definition, boxLeft, boxTop);
    }

    /** 'simplified' mode's atk/hp box — centered exactly on the card's bottom-right corner so it deliberately overflows both edges (a slighter version of the old dedicated 46x26 box, now sharing 'full' mode's smaller 34x13 size). */
    private createStatBadge(instance: CardInstance, definition: CardDefinition): Phaser.GameObjects.GameObject[] {
        const boxLeft = CARD_W / 2 - ATKHP_W_FULL / 2;
        const boxTop = CARD_H / 2 - ATKHP_H_FULL / 2;
        return this.createStatBox(instance, definition, boxLeft, boxTop);
    }

    /**
     * `artVerticalAlign`'s art box — shrinks the art's *display size* in the nudged
     * direction rather than translating a still-CARD_H-tall image, so it can never
     * overflow past the card's own edge (a pure translate did: the header/footer
     * PNGs are anchored exactly at the card's top/bottom edge — `origin (0.5, 0)` at
     * `y = -CARD_H/2` / `origin (0.5, 1)` at `y = CARD_H/2` — neither extends past
     * it, so nothing was ever there to hide the overflow). 'top' keeps the art's
     * bottom edge at CARD_H/2 (unchanged) and pulls its top edge down to
     * `-CARD_H/2 + HEADER_CONTENT_H_FULL` — exactly the header PNG's opaque flat
     * bar's bottom edge, not the full tapering image (see that constant's comment
     * in cardLayout.ts) — by shrinking height to `CARD_H - HEADER_CONTENT_H_FULL`
     * and recentering. 'bottom' mirrors this against the footer's flat bar. Zero
     * overflow, but coverFit necessarily crops a bit more of the source art to fit
     * the smaller box — an expected side effect, not a bug.
     */
    private artBoxFor(align: CardDefinition["artVerticalAlign"]): { height: number; centerY: number } {
        switch (align) {
            case "top":
                return { height: CARD_H - HEADER_CONTENT_H_FULL, centerY: HEADER_CONTENT_H_FULL / 2 };
            case "bottom":
                return { height: CARD_H - FOOTER_BAR_H, centerY: -FOOTER_BAR_H / 2 };
            default:
                return { height: CARD_H, centerY: 0 };
        }
    }

    /** Card art — the actual image if its texture loaded, otherwise a black box with small gray "MISSING ASSET" text
     * (most cards have no art asset yet; see Preloader.preload). Sized/positioned by the caller so it can cover just
     * the inset art zone ('full' mode) or the whole card ('simplified' mode). */
    private createArtVisual(art: string, width: number, height: number, centerY: number): Phaser.GameObjects.GameObject[] {
        if (this.scene.textures.exists(art)) {
            const image = this.scene.add.image(0, centerY, art);
            coverFit(image, width, height);
            return [image];
        }

        const box = this.scene.add.rectangle(0, centerY, width, height, 0x000000).setStrokeStyle(1, 0x333333);
        const label = this.scene.add
            .text(0, centerY, "MISSING ASSET", MISSING_ASSET_STYLE)
            .setOrigin(0.5)
            .setWordWrapWidth(width - 16, true);
        return [box, label];
    }

    /**
     * Full keyword names for a minion's active keywords — bold, colored per KEYWORD_METADATA,
     * flowed left-to-right ("Taunt, Divine Shield") rather than one row each, wrapping onto
     * additional rows (DESC_BOX_KEYWORD_LINE_H apart) whenever the next label would overflow the
     * same CARD_W-16 width the rule text below wraps to — a separator always stays glued to the
     * label before it (wrap is only ever checked before a *label*, never before its separator), so
     * a wrapped row can end in a trailing comma but never start with one. Built at a provisional
     * y=0 baseline (row 0, row 1, ... each DESC_BOX_KEYWORD_LINE_H below the last) rather than the
     * final on-card position, since createDescriptionBox doesn't know the box's top edge — which
     * depends on how many rows this took — until after calling this; it shifts the returned objects
     * down as a group once that's known. Iterates instance.keywords (runtime, mutable) rather than
     * the card's static definition.keywords — a consumed keyword like divineShield must stop
     * rendering once popped, and the definition never changes to reflect that.
     */
    private createKeywordLabels(instance: CardInstance): { objects: Phaser.GameObjects.Text[]; lineCount: number } {
        const keywords = [...instance.keywords];
        if (keywords.length === 0) return { objects: [], lineCount: 0 };

        const startX = -CARD_W / 2 + 8;
        const maxX = CARD_W / 2 - 8;
        const objects: Phaser.GameObjects.Text[] = [];
        let cursorX = startX;
        let row = 0;

        keywords.forEach((keyword, index) => {
            const meta = KEYWORD_METADATA[keyword];
            const hex = `#${meta.color.toString(16).padStart(6, "0")}`;
            const label = this.scene.add.text(0, 0, meta.label, { ...KEYWORD_LABEL_BASE_STYLE, color: hex }).setOrigin(0, 0);

            if (cursorX + label.width > maxX && cursorX > startX) {
                row += 1;
                cursorX = startX;
            }
            label.setPosition(cursorX, row * DESC_BOX_KEYWORD_LINE_H);
            objects.push(label);
            cursorX += label.width;

            if (index < keywords.length - 1) {
                const separator = this.scene.add.text(cursorX, row * DESC_BOX_KEYWORD_LINE_H, ",", KEYWORD_SEPARATOR_STYLE).setOrigin(0, 0);
                objects.push(separator);
                cursorX += separator.width;
            }
        });

        return { objects, lineCount: row + 1 };
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
    private fitCardName(text: Phaser.GameObjects.Text, maxWidth: number): void {
        if (text.width <= maxWidth) return;

        const minFontSize = 9;
        const mildLetterSpacing = -0.4;

        for (let fontSize = 12; fontSize >= minFontSize; fontSize -= 1) {
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
     *
     * A silenced instance skips the trigger pills entirely — distinctTriggers reads the static
     * CardDefinition, not instance state, so it would otherwise keep advertising a Deathcry/etc.
     * that TurnStateMachine.triggerEffects will no longer actually fire — and shows a single
     * "Silenced" pill in their place instead of just going blank (which would look identical to a
     * plain vanilla minion that never had any keywords/effects to begin with).
     */
    private createStatusPills(instance: CardInstance, definition: CardDefinition): Phaser.GameObjects.GameObject[] {
        const entries = instance.silenced
            ? [{ label: 'Silenced', color: 0x808080 }]
            : [...[...instance.keywords].map((keyword) => KEYWORD_METADATA[keyword]), ...distinctTriggers(definition.effects).map((trigger) => TRIGGER_METADATA[trigger])];
        if (entries.length === 0) return [];

        const objects: Phaser.GameObjects.GameObject[] = [];
        const startX = -CARD_W / 2 + PILL_INSET_X;
        const rowLimitX = CARD_W / 2 - ATKHP_W_FULL / 2 - PILL_INSET_X;
        let cursorX = startX;
        let cursorY = CARD_H / 2 - PILL_INSET_Y - PILL_H;

        for (const { label, color } of entries) {
            const text = this.scene.add.text(0, 0, label, PILL_LABEL_STYLE).setOrigin(0, 0.5);
            const pillWidth = text.width + PILL_PAD_X * 2;

            if (cursorX + pillWidth > rowLimitX && cursorX > startX) {
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
