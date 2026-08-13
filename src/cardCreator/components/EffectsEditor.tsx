import type {
    CardDefinition,
    CardEffect,
    ChosenTargetRestriction,
    CounterKind,
    EffectAction,
    EffectTrigger,
    EffectValue,
    Keyword,
    TargetSelector,
    Tribe,
} from '@/game/types/Card';
import { COUNTER_METADATA } from '@/game/data/counterMetadata';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import { TRIBE_METADATA } from '@/game/data/tribeMetadata';
import { TRIGGER_METADATA } from '@/game/data/triggerMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';

const TRIGGERS = Object.keys(TRIGGER_METADATA) as EffectTrigger[];
const ACTION_KINDS: EffectAction['kind'][] = ['damage', 'heal', 'draw', 'buff', 'summon', 'freeze', 'silence', 'destroy', 'grantKeyword'];
const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
const TARGETS: TargetSelector[] = ['self', 'enemyHero', 'friendlyHero', 'chosen', 'allEnemyMinions', 'allFriendlyMinions', 'allMinions', 'allHeroes'];
const RESTRICTIONS: ChosenTargetRestriction[] = ['minion', 'hero', ...(Object.keys(TRIBE_METADATA) as Tribe[])];
const TRIBES = Object.keys(TRIBE_METADATA) as Tribe[];
const COUNTERS = Object.keys(COUNTER_METADATA) as CounterKind[];
/** AOE minion targets a tribeFilter can narrow — hero/self/chosen targets are unaffected (a chosen target's tribe restriction is chosenRestriction instead). */
const TRIBE_FILTERABLE_TARGETS: TargetSelector[] = ['allMinions', 'allEnemyMinions', 'allFriendlyMinions'];

function restrictionLabel(restriction: ChosenTargetRestriction): string {
    if (restriction === 'minion' || restriction === 'hero') return restriction;
    return TRIBE_METADATA[restriction].label;
}

interface TribeFilterFieldProps {
    value: Tribe | undefined;
    onChange: (value: Tribe | undefined) => void;
    error?: string;
}

/** "Tribe filter" listbox for an AOE minion target (allMinions/allEnemyMinions/allFriendlyMinions)
 * — narrows the action to minions of one tribe, e.g. "Destroy all Elemental minions". Only rendered
 * when the action's target is one of TRIBE_FILTERABLE_TARGETS (see isTribeFilterable below). */
function TribeFilterField({ value, onChange, error }: TribeFilterFieldProps) {
    return (
        <div className={styles.field}>
            <label className={styles.fieldLabel}>Tribe filter</label>
            <select
                className={styles.selectInput}
                value={value ?? ''}
                onChange={(e) => onChange(e.target.value === '' ? undefined : (e.target.value as Tribe))}
            >
                <option value="">— all tribes —</option>
                {TRIBES.map((tribe) => (
                    <option key={tribe} value={tribe}>
                        {TRIBE_METADATA[tribe].label}
                    </option>
                ))}
            </select>
            {error && <span className={styles.fieldError}>{error}</span>}
        </div>
    );
}

interface EffectValueInputProps {
    label: string;
    value: EffectValue | undefined;
    onChange: (value: EffectValue | undefined) => void;
    min?: number;
    /** Buff's attack/health are individually optional — "at least one of attack or health" is
     * enforced elsewhere (validateCardDefinition.ts), not here. Damage/heal amount and draw count
     * are always required, so they don't offer this option. */
    allowUnset?: boolean;
    error?: string;
}

/**
 * Fixed number vs. live counter (see counters.ts's resolveEffectValue) toggle for a single
 * EffectValue field. No value is ever computed/previewed here — the Card Creator has no live
 * game state to compute against; picking a counter just records which one, and multiplier/offset
 * for the "twice your minion count" / "count plus 2" style of scaling.
 */
