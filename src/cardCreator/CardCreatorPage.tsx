import { useMemo, useState } from 'react';

import { CARD_DEFINITIONS } from '@/game/data/cards';
import type { CardDefinition } from '@/game/types/Card';
import { CardForm } from './components/CardForm';
import { CardListSidebar } from './components/CardListSidebar';
import { PreviewPane, type PreviewMode } from './components/PreviewPane';
import { makeBlankCard } from './defaultCardDefinition';
import { serializeCardDefinitions } from './serializeCardDefinitions';
import { useSaveCards } from './useSaveCards';
import { validateCardDefinition } from './validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';

// Loaded once from the module cards.ts already bundles into the client build (it's
// imported by Preloader.ts/CardGame/deckGenerator.ts today too) — deep-copied so
// in-tool edits never mutate the imported module's own object. The API route (see
// useSaveCards.ts) is a write-only target, the authoritative in-memory source is this
// state, not a re-read of the file.
function loadInitialCards(): Record<string, CardDefinition> {
    return JSON.parse(JSON.stringify(CARD_DEFINITIONS));
}

export default function CardCreatorPage() {
    const [cards, setCards] = useState<Record<string, CardDefinition>>(loadInitialCards);
    const [savedCards, setSavedCards] = useState<Record<string, CardDefinition>>(loadInitialCards);
    const [selectedId, setSelectedId] = useState<string | null>(() => Object.keys(cards)[0] ?? null);
    const [mode, setMode] = useState<PreviewMode>('full');
    const { save, saving, error } = useSaveCards();

    const draft = (selectedId ? cards[selectedId] : null) ?? makeBlankCard(new Set());
    const originalId = selectedId;

    const errors = useMemo(() => validateCardDefinition(draft, cards, originalId), [draft, cards, originalId]);

    const dirtyIds = useMemo(() => {
        const dirty = new Set<string>();
        for (const id of Object.keys(cards)) {
            if (JSON.stringify(cards[id]) !== JSON.stringify(savedCards[id])) dirty.add(id);
        }
        for (const id of Object.keys(savedCards)) {
            if (!(id in cards)) dirty.add(id);
        }
        return dirty;
    }, [cards, savedCards]);
    const hasUnsavedChanges = dirtyIds.size > 0;

    function updateDraft(next: CardDefinition) {
        if (!selectedId) return;

        // Renaming a card's id (its object key) means the entry has to move to the
        // new key — replace rather than mutate in place.
        if (next.id !== selectedId) {
            setCards((prev) => {
                const { [selectedId]: _removed, ...rest } = prev;
                return { ...rest, [next.id]: next };
            });
            setSelectedId(next.id);
        } else {
            setCards((prev) => ({ ...prev, [selectedId]: next }));
        }
    }

    function handleNew() {
        const blank = makeBlankCard(new Set(Object.keys(cards)));
        setCards((prev) => ({ ...prev, [blank.id]: blank }));
        setSelectedId(blank.id);
    }

    function handleDelete() {
        if (!selectedId) return;
        if (!window.confirm(`Delete "${draft.name}" (${selectedId})? This cannot be undone.`)) return;

        setCards((prev) => {
            const { [selectedId]: _removed, ...rest } = prev;
            return rest;
        });
        setSelectedId(Object.keys(cards).find((id) => id !== selectedId) ?? null);
    }

    async function handleSave() {
        // Belt-and-suspenders re-check — the Save button is already disabled while
        // any card in `cards` fails validation, but no tsc runs in-browser, so this
        // is the only structural check that ever exists before a write.
        const allErrors = Object.keys(cards).flatMap((id) => Object.keys(validateCardDefinition(cards[id], cards, id)));
        if (allErrors.length > 0) return;

        const source = serializeCardDefinitions(cards);
        try {
            await save(source);
            setSavedCards(JSON.parse(JSON.stringify(cards)));
        } catch {
            // Already surfaced via useSaveCards' `error` state — nothing further to do here.
        }
    }

    const allCardsValid = useMemo(
        () => Object.keys(cards).every((id) => Object.keys(validateCardDefinition(cards[id], cards, id)).length === 0),
        [cards],
    );

    return (
        <div className={styles.page}>
            <CardListSidebar cards={cards} selectedId={selectedId} dirtyIds={dirtyIds} onSelect={setSelectedId} onNew={handleNew} />

            <PreviewPane definition={draft} mode={mode} onModeChange={setMode}>
                <div className={styles.fileBar}>
                    <button type="button" className={styles.saveButton} onClick={handleSave} disabled={!allCardsValid || saving}>
                        {saving ? 'Saving...' : hasUnsavedChanges ? 'Save changes' : 'Saved'}
                    </button>
                    {error && <span className={styles.fieldError}>{error}</span>}
                    <button type="button" className={styles.deleteButton} onClick={handleDelete} disabled={!selectedId}>
                        Delete card
                    </button>
                    <a className={styles.navLink} href="/deckbuilder">Deck Builder →</a>
                </div>
            </PreviewPane>

            <CardForm draft={draft} onChange={updateDraft} errors={errors} allCards={cards} />
        </div>
    );
}
