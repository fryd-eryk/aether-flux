import { useState } from 'react';

import { isDeckLegal, loadDecks } from '@/game/state/deckStorage';
import type { SavedDeck } from '@/game/types/Deck';
import styles from '@/styles/DeckSelect.module.css';

interface DeckSelectScreenProps {
    onSelect: (deck: SavedDeck) => void;
}

export function DeckSelectScreen({ onSelect }: DeckSelectScreenProps) {
    const [decks] = useState<SavedDeck[]>(() => loadDecks().filter(isDeckLegal));

    return (
        <div className={styles.page}>
            <div className={styles.panel}>
                <h1 className={styles.title}>Choose your deck</h1>

                {decks.length === 0 ? (
                    <p className={styles.emptyMessage}>
                        You don&apos;t have any complete decks yet. Build one in the{' '}
                        <a className={styles.link} href="/deckbuilder">Deck Builder</a>.
                    </p>
                ) : (
                    <ul className={styles.deckList}>
                        {decks.map((deck) => (
                            <li key={deck.id}>
                                <button type="button" className={styles.deckButton} onClick={() => onSelect(deck)}>
                                    {deck.name.trim() || 'Untitled Deck'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <a className={styles.link} href="/deckbuilder">Go to Deck Builder</a>
            </div>
        </div>
    );
}
