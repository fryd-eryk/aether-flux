import type { CounterKind } from '../types/Card';

/** Display-only labels for the Card Creator's counter picker — kept separate from state/counters.ts, which is pure game logic. */
export const COUNTER_METADATA: Record<CounterKind, { label: string }> = {
    allMinionCount: { label: 'All minions on the board' },
    friendlyMinionCount: { label: 'Your minions' },
    enemyMinionCount: { label: 'Enemy minions' },
    friendlyHeroHealth: { label: 'Your Health' },
    enemyHeroHealth: { label: "Enemy's Health" },
    allTribeMinionCount: { label: 'Minions of a tribe' },
    friendlyHandCount: { label: 'Cards in your hand' },
    enemyHandCount: { label: "Cards in enemy's hand" },
    friendlyGraveyardCount: { label: 'Cards in your graveyard' },
    enemyGraveyardCount: { label: "Cards in enemy's graveyard" },
    friendlyDeckCount: { label: 'Cards in your deck' },
    enemyDeckCount: { label: "Cards in enemy's deck" },
};
