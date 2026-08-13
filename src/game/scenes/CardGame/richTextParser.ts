/**
 * A tiny markdown-emphasis subset for card rule text: **bold**, *italic*, ***both***. No
 * nesting, no other markdown constructs — rule text is short, punchy prose, not documents.
 */
export interface RichTextRun {
    text: string;
    bold: boolean;
    italic: boolean;
}

// Longest marker first so ***x*** isn't misparsed as fragments of the shorter alternatives.
export const RICH_TEXT_MARKER_RE = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g;

export function parseRichText(source: string): RichTextRun[] {
    const runs: RichTextRun[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    RICH_TEXT_MARKER_RE.lastIndex = 0;
    while ((match = RICH_TEXT_MARKER_RE.exec(source)) !== null) {
        if (match.index > lastIndex) {
            runs.push({ text: source.slice(lastIndex, match.index), bold: false, italic: false });
        }

        const [, both, bold, italic] = match;
        if (both !== undefined) {
            runs.push({ text: both, bold: true, italic: true });
        } else if (bold !== undefined) {
            runs.push({ text: bold, bold: true, italic: false });
        } else {
            runs.push({ text: italic ?? "", bold: false, italic: true });
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < source.length) {
        runs.push({ text: source.slice(lastIndex), bold: false, italic: false });
    }

    return runs;
}

/**
 * True when a `*`/`**`/`***` marker in `source` never found a matching close — i.e. a literal
 * `*` survives after stripping every well-formed matched run. Used by validateCardDefinition.ts
 * to catch an authoring typo (unpaired marker) that would otherwise silently render as a stray
 * asterisk instead of the intended formatting.
 */
export function hasDanglingMarkdownMarker(source: string): boolean {
    return source.replace(RICH_TEXT_MARKER_RE, "").includes("*");
}
