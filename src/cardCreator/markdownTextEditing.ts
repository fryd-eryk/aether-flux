export type MarkdownStyle = "bold" | "italic";

function asteriskRunEndingAt(s: string): number {
    let n = 0;
    while (n < s.length && n < 3 && s[s.length - 1 - n] === "*") n++;
    return n;
}

function asteriskRunStartingAt(s: string): number {
    let n = 0;
    while (n < s.length && n < 3 && s[n] === "*") n++;
    return n;
}

/**
 * Toggles `style` on the substring `value[start:end]`, returning the rewrapped string plus the
 * (possibly shifted) selection to restore afterward.
 *
 * Tracks the surrounding asterisk run (0-3 chars) on both sides rather than doing a naive
 * `**`/`*` string match, because bold's `**` and italic's `*` share the `*` character — a naive
 * check would misfire on an already-bold selection (e.g. italic-toggling `**bold**` should layer
 * into `***bold***`, not strip one of bold's own markers). A collapsed selection (start === end)
 * just wraps an empty string, leaving the cursor positioned between the inserted markers.
 */
export function toggleMarkdownStyle(
    value: string,
    start: number,
    end: number,
    style: MarkdownStyle
): { value: string; start: number; end: number } {
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    const existingCount = Math.min(asteriskRunEndingAt(before), asteriskRunStartingAt(after));
    const bold = existingCount === 2 || existingCount === 3;
    const italic = existingCount === 1 || existingCount === 3;

    const nextBold = style === "bold" ? !bold : bold;
    const nextItalic = style === "italic" ? !italic : italic;
    const nextCount = nextBold && nextItalic ? 3 : nextBold ? 2 : nextItalic ? 1 : 0;

    const strippedBefore = before.slice(0, before.length - existingCount);
    const strippedAfter = after.slice(existingCount);
    const marker = "*".repeat(nextCount);

    const newValue = strippedBefore + marker + selected + marker + strippedAfter;
    const newStart = strippedBefore.length + marker.length;
    return { value: newValue, start: newStart, end: newStart + selected.length };
}
