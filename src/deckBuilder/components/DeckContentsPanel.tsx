import { useMemo } from 'react';

import { CARD_DEFINITIONS } from '@/game/data/cards';
import styles from '@/styles/DeckBuilder.module.css';

interface DeckContentsPanelProps {
    title: string;
    /** Card ids currently in this deck half — may repeat, one entry per physical copy. */
    ids: string[];
    target: number;
    onRemove: (id: string) => void;
}

/** Grouped "qty × name" view of one deck half's current contents, with a running count against
 * its target size. Shared between the Main Deck (used from DeckBuilderPage) and would apply
 * equally to the Aether Deck, though that side is small enough that AetherPoolPanel's own
 * steppers already serve as its contents view — see that component's doc comment. A card id
 * that no longer resolves in cards.ts (removed/renamed since the deck was saved) still renders,
 * flagged as unknown, instead of throwing. */
export function DeckContentsPanel({ title, ids, target, onRemove }: DeckContentsPanelProps) {
    const grouped = useMemo(() => {
        const counts = new Map<string, number>();
        for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
        return [...counts.entries()].sort((a, b) => {
            const nameA = CARD_DEFINITIONS[a[0]]?.name ?? a[0];
            const nameB = CARD_DEFINITIONS[b[0]]?.name ?? b[0];
            return nameA.localeCompare(nameB);
        });
    }, [ids]);

    const complete = ids.length === target;

    return (
        <div className={styles.contentsPanel}>
            <div className={styles.contentsHeader}>
                <span>{title}</span>
                <span className={complete ? styles.contentsCountComplete : styles.contentsCount}>
                    {ids.length} / {target}
                </span>
            </div>
            <div className={styles.contentsList}>
                {grouped.length === 0 && <div className={styles.contentsEmpty}>No cards yet — add some from the pool.</div>}
                {grouped.map(([id, qty]) => (
                    <div key={id} className={styles.contentsRow}>
                        <span className={styles.contentsRowName}>{CARD_DEFINITIONS[id]?.name ?? 'Unknown card (removed)'}</span>
                        <span className={styles.contentsRowQty}>×{qty}</span>
                        <button type="button" className={styles.contentsRemoveButton} onClick={() => onRemove(id)} title="Remove one copy">
                            −
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
