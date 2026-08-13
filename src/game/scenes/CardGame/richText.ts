import type { Scene } from "phaser";

import { parseRichText } from "./richTextParser";

export interface RichTextLayoutOptions {
    x: number;
    y: number;
    maxWidth: number;
    style: Phaser.Types.GameObjects.Text.TextStyle;
    /** Extra px between wrapped lines, on top of each line's own font height. */
    lineSpacing?: number;
}

export interface RichTextLayoutResult {
    objects: Phaser.GameObjects.Text[];
    /** Total block height, for callers sizing a background box around the text. */
    height: number;
}

type WordToken = { kind: "word"; text: string; bold: boolean; italic: boolean };
type SpaceToken = { kind: "space" };
type BreakToken = { kind: "break" };
type Token = WordToken | SpaceToken | BreakToken;
/** A line never contains a break token — hitting one always starts a new line instead. */
type LineToken = WordToken | SpaceToken;

function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    for (const run of parseRichText(source)) {
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

interface Segment {
    text: string;
    bold: boolean;
    italic: boolean;
    /** True if a space separated this segment from the previous one on the same line (style
     * changed at a word boundary, so the space couldn't be embedded in either segment's string). */
    gapBefore: boolean;
}

/**
 * Groups a line's word/space tokens into the fewest possible segments, merging consecutive words
 * that share the same bold/italic styling into one segment (with their real space characters
 * embedded literally) — only starting a new segment where the styling actually changes. This is
 * what lets same-style runs render via a single native fillText call instead of one Text object
 * per word, avoiding the per-word Math.ceil rounding (and per-object edge/anti-alias seams) that
 * compounds into visibly oversized gaps when every word is its own texture.
 */
function buildSegments(lineTokens: LineToken[]): Segment[] {
    const segments: Segment[] = [];
    let current: Segment | null = null;
    let sawSpace = false;

    for (const token of lineTokens) {
        if (token.kind === "space") {
            sawSpace = true;
            continue;
        }

        if (current && current.bold === token.bold && current.italic === token.italic) {
            current.text += (sawSpace ? " " : "") + token.text;
        } else {
            if (current) segments.push(current);
            current = { text: token.text, bold: token.bold, italic: token.italic, gapBefore: segments.length > 0 && sawSpace };
        }
        sawSpace = false;
    }
    if (current) segments.push(current);

    return segments;
}

/**
 * Lays out markdown-emphasis rule text (see richTextParser.ts) as a group of plain Phaser Text
 * objects — Phaser 4's core Text has no inline-tag rich-text support, so mixed styling still
 * needs multiple Text objects (the same technique CardView.ts already uses for keyword labels and
 * stat badges), but only split at actual bold/italic boundaries and line wraps, not per word — see
 * buildSegments.
 *
 * Two passes: the first walks token-by-token (word-level) purely to decide wrap points, using
 * cheap throwaway measurements; the second groups each resulting line into segments and creates
 * the real, kept Text objects — one per segment, not per word.
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

    // Pass 1: word-level wrap simulation, producing lines of word/space tokens (no breaks).
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

    // Pass 2: build the real, kept Text objects per line/segment.
    const objects: Phaser.GameObjects.Text[] = [];
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
