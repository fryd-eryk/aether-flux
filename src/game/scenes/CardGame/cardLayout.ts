import type { CardInstance } from '../../types/Card';
import type { PlayerState } from '../../types/GameState';

// Base game resolution — must match the `width`/`height` in game/main.ts's Scale config.
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;
export const CENTER_X = GAME_WIDTH / 2;
export const CENTER_Y = GAME_HEIGHT / 2;

// 2:3 ratio, matching the 832x1248 art assets exactly — so a full-bleed cover-fit (see
// coverFit) never needs to crop, the art's own aspect ratio already fills the card exactly.
export const CARD_W = 150;
export const CARD_H = 225;

// 'simplified' mode's stat box (createStatBadge) now shares its actual size with 'full' mode's
// (ATKHP_W_FULL/ATKHP_H_FULL, declared further down) — this is just the legacy sizing basis for
// HAND_PEEK_BOTTOM_CLEARANCE below, kept as a slightly-larger-than-necessary (i.e. safe) clearance
// margin rather than threading ATKHP_H_FULL up through the module's declaration order. Declared
// this early (rather than with the rest of the layout constants further down) because
// PLAYER_HAND_PEEK_Y below needs it to keep the corner-overflowing stat box from being clipped by
// the screen's bottom edge.
export const ATKHP_H = 26;

// Shared face-down texture — key must match Preloader.ts's load.image call.
export const CARD_BACK_KEY = 'card-back';
export const HERO_RADIUS = 28;
export const HERO_SIZE = HERO_RADIUS * 2;
export const BOARD_ZONE_W = 1600;

// Row Y-positions are hand-tuned so hero/board rows and the hand states below clear each
// other with a small gap given CARD_H/HERO_RADIUS above — see the git history of this file if
// those change again.
//
// Hands don't occupy a permanent dedicated row. Each hand rests "poked" against its owner's
// screen edge — card center pinned exactly on the edge, so only the CARD_H/2 half that's on-screen
// is visible (Phaser/the canvas clips the rest for free, no mask needed) — and its owner's hero
// overlaps that poke, drawn on top via HERO_DEPTH, like the hero is standing in front of a mostly
// tucked-away fan of cards. The hero never moves off HERO_Y for either side — only individual
// hand cards animate (see HAND_ARC_* / PLAYER_HAND_PEEK_Y below).
//
// Idle hand cards fan out in a slight arc (see HAND_ARC_* and handCardSlot in index.ts) rather
// than sitting in a flat row — center card upright and least-hidden, cards further out rotate
// away from center and sit closer to the flush poke edge (more hidden), mimicking a fan pivoting
// from a point beyond the screen edge. The opponent's hand *only* ever exists in this idle arced
// state — it never peeks (a deliberate "nothing happens" twist, see renderHand in index.ts). The
// player's hand additionally supports peeking ONE card at a time on hover: that card alone
// straightens (rotation 0) and rises to PLAYER_HAND_PEEK_Y, fully clear of the screen's bottom
// edge; every other card stays in its idle arced slot. 
//
// Freeing the opponent's hand from its own row lets OPPONENT_BOARD_Y move up (it no longer needs
// to clear a full hand row below the opponent's hero), which in turn opens up a deliberately
// generous gap between the two boards — the freed space's biggest single beneficiary, giving the
// battlefield itself more visual weight instead of the two rows sitting seam-to-seam.
export const OPPONENT_HERO_Y = 37;
export const OPPONENT_HAND_Y = 0; // poked flush against the top edge — always, see above
export const OPPONENT_BOARD_Y = 265;
export const PLAYER_BOARD_Y = 657;
export const PLAYER_HAND_POKE_Y = GAME_HEIGHT; // poked flush against the bottom edge
export const PLAYER_HERO_Y = 1043; // fixed — the hero never moves, see above

// tuned by eye, so a peeked card doesn't sit flush against the screen's edge.
export const PLAYER_HAND_PEEK_Y = GAME_HEIGHT - CARD_H / 2 - 10;

