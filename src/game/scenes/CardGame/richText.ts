import type { Scene } from "phaser";

import { COST_BADGE_DARK, COST_BADGE_LIGHT, COST_BADGE_STROKE_COLOR, COST_BADGE_STROKE_WIDTH, withStroke } from "./cardLayout";
import { parseRichText } from "./richTextParser";

export interface RichTextLayoutOptions {
    x: number;
    y: number;
    maxWidth: number;
    style: Phaser.Types.GameObjects.Text.TextStyle;
    /** Extra px between wrapped lines, on top of each line's own font height. */
    lineSpacing?: number;
}

/** Every segment renders as either a plain Text (word runs) or a Container (a pip badge, see
 * PipToken) — narrower than the generic GameObject base type so callers can still read .x/.y/
 * .width/.height off each entry (createDescriptionBox's cursorY shifting, HelpBoxController's
 * maxRight bound) without those properties being lost to a too-generic element type. */
export type RichTextObject = Phaser.GameObjects.Text | Phaser.GameObjects.Container;

export interface RichTextLayoutResult {
    objects: RichTextObject[];
    /** Total block height, for callers sizing a background box around the text. */
    height: number;
}

type WordToken = { kind: "word"; text: string; bold: boolean; italic: boolean };
type SpaceToken = { kind: "space" };
type BreakToken = { kind: "break" };
/** A minion's paid-ability `(<cost>):` text prefix (see PaidAbility, Card.ts) — an atomic inline
 * badge, not text, produced by splitPipSegments below rather than parseRichText's markdown parser. */
type PipToken = { kind: "pip"; cost: number };
type Token = WordToken | SpaceToken | BreakToken | PipToken;
/** A line never contains a break token — hitting one always starts a new line instead. */
type LineToken = WordToken | SpaceToken | PipToken;

type SourceSegment = { kind: "text"; text: string } | { kind: "pip"; cost: number };

// Matches a paid ability's `(<cost>):` text prefix — see PaidAbility's doc comment (Card.ts) and
// SPEC.md's "Card design conventions". Only recognized at the very start of the source or right
// after a line break (see splitPipSegments) — this is the one authoring convention it stands for,
// not a general inline-badge markdown syntax, so "(2):" appearing mid-sentence elsewhere in a
// card's prose renders as plain literal text instead of a badge.
const PIP_PATTERN = /\((\d+)\):/g;

/**
 * Splits `source` into alternating text/pip segments, pulling out every `(<digits>):` match that
 * sits at the very start of the string or immediately after a `\n` — see PIP_PATTERN. The `\n`
 * itself is left untouched in the surrounding text segment (not consumed), so break-detection
 * downstream in tokenize() still sees it normally; only the cost-prefix characters are extracted.
 */
function splitPipSegments(source: string): SourceSegment[] {
    const segments: SourceSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    PIP_PATTERN.lastIndex = 0;
    while ((match = PIP_PATTERN.exec(source)) !== null) {
        const atLineStart = match.index === 0 || source[match.index - 1] === "\n";
        if (!atLineStart) continue;

        if (match.index > lastIndex) {
            segments.push({ kind: "text", text: source.slice(lastIndex, match.index) });
        }
        segments.push({ kind: "pip", cost: Number(match[1]) });
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < source.length) {
        segments.push({ kind: "text", text: source.slice(lastIndex) });
    }

    return segments;
}

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    for (const segment of splitPipSegments(source)) {
        if (segment.kind === "pip") {
            tokens.push({ kind: "pip", cost: segment.cost });
            continue;
        }

        for (const run of parseRichText(segment.text)) {
            const pieces = run.text.split(/(\n|[^\S\n]+)/);
            for (const piece of pieces) {
                if (piece === "") continue;
                if (piece === "\n") {
                    tokens.push({ kind: "break" });
                } else if (/^[^\S\n]+$/.test(piece)) {
                    tokens.push({ kind: "space" });
                } else {
                    tokens.push({ kind: "word", text: piece, bold: run.bold, italic: run.italic });
                }
            }
        }
    }
    return tokens;
}

function fontStyleFor(bold: boolean, italic: boolean): string | undefined {
    if (bold && italic) return "bold italic";
    if (bold) return "bold";
    if (italic) return "italic";
    return undefined;
}

/** Creates a throwaway Text object purely to read Phaser's own measured width for `text`. */
function measureWidth(scene: Scene, text: string, style: Phaser.Types.GameObjects.Text.TextStyle): number {
    const probe = scene.add.text(0, 0, text, style);
    const width = probe.width;
    probe.destroy();
    return width;
}

