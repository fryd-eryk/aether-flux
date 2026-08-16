import type { AuraTarget, CardAura, Keyword } from '@/game/types/Card';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';
import { EffectValueInput, TribeFilterField } from './ActionFieldsEditor';

const AURA_TARGETS: AuraTarget[] = ['allFriendlyMinions', 'allEnemyMinions', 'allMinions'];
const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];

function defaultAura(): CardAura {
    return { target: 'allFriendlyMinions', attack: 1, health: 1 };
}

interface AuraEditorProps {
    auras: CardAura[];
    onChange: (auras: CardAura[]) => void;
    errors: FieldErrors;
}

/** List editor for a minion/token's continuously-active Aura entries (see CardAura in Card.ts) —
 * flatter than EffectsEditor since a CardAura has no trigger/condition/nested actions list, just
 * a target selector, an optional tribe filter, attack/health (each a plain number or a live
 * counter, reusing EffectValueInput exactly as the `buff` action's fields do), and a set of
 * keywords to grant (checkbox group, mirroring CardForm's own printed-keywords section). */
export function AuraEditor({ auras, onChange, errors }: AuraEditorProps) {
    function updateAura(index: number, next: CardAura) {
        onChange(auras.map((aura, i) => (i === index ? next : aura)));
    }

    function removeAura(index: number) {
        onChange(auras.filter((_, i) => i !== index));
    }

    function moveAura(index: number, delta: number) {
        const target = index + delta;
        if (target < 0 || target >= auras.length) return;
        const next = auras.slice();
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    }

    function addAura() {
        onChange([...auras, defaultAura()]);
    }

    function toggleKeyword(index: number, keyword: Keyword, checked: boolean) {
        const aura = auras[index];
        const keywords = checked
            ? [...(aura.keywords ?? []), keyword]
            : (aura.keywords ?? []).filter((k) => k !== keyword);
        updateAura(index, { ...aura, keywords: keywords.length > 0 ? keywords : undefined });
    }

    return (
        <div>
            {auras.map((aura, index) => {
                const prefix = `auras.${index}`;
                return (
                    <div key={index} className={styles.effectRow}>
                        <div className={styles.effectRowHeader}>
                            <select
                                className={styles.selectInput}
                                style={{ width: 'auto' }}
                                value={aura.target}
                                onChange={(e) => updateAura(index, { ...aura, target: e.target.value as AuraTarget })}
                            >
                                {AURA_TARGETS.map((target) => (
                                    <option key={target} value={target}>
                                        {target}
                                    </option>
                                ))}
                            </select>
                            <div className={styles.effectRowButtons}>
                                <button type="button" className={styles.smallButton} disabled={index === 0} onClick={() => moveAura(index, -1)}>
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className={styles.smallButton}
                                    disabled={index === auras.length - 1}
                                    onClick={() => moveAura(index, 1)}
                                >
                                    ↓
                                </button>
                                <button type="button" className={styles.smallButton} onClick={() => removeAura(index)}>
                                    Remove
                                </button>
                            </div>
                        </div>
                        <div className={styles.fieldRow}>
                            <TribeFilterField
                                value={aura.tribeFilter}
                                error={errors[`${prefix}.tribeFilter`]}
                                onChange={(tribeFilter) => updateAura(index, { ...aura, tribeFilter })}
                            />
                            <EffectValueInput
                                label="Attack"
                                value={aura.attack}
                                allowUnset
                                error={errors[`${prefix}.attack`]}
                                onChange={(value) => updateAura(index, { ...aura, attack: value })}
                            />
                            <EffectValueInput
                                label="Health"
                                value={aura.health}
                                allowUnset
                                error={errors[`${prefix}.health`]}
                                onChange={(value) => updateAura(index, { ...aura, health: value })}
                            />
                        </div>
                        <div className={styles.checkboxGroup}>
                            {KEYWORDS.map((keyword) => (
                                <label key={keyword} className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={(aura.keywords ?? []).includes(keyword)}
                                        onChange={(e) => toggleKeyword(index, keyword, e.target.checked)}
                                    />
                                    {KEYWORD_METADATA[keyword].label}
                                </label>
                            ))}
                        </div>
                    </div>
                );
            })}

            <button type="button" className={styles.addEffectButton} onClick={addAura}>
                + Add aura
            </button>
        </div>
    );
}