// Hero containers must out-rank hand containers' default fan depth (0..handSize-1 — see
// renderHand) so each hero visually sits in front of its own poked hand rather than being
// half-buried under it, while staying well clear of drag(1000)/animation depths above.
export const HERO_DEPTH = 100;

// Depth for whichever single hand card is currently peeked (hover) — must out-rank every hand
// card's own fan depth AND HERO_DEPTH (a centered peek must never be partially hidden behind the
// hero), while staying well clear of drag's depth (1000) above.
export const HAND_PEEK_DEPTH = 400;

// Hand fan/arc (handCardSlot in index.ts, used for both hands' idle layout). A card `n` slots
// from the hand's center rotates by `n * HAND_ARC_ANGLE_STEP_DEG`, clamped at
// HAND_ARC_MAX_ANGLE_DEG so a very large hand's outermost cards don't over-rotate.
//
// HAND_ARC_LIFT is the rise of the card's *visible* edge (top for the player, bottom for the
// opponent — whichever one is actually poking into view) above the flush poke edge, at the
// center of the hand, tapering by cos(rotation) toward the outer cards — the cosine falloff
// mimics a true circular fan, where more-rotated outer cards sit nearer the fan's rim (i.e.
// closer to the flush edge, more hidden). It deliberately does NOT describe the card's own
// center: rotating a card by theta shifts its visible edge by CARD_H/2 * cos(theta) relative to
// its center (rotation-matrix arithmetic — a local point (0, ±CARD_H/2) rotates to
// (±CARD_H/2*sin(theta), ∓CARD_H/2*cos(theta))), so handCardSlot solves for the center position
// that puts the *edge* exactly HAND_ARC_LIFT*cos(theta) above the flush edge, not the center
// itself. Skipping that correction (an earlier version of this code did) makes the edge's actual
// arc amplitude come out as (HAND_ARC_LIFT + CARD_H/2)*cos(theta) instead of the intended
// HAND_ARC_LIFT*cos(theta) — over 3x too pronounced at CARD_H=225 — instead of the smooth,
// harmonious curve the top/bottom edges are supposed to trace.
export const HAND_ARC_ANGLE_STEP_DEG = 4;
export const HAND_ARC_MAX_ANGLE_DEG = 18;
export const HAND_ARC_LIFT = 46;

// The hand row's spacing, always — not just a fallback floor for large hands (handRowLayout in
// index.ts scales the whole row down once even this can't fit within BOARD_ZONE_W, rather than
// shrinking spacing further). Deliberately tighter than CARD_W so idle cards read as a natural
// overlapping fan rather than a flat row with gaps between them, while staying the *widest*
// spacing that still overlaps zero pixels of a neighbor's cost badge — kept separate from the
// plain rowLayout board/hand share, since this is a 'full'-mode cost-badge concern that doesn't
// apply to renderBoard's cost-badge-less 'simplified' cards. 'full' mode's cost number sits
// right-anchored 3px from the card's right edge (COST_TEXT_STYLE at CARD_W/2-3) and is a single
// digit (~11px wide at that font — every card cost in cards.ts is single-digit), so its own left
// edge sits CARD_W - 3 - 11 in from the card's right edge. Per-card depth is ascending
// left-to-right, so a rightward neighbor always paints over the card to its left — z-order alone
// can't avoid that (see handRowLayout's doc comment) — so CARD_W - 3 is the tightest spacing at
// which the neighbor's own left edge lands exactly on the digit's right edge without crossing
// into it, i.e. the badge stays fully visible right up to the edge of safe.
export const HAND_MIN_SPACING = CARD_W - 3;

// Deck/graveyard piles share the end-turn/cancel buttons' column, offset further right so hand
// cards (which can extend close to x=1760 at max hand size) never overlap them.
export const PILE_X = 1860;
export const OPPONENT_DECK_Y = 300;
export const PLAYER_DECK_Y = 750;
export const DECK_PILE_W = 80;
// Matches CARD_W:CARD_H's 2:3 ratio exactly (see that constant's comment) so coverFit's cover-fit
// of the deck pile's card-back image never needs to crop — an earlier 80x100 (4:5) box cropped the
// top/bottom off the card-back art since its real aspect ratio didn't match the box it was fit into.
export const DECK_PILE_H = DECK_PILE_W * (CARD_H / CARD_W);

