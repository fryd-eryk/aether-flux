import type {
    CardDefinition,
    ChosenTargetRestriction,
    CounterKind,
    EffectAction,
    EffectValue,
    Keyword,
    TargetSelector,
    Tribe,
} from '@/game/types/Card';
import { COUNTER_METADATA } from '@/game/data/counterMetadata';
import { KEYWORD_METADATA } from '@/game/data/keywordMetadata';
import { TRIBE_METADATA } from '@/game/data/tribeMetadata';
import type { FieldErrors } from '../validateCardDefinition';
import styles from '@/styles/CardCreator.module.css';

export const ACTION_KINDS: EffectAction['kind'][] = ['damage', 'heal', 'draw', 'buff', 'summon', 'freeze', 'silence', 'destroy', 'grantKeyword'];
const KEYWORDS = Object.keys(KEYWORD_METADATA) as Keyword[];
export const TARGETS: TargetSelector[] = ['self', 'enemyHero', 'friendlyHero', 'chosen', 'allEnemyMinions', 'allFriendlyMinions', 'allMinions', 'allOtherMinions', 'allHeroes'];
export const RESTRICTIONS: ChosenTargetRestriction[] = ['minion', 'hero', ...(Object.keys(TRIBE_METADATA) as Tribe[])];
const TRIBES = Object.keys(TRIBE_METADATA) as Tribe[];
const COUNTERS = Object.keys(COUNTER_METADATA) as CounterKind[];
/** AOE minion targets a tribeFilter can narrow — hero/self/chosen targets are unaffected (a chosen target's tribe restriction is chosenRestriction instead). */
export const TRIBE_FILTERABLE_TARGETS: TargetSelector[] = ['allMinions', 'allEnemyMinions', 'allFriendlyMinions', 'allOtherMinions'];

export function restrictionLabel(restriction: ChosenTargetRestriction): string {
    if (restriction === 'minion' || restriction === 'hero') return restriction;
    return TRIBE_METADATA[restriction].label;
}

/** Every EffectAction kind's starting shape — shared by EffectsEditor (switching a CardEffect's
 * action) and PaidAbilitiesEditor (switching a PaidAbility's action). */
