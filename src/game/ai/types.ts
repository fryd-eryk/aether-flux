/** A single decision the AI has committed to for this step of its turn. Only `attack`'s `targetId`
 * (who the attacker hits) is decided up front, via scoreAttack — every chosen-target prompt any
 * action goes on to raise (the card/ability/attacker's own, or a board-wide Channel/Muster/Vigil/
 * Curfew reaction) is resolved reactively afterward, one at a time, off the live GameState.pendingTarget
 * — see OpponentAI.decideOpponentTarget and CardGame/index.ts's drainOpponentTargeting. */
export type AIAction =
    | { kind: 'playCard'; instanceId: string }
    | { kind: 'attack'; attackerInstanceId: string; targetId: string }
    | { kind: 'activateAbility'; instanceId: string; abilityIndex: number };
