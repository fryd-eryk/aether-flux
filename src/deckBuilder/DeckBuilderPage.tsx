import { useMemo, useState } from 'react';

import { PreviewPane, type PreviewMode } from '@/cardCreator/components/PreviewPane';
import { makeBlankCard } from '@/cardCreator/defaultCardDefinition';
import { deleteDeck, loadDecks, MAIN_DECK_SIZE, saveDeck } from '@/game/state/deckStorage';
import type { CardDefinition } from '@/game/types/Card';
import type { SavedDeck } from '@/game/types/Deck';
import styles from '@/styles/DeckBuilder.module.css';

import { AetherPoolPanel } from './components/AetherPoolPanel';
import { DeckCardPoolSidebar } from './components/DeckCardPoolSidebar';
import { DeckContentsPanel } from './components/DeckContentsPanel';
import { cloneDeckForEditing, makeBlankDeck } from './defaultDeck';

function countsOf(ids: string[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    return counts;
}

export default function DeckBuilderPage() {
    const [allDecks, setAllDecks] = useState<SavedDeck[]>(() => loadDecks());
    const [editingDeck, setEditingDeck] = useState<SavedDeck>(() => {
        const existing = loadDecks();
        return existing.length > 0 ? cloneDeckForEditing(existing[0]) : makeBlankDeck();
    });
    const [previewDefinition, setPreviewDefinition] = useState<CardDefinition>(() => makeBlankCard(new Set()));
    const [mode, setMode] = useState<PreviewMode>('full');

    const mainCounts = useMemo(() => countsOf(editingDeck.mainDeckIds), [editingDeck.mainDeckIds]);
    const aetherCounts = useMemo(() => countsOf(editingDeck.aetherDeckIds), [editingDeck.aetherDeckIds]);
    const isSavedDeck = allDecks.some((d) => d.id === editingDeck.id);

    function handleSelectDeck(id: string) {
        const deck = allDecks.find((d) => d.id === id);
        if (deck) setEditingDeck(cloneDeckForEditing(deck));
    }

    function handleNewDeck() {
        setEditingDeck(makeBlankDeck());
    }

    function handleDuplicate() {
        const now = Date.now();
        setEditingDeck({
            ...cloneDeckForEditing(editingDeck),
            id: crypto.randomUUID(),
            name: editingDeck.name.trim() ? `${editingDeck.name} (copy)` : '',
            createdAt: now,
            updatedAt: now,
        });
    }

    function handleSave() {
        const toSave: SavedDeck = { ...editingDeck, updatedAt: Date.now() };
        saveDeck(toSave);
        setAllDecks(loadDecks());
        setEditingDeck(toSave);
    }

    function handleDelete() {
        if (!isSavedDeck) return;
        if (!window.confirm(`Delete "${editingDeck.name.trim() || 'Untitled Deck'}"? This cannot be undone.`)) return;

        deleteDeck(editingDeck.id);
        const remaining = loadDecks();
        setAllDecks(remaining);
        setEditingDeck(remaining.length > 0 ? cloneDeckForEditing(remaining[0]) : makeBlankDeck());
    }

    function handleRename(name: string) {
        setEditingDeck((prev) => ({ ...prev, name }));
    }

    function handleAddMain(id: string) {
        setEditingDeck((prev) => ({ ...prev, mainDeckIds: [...prev.mainDeckIds, id] }));
    }

    function handleRemoveMain(id: string) {
        setEditingDeck((prev) => {
            const index = prev.mainDeckIds.indexOf(id);
            if (index === -1) return prev;
            const next = [...prev.mainDeckIds];
            next.splice(index, 1);
            return { ...prev, mainDeckIds: next };
        });
    }

    function handleAddAether(id: string) {
        setEditingDeck((prev) => ({ ...prev, aetherDeckIds: [...prev.aetherDeckIds, id] }));
    }

    function handleRemoveAether(id: string) {
        setEditingDeck((prev) => {
            const index = prev.aetherDeckIds.indexOf(id);
            if (index === -1) return prev;
            const next = [...prev.aetherDeckIds];
            next.splice(index, 1);
            return { ...prev, aetherDeckIds: next };
        });
    }

    return (
        <div className={styles.page}>
            <DeckCardPoolSidebar counts={mainCounts} totalCount={editingDeck.mainDeckIds.length} onAdd={handleAddMain} onHover={setPreviewDefinition} />

            <div className={styles.centerColumn}>
                <div className={styles.deckSelectorBlock}>
                    <div className={styles.deckSelectorList}>
                        {allDecks.map((deck) => (
                            <button
                                key={deck.id}
                                type="button"
                                className={`${styles.deckSelectorItem} ${deck.id === editingDeck.id ? styles.deckSelectorItemActive : ''}`}
                                onClick={() => handleSelectDeck(deck.id)}
                            >
                                {deck.name.trim() || 'Untitled Deck'}
                            </button>
                        ))}
                        <button type="button" className={styles.newDeckButton} onClick={handleNewDeck}>
                            + New Deck
                        </button>
                    </div>
                    <input
                        className={styles.nameInput}
                        placeholder="Deck name"
                        value={editingDeck.name}
                        onChange={(e) => handleRename(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <PreviewPane definition={previewDefinition} mode={mode} onModeChange={setMode} />
                    <DeckContentsPanel title="Main Deck" ids={editingDeck.mainDeckIds} target={MAIN_DECK_SIZE} onRemove={handleRemoveMain} />
                </div>

                <div className={styles.actionBar}>
                    <button type="button" className={styles.saveButton} onClick={handleSave}>
                        Save
                    </button>
                    <button type="button" className={styles.actionButton} onClick={handleDuplicate}>
                        Duplicate
                    </button>
                    <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={!isSavedDeck}>
                        Delete
                    </button>
                    <a className={styles.navLink} href="/card-creator">Card Creator →</a>
                </div>
            </div>

            <AetherPoolPanel
                counts={aetherCounts}
                totalCount={editingDeck.aetherDeckIds.length}
                onAdd={handleAddAether}
                onRemove={handleRemoveAether}
                onHover={setPreviewDefinition}
            />
        </div>
    );
}