/**
 * Measures a single space's true advance width for `style`. Phaser's own Text width includes a
 * flat `strokeThickness` add-on baked into every measurement (see GetTextSize.js) — a negligible
 * fraction of a whole sentence's width, but for stroked on-card text (RULE_TEXT_STYLE) it's a huge
 * fraction of a single space glyph's width on its own, roughly doubling the isolated-space probe
 * that used to be used here. Measuring "x x" vs "xx" instead cancels that constant exactly (it's
 * added once per Text object regardless of content, so subtracting two measurements removes it),
 * leaving just the space's own advance width.
 */
function measureSpaceWidth(scene: Scene, style: Phaser.Types.GameObjects.Text.TextStyle): number {
    return measureWidth(scene, "x x", style) - measureWidth(scene, "xx", style);
}

/** A pip badge's diameter, derived from the surrounding line's own font size so it scales
 * correctly between contexts (the card's 10px rule text vs. the tooltip's 15px body text) and
 * reads as roughly one line-height tall rather than a fixed size that's right in only one place. */
function pipDiameterFor(style: Phaser.Types.GameObjects.Text.TextStyle): number {
    const fontSize = typeof style.fontSize === "string" ? parseFloat(style.fontSize) : style.fontSize ?? 16;
    return fontSize * 1.3;
}

/** Builds one inline cost-pip badge — the same gradient-circle recipe CardView's on-card mana/
 * ability badges use (COST_BADGE_*), just sized to `diameter` instead of a fixed radius, and
 * positioned with its own top-left corner at (topLeftX, topLeftY) to match how word segments are
 * positioned in the surrounding text flow (see the render pass below). */
function createPipBadge(scene: Scene, topLeftX: number, topLeftY: number, cost: number, diameter: number): Phaser.GameObjects.Container {
    const radius = diameter / 2;

    const badge = scene.add.graphics();
    badge.fillGradientStyle(COST_BADGE_LIGHT, COST_BADGE_LIGHT, COST_BADGE_DARK, COST_BADGE_DARK, 1, 1, 1, 1);
    badge.fillCircle(radius, radius, radius);
    badge.lineStyle(COST_BADGE_STROKE_WIDTH, COST_BADGE_STROKE_COLOR, 1);
    badge.strokeCircle(radius, radius, radius);

    // withStroke both adds the black border and switches this Text to CARD_TEXT_RESOLUTION's
    // higher-density rasterization — without it, a small on-card/tooltip font like this renders
    // from a genuinely tiny source bitmap and blurs when the card is displayed above native size
    // (see cardLayout.ts's CARD_TEXT_RESOLUTION comment for the full explanation).
    const text = scene.add
        .text(radius, radius, `${cost}`, withStroke({ fontFamily: "Arial Black", fontSize: `${Math.max(8, Math.round(diameter * 0.55))}px`, color: "#ffffff" }, 1.5))
        .setOrigin(0.5);

    const container = scene.add.container(topLeftX, topLeftY, [badge, text]);
    container.setSize(diameter, diameter);
    return container;
}

interface TextSegment {
    kind: "text";
    text: string;
    bold: boolean;
    italic: boolean;
    /** True if a space separated this segment from the previous one on the same line (style
     * changed at a word boundary, so the space couldn't be embedded in either segment's string). */
    gapBefore: boolean;
}

interface PipSegment {
    kind: "pip";
    cost: number;
    gapBefore: boolean;
}

type Segment = TextSegment | PipSegment;

/**
 * Groups a line's word/space/pip tokens into the fewest possible segments, merging consecutive
 * words that share the same bold/italic styling into one segment (with their real space characters
 * embedded literally) — only starting a new segment where the styling actually changes, or a pip
 * token interrupts the run (a pip is always its own atomic segment, never merged with text). This
 * is what lets same-style text runs render via a single native fillText call instead of one Text
 * object per word, avoiding the per-word Math.ceil rounding (and per-object edge/anti-alias seams)
 * that compounds into visibly oversized gaps when every word is its own texture.
 */
function buildSegments(lineTokens: LineToken[]): Segment[] {
    const segments: Segment[] = [];
    let current: TextSegment | null = null;
    let sawSpace = false;

    for (const token of lineTokens) {
        if (token.kind === "space") {
            sawSpace = true;
            continue;
        }

        if (token.kind === "pip") {
            if (current) {
                segments.push(current);
                current = null;
            }
            segments.push({ kind: "pip", cost: token.cost, gapBefore: segments.length > 0 && sawSpace });
            sawSpace = false;
            continue;
        }

        if (current && current.bold === token.bold && current.italic === token.italic) {
            current.text += (sawSpace ? " " : "") + token.text;
        } else {
            if (current) segments.push(current);
            current = { kind: "text", text: token.text, bold: token.bold, italic: token.italic, gapBefore: segments.length > 0 && sawSpace };
        }
        sawSpace = false;
    }
    if (current) segments.push(current);

    return segments;
}