// Each player's graveyard sits one row from its own deck, on that player's side of the column:
// the player's below its deck, the opponent's above its deck. PILE_ROW_GAP has to clear a pile's
// *full* drawn extent — the stack offset and zone label above it, the count label below it
// (~152px in total) — not merely DECK_PILE_H, or the two piles' labels overlap.
export const PILE_ROW_GAP = 165;
export const OPPONENT_GRAVEYARD_Y = OPPONENT_DECK_Y - PILE_ROW_GAP;
export const PLAYER_GRAVEYARD_Y = PLAYER_DECK_Y + PILE_ROW_GAP;

// Click-a-pile-to-inspect overlay. Depth sits above every in-game depth — including the 3000 an
// in-flight draw animation uses — so the overlay stays readable if a pile is opened mid-animation.
export const PILE_VIEW_DEPTH = 5000;
export const PILE_VIEW_MAX_COLUMNS = 8;
export const PILE_VIEW_GAP = 22;
export const PILE_VIEW_TOP = 150;
export const PILE_VIEW_BOTTOM = 1020;

// Where a played card is held for a beat before flying to its resting place.
export const SPOTLIGHT_X = 260;

// Phaser Text objects rasterize to their own internal canvas at this multiple of their
// font size, independent of any later container/camera scale (confirmed against
// node_modules/phaser/src/gameobjects/text/Text.js — resolution defaults to 1 and is
// NOT derived from any Game Config setting in this Phaser version, despite what the
// hosted API docs imply). At `resolution: 1`, a 10-19px on-card font is a genuinely
// tiny source bitmap, so any card rendered bigger than its native CARD_W/CARD_H — a
// board/hand card on a browser window wider than the game's 1920x1080 base resolution
// (Scale.FIT stretches the canvas via CSS in that case), or the Card Creator's
// preview, which deliberately renders bigger — blurs exactly like an upscaled raster
// image. Every on-card Text uses this; off-card UI chrome (health/mana readouts, pile
// labels, tooltip body text — SMALL_STYLE/PILE_LABEL_STYLE/statStyle) doesn't need it,
// since none of those get scaled up beyond the game's own base resolution.
const CARD_TEXT_RESOLUTION = 3;

/** Adds a black outline to a text style, for legibility over full-bleed art — every on-card text element uses this; off-card UI chrome (health/mana readouts, pile labels, tooltip body text) does not. */
export function withStroke(style: Phaser.Types.GameObjects.Text.TextStyle, thickness = 3): Phaser.Types.GameObjects.Text.TextStyle
{
    return { ...style, stroke: '#000000', strokeThickness: thickness, resolution: CARD_TEXT_RESOLUTION };
}

