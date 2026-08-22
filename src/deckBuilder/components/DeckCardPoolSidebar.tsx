import { useMemo, useState } from 'react';

import { FilterListbox, type FilterListboxOption } from '@/cardCreator/components/FilterListbox';
import { CARD_DEFINITIONS } from '@/game/data/cards';
import { MAX_COPIES } from '@/game/data/deckGenerator';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import { RARITY_METADATA } from '@/game/data/rarityMetadata';
import { TRIBE_METADATA } from '@/game/data/tribeMetadata';
import { MAIN_DECK_SIZE } from '@/game/state/deckStorage';
import type { CardDefinition, CardRarity, Keyword, Tribe } from '@/game/types/Card';
import styles from '@/styles/DeckBuilder.module.css';

type SortField = 'name' | 'cost' | 'rarity' | 'tribe';
type SortDir = 'asc' | 'desc';

const RARITY_ORDER: CardRarity[] = ['common', 'rare', 'exotic', 'legendary', 'mythical'];
const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
const TRIBES = Object.keys(TRIBE_METADATA) as Tribe[];

function hexColor(n: number): string {
    return `#${n.toString(16).padStart(6, '0')}`;
}

const TRIBE_OPTIONS: FilterListboxOption[] = TRIBES.map((tribe) => ({ value: tribe, label: TRIBE_METADATA[tribe].label }));
const KEYWORD_OPTIONS: FilterListboxOption[] = KEYWORDS.map((keyword) => ({ value: keyword, label: KEYWORD_METADATA[keyword].label }));
const RARITY_OPTIONS: FilterListboxOption[] = RARITY_ORDER.map((rarity) => ({
    value: rarity,
    label: rarity[0].toUpperCase() + rarity.slice(1),
    swatch: hexColor(RARITY_METADATA[rarity].light),
}));

const MAIN_DECK_POOL: CardDefinition[] = Object.values(CARD_DEFINITIONS).filter((c) => c.type === 'minion' || c.type === 'spell');

function rarityColor(card: CardDefinition): string {
    const { light } = RARITY_METADATA[card.rarity ?? 'common'];
    return `#${light.toString(16).padStart(6, '0')}`;
}

function tribeLabel(card: CardDefinition): string | null {
    const tribe = card.tribes?.[0];
    return tribe ? TRIBE_METADATA[tribe].label : null;
}

interface DeckCardPoolSidebarProps {
    /** Copies of each card id already in the Main Deck being edited. */
    counts: Map<string, number>;
    totalCount: number;
    onAdd: (id: string) => void;
    /** Called on row hover only (never with null on leave) — the preview keeps showing the last
     * hovered card rather than flickering to a placeholder between rows. */
    onHover: (definition: CardDefinition) => void;
}

/** Browsable/filterable Main Deck card pool — modeled on Card Creator's CardListSidebar, but a
 * row click adds a copy to the deck (repeatable) instead of selecting a card for editing
 * (mutually exclusive), and there's no Type filter since this pool is already type-locked to
 * minion/spell. See AetherPoolPanel for the Aether side, which is a different shape entirely
 * (5 fixed cards, no filters) rather than a parametrized variant of this component. */
