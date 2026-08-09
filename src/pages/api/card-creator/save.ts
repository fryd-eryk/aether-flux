import fs from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

// Dev-only endpoint backing the Card Creator's Save button (src/cardCreator/). Writes
// straight to the repo's own src/game/data/cards.ts — only meaningful against a local
// checkout with `npm run dev` running, so it's gated to development regardless of
// deployment target. Doesn't exist in the static export `next build` produces (Next.js
// drops pages/api entirely from `output: 'export'`'s output, with just a build-time
// warning — see CLAUDE.md), so there's no path where this runs against a real server.
const CARDS_FILE_PATH = path.join(process.cwd(), 'src', 'game', 'data', 'cards.ts');

type SaveResponse = { ok: true } | { ok: false; error: string };

export default function handler(req: NextApiRequest, res: NextApiResponse<SaveResponse>) {
    if (process.env.NODE_ENV !== 'development') {
        res.status(403).json({ ok: false, error: 'Only available in development.' });
        return;
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ ok: false, error: 'Method not allowed.' });
        return;
    }

    const { source } = req.body ?? {};
    if (typeof source !== 'string' || source.trim().length === 0) {
        res.status(400).json({ ok: false, error: 'Missing or empty "source" in request body.' });
        return;
    }

    try {
        fs.writeFileSync(CARDS_FILE_PATH, source, 'utf8');
        res.status(200).json({ ok: true });
    } catch (error) {
        res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
}
