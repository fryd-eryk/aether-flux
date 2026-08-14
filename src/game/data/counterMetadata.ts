import type { CounterKind } from '../types/Card';

/** Display-only labels for the Card Creator's counter picker — kept separate from state/counters.ts, which is pure game logic. */
export const COUNTER_METADATA: Record<CounterKind, { label: string }> = {
    allMinionCount: { label: 'All minions on the board' },
    friendlyMinionCount: { label: 'Your minions' },
    enemyMinionCount: { label: 'Enemy minions' },
    friendlyHeroHealth: { label: 'Your Health' },
    enemyHeroHealth: { label: "Enemy's Health" },
    allTribeMinionCount: { label: 'Minions of a tribe' },
};
