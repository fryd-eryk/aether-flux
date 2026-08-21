import { useLayoutEffect, useRef } from 'react';
import type { AetherCategory, CardDefinition, CardRarity, CardType, ElementalCategory, Keyword, Tribe } from '@/game/types/Card';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import { TRIBE_METADATA } from '@/game/data/tribeMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import { toggleMarkdownStyle, type MarkdownStyle } from '../markdownTextEditing';
import { AuraEditor } from './AuraEditor';
import { EffectsEditor } from './EffectsEditor';
import { PaidAbilitiesEditor } from './PaidAbilitiesEditor';
import styles from '@/styles/CardCreator.module.css';

const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
const TRIBES = Object.keys(TRIBE_METADATA) as Tribe[];
const RARITIES: CardRarity[] = ['common', 'rare', 'exotic', 'legendary', 'mythical'];
const AETHER_CATEGORIES: AetherCategory[] = ['generic', 'fire', 'water', 'earth', 'air'];
const ELEMENTAL_CATEGORIES: ElementalCategory[] = ['fire', 'water', 'earth', 'air'];

interface CardFormProps {
    draft: CardDefinition;
    onChange: (draft: CardDefinition) => void;
    errors: FieldErrors;
    allCards: Record<string, CardDefinition>;
}

export function CardForm({ draft, onChange, errors, allCards }: CardFormProps) {
    function set<K extends keyof CardDefinition>(key: K, value: CardDefinition[K]) {
        onChange({ ...draft, [key]: value });
    }

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null);

    // Restores the selection after a programmatic markdown-wrap edit — must happen after React
    // commits the new textarea value, since setSelectionRange in the same synchronous handler
    // that changes `.value` doesn't reliably survive the re-render.
    useLayoutEffect(() => {
        if (pendingSelectionRef.current && textareaRef.current) {
            const { start, end } = pendingSelectionRef.current;
            textareaRef.current.setSelectionRange(start, end);
            pendingSelectionRef.current = null;
        }
    });

    function applyMarkdownStyle(style: MarkdownStyle) {
        const el = textareaRef.current;
        if (!el) return;
        const { value, start, end } = toggleMarkdownStyle(draft.text, el.selectionStart, el.selectionEnd, style);
        pendingSelectionRef.current = { start, end };
        set('text', value);
        el.focus();
    }

    function setType(type: CardType) {
        if (type === 'aether') {
            // Aether cards have no cost of their own, no rarity (deckGenerator.ts excludes them
            // the same way it excludes tokens), and — this pass — no mechanics (effects/auras/
            // paidAbilities/keywords/tribes/attack/health), just a category. See SPEC.md's
            // "Resource system roadmap: Aether".
            const { attack: _attack, health: _health, tribes: _tribes, paidAbilities: _paidAbilities, keywords: _keywords, effects: _effects, auras: _auras, rarity: _rarity, cost: _cost, ...rest } = draft;
            onChange({ ...rest, type, aetherCategory: draft.aetherCategory ?? 'generic' });
            return;
        }

        // Leaving 'aether' (or arriving from it) needs a cost re-added — every other type has
        // one, and aetherCategory dropped, since it's Aether-only.
        const { aetherCategory: _aetherCategory, ...withoutAetherCategory } = draft;
        const withCost = { ...withoutAetherCategory, cost: withoutAetherCategory.cost ?? { generic: 1 } };

        if (type === 'minion' || type === 'token') {
            const next = { ...withCost, type, attack: withCost.attack ?? 1, health: withCost.health ?? 1 };
            if (type === 'token') {
                // Tokens aren't collectible — type is now what excludes them from generated
                // decks (deckGenerator.ts), so rarity is meaningless for them.
                const { rarity: _rarity, ...rest } = next;
                onChange(rest);
            } else {
                onChange(next);
            }
        } else {
            const { attack: _attack, health: _health, tribes: _tribes, paidAbilities: _paidAbilities, keywords: _keywords, ...rest } = withCost;
            onChange({ ...rest, type });
        }
    }

    function setElementalCategory(value: string) {
        const generic = draft.cost?.generic ?? 0;
        if (value === '') {
            set('cost', { generic });
        } else {
            set('cost', { generic, elemental: { category: value as ElementalCategory, threshold: draft.cost?.elemental?.threshold ?? 1 } });
        }
    }

    function setRarity(value: string) {
        if (value === '') {
            const { rarity: _rarity, ...rest } = draft;
            onChange(rest);
        } else {
            onChange({ ...draft, rarity: value as CardRarity });
        }
    }

    function setArtVerticalAlign(value: string) {
        if (value === '') {
            const { artVerticalAlign: _artVerticalAlign, ...rest } = draft;
            onChange(rest);
        } else {
            onChange({ ...draft, artVerticalAlign: value as 'top' | 'bottom' | 'center' });
        }
    }

    function toggleKeyword(keyword: Keyword, enabled: boolean) {
        const current = new Set(draft.keywords ?? []);
        if (enabled) current.add(keyword);
        else current.delete(keyword);
        const next = [...current];
        if (next.length === 0) {
            const { keywords: _keywords, ...rest } = draft;
            onChange(rest);
        } else {
            onChange({ ...draft, keywords: next });
        }
    }

    function generateIdFromName() {
        const id = draft.name
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        set('id', id);
    }

    function toggleTribe(tribe: Tribe, enabled: boolean) {
        const current = new Set(draft.tribes ?? []);
        if (enabled) current.add(tribe);
        else current.delete(tribe);
        const next = [...current];
        if (next.length === 0) {
            const { tribes: _tribes, ...rest } = draft;
            onChange(rest);
        } else {
            onChange({ ...draft, tribes: next });
        }
    }

    return (
        <div className={styles.formPanel}>
            <section className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Identity</h3>
                <div className={styles.fieldRow}>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Id</label>
                        <div className={styles.fieldInputRow}>
                            <input className={styles.textInput} value={draft.id} onChange={(e) => set('id', e.target.value)} />
                            <button
                                type="button"
                                className={styles.smallButton}
                                title="Generate from name"
                                disabled={!draft.name.trim()}
                                onClick={generateIdFromName}
                            >
                                From name
                            </button>
                        </div>
                        {errors.id && <span className={styles.fieldError}>{errors.id}</span>}
                    </div>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Name</label>
                        <input className={styles.textInput} value={draft.name} onChange={(e) => set('name', e.target.value)} />
                        {errors.name && <span className={styles.fieldError}>{errors.name}</span>}
                    </div>
                </div>
                <div className={styles.fieldRow}>
                    {draft.type === 'aether' ? (
                        <div className={styles.field}>
                            <label className={styles.fieldLabel}>Category</label>
                            <select
                                className={styles.selectInput}
                                value={draft.aetherCategory ?? 'generic'}
                                onChange={(e) => set('aetherCategory', e.target.value as AetherCategory)}
                            >
                                {AETHER_CATEGORIES.map((category) => (
                                    <option key={category} value={category}>
                                        {category === 'generic' ? 'Generic (Aether)' : category[0].toUpperCase() + category.slice(1)}
                                    </option>
                                ))}
                            </select>
                            {errors.aetherCategory && <span className={styles.fieldError}>{errors.aetherCategory}</span>}
                        </div>
                    ) : (
                        <>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Cost</label>
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    className={styles.numberInput}
                                    value={draft.cost?.generic ?? 0}
                                    onChange={(e) => set('cost', { ...draft.cost, generic: Number(e.target.value) })}
                                />
                                {errors.cost && <span className={styles.fieldError}>{errors.cost}</span>}
                            </div>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Elemental threshold</label>
                                <select
                                    className={styles.selectInput}
                                    value={draft.cost?.elemental?.category ?? ''}
                                    onChange={(e) => setElementalCategory(e.target.value)}
                                >
                                    <option value="">— none —</option>
                                    {ELEMENTAL_CATEGORIES.map((category) => (
                                        <option key={category} value={category}>
                                            {category[0].toUpperCase() + category.slice(1)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {draft.cost?.elemental && (
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel}>Threshold amount</label>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className={styles.numberInput}
                                        value={draft.cost.elemental.threshold}
                                        onChange={(e) =>
                                            set('cost', {
                                                generic: draft.cost?.generic ?? 0,
                                                elemental: { category: draft.cost!.elemental!.category, threshold: Number(e.target.value) },
                                            })
                                        }
                                    />
                                    {errors.costElementalThreshold && <span className={styles.fieldError}>{errors.costElementalThreshold}</span>}
                                </div>
                            )}
                        </>
                    )}
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Type</label>
                        <select className={styles.selectInput} value={draft.type} onChange={(e) => setType(e.target.value as CardType)}>
                            <option value="minion">Minion</option>
                            <option value="spell">Spell</option>
                            <option value="token">Token</option>
                            <option value="aether">Aether</option>
                        </select>
                    </div>
                    {draft.type === 'token' || draft.type === 'aether' ? (
                        <div className={styles.field}>
                            <label className={styles.fieldLabel}>Rarity</label>
                            <span className={styles.fieldHint}>
                                {draft.type === 'token' ? "Tokens aren't collectible" : 'Aether cards aren’t collectible'} — no rarity.
                            </span>
                        </div>
                    ) : (
                        <div className={styles.field}>
                            <label className={styles.fieldLabel}>Rarity</label>
                            <select className={styles.selectInput} value={draft.rarity ?? ''} onChange={(e) => setRarity(e.target.value)}>
                                <option value="">— none —</option>
                                {RARITIES.map((rarity) => (
                                    <option key={rarity} value={rarity}>
                                        {rarity}
                                    </option>
                                ))}
                            </select>
                            {errors.rarity && <span className={styles.fieldError}>{errors.rarity}</span>}
                        </div>
                    )}
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Art vertical align</label>
                        <select
                            className={styles.selectInput}
                            value={draft.artVerticalAlign ?? ''}
                            onChange={(e) => setArtVerticalAlign(e.target.value)}
                        >
                            <option value="">Bottom (default)</option>
                            <option value="center">Center</option>
                            <option value="top">Top</option>
                        </select>
                    </div>
                </div>
                {(draft.type === 'minion' || draft.type === 'token') && (
                    <div className={styles.fieldRow}>
                        <div className={styles.field}>
                            <label className={styles.fieldLabel}>Attack</label>
                            <input
                                type="number"
                                min={0}
                                step={1}
                                className={styles.numberInput}
                                value={draft.attack ?? 0}
                                onChange={(e) => set('attack', Number(e.target.value))}
                            />
                            {errors.attack && <span className={styles.fieldError}>{errors.attack}</span>}
                        </div>
                        <div className={styles.field}>
                            <label className={styles.fieldLabel}>Health</label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                className={styles.numberInput}
                                value={draft.health ?? 1}
                                onChange={(e) => set('health', Number(e.target.value))}
                            />
                            {errors.health && <span className={styles.fieldError}>{errors.health}</span>}
                        </div>
                    </div>
                )}
                <div className={styles.fieldRow}>
                    <div className={styles.fieldWide}>
                        <label className={styles.fieldLabel}>Rule text</label>
                        <div className={styles.previewToolbar}>
                            <button type="button" className={styles.smallButton} style={{ fontWeight: 'bold' }} onClick={() => applyMarkdownStyle('bold')}>
                                Bold <code>(Ctrl+B)</code>
                            </button>
                            <button type="button" className={styles.smallButton} style={{ fontStyle: 'italic' }} onClick={() => applyMarkdownStyle('italic')}>
                                Italic <code>(Ctrl+I)</code>
                            </button>
                        </div>
                        <textarea
                            ref={textareaRef}
                            className={styles.textArea}
                            value={draft.text}
                            onChange={(e) => set('text', e.target.value)}
                            onKeyDown={(e) => {
                                const key = e.key.toLowerCase();
                                if ((e.ctrlKey || e.metaKey) && (key === 'b' || key === 'i')) {
                                    e.preventDefault();
                                    applyMarkdownStyle(key === 'b' ? 'bold' : 'italic');
                                }
                            }}
                        />
                        <p className={styles.fieldHint}>
                            Tip: write <code>{'{X}'}</code> where a counter-based effect value should appear — e.g. &ldquo;Restore{' '}
                            {'{X}'} Health to your hero.&rdquo;
                        </p>
                        {errors.text && <span className={styles.fieldError}>{errors.text}</span>}
                    </div>
                </div>
            </section>

            {draft.type !== 'spell' && draft.type !== 'aether' && (
                <section className={styles.formSection}>
                    <h3 className={styles.formSectionTitle}>Keywords</h3>
                    <div className={styles.checkboxGroup}>
                        {KEYWORDS.map((keyword) => (
                            <label key={keyword} className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={(draft.keywords ?? []).includes(keyword)}
                                    onChange={(e) => toggleKeyword(keyword, e.target.checked)}
                                />
                                {KEYWORD_METADATA[keyword].label}
                            </label>
                        ))}
                    </div>
                </section>
            )}

            {(draft.type === 'minion' || draft.type === 'token') && (
                <section className={styles.formSection}>
                    <h3 className={styles.formSectionTitle}>Tribes</h3>
                    <div className={styles.checkboxGroup}>
                        {TRIBES.map((tribe) => (
                            <label key={tribe} className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={(draft.tribes ?? []).includes(tribe)}
                                    onChange={(e) => toggleTribe(tribe, e.target.checked)}
                                />
                                {TRIBE_METADATA[tribe].label}
                            </label>
                        ))}
                    </div>
                </section>
            )}

            {draft.type !== 'aether' && (
                <section className={styles.formSection}>
                    <h3 className={styles.formSectionTitle}>Triggered Effects</h3>
                    <EffectsEditor
                        effects={draft.effects ?? []}
                        onChange={(effects) => onChange({ ...draft, effects: effects.length > 0 ? effects : undefined })}
                        errors={errors}
                        allCards={allCards}
                    />
                </section>
            )}

            {(draft.type === 'minion' || draft.type === 'token') && (
                <section className={styles.formSection}>
                    <h3 className={styles.formSectionTitle}>Aura</h3>
                    <AuraEditor
                        auras={draft.auras ?? []}
                        onChange={(auras) => onChange({ ...draft, auras: auras.length > 0 ? auras : undefined })}
                        errors={errors}
                    />
                </section>
            )}

            {(draft.type === 'minion' || draft.type === 'token') && (
                <section className={styles.formSection}>
                    <h3 className={styles.formSectionTitle}>Paid Abilities</h3>
                    <PaidAbilitiesEditor
                        abilities={draft.paidAbilities ?? []}
                        onChange={(paidAbilities) => onChange({ ...draft, paidAbilities: paidAbilities.length > 0 ? paidAbilities : undefined })}
                        errors={errors}
                        allCards={allCards}
                    />
                </section>
            )}
        </div>
    );
}
