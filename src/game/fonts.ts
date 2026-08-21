// Card titles use Cinzel (self-hosted, public/assets/fonts/cinzel/) instead of the system
// fonts every other on-card text uses — see cardLayout.ts's NAME_STYLE. Phaser's canvas Text
// paints with whatever font-family is currently resolved when it's created; if Cinzel's file
// hasn't finished downloading yet, the title silently renders in the fallback font forever
// (no auto-repaint on font load, unlike DOM text). Both places that build card Text before any
// user-driven event (Preloader, CardCreatorPreview) must await this first.
let cardFontsLoaded: Promise<void> | null = null;

export function ensureCardFontsLoaded(): Promise<void>
{
    if (!cardFontsLoaded)
    {
        const cinzelBold = new FontFace('Cinzel', 'url(/assets/fonts/cinzel/Cinzel-Bold.otf)', { weight: '700' });
        document.fonts.add(cinzelBold);
        cardFontsLoaded = cinzelBold.load().then(() => undefined);
    }

    return cardFontsLoaded;
}
