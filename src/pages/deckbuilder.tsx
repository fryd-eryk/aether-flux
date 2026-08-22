import Head from "next/head";
import dynamic from "next/dynamic";

const DeckBuilderPageWithoutSSR = dynamic(() => import("@/deckBuilder/DeckBuilderPage"), { ssr: false });

export default function DeckBuilderRoute() {
    return (
        <>
            <Head>
                <title>Aether Flux — Deck Builder</title>
                <meta name="description" content="Build and manage Main Decks and Aether Decks for Aether Flux." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.png" />
            </Head>
            <DeckBuilderPageWithoutSSR />
        </>
    );
}
