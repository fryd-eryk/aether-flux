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

// Fused "atk/hp" stat box (see createStatBadge) — centered exactly on a card's bottom-right
// corner so it deliberately overflows past both edges. Declared this early (rather than with the
// rest of the layout constants further down) because PLAYER_HAND_PEEK_Y below needs ATKHP_H to
// keep that overflow from being clipped by the screen's bottom edge.
export const ATKHP_W = 46;
export const ATKHP_H = 26;

// Shared face-down texture — key must match Preloader.ts's load.image call.
export const CARD_BACK_KEY = 'card-back';
export const HERO_RADIUS = 28;
export const HERO_SIZE = HERO_RADIUS * 2;
export const BOARD_ZONE_W = 1600;

// Row Y-positions are hand-tuned so hero/board rows and the two hand states below clear each
// other with a small gap given CARD_H/HERO_RADIUS above — see the git history of this file if
// those change again.
//
// Hands no longer occupy a permanent dedicated row. Each hand rests "poked" against its owner's
// screen edge — card center pinned exactly on the edge, so only the CARD_H/2 half that's on-screen
// is visible (Phaser/the canvas clips the rest for free, no mask needed) — and its owner's hero
// overlaps that poke, drawn on top via HERO_DEPTH, like the hero is standing in front of a mostly
// tucked-away fan of cards. The opponent's hand *only* ever exists in this poked state (see the
// "twist" in wirePlayerHandPeekEvents — hovering it does nothing). The player's hand additionally has a
// "peeked" state, entered by hovering the trigger band below the battlefield (see
// PEEK_TRIGGER_*): the hand rises to PLAYER_HAND_PEEK_Y (fully visible) and the hero rises off the
// poke to PLAYER_HERO_PEEK_Y (just clear of the battlefield) so neither obscures the other. Both
// are derived from PLAYER_BOARD_Y (via PEEK_GAP) so the peeked hand+hero always fit exactly
// between the board and the bottom edge. PLAYER_HAND_PEEK_Y additionally backs off by
// HAND_PEEK_BOTTOM_CLEARANCE, since a hand card's own bottom edge isn't its true visual extent —
// the fused atk/hp box (see ATKHP_H in createStatBadge) is centered on and overflows past the
// card's bottom-right corner, so without that clearance it would render clipped by the screen's
// bottom edge whenever the hand is fully peeked.
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
export const PLAYER_HERO_Y = 1043; // idle, i.e. poked-hand state

export const PEEK_GAP = 14;
export const PLAYER_HERO_PEEK_Y = PLAYER_BOARD_Y + CARD_H / 2 + PEEK_GAP + HERO_RADIUS;
// See the HAND_PEEK_BOTTOM_CLEARANCE comment above — pulls the peeked hand row up just enough
// that the atk/hp box's overflow past a card's bottom edge still lands on-screen.
export const HAND_PEEK_BOTTOM_CLEARANCE = ATKHP_H / 2;
export const PLAYER_HAND_PEEK_Y = PLAYER_HERO_PEEK_Y + HERO_RADIUS + PEEK_GAP + CARD_H / 2 - HAND_PEEK_BOTTOM_CLEARANCE;

// Hero containers must out-rank hand containers' depth (hand fans out over 0..handSize-1 — see
// renderHand) so each hero visually sits in front of its own poked hand rather than being
// half-buried under it, while staying well clear of drag(1000)/animation depths above.
export const HERO_DEPTH = 100;

// Hovering this band under the battlefield toggles the player's hand between poked and peeked
// (see wirePlayerHandPeekEvents). It's exactly the row-layout footprint (rowLayout's BOARD_ZONE_W-wide
// span) from the board's bottom edge down to the screen edge, so it naturally covers the poke
// sliver, the fully peeked hand, and the peeked hero without also catching the End Turn/Cancel
// buttons or the deck/graveyard piles, which all live further out at PILE_X.
export const PEEK_TRIGGER_Y = PLAYER_BOARD_Y + CARD_H / 2;
export const PEEK_TRIGGER_X_MIN = CENTER_X - BOARD_ZONE_W / 2;
export const PEEK_TRIGGER_X_MAX = CENTER_X + BOARD_ZONE_W / 2;

// Deck/graveyard piles share the end-turn/cancel buttons' column, offset further right so hand
// cards (which can extend close to x=1760 at max hand size) never overlap them.
export const PILE_X = 1860;
export const OPPONENT_DECK_Y = 300;
export const PLAYER_DECK_Y = 750;
export const DECK_PILE_W = 80;
export const DECK_PILE_H = 100;

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

/** Adds a black outline to a text style, for legibility over full-bleed art — every on-card text element uses this; off-card UI chrome (health/mana readouts, pile labels, tooltip body text) does not. */
export function withStroke(style: Phaser.Types.GameObjects.Text.TextStyle, thickness = 3): Phaser.Types.GameObjects.Text.TextStyle
{
    return { ...style, stroke: '#000000', strokeThickness: thickness };
}