export const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '12px', color: '#ffffff', align: 'left' });
// Extra pixels Phaser adds between wrapped lines of the 'full' mode description box's rule text
// (definition.text) — edit this to tighten/loosen its line-height. Independent of DESC_BOX_LINE_GAP
// (the gap between the keyword line and the start of the rule text, a different measurement).
export const RULE_TEXT_LINE_SPACING = -3;
export const RULE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '10px', color: '#e8ecf5', fontStyle: 'italic', align: 'left', lineSpacing: RULE_TEXT_LINE_SPACING }, 2);
export const SMALL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '18px', color: '#ffffff' };
// Hero circle's HP readout — bold + stroked (unlike statStyle's HUD text) since it sits directly
// over the circle's solid fill rather than the plain background the HUD corner text sits on.
export const HERO_HP_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial Black', fontSize: '26px', color: '#ffffff' });
export const COST_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial Black', fontSize: '14px', color: '#ffffff' });
// Repurposed as the bottom type banner's label (was small centered gray text) — white on a
// solid green bar now, see createCardContainer's 'full' mode.
export const TYPE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '9px', color: '#9e9e9e', align: 'left' }, 0);
export const KEYWORD_LABEL_BASE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '10px', fontStyle: 'bold' }, 2);
// The ", " joining multiple keyword labels on their shared line — plain (unbolded, uncolored) so
// the colored keyword names stay the visual focus.
export const KEYWORD_SEPARATOR_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '10px', color: '#e8ecf5' }, 2);
export const MISSING_ASSET_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '10px', color: '#888888', align: 'center', resolution: CARD_TEXT_RESOLUTION };
export const PILL_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '9px', color: '#ffffff', fontStyle: 'bold' }, 2);
// The atk/hp stat box (createStatBox, shared by 'full' and 'simplified') sits on an opaque white
// background, so the art-legibility stroke trick the rest of on-card text relies on would just look
// muddy here — plain dark text instead. The wounded variant (currentHealth !== maxHealth) recolors
// just the health digits red — everything else about the two styles must stay identical (font,
// size, resolution) since they render side-by-side in the same line.
export const STAT_FUSED_LIGHT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial Black', fontSize: '12px', color: '#1a1a2e', resolution: CARD_TEXT_RESOLUTION };
export const STAT_FUSED_LIGHT_WOUNDED_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { ...STAT_FUSED_LIGHT_STYLE, color: '#c0392b' };

// New card layout constants (createCardContainer) — starting points tuned by eye against
// src/refs/card-layout-ref-v1.png (superseded for 'full' mode by v2, see below), not pixel-perfect gospel.
export const HEADER_H = 30; // top band height, holding the title — shared by 'full' and 'simplified'
// ATKHP_H (used only for HAND_PEEK_BOTTOM_CLEARANCE's legacy sizing basis) is declared up near
// CARD_W/CARD_H — see the comment there. The stat box's real size is ATKHP_W_FULL/ATKHP_H_FULL below.
export const PILL_H = 14;
export const PILL_PAD_X = 5;
export const PILL_ROW_GAP = 3;
export const PILL_INSET_X = 6;
export const PILL_INSET_Y = 8; // 'simplified' mode's bottom-left keyword/trigger pill stack
// Extra top padding in the hover tooltip when it draws its own overflowing mana-cost box (now the
// same small ATKHP_W_FULL x ATKHP_H_FULL shape as the atk/hp stat box, just blue — see
// HelpBoxController.showHelpBox) — tuned down from the old value now that the box (13px tall) barely
// overflows past the tooltip's own top margin, unlike the much taller circle badge it replaced.
export const TOOLTIP_COST_CLEARANCE = 4;
export const TOOLTIP_BG_RADIUS = 6; // hover tooltip's rounded-corner background — matches DESC_BOX_RADIUS's "small, tuned by eye" scale, kept separate since the tooltip isn't drawn at card scale
export const MANA_BADGE_COLOR = 0x2f6fed; // blue fill for the tooltip's mana-cost box

export const OUTLINE_COLOR_TARGETABLE = 0xffd23f; // valid-target highlight (hero + board minions, AwaitingTarget) + the active player's hero-circle fill
export const OUTLINE_COLOR_READY = 0x38d97b; // "can act now" — board attack-ready minions AND hand playable cards
export const OUTLINE_COLOR_HOVER = 0x4fc3f7; // deck/graveyard pile hover

// Shimmer sweep tuning (addShimmeringOutline in index.ts) — the border is repainted every tick as
// a light→bright→light gradient along the bottom-left→top-right diagonal, with a bright band that
// sweeps that diagonal twice in quick succession, then pauses, then repeats.
export const SHIMMER_BRIGHTEN_AMOUNT = 0.7; // color lerp at the sweep's peak — 0 = unchanged border color, 1 = white
export const SHIMMER_BAND_WIDTH = 40; // falloff radius (px, along the diagonal) of the bright band around its peak
export const SHIMMER_SWEEP_MS = 650; // duration of a single bottom-left → top-right sweep
export const SHIMMER_PAUSE_MS = 2000; // pause after the 2 sweeps before the cycle repeats

/** Blends `color` toward white by `amount` (0-1) — derives the shimmer's brighter tint from
 * whatever border color it's sweeping across, so a new color variant needs no separate lookup. */