export function defaultActionFor(kind: EffectAction['kind']): EffectAction {
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

interface TribeFilterFieldProps {
    value: Tribe | undefined;
    onChange: (value: Tribe | undefined) => void;
    error?: string;
}

/** "Tribe filter" listbox for an AOE minion target (allMinions/allEnemyMinions/allFriendlyMinions)
 * — narrows the action to minions of one tribe, e.g. "Destroy all Elemental minions". Only rendered
 * when the action's target is one of TRIBE_FILTERABLE_TARGETS (see isTribeFilterable below). */
export function TribeFilterField({ value, onChange, error }: TribeFilterFieldProps) {
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
export function EffectValueInput({ label, value, onChange, min, allowUnset, error }: EffectValueInputProps) {
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
                            onChange={(e) => {
                                const counter = e.target.value as CounterKind;
                                const tribe = counter === 'allTribeMinionCount' ? (value.tribe ?? TRIBES[0]) : undefined;
                                onChange({ ...value, counter, tribe });
                            }}
                        >
                            {COUNTERS.map((counter) => (
                                <option key={counter} value={counter}>
                                    {COUNTER_METADATA[counter].label}
                                </option>
                            ))}
                        </select>
                        {value.counter === 'allTribeMinionCount' && (
                            <select
                                className={styles.selectInput}
                                value={value.tribe ?? ''}
                                onChange={(e) => onChange({ ...value, tribe: e.target.value as Tribe })}
                            >
                                {TRIBES.map((tribe) => (
                                    <option key={tribe} value={tribe}>
                                        {TRIBE_METADATA[tribe].label}
                                    </option>
                                ))}
                            </select>
                        )}
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

interface ActionFieldsEditorProps {
    action: EffectAction;
    onChange: (action: EffectAction) => void;
    errors: FieldErrors;
    /** Error-key prefix for this action's own fields (e.g. `effects.0` or `paidAbilities.0`) — the
     * caller owns the numbering scheme, this component just reads `errors[`${prefix}.field`]`. */
    prefix: string;
    allCards: Record<string, CardDefinition>;
    /** Whether an earlier action in the same actions[] list already resolved a real (non-reuseTarget)
     * chosen target — gates whether the "Same target as previous effect" checkbox is offered at all,
     * mirroring validateCardDefinition.ts's validateActions. */
    canReuseTarget: boolean;
}

interface ReuseTargetFieldProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

/** "Same target as previous effect" checkbox for a chosen-target action — see EffectAction.reuseTarget
 * in Card.ts. Shared across the damage/heal, buff, and freeze/silence/destroy/grantKeyword blocks
 * below, all of which have the exact same reuseTarget?: boolean field. */
function ReuseTargetField({ checked, onChange }: ReuseTargetFieldProps) {
    return (
        <label className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            Same target as previous effect
        </label>
    );
}

/**
 * The kind-specific field block for a single EffectAction — shared by EffectsEditor (a CardEffect's
 * action) and PaidAbilitiesEditor (a PaidAbility's action), since both wrap the exact same
 * EffectAction shape and only differ in what wraps it (trigger+condition vs. a mana cost). Operates
 * directly on `action`/`onChange` so neither caller's own wrapper shape leaks in here.
 */
export function ActionFieldsEditor({ action, onChange, errors, prefix, allCards, canReuseTarget }: ActionFieldsEditorProps) {
    const summonOptions = Object.values(allCards).sort((a, b) => a.name.localeCompare(b.name));
    const isChosen = 'target' in action && action.target === 'chosen';
    const isTribeFilterable = 'target' in action && TRIBE_FILTERABLE_TARGETS.includes(action.target);

    return (
        <div className={styles.fieldRow}>
            {(action.kind === 'damage' || action.kind === 'heal') && (
                <>
                    <EffectValueInput
                        label="Amount"
                        value={action.amount}
                        min={1}
                        error={errors[`${prefix}.amount`]}
                        onChange={(value) => onChange({ ...action, amount: (value ?? 1) as EffectValue })}
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
                                onChange({ ...action, target, chosenRestriction, tribeFilter });
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
                                    onChange({
                                        ...action,
                                        chosenRestriction: e.target.value === '' ? undefined : (e.target.value as ChosenTargetRestriction),
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
                            onChange={(tribeFilter) => onChange({ ...action, tribeFilter })}
                        />
                    )}
                    {isChosen && canReuseTarget && (
                        <ReuseTargetField
                            checked={!!action.reuseTarget}
                            onChange={(reuseTarget) => onChange({ ...action, reuseTarget: reuseTarget || undefined })}
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
                    onChange={(value) => onChange({ ...action, count: (value ?? 1) as EffectValue })}
                />
            )}

            {action.kind === 'buff' && (
                <>
                    <EffectValueInput
                        label="Attack"
                        value={action.attack}
                        allowUnset
                        error={errors[`${prefix}.attack`]}
                        onChange={(value) => onChange({ ...action, attack: value })}
                    />
                    <EffectValueInput
                        label="Health"
                        value={action.health}
                        allowUnset
                        onChange={(value) => onChange({ ...action, health: value })}
                    />
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Duration (turns)</label>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            className={styles.numberInput}
                            value={action.duration ?? ''}
                            placeholder="Permanent"
                            onChange={(e) => onChange({ ...action, duration: e.target.value === '' ? undefined : Number(e.target.value) })}
                        />
                        {errors[`${prefix}.duration`] && <span className={styles.fieldError}>{errors[`${prefix}.duration`]}</span>}
                    </div>
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
                                onChange({ ...action, target, chosenRestriction, tribeFilter });
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
                                    onChange({
                                        ...action,
                                        chosenRestriction: e.target.value === '' ? undefined : (e.target.value as ChosenTargetRestriction),
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
                            onChange={(tribeFilter) => onChange({ ...action, tribeFilter })}
                        />
                    )}
                    {isChosen && canReuseTarget && (
                        <ReuseTargetField
                            checked={!!action.reuseTarget}
                            onChange={(reuseTarget) => onChange({ ...action, reuseTarget: reuseTarget || undefined })}
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
                            onChange={(e) => onChange({ ...action, definitionId: e.target.value })}
                        >
                            <option value="">— pick a card —</option>
                            {summonOptions.map((card) => (
                                <option key={card.id} value={card.id}>
                                    {card.name}
                                </option>
                            ))}
                        </select>
                        {errors[`${prefix}.definitionId`] && <span className={styles.fieldError}>{errors[`${prefix}.definitionId`]}</span>}
                    </div>
                    <div className={styles.field}>
                        <label className={styles.fieldLabel}>Count</label>
                        <input
                            type="number"
                            min={1}
                            step={1}
                            className={styles.numberInput}
                            value={action.count}
                            onChange={(e) => onChange({ ...action, count: Number(e.target.value) })}
                        />
                        {errors[`${prefix}.count`] && <span className={styles.fieldError}>{errors[`${prefix}.count`]}</span>}
                    </div>
                </>
            )}

            {(action.kind === 'freeze' || action.kind === 'silence' || action.kind === 'destroy' || action.kind === 'grantKeyword') && (
                <>
                    {action.kind === 'grantKeyword' && (
                        <>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Keyword</label>
                                <select
                                    className={styles.selectInput}
                                    value={action.keyword}
                                    onChange={(e) => onChange({ ...action, keyword: e.target.value as Keyword })}
                                >
                                    {KEYWORDS.map((keyword) => (
                                        <option key={keyword} value={keyword}>
                                            {KEYWORD_METADATA[keyword].label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel}>Duration (turns)</label>
                                <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className={styles.numberInput}
                                    value={action.duration ?? ''}
                                    placeholder="Permanent"
                                    onChange={(e) => onChange({ ...action, duration: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                                {errors[`${prefix}.duration`] && <span className={styles.fieldError}>{errors[`${prefix}.duration`]}</span>}
                            </div>
                        </>
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
                                onChange({ ...action, target, chosenRestriction, tribeFilter });
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
                                    onChange({
                                        ...action,
                                        chosenRestriction: e.target.value === '' ? undefined : (e.target.value as ChosenTargetRestriction),
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
                            onChange={(tribeFilter) => onChange({ ...action, tribeFilter })}
                        />
                    )}
                    {isChosen && canReuseTarget && (
                        <ReuseTargetField
                            checked={!!action.reuseTarget}
                            onChange={(reuseTarget) => onChange({ ...action, reuseTarget: reuseTarget || undefined })}
                        />
                    )}
                </>
            )}
        </div>
    );
}
