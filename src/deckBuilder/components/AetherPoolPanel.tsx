import { useMemo } from 'react';

import { CARD_DEFINITIONS } from '@/game/data/cards';
import { AETHER_DECK_SIZE } from '@/game/state/deckStorage';
import type { AetherCategory, CardDefinition } from '@/game/types/Card';
import styles from '@/styles/DeckBuilder.module.css';

const CATEGORY_ORDER: AetherCategory[] = ['generic', 'fire', 'water', 'earth', 'air'];

interface AetherPoolPanelProps {
    /** Copies of each Aether card id already in the Aether Deck being edited. */
    counts: Map<string, number>;
    totalCount: number;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
    /** Called on row hover only (never on leave) — see DeckCardPoolSidebar's matching prop. */
    onHover: (definition: CardDefinition) => void;
}

/** The Aether card pool — exactly one card per AetherCategory (5 total today), so unlike
 * DeckCardPoolSidebar this is a fixed short list with inline quantity steppers, not a
 * filterable/sortable browse view. This panel doubles as the Aether Deck's "current contents"
 * display (no separate DeckContentsPanel instance for the Aether side — with only 5 possible
 * rows, a second list showing the same 5 cards again would be redundant). No per-card copy cap
 * — see SPEC.md's "Resource system roadmap: Aether". */
export function AetherPoolPanel({ counts, totalCount, onAdd, onRemove, onHover }: AetherPoolPanelProps) {
    const cards = useMemo(() => {
        return CATEGORY_ORDER
            .map((category) => Object.values(CARD_DEFINITIONS).find((c) => c.type === 'aether' && c.aetherCategory === category))
            .filter((c): c is CardDefinition => c !== undefined);
    }, []);

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <div className={styles.cardCountLabel}>
                    Aether Deck: {totalCount} / {AETHER_DECK_SIZE}
                </div>
            </div>
            <div className={styles.aetherList}>
                {cards.map((card) => {
                    const copies = counts.get(card.id) ?? 0;
                    const atDeckLimit = totalCount >= AETHER_DECK_SIZE;
                    return (
                        <div key={card.id} className={styles.aetherRow} onMouseEnter={() => onHover(card)}>
                            <span className={styles.aetherRowName}>{card.name}</span>
                            <span className={styles.stepperGroup}>
                                <button type="button" className={styles.stepperButton} disabled={copies === 0} onClick={() => onRemove(card.id)}>
                                    −
                                </button>
                                <span className={styles.stepperCount}>{copies}</span>
                                <button type="button" className={styles.stepperButton} disabled={atDeckLimit} onClick={() => onAdd(card.id)}>
                                    +
                                </button>
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