export function lightenColor(color: number, amount: number): number {
    const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
    const mix = (c: number) => Math.round(c + (255 - c) * amount);
    return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

// 'full' mode layout (v2 — src/refs/card-layout-ref-v2.jpg): the header/footer bars are pre-authored
// PNGs (art-legibility swirl and the "rounded corners descending down the card's sides" shape are
// both baked into their alpha channels — see createHeaderFull/createFooterBar) rather than
// hand-drawn Graphics, plus a semi-transparent rounded description box that grows upward from a
// fixed bottom anchor. Both PNGs are authored at 832px wide — the same native width as the card art
// (see CARD_W's comment) — so rendering them at CARD_W via fitWidth keeps them pixel-aligned with
// the art underneath; their *content* positioning (title/cost/dot/type/atk-hp text) is then tuned by
// eye against their "flat bar" region (the part that's opaque across the full width — the sides taper
// down/up into transparency beyond that), like the rest of this file.
export const HEADER_BG_KEY = 'card-header-bg';
export const FOOTER_BG_KEY = 'card-footer-bg';
export const HEADER_CONTENT_H_FULL = 16; // header PNG's flat-bar height at CARD_W scale (86px @ 832px native) — title/cost text center on this, not the full (taller, tapering) image height
export const FOOTER_BAR_H = 14; // footer PNG's flat-bar height at CARD_W scale (78px @ 832px native) — rarity dot/type/atk-hp center on this
export const RARITY_DOT_R = 4;
export const RARITY_DOT_INSET = 8; // gap from the card's left/bottom edges to the dot's center
// Shared atk/hp stat box size (createStatBox) — 'full' mode positions it inset from the corner
// (ATKHP_INSET, non-overflowing), 'simplified' mode centers it exactly on the corner so it still
// overflows both edges, just by less than the old dedicated ATKHP_W/H (46x26) did.
export const ATKHP_W_FULL = 30;
export const ATKHP_H_FULL = 13;
export const ATKHP_BOX_RADIUS = 3;
export const ATKHP_INSET = 6; // gap from the card's right edge to the inset atk/hp box ('full' mode only)
export const DESC_BOX_RADIUS = 5;
export const DESC_BOX_INSET_X = 4; // gap from the card's left/right edges to the description box
export const DESC_BOX_PAD_Y = 6; // internal top/bottom padding between the box edge and its text
export const DESC_BOX_KEYWORD_LINE_H = 14; // fixed height budgeted for the keyword line, matching createKeywordLabels' font metrics
export const DESC_BOX_LINE_GAP = 2; // gap between the keyword line and the rule text below it
// Fixed bottom anchor the description box's *content* (text) is pinned to — see
// createDescriptionBox. Deliberately a literal, not derived from FOOTER_BAR_H — the box's drawn
// background is separately stretched down past this anchor to CARD_H / 2 so it visually continues
// behind the footer bar (which paints over it on top), but that must never move where the text
// itself lands, so the two are intentionally decoupled.
export const DESC_BOX_BOTTOM_Y = CARD_H / 2 - 12;

/** The two off-board card zones that get a pile visual and a click-to-inspect overlay. */
export type PileZone = 'deck' | 'graveyard';

/**
 * How createCardContainer renders a card. 'full' is the detailed layout (hand, deck/graveyard
 * pile view, the played-card spotlight) — full-bleed art with a solid header (title + an inset,
 * non-overflowing mana-cost number over a masked decorative texture), a semi-transparent rounded
 * description box (keyword labels then rule text) that grows upward from a fixed bottom anchor so
 * its last line always lands in the same place, and a solid footer bar (gradient-filled rarity dot
 * + type text, plus an inset atk/hp box). 'simplified' is the battlefield-only layout — same
 * full-bleed art and gradient header/title, but no cost badge, no description box/footer bar; a
 * minion's keywords and triggered-effect flavor words instead render as compact bottom-left
 * pills (see createStatusPills), and its atk/hp uses the older overflowing corner box, to keep the
 * cramped board row as clutter-free as possible. 'faceDown' is the card-back, used for the
 * opponent's hand and its matching draw-animation preview.
 */
export type CardDisplayMode = 'full' | 'simplified' | 'faceDown';

export function statStyle(color: string, stroke = false, fontSize = '20px'): Phaser.Types.GameObjects.Text.TextStyle {
    const base: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial Black', fontSize, color };
    return stroke ? withStroke(base) : base;
}

/** Per-zone pile chrome. The deck keeps the card-back blue it has always used; the graveyard takes a desaturated maroon so the two read apart at a glance in the same column. `title` is the pile-inspect overlay's heading (PileViewController) — the board's own pile visual carries no text label. */
export const PILE_STYLES: Record<PileZone, { fill: number; stroke: number; title: string }> = {
    deck: { fill: 0x24304a, stroke: 0x8fa8d6, title: 'Deck' },
    graveyard: { fill: 0x33262c, stroke: 0xc08a94, title: 'Graveyard' },
};

/** The cards currently sitting in a player's deck or graveyard — shared by the board's pile visual (renderPile) and the pile-inspect overlay (PileViewController), so both read the same zone the same way. */
export function getPileCards(playerState: PlayerState, zone: PileZone): CardInstance[]
{
    return zone === 'deck' ? playerState.deck : playerState.graveyard;
}

/**
 * CSS `background-size: cover; background-position: center` for a Phaser Image — fills exactly
 * width x height with no stretching, cropping whichever axis overflows and keeping the crop
 * centered. Crops the *source* texture to the target aspect ratio first (in texture pixels, via
 * setCrop), then scales uniformly so that cropped region ends up exactly width x height.
 *
 * Deliberately does NOT finish with `image.setDisplaySize(width, height)` despite that being the
 * obvious-looking call — per Phaser's own Crop component docs, "cropping ... does not change its
 * size, dimensions" (Components/Crop.js), meaning setDisplaySize scales relative to the image's
 * full *uncropped* frame, not the crop rectangle. Calling it directly here silently distorts
 * (non-uniform scaleX/scaleY) any time a real crop happens — invisible for years because every
 * caller happened to pass a target aspect ratio matching the source exactly (card art's fixed 2:3
 * matching CARD_W:CARD_H, the card-back texture), so cropW/cropH always coincidentally equaled the
 * full frame and no real crop ever occurred. First real crop (CardView's artVerticalAlign, which
 * intentionally requests a shorter-than-2:3 box) exposed it. Scaling by width/cropW instead (equal
 * to height/cropH by construction, since the crop's aspect always matches the target's) is uniform
 * regardless of whether a crop actually happened, and is a no-op change for every existing
 * no-crop-needed caller. Shared by CardView's card art and CardGame's deck-pile card-back image —
 * the only two places that render a texture into a fixed box.
 */
export function coverFit(image: Phaser.GameObjects.Image, width: number, height: number): void
{
    const sourceW = image.width;
    const sourceH = image.height;
    const targetAspect = width / height;

    let cropW: number;
    let cropH: number;

    if (sourceW / sourceH > targetAspect)
    {
        cropW = sourceH * targetAspect;
        cropH = sourceH;
        image.setCrop((sourceW - cropW) / 2, 0, cropW, cropH);
    }
    else
    {
        cropW = sourceW;
        cropH = sourceW / targetAspect;
        image.setCrop(0, (sourceH - cropH) / 2, cropW, cropH);
    }

    image.setScale(width / cropW);
}

/**
 * Scales a Phaser Image to an exact target width, preserving its native aspect ratio (no crop) —
 * unlike coverFit, which fills a fixed box by cropping. Used for the 'full' mode header/footer PNGs
 * (createHeaderFull/createFooterBar), which are authored at CARD_W's native art resolution (832px
 * wide) and must render at their real proportions, alpha-shaped edges included, rather than being
 * force-fit into a hand-picked box.
 */
export function fitWidth(image: Phaser.GameObjects.Image, width: number): void
{
    const scale = width / image.width;
    image.setDisplaySize(width, image.height * scale);
}
