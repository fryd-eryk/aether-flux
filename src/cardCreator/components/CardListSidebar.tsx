import { useMemo, useState } from 'react';

import type { CardDefinition } from '@/game/types/Card';
import styles from '@/styles/CardCreator.module.css';

interface CardListSidebarProps {
    cards: Record<string, CardDefinition>;
    selectedId: string | null;
    dirtyIds: Set<string>;
    onSelect: (id: string) => void;
    onNew: () => void;
}

export function CardListSidebar({ cards, selectedId, dirtyIds, onSelect, onNew }: CardListSidebarProps) {
    const [search, setSearch] = useState('');

    const entries = useMemo(() => {
        const query = search.trim().toLowerCase();
        return Object.values(cards)
            .filter((card) => !query || card.name.toLowerCase().includes(query) || card.id.toLowerCase().includes(query))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [cards, search]);

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <input
                    className={styles.searchInput}
                    placeholder="Search cards..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <button type="button" className={styles.newButton} onClick={onNew}>
                    + New Card
                </button>
            </div>
            <div className={styles.cardList}>
                {entries.map((card) => (
                    <button
                        key={card.id}
                        type="button"
                        className={`${styles.cardListItem} ${card.id === selectedId ? styles.cardListItemActive : ''}`}
                        onClick={() => onSelect(card.id)}
                    >
                        <span>
                            {card.name}
                            {dirtyIds.has(card.id) && <span className={styles.cardListItemDirty}>●</span>}
                        </span>
                        <span className={styles.cardListItemCost}>{card.cost}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
