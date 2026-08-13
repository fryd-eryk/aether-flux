import { useLayoutEffect, useRef } from 'react';
import type { CardDefinition, CardRarity, CardType, Keyword, Tribe } from '@/game/types/Card';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import { TRIBE_METADATA } from '@/game/data/tribeMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import { toggleMarkdownStyle, type MarkdownStyle } from '../markdownTextEditing';
import { EffectsEditor } from './EffectsEditor';
import styles from '@/styles/CardCreator.module.css';

const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
const TRIBES = Object.keys(TRIBE_METADATA) as Tribe[];
const RARITIES: CardRarity[] = ['common', 'rare', 'exotic', 'legendary', 'mythical'];

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
        if (type === 'minion' || type === 'token') {
            const next = { ...draft, type, attack: draft.attack ?? 1, health: draft.health ?? 1 };
            if (type === 'token') {
                // Tokens aren't collectible — type is now what excludes them from generated
                // decks (deckGenerator.ts), so rarity is meaningless for them.
                const { rarity: _rarity, ...rest } = next;
                onChange(rest);
            } else {
                onChange(next);
            }
        } else {
            const { attack: _attack, health: _health, tribes: _tribes, ...rest } = draft;
            onChange({ ...rest, type });
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
            onChange({ ...draft, artVerticalAlign: value as 'top' | 'bottom' });
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
                        <input className={styles.textInput} value={draft.id} onChange={(e) => set('id', e.target.value)} />
                        {errors.id && <span className={styles.fieldError}>{errors.id}</span>}
                    </div>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Name</label>
                        <input className={styles.textInput} value={draft.name} onChange={(e) => set('name', e.target.value)} />
                        {errors.name && <span className={styles.fieldError}>{errors.name}</span>}
                    </div>
                </div>
                <div className={styles.fieldRow}>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Cost</label>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            className={styles.numberInput}
                            value={draft.cost}
                            onChange={(e) => set('cost', Number(e.target.value))}
                        />
                        {errors.cost && <span className={styles.fieldError}>{errors.cost}</span>}
                    </div>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Type</label>
                        <select className={styles.selectInput} value={draft.type} onChange={(e) => setType(e.target.value as CardType)}>
                            <option value="minion">Minion</option>
                            <option value="spell">Spell</option>
                            <option value="token">Token</option>
                        </select>
                    </div>
                    {draft.type === 'token' ? (
                        <div className={styles.field}>
                            <label className={styles.fieldLabel}>Rarity</label>
                            <span className={styles.fieldHint}>Tokens aren&rsquo;t collectible — no rarity.</span>
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
                            <option value="">Center</option>
                            <option value="top">Top</option>
                            <option value="bottom">Bottom</option>
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
                                B
                            </button>
                            <button type="button" className={styles.smallButton} style={{ fontStyle: 'italic' }} onClick={() => applyMarkdownStyle('italic')}>
                                I
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
                            {'{X}'} Health to your hero.&rdquo; It resolves live in a real match; the preview here shows it literally,
                            since there&rsquo;s no board/HP to compute against outside a match. Use the B / I buttons (or Ctrl+B /
                            Ctrl+I) to wrap the current selection in <code>**bold**</code> or <code>*italic*</code>.
                        </p>
                        {errors.text && <span className={styles.fieldError}>{errors.text}</span>}
                    </div>
                </div>
            </section>

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

            <section className={styles.formSection}>
                <h3 className={styles.formSectionTitle}>Effects</h3>
                <EffectsEditor
                    effects={draft.effects ?? []}
                    onChange={(effects) => onChange({ ...draft, effects: effects.length > 0 ? effects : undefined })}
                    errors={errors}
                    allCards={allCards}
                />
            </section>
        </div>
    );
}
