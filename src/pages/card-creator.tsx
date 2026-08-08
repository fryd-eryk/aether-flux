import Head from "next/head";
import dynamic from "next/dynamic";

const CardCreatorPageWithoutSSR = dynamic(() => import("@/cardCreator/CardCreatorPage"), { ssr: false });

export default function CardCreatorRoute() {
    return (
        <>
            <Head>
                <title>Card Creator</title>
                <meta name="description" content="Visual card editor for the card game's cards.ts data." />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.png" />
            </Head>
            <CardCreatorPageWithoutSSR />
        </>
    );
}
