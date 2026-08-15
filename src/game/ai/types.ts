/** A single decision the AI has committed to for this step of its turn. Each id in `targetIds` is
 * a hero PlayerId or a minion instanceId, one per `target: 'chosen'` action the card/ability has,
 * in the same order TurnStateMachine's chosen-target queue will prompt for them (see
 * scorePlayCard/scorePaidAbility). `attack`'s `targetId` is unrelated — always a single target. */
export type AIAction =
    | { kind: 'playCard'; instanceId: string; targetIds?: string[] }
    | { kind: 'attack'; attackerInstanceId: string; targetId: string }
    | { kind: 'activateAbility'; instanceId: string; abilityIndex: number; targetIds?: string[] };
