import type { CardDefinition, CardEffect, EffectAction, EffectTrigger } from '@/game/types/Card';
import { TRIGGER_METADATA } from '@/game/data/triggerMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';
import { ACTION_KINDS, ActionFieldsEditor, defaultActionFor } from './ActionFieldsEditor';

const TRIGGERS = Object.keys(TRIGGER_METADATA) as EffectTrigger[];

interface EffectsEditorProps {
    effects: CardEffect[];
    onChange: (effects: CardEffect[]) => void;
    errors: FieldErrors;
    allCards: Record<string, CardDefinition>;
}

export function EffectsEditor({ effects, onChange, errors, allCards }: EffectsEditorProps) {
    function updateEffect(index: number, next: CardEffect) {
        onChange(effects.map((effect, i) => (i === index ? next : effect)));
    }

    function removeEffect(index: number) {
        onChange(effects.filter((_, i) => i !== index));
    }

    function moveEffect(index: number, delta: number) {
        const target = index + delta;
        if (target < 0 || target >= effects.length) return;
        const next = effects.slice();
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    }

    function addEffect() {
        onChange([...effects, { trigger: 'onPlay', action: defaultActionFor('damage') }]);
    }

    return (
        <div>
            {effects.map((effect, index) => {
                const prefix = `effects.${index}`;

                return (
                    <div key={index} className={styles.effectRow}>
                        <div className={styles.effectRowHeader}>
                            <select
                                className={styles.selectInput}
                                style={{ width: 'auto' }}
                                value={effect.trigger}
                                onChange={(e) => updateEffect(index, { ...effect, trigger: e.target.value as EffectTrigger })}
                            >
                                {TRIGGERS.map((trigger) => (
                                    <option key={trigger} value={trigger}>
                                        {TRIGGER_METADATA[trigger].label} ({trigger})
                                    </option>
                                ))}
                            </select>
                            <select
                                className={styles.selectInput}
                                style={{ width: 'auto' }}
                                value={effect.action.kind}
                                onChange={(e) =>
                                    updateEffect(index, { ...effect, action: defaultActionFor(e.target.value as EffectAction['kind']) })
                                }
                            >
                                {ACTION_KINDS.map((kind) => (
                                    <option key={kind} value={kind}>
                                        {kind}
                                    </option>
                                ))}
                            </select>
                            <label className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <input
                                    type="checkbox"
                                    checked={effect.condition?.type === 'momentum'}
                                    onChange={(e) =>
                                        updateEffect(index, {
                                            ...effect,
                                            condition: e.target.checked ? { type: 'momentum', minCount: 1 } : undefined,
                                        })
                                    }
                                />
                                Momentum
                            </label>
                            {effect.condition?.type === 'momentum' && (
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className={styles.numberInput}
                                    style={{ width: '4rem' }}
                                    value={effect.condition.minCount}
                                    onChange={(e) =>
                                        updateEffect(index, {
                                            ...effect,
                                            condition: { type: 'momentum', minCount: Math.max(1, Number(e.target.value)) },
                                        })
                                    }
                                />
                            )}
                            {errors[`${prefix}.condition`] && <span className={styles.fieldError}>{errors[`${prefix}.condition`]}</span>}
                            <div className={styles.effectRowButtons}>
                                <button type="button" className={styles.smallButton} disabled={index === 0} onClick={() => moveEffect(index, -1)}>
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    className={styles.smallButton}
                                    disabled={index === effects.length - 1}
                                    onClick={() => moveEffect(index, 1)}
                                >
                                    ↓
                                </button>
                                <button type="button" className={styles.smallButton} onClick={() => removeEffect(index)}>
                                    Remove
                                </button>
                            </div>
                        </div>

                        <ActionFieldsEditor
                            action={effect.action}
                            onChange={(action) => updateEffect(index, { ...effect, action })}
                            errors={errors}
                            prefix={prefix}
                            allCards={allCards}
                        />
                    </div>
                );
            })}

            <button type="button" className={styles.addEffectButton} onClick={addEffect}>
                + Add effect
            </button>
        </div>
    );
}