export const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '14px', color: '#ffffff', align: 'left' });
export const RULE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '10px', color: '#e8ecf5', fontStyle: 'italic', align: 'left' }, 2);
export const SMALL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '18px', color: '#ffffff' };
export const PILE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '12px', color: '#9aa7bd' };
export const COST_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '19px', color: '#ffffff' });
// Repurposed as the bottom type banner's label (was small centered gray text) — white on a
// solid green bar now, see createCardContainer's 'full' mode.
export const TYPE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '11px', color: '#ffffff', fontStyle: 'bold', align: 'left' }, 2);
export const KEYWORD_LABEL_BASE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '11px', fontStyle: 'bold' }, 2);
// The ", " joining multiple keyword labels on their shared line — plain (unbolded, uncolored) so
// the colored keyword names stay the visual focus.
export const KEYWORD_SEPARATOR_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '11px', color: '#e8ecf5' }, 2);
export const MISSING_ASSET_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '10px', color: '#888888', align: 'center' };
export const PILL_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial', fontSize: '9px', color: '#ffffff', fontStyle: 'bold' }, 2);
export const STAT_FUSED_STYLE: Phaser.Types.GameObjects.Text.TextStyle = withStroke({ fontFamily: 'Arial Black', fontSize: '15px', color: '#ffffff' });

// New card layout constants (createCardContainer) — starting points tuned by eye against
// src/refs/card-layout-ref.png, not pixel-perfect gospel.
export const HEADER_H = 30; // top gradient band height, holding the title
export const FOOTER_H = 64; // 'full' mode's bottom gradient band height (keywords + rule text), sits just above the type banner
export const TYPE_BANNER_H = 18; // 'full' mode's bottom-edge green type bar
export const COST_BADGE_R = 22; // cost circle, centered exactly on the card's top-right corner so it overflows both edges
// ATKHP_W / ATKHP_H (fused atk/hp box) are declared up near CARD_W/CARD_H — see the comment there.
export const PILL_H = 14;
export const PILL_PAD_X = 5;
export const PILL_ROW_GAP = 3;
export const PILL_INSET_X = 6;
export const PILL_INSET_Y = 8; // 'simplified' mode's bottom-left keyword/trigger pill stack
export const TOOLTIP_COST_CLEARANCE = 14; // extra top padding in the hover tooltip when it draws its own overflowing cost badge

/** The two off-board card zones that get a pile visual and a click-to-inspect overlay. */
export type PileZone = 'deck' | 'graveyard';

/**
 * How createCardContainer renders a card. 'full' is the detailed layout (hand, deck/graveyard
 * pile view, the played-card spotlight) — full-bleed art with a gradient header (title + an
 * overflowing cost badge) and a gradient footer (keyword labels, then rule text) plus a bottom
 * type banner and a fused, overflowing atk/hp box. 'simplified' is the battlefield-only layout —
 * same full-bleed art and header/title, but no cost badge, no footer/rule-text/type banner; a
 * minion's keywords and triggered-effect flavor words instead render as compact bottom-left
 * pills (see createStatusPills), to keep the cramped board row as clutter-free as possible.
 * 'faceDown' is the card-back, used for the opponent's hand and its matching draw-animation
 * preview.
 */
export type CardDisplayMode = 'full' | 'simplified' | 'faceDown';

export function statStyle(color: string, stroke = false): Phaser.Types.GameObjects.Text.TextStyle {
    const base: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial Black', fontSize: '20px', color };
    return stroke ? withStroke(base) : base;
}

/** Per-zone pile chrome. The deck keeps the card-back blue it has always used; the graveyard takes a desaturated maroon so the two read apart at a glance in the same column. */
export const PILE_STYLES: Record<PileZone, { fill: number; stroke: number; label: string; title: string }> = {
    deck: { fill: 0x24304a, stroke: 0x8fa8d6, label: 'DECK', title: 'Deck' },
    graveyard: { fill: 0x33262c, stroke: 0xc08a94, label: 'GRAVE', title: 'Graveyard' },
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
 * setCrop) and only then stretches that already-matching-aspect-ratio rectangle to fit via
 * setDisplaySize — since the crop's aspect ratio already equals the target's, that final stretch
 * is uniform and introduces no distortion. Shared by CardView's card art and CardGame's deck-pile
 * card-back image — the only two places that render a texture into a fixed box.
 */
export function coverFit(image: Phaser.GameObjects.Image, width: number, height: number): void
{
    const sourceW = image.width;
    const sourceH = image.height;
    const targetAspect = width / height;

    if (sourceW / sourceH > targetAspect)
    {
        const cropW = sourceH * targetAspect;
        image.setCrop((sourceW - cropW) / 2, 0, cropW, sourceH);
    }
    else
    {
        const cropH = sourceW / targetAspect;
        image.setCrop(0, (sourceH - cropH) / 2, sourceW, cropH);
    }

    image.setDisplaySize(width, height);
}
