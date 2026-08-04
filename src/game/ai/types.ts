/** A single decision the AI has committed to for this step of its turn. `targetId` is a hero PlayerId or a minion instanceId, resolved from `GameState.pendingTarget.validTargetIds`. */
export type AIAction =
    | { kind: 'playCard'; instanceId: string; targetId?: string }
    | { kind: 'attack'; attackerInstanceId: string; targetId: string };