export function DeckCardPoolSidebar({ counts, totalCount, onAdd, onHover }: DeckCardPoolSidebarProps) {
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('cost');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const [filterTribes, setFilterTribes] = useState<Tribe[]>([]);
    const [filterKeywords, setFilterKeywords] = useState<Keyword[]>([]);
    const [filterRarities, setFilterRarities] = useState<CardRarity[]>([]);

    function clearFilters() {
        setFilterTribes([]);
        setFilterKeywords([]);
        setFilterRarities([]);
    }
    const hasActiveFilters = filterTribes.length > 0 || filterKeywords.length > 0 || filterRarities.length > 0;

    const entries = useMemo(() => {
        const query = search.trim().toLowerCase();
        const dir = sortDir === 'asc' ? 1 : -1;

        return MAIN_DECK_POOL
            .filter((card) => !query || card.name.toLowerCase().includes(query))
            .filter((card) => filterTribes.length === 0 || (card.tribes ?? []).some((t) => filterTribes.includes(t)))
            .filter((card) => filterKeywords.length === 0 || (card.keywords ?? []).some((k) => filterKeywords.includes(k)))
            .filter((card) => filterRarities.length === 0 || (card.rarity !== undefined && filterRarities.includes(card.rarity)))
            .sort((a, b) => {
                switch (sortField) {
                    case 'rarity':
                        return (RARITY_ORDER.indexOf(a.rarity ?? 'common') - RARITY_ORDER.indexOf(b.rarity ?? 'common')) * dir || a.name.localeCompare(b.name);
                    case 'tribe': {
                        const labelA = tribeLabel(a);
                        const labelB = tribeLabel(b);
                        if (labelA === null && labelB === null) return a.name.localeCompare(b.name);
                        if (labelA === null) return dir;
                        if (labelB === null) return -dir;
                        return labelA.localeCompare(labelB) * dir || a.name.localeCompare(b.name);
                    }
                    case 'name':
                        return a.name.localeCompare(b.name) * dir;
                    case 'cost':
                    default:
                        return ((a.cost?.generic ?? 0) - (b.cost?.generic ?? 0)) * dir || a.name.localeCompare(b.name);
                }
            });
    }, [search, sortField, sortDir, filterTribes, filterKeywords, filterRarities]);

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <input className={styles.searchInput} placeholder="Search cards..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className={styles.cardCountLabel}>
                    Main Deck: {totalCount} / {MAIN_DECK_SIZE}
                </div>
                <div className={styles.sortRow}>
                    <select className={styles.sortSelect} value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                        <option value="cost">Cost</option>
                        <option value="name">Title</option>
                        <option value="rarity">Rarity</option>
                        <option value="tribe">Tribe</option>
                    </select>
                    <button type="button" className={styles.sortDirButton} onClick={() => setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))} title={sortDir === 'asc' ? 'Ascending — click for descending' : 'Descending — click for ascending'}>
                        {sortDir === 'asc' ? '↑' : '↓'}
                    </button>
                </div>

                <div className={styles.filterBlock}>
                    <div className={styles.filterHeaderRow}>
                        <span className={styles.filterHeaderLabel}>Filters</span>
                        <button type="button" className={styles.filterClearButton} onClick={clearFilters} disabled={!hasActiveFilters}>
                            Clear
                        </button>
                    </div>
                    <div className={styles.filterListboxRow}>
                        <FilterListbox label="Rarity" options={RARITY_OPTIONS} selected={filterRarities} onChange={(next) => setFilterRarities(next as CardRarity[])} />
                        <FilterListbox label="Tribes" options={TRIBE_OPTIONS} selected={filterTribes} onChange={(next) => setFilterTribes(next as Tribe[])} />
                    </div>
                    <div className={styles.filterListboxRow}>
                        <FilterListbox label="Keywords" options={KEYWORD_OPTIONS} selected={filterKeywords} onChange={(next) => setFilterKeywords(next as Keyword[])} />
                    </div>
                </div>
            </div>
            <div className={styles.cardList}>
                {entries.map((card) => {
                    const copies = counts.get(card.id) ?? 0;
                    const disabled = copies >= MAX_COPIES || totalCount >= MAIN_DECK_SIZE;
                    return (
                        <button
                            key={card.id}
                            type="button"
                            className={`${styles.cardListItem} ${disabled ? styles.cardListItemDisabled : ''}`}
                            disabled={disabled}
                            onClick={() => onAdd(card.id)}
                            onMouseEnter={() => onHover(card)}
                        >
                            <span>
                                <span style={{ color: rarityColor(card) }}>{card.name}</span>
                                {copies > 0 && <span className={styles.cardListItemQty}>×{copies}</span>}
                            </span>
                            <span className={styles.cardListItemRight}>
                                <span className={styles.cardListItemCost}>{card.cost?.generic ?? 0}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
