import { useMemo, useState } from "react";

import { KEYWORD_METADATA } from "@/game/data/keywordMetadata";
import { RARITY_METADATA, TOKEN_RARITY_COLOR } from "@/game/data/rarityMetadata";
import { TRIBE_METADATA } from "@/game/data/tribeMetadata";
import type { CardDefinition, CardRarity, CardType, Keyword, Tribe } from "@/game/types/Card";
import styles from "@/styles/CardCreator.module.css";

import { FilterListbox, type FilterListboxOption } from "./FilterListbox";

type SortField = "name" | "cost" | "rarity" | "type" | "tribe";
type SortDir = "asc" | "desc";

const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
const TRIBES = Object.keys(TRIBE_METADATA) as Tribe[];

// Ascending power order, matching Card.ts's CardRarity doc comment.
const RARITY_ORDER: CardRarity[] = ["common", "rare", "exotic", "legendary", "mythical"];

function hexColor(n: number): string {
    return `#${n.toString(16).padStart(6, "0")}`;
}

const TYPE_OPTIONS: FilterListboxOption[] = [
    { value: "minion", label: "Minion" },
    { value: "spell", label: "Spell" },
    { value: "token", label: "Token" },
    { value: "aether", label: "Aether" },
];
const TRIBE_OPTIONS: FilterListboxOption[] = TRIBES.map((tribe) => ({ value: tribe, label: TRIBE_METADATA[tribe].label }));
const KEYWORD_OPTIONS: FilterListboxOption[] = KEYWORDS.map((keyword) => ({ value: keyword, label: KEYWORD_METADATA[keyword].label }));
const RARITY_OPTIONS: FilterListboxOption[] = RARITY_ORDER.map((rarity) => ({
    value: rarity,
    label: rarity[0].toUpperCase() + rarity.slice(1),
    swatch: hexColor(RARITY_METADATA[rarity].light),
}));

// Tokens and Aether cards rank below common regardless of sort direction — neither is a power
// tier, so there's no "descending" position that makes sense for either.
function rarityRank(card: CardDefinition): number {
    return card.type === "token" || card.type === "aether" || !card.rarity ? -1 : RARITY_ORDER.indexOf(card.rarity);
}

// Cards without a tribe (all spells, plus any minion authored without one) sort below every
// real tribe, same "no value ranks lowest" convention as rarityRank.
function tribeLabel(card: CardDefinition): string | null {
    const tribe = card.tribes?.[0];
    return tribe ? TRIBE_METADATA[tribe].label : null;
}

// Same light color CardView's footer rarity dot uses (rarityMetadata.ts), as a CSS hex string.
function rarityColor(card: CardDefinition): string {
    const { light } = card.type === "token" || card.type === "aether" || !card.rarity ? TOKEN_RARITY_COLOR : RARITY_METADATA[card.rarity];
    return `#${light.toString(16).padStart(6, "0")}`;
}

interface CardListSidebarProps {
    cards: Record<string, CardDefinition>;
    selectedId: string | null;
    dirtyIds: Set<string>;
    onSelect: (id: string) => void;
    onNew: () => void;
}