/**
 * Lays out markdown-emphasis rule text (see richTextParser.ts) as a group of plain Phaser Text
 * objects, plus one Container per inline paid-ability cost-pip (see PipToken/createPipBadge) —
 * Phaser 4's core Text has no inline-tag rich-text support, so mixed styling still needs multiple
 * Text objects (the same technique CardView.ts already uses for keyword labels and stat badges),
 * but only split at actual bold/italic boundaries, line wraps, and pip badges, not per word — see
 * buildSegments.
 *
 * Two passes: the first walks token-by-token (word/pip-level) purely to decide wrap points, using
 * cheap throwaway measurements (a pip's "measurement" is just its fixed diameter, no text probe
 * needed); the second groups each resulting line into segments and creates the real, kept objects —
 * one per segment, not per word.
 */
export function layoutRichText(scene: Scene, source: string, options: RichTextLayoutOptions): RichTextLayoutResult {
    const { x, y, maxWidth, style, lineSpacing = 0 } = options;

    const spaceWidth = measureSpaceWidth(scene, style);
    // Every stroked Text object's own .width reserves strokeThickness as padding around its ink
    // (see GetTextSize.js) so the stroke halo never gets clipped — invisible for a single
    // whole-line Text object (the original approach), but since a styled run here is its own
    // separate Text object, that reserved padding gets paid again at every segment boundary and
    // stacks visually on top of the already-correct spaceWidth gap. Subtracting it back out of
    // the cursor advance (both the wrap-decision pass and the render pass) cancels that out,
    // leaving segments' ink exactly spaceWidth apart regardless of how many segments a line has.
    const strokeThickness = typeof style.strokeThickness === "number" ? style.strokeThickness : 0;
    const pipDiameter = pipDiameterFor(style);

    // Pass 1: word/pip-level wrap simulation, producing lines of word/space/pip tokens (no breaks).
    const lines: LineToken[][] = [[]];
    let cursorX = 0;
    let lineHasWord = false;

    for (const token of tokenize(source)) {
        if (token.kind === "break") {
            lines.push([]);
            cursorX = 0;
            lineHasWord = false;
            continue;
        }

        if (token.kind === "space") {
            if (lineHasWord) {
                lines[lines.length - 1].push(token);
                cursorX += spaceWidth;
            }
            continue;
        }

        if (token.kind === "pip") {
            if (lineHasWord && cursorX + pipDiameter > maxWidth) {
                lines.push([]);
                cursorX = 0;
                lineHasWord = false;
            }
            lines[lines.length - 1].push(token);
            cursorX += pipDiameter;
            lineHasWord = true;
            continue;
        }

        const fontStyle = fontStyleFor(token.bold, token.italic);
        const wordWidth = measureWidth(scene, token.text, { ...style, ...(fontStyle ? { fontStyle } : {}) }) - strokeThickness;

        if (lineHasWord && cursorX + wordWidth > maxWidth) {
            lines.push([]);
            cursorX = 0;
            lineHasWord = false;
        }

        lines[lines.length - 1].push(token);
        cursorX += wordWidth;
        lineHasWord = true;
    }

    // Pass 2: build the real, kept objects per line/segment.
    const objects: RichTextObject[] = [];
    let cursorY = y;
    let lastRowHeight = 0;
    let renderedAnyLine = false;

    lines.forEach((lineTokens) => {
        const segments = buildSegments(lineTokens);
        if (segments.length === 0) return;

        if (renderedAnyLine) cursorY += lastRowHeight + lineSpacing;

        let segCursorX = x;
        let rowHeight = 0;

        for (const seg of segments) {
            if (seg.gapBefore) segCursorX += spaceWidth;

            if (seg.kind === "pip") {
                const pipObj = createPipBadge(scene, segCursorX, cursorY, seg.cost, pipDiameter);
                objects.push(pipObj);
                segCursorX += pipDiameter;
                rowHeight = Math.max(rowHeight, pipDiameter);
                continue;
            }

            const fontStyle = fontStyleFor(seg.bold, seg.italic);
            const textObj = scene.add.text(segCursorX, cursorY, seg.text, { ...style, ...(fontStyle ? { fontStyle } : {}) }).setOrigin(0, 0);

            objects.push(textObj);
            segCursorX += textObj.width - strokeThickness;
            rowHeight = Math.max(rowHeight, textObj.height);
        }

        lastRowHeight = rowHeight;
        renderedAnyLine = true;
    });

    const height = renderedAnyLine ? cursorY - y + lastRowHeight : 0;
    return { objects, height };
}
