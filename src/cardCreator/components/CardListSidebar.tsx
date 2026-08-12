import { useMemo, useState } from "react";

import { RARITY_METADATA, TOKEN_RARITY_COLOR } from "@/game/data/rarityMetadata";
import type { CardDefinition, CardRarity } from "@/game/types/Card";
import styles from "@/styles/CardCreator.module.css";

type SortField = "name" | "cost" | "rarity" | "type";
type SortDir = "asc" | "desc";

// Ascending power order, matching Card.ts's CardRarity doc comment.
const RARITY_ORDER: CardRarity[] = ["common", "rare", "exotic", "legendary", "mythical"];

// Tokens rank below common regardless of sort direction — they aren't a power tier, so
// there's no "descending" position that makes sense for them either.
function rarityRank(card: CardDefinition): number {
    return card.type === "token" || !card.rarity ? -1 : RARITY_ORDER.indexOf(card.rarity);
}

// Same light color CardView's footer rarity dot uses (rarityMetadata.ts), as a CSS hex string.
function rarityColor(card: CardDefinition): string {
    const { light } = card.type === "token" || !card.rarity ? TOKEN_RARITY_COLOR : RARITY_METADATA[card.rarity];
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

    const entries = useMemo(() => {
        const query = search.trim().toLowerCase();
        const dir = sortDir === "asc" ? 1 : -1;

        return Object.values(cards)
            .filter((card) => !query || card.name.toLowerCase().includes(query) || card.id.toLowerCase().includes(query))
            .sort((a, b) => {
                // Name is always the tiebreaker so cost/rarity ties don't jump around as you edit.
                switch (sortField) {
                    case "rarity":
                        return (rarityRank(a) - rarityRank(b)) * dir || a.name.localeCompare(b.name);
                    case "type":
                        return a.type.localeCompare(b.type) * dir || a.name.localeCompare(b.name);
                    case "name":
                        return a.name.localeCompare(b.name) * dir;
                    case "cost":
                    default:
                        return (a.cost - b.cost) * dir || a.name.localeCompare(b.name);
                }
            });
    }, [cards, search, sortField, sortDir]);

    return (
        <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>
                <input className={styles.searchInput} placeholder="Search cards..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className={styles.sortRow}>
                    <select className={styles.sortSelect} value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}>
                        <option value="cost">Cost</option>
                        <option value="name">Title</option>
                        <option value="rarity">Rarity</option>
                        <option value="type">Type</option>
                    </select>
                    <button type="button" className={styles.sortDirButton} onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))} title={sortDir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}>
                        {sortDir === "asc" ? "↑" : "↓"}
                    </button>
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
                            <span className={styles.cardListItemTypeBadge} title={card.type === "minion" ? "Minion" : card.type === "spell" ? "Spell" : "Token"}>
                                {card.type === "minion" ? "M" : card.type === "spell" ? "S" : "T"}
                            </span>
                            <span className={styles.cardListItemCost}>{card.cost}</span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

