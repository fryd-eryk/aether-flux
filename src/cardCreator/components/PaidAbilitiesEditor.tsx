import type { CardDefinition, EffectAction, PaidAbility } from '@/game/types/Card';
import type { FieldErrors } from '../validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';
import { ACTION_KINDS, ActionFieldsEditor, defaultActionFor } from './ActionFieldsEditor';

interface PaidAbilitiesEditorProps {
    abilities: PaidAbility[];
    onChange: (abilities: PaidAbility[]) => void;
    errors: FieldErrors;
    allCards: Record<string, CardDefinition>;
}

/**
 * Editor for a minion/token's activated abilities (see PaidAbility, Card.ts — the `(<cost>):`
 * text-prefix convention documented in SPEC.md). Same per-row shape as EffectsEditor, minus the
 * trigger select/Momentum condition — a paid ability isn't trigger-driven, just a mana cost plus
 * one EffectAction, so it shares ActionFieldsEditor's kind-specific fields directly.
 */
export function PaidAbilitiesEditor({ abilities, onChange, errors, allCards }: PaidAbilitiesEditorProps) {
    function updateAbility(index: number, next: PaidAbility) {
        onChange(abilities.map((ability, i) => (i === index ? next : ability)));
    }

    function removeAbility(index: number) {
        onChange(abilities.filter((_, i) => i !== index));
    }

    function moveAbility(index: number, delta: number) {
        const target = index + delta;
        if (target < 0 || target >= abilities.length) return;
        const next = abilities.slice();
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    }

    function addAbility() {
        onChange([...abilities, { cost: 1, action: defaultActionFor('damage') }]);
    }

    return (
        <div>
            {abilities.map((ability, index) => {
                const prefix = `paidAbilities.${index}`;

                return (
                    <div key={index} className={styles.effectRow}>
                        <div className={styles.effectRowHeader}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Cost</label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className={styles.numberInput}
                                    style={{ width: '4rem' }}
                                    value={ability.cost}
                                    onChange={(e) => updateAbility(index, { ...ability, cost: Number(e.target.value) })}
                                />
                                {errors[`${prefix}.cost`] && <span className={styles.fieldError}>{errors[`${prefix}.cost`]}</span>}
                            </div>
                            <select
                                className={styles.selectInput}
                                style={{ width: 'auto' }}
                                value={ability.action.kind}
                                onChange={(e) =>
                                    updateAbility(index, { ...ability, action: defaultActionFor(e.target.value as EffectAction['kind']) })
                                }
                            >
                                {ACTION_KINDS.map((kind) => (
                                    <option key={kind} value={kind}>
                                        {kind}
                                    </option>
                                ))}
                            </select>
                            <div className={styles.effectRowButtons}>
                                <button type="button" className={styles.smallButton} disabled={index === 0} onClick={() => moveAbility(index, -1)}>
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className={styles.smallButton}
                                    disabled={index === abilities.length - 1}
                                    onClick={() => moveAbility(index, 1)}
                                >
                                    ↓
                                </button>
                                <button type="button" className={styles.smallButton} onClick={() => removeAbility(index)}>
                                    Remove
                                </button>
                            </div>
                        </div>

                        <ActionFieldsEditor
                            action={ability.action}
                            onChange={(action) => updateAbility(index, { ...ability, action })}
                            errors={errors}
                            prefix={prefix}
                            allCards={allCards}
                        />
                    </div>
                );
            })}

            <button type="button" className={styles.addEffectButton} onClick={addAbility}>
                + Add paid ability
            </button>
        </div>
    );
}
