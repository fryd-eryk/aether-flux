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

/** Per-index "is there an earlier real (non-reuseTarget) chosen action before this one" flag,
 * for gating the "Same target as previous effect" checkbox — mirrors
 * validateCardDefinition.ts's validateActions. */
function canReuseTargetByIndex(actions: EffectAction[]): boolean[] {
    let seenChosen = false;
    return actions.map((action) => {
        const canReuse = seenChosen;
        if ('target' in action && action.target === 'chosen' && !action.reuseTarget) seenChosen = true;
        return canReuse;
    });
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
        onChange([...abilities, { cost: 1, actions: [defaultActionFor('damage')] }]);
    }

    function updateAction(abilityIndex: number, actionIndex: number, next: EffectAction) {
        const ability = abilities[abilityIndex];
        updateAbility(abilityIndex, { ...ability, actions: ability.actions.map((a, i) => (i === actionIndex ? next : a)) });
    }

    function removeAction(abilityIndex: number, actionIndex: number) {
        const ability = abilities[abilityIndex];
        updateAbility(abilityIndex, { ...ability, actions: ability.actions.filter((_, i) => i !== actionIndex) });
    }

    function moveAction(abilityIndex: number, actionIndex: number, delta: number) {
        const ability = abilities[abilityIndex];
        const target = actionIndex + delta;
        if (target < 0 || target >= ability.actions.length) return;
        const next = ability.actions.slice();
        [next[actionIndex], next[target]] = [next[target], next[actionIndex]];
        updateAbility(abilityIndex, { ...ability, actions: next });
    }

    function addAction(abilityIndex: number) {
        const ability = abilities[abilityIndex];
        updateAbility(abilityIndex, { ...ability, actions: [...ability.actions, defaultActionFor('damage')] });
    }

    return (
        <div>
            {abilities.map((ability, index) => {
                const prefix = `paidAbilities.${index}`;
                const canReuse = canReuseTargetByIndex(ability.actions);

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

                        {ability.actions.map((action, actionIndex) => {
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
                                                disabled={actionIndex === ability.actions.length - 1}
                                                onClick={() => moveAction(index, actionIndex, 1)}
                                            >
                                                ↓
                                            </button>
                                            <button
                                                type="button"
                                                className={styles.smallButton}
                                                disabled={ability.actions.length <= 1}
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

            <button type="button" className={styles.addEffectButton} onClick={addAbility}>
                + Add paid ability
            </button>
        </div>
    );
}