export function CardListSidebar({ cards, selectedId, dirtyIds, onSelect, onNew }: CardListSidebarProps) {
    const [search, setSearch] = useState("");
    const [sortField, setSortField] = useState<SortField>("cost");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    const [filterTypes, setFilterTypes] = useState<CardType[]>([]);
    const [filterTribes, setFilterTribes] = useState<Tribe[]>([]);
    const [filterKeywords, setFilterKeywords] = useState<Keyword[]>([]);
    const [filterRarities, setFilterRarities] = useState<CardRarity[]>([]);
    const [filterAtkMin, setFilterAtkMin] = useState("");
    const [filterAtkMax, setFilterAtkMax] = useState("");
    const [filterHpMin, setFilterHpMin] = useState("");
    const [filterHpMax, setFilterHpMax] = useState("");

    function clearFilters() {
        setFilterTypes([]);
        setFilterTribes([]);
        setFilterKeywords([]);
        setFilterRarities([]);
        setFilterAtkMin("");
        setFilterAtkMax("");
        setFilterHpMin("");
        setFilterHpMax("");
    }

    const hasActiveFilters =
        filterTypes.length > 0 ||
        filterTribes.length > 0 ||
        filterKeywords.length > 0 ||
        filterRarities.length > 0 ||
        filterAtkMin !== "" ||
        filterAtkMax !== "" ||
        filterHpMin !== "" ||
        filterHpMax !== "";

    const entries = useMemo(() => {
        const query = search.trim().toLowerCase();
        const dir = sortDir === "asc" ? 1 : -1;

        const atkMin = filterAtkMin === "" ? null : Number(filterAtkMin);
        const atkMax = filterAtkMax === "" ? null : Number(filterAtkMax);
        const hpMin = filterHpMin === "" ? null : Number(filterHpMin);
        const hpMax = filterHpMax === "" ? null : Number(filterHpMax);

        return Object.values(cards)
            .filter((card) => !query || card.name.toLowerCase().includes(query) || card.id.toLowerCase().includes(query))
            .filter((card) => filterTypes.length === 0 || filterTypes.includes(card.type))
            .filter((card) => filterTribes.length === 0 || (card.tribes ?? []).some((t) => filterTribes.includes(t)))
            .filter((card) => filterKeywords.length === 0 || (card.keywords ?? []).some((k) => filterKeywords.includes(k)))
            .filter((card) => filterRarities.length === 0 || (card.rarity !== undefined && filterRarities.includes(card.rarity)))
            .filter((card) => atkMin === null || (card.attack ?? 0) >= atkMin)
            .filter((card) => atkMax === null || (card.attack ?? 0) <= atkMax)
            .filter((card) => hpMin === null || (card.health ?? 0) >= hpMin)
            .filter((card) => hpMax === null || (card.health ?? 0) <= hpMax)
            .sort((a, b) => {
                // Name is always the tiebreaker so cost/rarity ties don't jump around as you edit.
                switch (sortField) {
                    case "rarity":
                        return (rarityRank(a) - rarityRank(b)) * dir || a.name.localeCompare(b.name);
                    case "type":
                        return a.type.localeCompare(b.type) * dir || a.name.localeCompare(b.name);
                    case "tribe": {
                        const labelA = tribeLabel(a);
                        const labelB = tribeLabel(b);
                        if (labelA === null && labelB === null) return a.name.localeCompare(b.name);
                        if (labelA === null) return dir;
                        if (labelB === null) return -dir;
                        return labelA.localeCompare(labelB) * dir || a.name.localeCompare(b.name);
                    }
                    case "name":
                        return a.name.localeCompare(b.name) * dir;
                    case "cost":
                    default:
                        return ((a.cost?.generic ?? 0) - (b.cost?.generic ?? 0)) * dir || a.name.localeCompare(b.name);
                }
            });
    }, [cards, search, sortField, sortDir, filterTypes, filterTribes, filterKeywords, filterRarities, filterAtkMin, filterAtkMax, filterHpMin, filterHpMax]);

    const totalCount = useMemo(() => Object.keys(cards).length, [cards]);

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <input className={styles.searchInput} placeholder="Search cards..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className={styles.cardCountLabel}>
                    {entries.length} of {totalCount} card{totalCount === 1 ? "" : "s"}
                </div>
                <div className={styles.sortRow}>
                    <select className={styles.sortSelect} value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                        <option value="cost">Cost</option>
                        <option value="name">Title</option>
                        <option value="rarity">Rarity</option>
                        <option value="type">Type</option>
                        <option value="tribe">Tribe</option>
                    </select>
                    <button type="button" className={styles.sortDirButton} onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} title={sortDir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}>
                        {sortDir === "asc" ? "↑" : "↓"}
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
                        <FilterListbox label="Type" options={TYPE_OPTIONS} selected={filterTypes} onChange={(next) => setFilterTypes(next as CardType[])} />
                        <FilterListbox label="Rarity" options={RARITY_OPTIONS} selected={filterRarities} onChange={(next) => setFilterRarities(next as CardRarity[])} />
                    </div>
                    <div className={styles.filterListboxRow}>
                        <FilterListbox label="Tribes" options={TRIBE_OPTIONS} selected={filterTribes} onChange={(next) => setFilterTribes(next as Tribe[])} />
                        <FilterListbox label="Keywords" options={KEYWORD_OPTIONS} selected={filterKeywords} onChange={(next) => setFilterKeywords(next as Keyword[])} />
                    </div>

                    <div className={styles.filterRangeRow}>
                        <span className={styles.filterRangeLabel}>Atk</span>
                        <input className={styles.numberInput} type="number" placeholder="Min" value={filterAtkMin} onChange={(e) => setFilterAtkMin(e.target.value)} />
                        <input className={styles.numberInput} type="number" placeholder="Max" value={filterAtkMax} onChange={(e) => setFilterAtkMax(e.target.value)} />
                    </div>
                    <div className={styles.filterRangeRow}>
                        <span className={styles.filterRangeLabel}>Hp</span>
                        <input className={styles.numberInput} type="number" placeholder="Min" value={filterHpMin} onChange={(e) => setFilterHpMin(e.target.value)} />
                        <input className={styles.numberInput} type="number" placeholder="Max" value={filterHpMax} onChange={(e) => setFilterHpMax(e.target.value)} />
                    </div>
                </div>

                <button type="button" className={styles.newButton} onClick={onNew}>
                    + New Card
                </button>
            </div>
            <div className={styles.cardList}>
                {entries.map((card) => (
                    <button key={card.id} type="button" className={`${styles.cardListItem} ${card.id === selectedId ? styles.cardListItemActive : ""}`} onClick={() => onSelect(card.id)}>
                        <span>
                            <span style={{ color: rarityColor(card) }}>{card.name}</span>
                            {dirtyIds.has(card.id) && <span className={styles.cardListItemDirty}>●</span>}
                        </span>
                        <span className={styles.cardListItemRight}>
                            <span className={styles.cardListItemTypeBadge} title={card.type === "minion" ? "Minion" : card.type === "spell" ? "Spell" : card.type === "aether" ? "Aether" : "Token"}>
                                {card.type === "minion" ? "M" : card.type === "spell" ? "S" : card.type === "aether" ? "A" : "T"}
                            </span>
                            <span className={styles.cardListItemCost}>
                                {card.type === "aether"
                                    ? (card.aetherCategory ?? "generic")[0].toUpperCase()
                                    : (card.cost?.generic ?? 0)}
                            </span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

