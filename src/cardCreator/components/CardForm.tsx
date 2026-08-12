import type { CardDefinition, CardRarity, CardType, Keyword } from '@/game/types/Card';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import { EffectsEditor } from './EffectsEditor';
import styles from '@/styles/CardCreator.module.css';

const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
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

    function setType(type: CardType) {
        if (type === 'minion') {
            onChange({ ...draft, type, attack: draft.attack ?? 1, health: draft.health ?? 1 });
        } else {
            const { attack: _attack, health: _health, ...rest } = draft;
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
                        </select>
                    </div>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Rarity</label>
                        <select className={styles.selectInput} value={draft.rarity ?? ''} onChange={(e) => setRarity(e.target.value)}>
                            <option value="">— none (token) —</option>
                            {RARITIES.map((rarity) => (
                                <option key={rarity} value={rarity}>
                                    {rarity}
                                </option>
                            ))}
                        </select>
                    </div>
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
                {draft.type === 'minion' && (
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
                        <textarea className={styles.textArea} value={draft.text} onChange={(e) => set('text', e.target.value)} />
                        <p className={styles.fieldHint}>
                            Tip: write <code>{'{X}'}</code> where a counter-based effect value should appear — e.g. &ldquo;Restore{' '}
                            {'{X}'} Health to your hero.&rdquo; It resolves live in a real match; the preview here shows it literally,
                            since there&rsquo;s no board/HP to compute against outside a match.
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
