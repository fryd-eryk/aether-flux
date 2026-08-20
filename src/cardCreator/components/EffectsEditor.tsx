import type { CardDefinition, CardEffect, EffectAction, EffectTrigger } from '@/game/types/Card';
import { TRIGGER_METADATA } from '@/game/data/triggerMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';
import { ACTION_KINDS, ActionFieldsEditor, CHOSEN_TARGETS, defaultActionFor } from './ActionFieldsEditor';

const TRIGGERS = Object.keys(TRIGGER_METADATA) as EffectTrigger[];

/** Per-index "is there an earlier real (non-reuseTarget) chosen action before this one" flag,
 * for gating the "Same target as previous effect" checkbox — mirrors
 * validateCardDefinition.ts's validateActions. */
function canReuseTargetByIndex(actions: EffectAction[]): boolean[] {
    let seenChosen = false;
    return actions.map((action) => {
        const canReuse = seenChosen;
        if ('target' in action && CHOSEN_TARGETS.includes(action.target) && !action.reuseTarget) seenChosen = true;
        return canReuse;
    });
}

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
        onChange([...effects, { trigger: 'onPlay', actions: [defaultActionFor('damage')] }]);
    }

    function updateAction(effectIndex: number, actionIndex: number, next: EffectAction) {
        const effect = effects[effectIndex];
        updateEffect(effectIndex, { ...effect, actions: effect.actions.map((a, i) => (i === actionIndex ? next : a)) });
    }

    function removeAction(effectIndex: number, actionIndex: number) {
        const effect = effects[effectIndex];
        updateEffect(effectIndex, { ...effect, actions: effect.actions.filter((_, i) => i !== actionIndex) });
    }

    function moveAction(effectIndex: number, actionIndex: number, delta: number) {
        const effect = effects[effectIndex];
        const target = actionIndex + delta;
        if (target < 0 || target >= effect.actions.length) return;
        const next = effect.actions.slice();
        [next[actionIndex], next[target]] = [next[target], next[actionIndex]];
        updateEffect(effectIndex, { ...effect, actions: next });
    }

    function addAction(effectIndex: number) {
        const effect = effects[effectIndex];
        updateEffect(effectIndex, { ...effect, actions: [...effect.actions, defaultActionFor('damage')] });
    }

    return (
        <div>
            {effects.map((effect, index) => {
                const prefix = `effects.${index}`;
                const canReuse = canReuseTargetByIndex(effect.actions);

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

                        {effect.actions.map((action, actionIndex) => {
                            const actionPrefix = `${prefix}.actions.${actionIndex}`;
                            return (
                                <div key={actionIndex} className={styles.actionRow}>
                                    <div className={styles.actionRowHeader}>
                                        <select
                                            className={styles.selectInput}
                                            style={{ width: 'auto' }}
                                            value={action.kind}
                                            onChange={(e) =>
                                                updateAction(index, actionIndex, defaultActionFor(e.target.value as EffectAction['kind']))
                                            }
                                        >
                                            {ACTION_KINDS.map((kind) => (
                                                <option key={kind} value={kind}>
                                                    {kind}
                                                </option>
                                            ))}
                                        </select>
                                        <div className={styles.effectRowButtons}>
                                            <button
                                                type="button"
                                                className={styles.smallButton}
                                                disabled={actionIndex === 0}
                                                onClick={() => moveAction(index, actionIndex, -1)}
                                            >
                                                ↑
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.smallButton}
                                                disabled={actionIndex === effect.actions.length - 1}
                                                onClick={() => moveAction(index, actionIndex, 1)}
                                            >
                                                ↓
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.smallButton}
                                                disabled={effect.actions.length <= 1}
                                                onClick={() => removeAction(index, actionIndex)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                    <ActionFieldsEditor
                                        action={action}
                                        onChange={(next) => updateAction(index, actionIndex, next)}
                                        errors={errors}
                                        prefix={actionPrefix}
                                        allCards={allCards}
                                        canReuseTarget={canReuse[actionIndex]}
                                    />
                                </div>
                            );
                        })}

                        <button type="button" className={styles.addActionButton} onClick={() => addAction(index)}>
                            + Add effect line
                        </button>
                    </div>
                );
            })}

            <button type="button" className={styles.addEffectButton} onClick={addEffect}>
                + Add effect
            </button>
        </div>
    );
}