function EffectValueInput({ label, value, onChange, min, allowUnset, error }: EffectValueInputProps) {
    const mode = value === undefined ? 'unset' : typeof value === 'number' ? 'flat' : 'counter';

    return (
        <div className={styles.field}>
            <label className={styles.fieldLabel}>{label}</label>
            <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                <select
                    className={styles.selectInput}
                    style={{ width: 'auto' }}
                    value={mode}
                    onChange={(e) => {
                        const next = e.target.value;
                        if (next === 'unset') onChange(undefined);
                        else if (next === 'counter') onChange({ counter: 'enemyMinionCount', multiplier: 1 });
                        else onChange(min ?? 1);
                    }}
                >
                    {allowUnset && <option value="unset">— unset —</option>}
                    <option value="flat">Fixed</option>
                    <option value="counter">Counter</option>
                </select>
                {mode === 'counter' && typeof value === 'object' && (
                    <>
                        <select
                            className={styles.selectInput}
                            value={value.counter}
                            onChange={(e) => onChange({ ...value, counter: e.target.value as CounterKind })}
                        >
                            {COUNTERS.map((counter) => (
                                <option key={counter} value={counter}>
                                    {COUNTER_METADATA[counter].label}
                                </option>
                            ))}
                        </select>
                        <input
                            type="number"
                            step={1}
                            className={styles.numberInput}
                            style={{ width: '4rem' }}
                            placeholder="×1"
                            value={value.multiplier ?? ''}
                            onChange={(e) =>
                                onChange({ ...value, multiplier: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                        />
                        <input
                            type="number"
                            step={1}
                            className={styles.numberInput}
                            style={{ width: '4rem' }}
                            placeholder="+0"
                            value={value.offset ?? ''}
                            onChange={(e) =>
                                onChange({ ...value, offset: e.target.value === '' ? undefined : Number(e.target.value) })
                            }
                        />
                    </>
                )}
                {mode === 'flat' && (
                    <input
                        type="number"
                        min={min}
                        step={1}
                        className={styles.numberInput}
                        value={value as number}
                        onChange={(e) => onChange(Number(e.target.value))}
                    />
                )}
            </div>
            {error && <span className={styles.fieldError}>{error}</span>}
        </div>
    );
}

function defaultActionFor(kind: EffectAction['kind']): EffectAction {
    switch (kind) {
        case 'damage':
        case 'heal':
            return { kind, amount: 1, target: 'chosen', chosenRestriction: 'minion' };
        case 'draw':
            return { kind, count: 1 };
        case 'buff':
            return { kind, attack: 1, health: 1, target: 'allFriendlyMinions' };
        case 'summon':
            return { kind, definitionId: '', count: 1 };
        case 'freeze':
        case 'silence':
        case 'destroy':
            return { kind, target: 'chosen', chosenRestriction: 'minion' };
        case 'grantKeyword':
            return { kind, keyword: 'divineShield', target: 'chosen', chosenRestriction: 'minion' };
    }
}

interface EffectsEditorProps {
    effects: CardEffect[];
    onChange: (effects: CardEffect[]) => void;
    errors: FieldErrors;
    allCards: Record<string, CardDefinition>;
}

export function EffectsEditor({ effects, onChange, errors, allCards }: EffectsEditorProps) {
    const summonOptions = Object.values(allCards).sort((a, b) => a.name.localeCompare(b.name));

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
                const action = effect.action;
                const isChosen = 'target' in action && action.target === 'chosen';
                const isTribeFilterable = 'target' in action && TRIBE_FILTERABLE_TARGETS.includes(action.target);

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
                                value={action.kind}
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

                        <div className={styles.fieldRow}>
                            {(action.kind === 'damage' || action.kind === 'heal') && (
                                <>
                                    <EffectValueInput
                                        label="Amount"
                                        value={action.amount}
                                        min={1}
                                        error={errors[`${prefix}.amount`]}
                                        onChange={(value) =>
                                            updateEffect(index, { ...effect, action: { ...action, amount: (value ?? 1) as EffectValue } })
                                        }
                                    />
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Target</label>
                                        <select
                                            className={styles.selectInput}
                                            value={action.target}
                                            onChange={(e) => {
                                                const target = e.target.value as TargetSelector;
                                                // Leaving chosenRestriction unset when target is 'chosen' is a legitimate
                                                // choice (e.g. Firebolt/Radiant Light target "any minion or hero") — only
                                                // force-clear it when target moves away from 'chosen' entirely, don't
                                                // invent a restriction that wasn't there.
                                                const chosenRestriction = target === 'chosen' ? action.chosenRestriction : undefined;
                                                const tribeFilter = TRIBE_FILTERABLE_TARGETS.includes(target) ? action.tribeFilter : undefined;
                                                updateEffect(index, { ...effect, action: { ...action, target, chosenRestriction, tribeFilter } });
                                            }}
                                        >
                                            {TARGETS.map((target) => (
                                                <option key={target} value={target}>
                                                    {target}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {isChosen && (
                                        <div className={styles.field}>
                                            <label className={styles.fieldLabel}>Chosen restriction</label>
                                            <select
                                                className={styles.selectInput}
                                                value={action.chosenRestriction ?? ''}
                                                onChange={(e) =>
                                                    updateEffect(index, {
                                                        ...effect,
                                                        action: {
                                                            ...action,
                                                            chosenRestriction: e.target.value === '' ? undefined : (e.target.value as ChosenTargetRestriction),
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="">— any (minion or hero) —</option>
                                                {RESTRICTIONS.map((restriction) => (
                                                    <option key={restriction} value={restriction}>
                                                        {restrictionLabel(restriction)}
                                                    </option>
                                                ))}
                                            </select>
                                            {errors[`${prefix}.chosenRestriction`] && (
                                                <span className={styles.fieldError}>{errors[`${prefix}.chosenRestriction`]}</span>
                                            )}
                                        </div>
                                    )}
                                    {isTribeFilterable && (
                                        <TribeFilterField
                                            value={action.tribeFilter}
                                            error={errors[`${prefix}.tribeFilter`]}
                                            onChange={(tribeFilter) => updateEffect(index, { ...effect, action: { ...action, tribeFilter } })}
                                        />
                                    )}
                                </>
                            )}

                            {action.kind === 'draw' && (
                                <EffectValueInput
                                    label="Count"
                                    value={action.count}
                                    min={1}
                                    error={errors[`${prefix}.count`]}
                                    onChange={(value) =>
                                        updateEffect(index, { ...effect, action: { ...action, count: (value ?? 1) as EffectValue } })
                                    }
                                />
                            )}

                            {action.kind === 'buff' && (
                                <>
                                    <EffectValueInput
                                        label="Attack"
                                        value={action.attack}
                                        allowUnset
                                        error={errors[`${prefix}.attack`]}
                                        onChange={(value) => updateEffect(index, { ...effect, action: { ...action, attack: value } })}
                                    />
                                    <EffectValueInput
                                        label="Health"
                                        value={action.health}
                                        allowUnset
                                        onChange={(value) => updateEffect(index, { ...effect, action: { ...action, health: value } })}
                                    />
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Target</label>
                                        <select
                                            className={styles.selectInput}
                                            value={action.target}
                                            onChange={(e) => {
                                                const target = e.target.value as TargetSelector;
                                                // Leaving chosenRestriction unset when target is 'chosen' is a legitimate
                                                // choice (e.g. Firebolt/Radiant Light target "any minion or hero") — only
                                                // force-clear it when target moves away from 'chosen' entirely, don't
                                                // invent a restriction that wasn't there.
                                                const chosenRestriction = target === 'chosen' ? action.chosenRestriction : undefined;
                                                const tribeFilter = TRIBE_FILTERABLE_TARGETS.includes(target) ? action.tribeFilter : undefined;
                                                updateEffect(index, { ...effect, action: { ...action, target, chosenRestriction, tribeFilter } });
                                            }}
                                        >
                                            {TARGETS.map((target) => (
                                                <option key={target} value={target}>
                                                    {target}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {isChosen && (
                                        <div className={styles.field}>
                                            <label className={styles.fieldLabel}>Chosen restriction</label>
                                            <select
                                                className={styles.selectInput}
                                                value={action.chosenRestriction ?? ''}
                                                onChange={(e) =>
                                                    updateEffect(index, {
                                                        ...effect,
                                                        action: {
                                                            ...action,
                                                            chosenRestriction: e.target.value === '' ? undefined : (e.target.value as ChosenTargetRestriction),
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="">— any (minion or hero) —</option>
                                                {RESTRICTIONS.map((restriction) => (
                                                    <option key={restriction} value={restriction}>
                                                        {restrictionLabel(restriction)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    {isTribeFilterable && (
                                        <TribeFilterField
                                            value={action.tribeFilter}
                                            error={errors[`${prefix}.tribeFilter`]}
                                            onChange={(tribeFilter) => updateEffect(index, { ...effect, action: { ...action, tribeFilter } })}
                                        />
                                    )}
                                </>
                            )}

                            {action.kind === 'summon' && (
                                <>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Summon</label>
                                        <select
                                            className={styles.selectInput}
                                            value={action.definitionId}
                                            onChange={(e) =>
                                                updateEffect(index, { ...effect, action: { ...action, definitionId: e.target.value } })
                                            }
                                        >
                                            <option value="">— pick a card —</option>
                                            {summonOptions.map((card) => (
                                                <option key={card.id} value={card.id}>
                                                    {card.name}
                                                </option>
                                            ))}
                                        </select>
                                        {errors[`${prefix}.definitionId`] && (
                                            <span className={styles.fieldError}>{errors[`${prefix}.definitionId`]}</span>
                                        )}
                                    </div>
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Count</label>
                                        <input
                                            type="number"
                                            min={1}
                                            step={1}
                                            className={styles.numberInput}
                                            value={action.count}
                                            onChange={(e) =>
                                                updateEffect(index, { ...effect, action: { ...action, count: Number(e.target.value) } })
                                            }
                                        />
                                        {errors[`${prefix}.count`] && <span className={styles.fieldError}>{errors[`${prefix}.count`]}</span>}
                                    </div>
                                </>
                            )}

                            {(action.kind === 'freeze' || action.kind === 'silence' || action.kind === 'destroy' || action.kind === 'grantKeyword') && (
                                <>
                                    {action.kind === 'grantKeyword' && (
                                        <div className={styles.field}>
                                            <label className={styles.fieldLabel}>Keyword</label>
                                            <select
                                                className={styles.selectInput}
                                                value={action.keyword}
                                                onChange={(e) =>
                                                    updateEffect(index, { ...effect, action: { ...action, keyword: e.target.value as Keyword } })
                                                }
                                            >
                                                {KEYWORDS.map((keyword) => (
                                                    <option key={keyword} value={keyword}>
                                                        {KEYWORD_METADATA[keyword].label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <div className={styles.field}>
                                        <label className={styles.fieldLabel}>Target</label>
                                        <select
                                            className={styles.selectInput}
                                            value={action.target}
                                            onChange={(e) => {
                                                const target = e.target.value as TargetSelector;
                                                const chosenRestriction = target === 'chosen' ? action.chosenRestriction : undefined;
                                                const tribeFilter = TRIBE_FILTERABLE_TARGETS.includes(target) ? action.tribeFilter : undefined;
                                                updateEffect(index, { ...effect, action: { ...action, target, chosenRestriction, tribeFilter } });
                                            }}
                                        >
                                            {TARGETS.map((target) => (
                                                <option key={target} value={target}>
                                                    {target}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {isChosen && (
                                        <div className={styles.field}>
                                            <label className={styles.fieldLabel}>Chosen restriction</label>
                                            <select
                                                className={styles.selectInput}
                                                value={action.chosenRestriction ?? ''}
                                                onChange={(e) =>
                                                    updateEffect(index, {
                                                        ...effect,
                                                        action: {
                                                            ...action,
                                                            chosenRestriction: e.target.value === '' ? undefined : (e.target.value as ChosenTargetRestriction),
                                                        },
                                                    })
                                                }
                                            >
                                                <option value="">— any (minion or hero) —</option>
                                                {RESTRICTIONS.map((restriction) => (
                                                    <option key={restriction} value={restriction}>
                                                        {restrictionLabel(restriction)}
                                                    </option>
                                                ))}
                                            </select>
                                            {errors[`${prefix}.chosenRestriction`] && (
                                                <span className={styles.fieldError}>{errors[`${prefix}.chosenRestriction`]}</span>
                                            )}
                                        </div>
                                    )}
                                    {isTribeFilterable && (
                                        <TribeFilterField
                                            value={action.tribeFilter}
                                            error={errors[`${prefix}.tribeFilter`]}
                                            onChange={(tribeFilter) => updateEffect(index, { ...effect, action: { ...action, tribeFilter } })}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })}

            <button type="button" className={styles.addEffectButton} onClick={addEffect}>
                + Add effect
            </button>
        </div>
    );
}
