import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// A function (not a plain object) so config can differ by phase — see
// CLAUDE.md/SPEC.md's "Card Creator" section for why: `output: "export"` makes
// `next dev` outright 404 every API route (confirmed empirically — it isn't just a
// `next build`-time warning, `next dev` refuses to serve them at all with this set),
// which breaks the Card Creator's save route (src/pages/api/card-creator/save.ts).
// Production (`next build`) still produces a fully static export; only the dev
// server skips `output: "export"` so that route can actually respond.
export default function nextConfig(phase) {
    const isDev = phase === PHASE_DEVELOPMENT_SERVER;

    /** @type {import('next').NextConfig} */
    const config = {
        ...(isDev ? {} : { output: "export" }),
        distDir: "dist",
        devIndicators: false,
    };

    return config;
}
