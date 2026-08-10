import { Geom, Scene } from 'phaser';

import { decideOpponentAction } from '../../ai/OpponentAI';
import { CARD_DEFINITIONS } from '../../data/cards';
import { generateDeck } from '../../data/deckGenerator';
import { EventBus } from '../../EventBus';
import { canDeclareAttack, hasKeyword } from '../../state/keywordRules';
import { createInitialState } from '../../state/createInitialState';
import { TurnStateMachine } from '../../state/TurnStateMachine';
import type { PlayerId } from '../../types/common';
import type { GameState, PlayerState } from '../../types/GameState';
import { TurnPhase } from '../../types/GameState';
import {
    BOARD_ZONE_W,
    CARD_BACK_KEY,
    CARD_H,
    CARD_W,
    CENTER_X,
    CENTER_Y,
    coverFit,
    DECK_PILE_H,
    DECK_PILE_W,
    GAME_HEIGHT,
    GAME_WIDTH,
    getPileCards,
    HAND_ARC_ANGLE_STEP_DEG,
    HAND_ARC_LIFT,
    HAND_ARC_MAX_ANGLE_DEG,
    HAND_DROP_ZONE_H,
    HAND_DROP_ZONE_W,
    HAND_MIN_SPACING,
    HAND_PEEK_DEPTH,
    HAND_PEEK_HOVER_MARGIN,
    HERO_DEPTH,
    HERO_HP_STYLE,
    HERO_RADIUS,
    HERO_SIZE,
    lightenColor,
    OPPONENT_BOARD_Y,
    OPPONENT_DECK_Y,
    OPPONENT_GRAVEYARD_Y,
    OPPONENT_HAND_Y,
    OPPONENT_HERO_Y,
    OUTLINE_COLOR_FROZEN,
    OUTLINE_COLOR_HOVER,
    OUTLINE_COLOR_READY,
    OUTLINE_COLOR_SICK,
    OUTLINE_COLOR_TARGETABLE,
    PILE_STYLES,
    PILE_X,
    PLAYER_BOARD_Y,
    PLAYER_DECK_Y,
    PLAYER_GRAVEYARD_Y,
    PLAYER_HAND_PEEK_Y,
    PLAYER_HAND_POKE_Y,
    PLAYER_HERO_Y,
    type PileZone,
    SHIMMER_BAND_WIDTH,
    SHIMMER_BRIGHTEN_AMOUNT,
    SHIMMER_PAUSE_MS,
    SHIMMER_SWEEP_MS,
    SMALL_STYLE,
    SPOTLIGHT_X,
    statStyle,
} from './cardLayout';
import { CardView } from './CardView';
import { HelpBoxController } from './HelpBoxController';
import { PileViewController } from './PileViewController';

/** A hand card's idle "slot" — its arced position/rotation/scale/depth when nothing is happening to it. See handCardSlot. */
type HandSlot = { x: number; y: number; rotation: number; scale: number; depth: number };

/**
 * A hand card's static peek-hover trigger rectangle (world space) plus its enter/leave callbacks
 * and current state — see the scene-level 'pointermove' listener registered in create() and the
 * comment above renderHand's population of this.handPeekZones for why this is driven by a manual
 * geometry check rather than Phaser's own per-object pointerover/pointerout events.
 */
type HandPeekZone = { left: number; right: number; top: number; bottom: number; peeked: boolean; peekIn: () => void; peekOut: () => void };

/**
 * Renders TurnStateMachine's GameState and forwards input into it. This scene owns no
 * game rules of its own — every button/drag/click just calls a TurnStateMachine method.
 *
 * TurnStateMachine resolves a whole action (mutation + effects + death sweep) synchronously
 * within a single call, emitting 'state:phase-change' plus action-specific events
 * ('state:card-played', 'state:attack', 'state:card-died', 'state:card-drawn') along the way —
 * all before this Scene ever gets a turn to run a tween. So the board is NOT rebuilt on every
 * phase-change: renderNow() (the full teardown/rebuild) only actually runs for "settled" phases
 * (see RENDERABLE_PHASES), and is deferred behind requestRender()'s isAnimating gate whenever an
 * action-specific event has queued an animation. Those queued animations run against whatever
 * renderNow() last actually painted — which, since GameState is already fully resolved by then,
 * is always the correct "before" picture for a move/fade/fly tween — and only once the queue
 * drains does the deferred renderNow() finally paint the true final state.
 *
 * Card visuals are built by CardView, the hover tooltip by HelpBoxController, and the
 * deck/graveyard inspect overlay by PileViewController — see those files for the display
 * layouts. This class owns the render pass that places their output (renderHero/renderPile/
 * renderHand/renderBoard/renderNow) and the animation choreography, since both directly mutate
 * this scene's core bookkeeping (instanceContainers, renderedObjects, heroContainers).
 */
export class CardGame extends Scene
{
    private static readonly RENDERABLE_PHASES: ReadonlySet<TurnPhase> = new Set([
        TurnPhase.MainIdle,
        TurnPhase.AwaitingTarget,
        TurnPhase.GameOver,
    ]);

    private machine!: TurnStateMachine;

    private cardView!: CardView;
    private helpBoxController!: HelpBoxController;
    private pileView!: PileViewController;

    private renderedObjects: Phaser.GameObjects.GameObject[] = [];
    private cardInstanceByContainer = new Map<Phaser.GameObjects.Container, string>();
    // Every non-face-down player hand card's idle arced slot (see handCardSlot) — both the
    // peek-out tween and a cancelled drag restore a card to exactly this, so there's one source
    // of truth for "where does this card live when nothing is happening to it."
    private handSlots = new Map<Phaser.GameObjects.Container, HandSlot>();
    // Drives peek hover — see create()'s single 'pointermove' listener and renderHand's
    // population of this map for why it's a manual geometry check instead of Phaser's own
    // per-object pointerover/pointerout (which silently breaks under topOnly input priority once
    // two overlapping interactive objects, the card and its hover-padding, are both in play).
    private handPeekZones = new Map<Phaser.GameObjects.Container, HandPeekZone>();
    private instanceContainers = new Map<string, Phaser.GameObjects.Container>();
    private heroContainers = new Map<PlayerId, Phaser.GameObjects.Container>();

    private turnBannerText!: Phaser.GameObjects.Text;
    private endTurnButton!: Phaser.GameObjects.Container;
    private cancelButton!: Phaser.GameObjects.Container;
    private playerManaText!: Phaser.GameObjects.Text;
    private opponentManaText!: Phaser.GameObjects.Text;

    // The hand card currently being dragged, if any — excluded from per-card peek handling (see
    // the 'pointermove' listener in create() that walks handPeekZones) so a peek firing mid-drag
    // can't fight the drag handler's own per-pointermove setPosition() on the same container.
    // Without this the card visibly detached from the cursor, stuttering between the tween's
    // eased position and the drag's direct one every frame.
    private draggedContainer: Phaser.GameObjects.Container | null = null;

    // --- animation orchestration --------------------------------------------------

    private animQueue: Array<() => Promise<void>> = [];
    private isAnimating = false;
    private renderQueued = false;
    private pendingDeathIds: string[] = [];

    private phaseChangeHandler = (phase: TurnPhase): void =>
    {
        if (!CardGame.RENDERABLE_PHASES.has(phase)) return;
        // Chrome (banner text, health/mana, End Turn/Cancel) is cheap and carries no stale
        // container references, so it updates immediately even mid-animation — otherwise e.g.
        // the Cancel button and "choose a target" banner would linger on screen throughout an
        // attack's lunge, since the full board rebuild that would normally clear them is deferred.
        this.updateChrome(this.machine.state);
        this.requestRender();
    };

    private cardDrawnHandler = ({ playerId, instanceId }: { playerId: PlayerId; instanceId: string }): void =>
    {
        this.enqueueAnimation(() => this.playDrawAnimation(playerId, instanceId));
    };

    private cardPlayedHandler = ({ instanceId, playerId }: { instanceId: string; playerId: PlayerId }): void =>
    {
        this.enqueueAnimation(() => this.playCardPlayedAnimation(instanceId, playerId));
    };

    private attackHandler = ({ attackerInstanceId, targetId }: { attackerInstanceId: string; targetId: string }): void =>
    {
        this.enqueueAnimation(() => this.playAttackAnimation(attackerInstanceId, targetId));
    };

    private cardDiedHandler = ({ instanceId }: { instanceId: string }): void =>
    {
        this.pendingDeathIds.push(instanceId);
    };

    // Only the human player's own hand cards get the held-at-spotlight treatment — see renderHand's
    // heldInstanceId/heldCard and TurnStateMachine's matching emits for why playerId is checked here.
    private targetBeginHandler = ({ instanceId, playerId }: { instanceId: string; playerId: PlayerId }): void =>
    {
        if (playerId !== 'player') return;
        this.enqueueAnimation(() => this.playTargetBeginAnimation(instanceId));
    };

    private targetCancelledHandler = ({ instanceId, playerId }: { instanceId: string; playerId: PlayerId }): void =>
    {
        if (playerId !== 'player') return;
        this.enqueueAnimation(() => this.playTargetCancelledAnimation(instanceId));
    };

    /** Queues an animation step and kicks off draining if nothing is already running. */
    private enqueueAnimation (step: () => Promise<void>): void
    {
        this.animQueue.push(step);
        if (this.isAnimating) return;
        this.isAnimating = true;
        void this.drainQueue();
    }

    private async drainQueue (): Promise<void>
    {
        while (this.animQueue.length > 0)
        {
            const step = this.animQueue.shift()!;
            await step();
        }
        this.isAnimating = false;
        if (this.renderQueued)
        {
            this.renderQueued = false;
            this.renderNow();
        }
    }

    /** Renders immediately unless an animation is in flight, in which case the render is deferred until it drains. */
    private requestRender (): void
    {
        if (this.pendingDeathIds.length > 0 && !this.isAnimating)
        {
            this.enqueueAnimation(() => this.playPendingDeaths());
        }
        if (this.isAnimating)
        {
            this.renderQueued = true;
            return;
        }
        this.renderNow();
    }

    /** Wraps a player-input callback so clicks/drops during an in-flight animation are ignored rather than firing on stale, about-to-be-replaced containers. */
    private guarded (fn: () => void): () => void
    {
        return () => { if (!this.isAnimating) fn(); };
    }

    private tweenPromise (config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void>
    {
        return new Promise((resolve) =>
        {
            this.tweens.add({ ...config, onComplete: () => resolve() });
        });
    }

    private delay (ms: number): Promise<void>
    {
        return new Promise((resolve) => { this.time.delayedCall(ms, () => resolve()); });
    }

    private deckPilePosition (playerId: PlayerId): { x: number; y: number }
    {
        return { x: PILE_X, y: playerId === 'opponent' ? OPPONENT_DECK_Y : PLAYER_DECK_Y };
    }

    private resolveTargetContainer (targetId: string): Phaser.GameObjects.Container | undefined
    {
        return targetId === 'player' || targetId === 'opponent'
            ? this.heroContainers.get(targetId as PlayerId)
            : this.instanceContainers.get(targetId);
    }

    /** Fades out and clears every instanceId queued up by cardDiedHandler since the last flush — a 500ms death fade, per card. */
    private async playPendingDeaths (): Promise<void>
    {
        if (this.pendingDeathIds.length === 0) return;

        const ids = this.pendingDeathIds.splice(0, this.pendingDeathIds.length);
        const containers = ids
            .map((id) => this.instanceContainers.get(id))
            .filter((c): c is Phaser.GameObjects.Container => !!c);
        if (containers.length === 0) return;

        await this.tweenPromise({ targets: containers, alpha: 0, duration: 500, ease: 'Linear' });
    }

    /** Attacker lunges at its target (easing in — slow start, speed ramping up) then returns to its original spot, before any resulting deaths fade. */
    private async playAttackAnimation (attackerInstanceId: string, targetId: string): Promise<void>
    {
        const attacker = this.instanceContainers.get(attackerInstanceId);
        const target = this.resolveTargetContainer(targetId);

        if (attacker && target)
        {
            const origin = { x: attacker.x, y: attacker.y };
            attacker.setDepth(1500);

            await this.tweenPromise({ targets: attacker, x: target.x, y: target.y, duration: 260, ease: 'Cubic.easeIn' });
            await this.tweenPromise({ targets: attacker, x: origin.x, y: origin.y, duration: 200, ease: 'Cubic.easeOut' });
        }

        await this.playPendingDeaths();
    }

    /**
     * Spotlights a just-played card at the screen's left-center so the player can register what
     * was played, then — without waiting on any input — flies it out to its resting place: its
     * computed board slot for a minion that was actually summoned, or a fade-out for a spell or a
     * minion discarded to a full board.
     */
    private async playCardPlayedAnimation (instanceId: string, playerId: PlayerId): Promise<void>
    {
        let container = this.instanceContainers.get(instanceId);
        if (!container)
        {
            await this.playPendingDeaths();
            return;
        }

        // The container we just found is whatever the last renderHand() built — for the
        // opponent that's always the face-down version (swap in a face-up one so the player can
        // actually see what was played), and for the player it's whatever hand-only decoration
        // (the playable glow outline, an idle arc rotation dragend didn't get a chance to clear —
        // see wireDragEvents' isAnimating guard) that container happened to carry. Rebuilding
        // fresh for both sides is simplest: a plain 'full' card has neither, and it's about to fly
        // off to the spotlight anyway, so nothing about the hand container is worth keeping.
        {
            const player = this.machine.state.players[playerId];
            const instance = player.board.find((c) => c.instanceId === instanceId)
                ?? player.graveyard.find((c) => c.instanceId === instanceId);
            if (instance)
            {
                const revealed = this.cardView.createCardContainer(instance, 'full');
                revealed.setPosition(container.x, container.y);

                const index = this.renderedObjects.indexOf(container);
                if (index !== -1) this.renderedObjects[index] = revealed;
                else this.renderedObjects.push(revealed);

                container.destroy();
                this.instanceContainers.set(instanceId, revealed);
                container = revealed;
            }
        }

        container.setDepth(2500);

        await this.tweenPromise({ targets: container, x: SPOTLIGHT_X, y: CENTER_Y, scale: 1.25, duration: 350, ease: 'Cubic.easeOut' });
        await this.delay(550);

        const destination = this.computePlayedCardDestination(instanceId, playerId);
        if (destination)
        {
            await this.tweenPromise({ targets: container, x: destination.x, y: destination.y, scale: 1, duration: 350, ease: 'Cubic.easeIn' });
        }
        else
        {
            await this.tweenPromise({ targets: container, alpha: 0, duration: 300, ease: 'Linear' });
        }

        await this.playPendingDeaths();
    }

    /** Board slot the just-played card settled into, using the same row-layout math as renderBoard — or undefined if it never made it to the board (spell, or a full-board discard). */
    private computePlayedCardDestination (instanceId: string, playerId: PlayerId): { x: number; y: number } | undefined
    {
        const board = this.machine.state.players[playerId].board;
        const index = board.findIndex((c) => c.instanceId === instanceId);
        if (index === -1) return undefined;

        const { spacing, startX } = this.rowLayout(board.length, 25);
        const y = playerId === 'opponent' ? OPPONENT_BOARD_Y : PLAYER_BOARD_Y;
        return { x: startX + index * spacing, y };
    }

    /**
     * Flies a temporary card preview from the drawing player's deck pile to the drawn card's
     * computed arced hand slot, then promotes it into instanceContainers/renderedObjects as that
     * card's resting container instead of discarding it — a full renderNow() stays deferred for
     * the *entire* burst of opening-hand draws (they all queue back-to-back into one animating
     * session, see the class doc comment), so a discarded preview left nothing on screen between
     * draws. Sibling cards already resting in this hand are re-tweened to their updated slot
     * first, since a growing hand recenters/rescales the whole row (handRowLayout's
     * spacing/startX/scale all shift with count) — without that they'd sit at a stale pre-draw
     * position until the eventual renderNow(). The newly-landed card itself is left
     * non-interactive (no peek/drag wiring) same as before — it only becomes interactive once
     * the next real renderNow() rebuilds it properly.
     */
    private async playDrawAnimation (playerId: PlayerId, instanceId: string): Promise<void>
    {
        const player = this.machine.state.players[playerId];
        const index = player.hand.findIndex((c) => c.instanceId === instanceId);
        if (index === -1) return;

        const faceDown = playerId === 'opponent';
        const liftSign: 1 | -1 = faceDown ? -1 : 1;
        const edgeY = playerId === 'opponent' ? OPPONENT_HAND_Y : PLAYER_HAND_POKE_Y;
        const layout = this.handRowLayout(player.hand.length);

        player.hand.forEach((sibling, siblingIndex) =>
        {
            if (sibling.instanceId === instanceId) return;
            const container = this.instanceContainers.get(sibling.instanceId);
            if (!container) return;
            const slot = this.handCardSlot(siblingIndex, player.hand.length, layout, edgeY, liftSign);
            this.tweens.add({ targets: container, x: slot.x, y: slot.y, rotation: slot.rotation, scale: slot.scale, duration: 250, ease: 'Cubic.easeOut' });
        });

        const destSlot = this.handCardSlot(index, player.hand.length, layout, edgeY, liftSign);
        const origin = this.deckPilePosition(playerId);
        const flying = this.cardView.createCardContainer(player.hand[index], faceDown ? 'faceDown' : 'full');
        flying.setPosition(origin.x, origin.y);
        flying.setDepth(3000);
        flying.setScale(0.6);

        await this.tweenPromise({ targets: flying, x: destSlot.x, y: destSlot.y, rotation: destSlot.rotation, scale: destSlot.scale, duration: 400, ease: 'Cubic.easeOut' });

        flying.setDepth(destSlot.depth);
        this.renderedObjects.push(flying);
        this.instanceContainers.set(instanceId, flying);
    }

    /**
     * Pulls a hand card out to the spotlight while the player picks a target for it (see
     * TurnStateMachine's 'state:target-begin' emit and renderHand's heldCard branch, which this
     * settles into) — the mirror image of playDrawAnimation's sibling reflow above: closing the gap
     * the held card leaves rather than opening one for an incoming card. Only ever fired for the
     * human player's own hand (see targetBeginHandler).
     */
    private async playTargetBeginAnimation (instanceId: string): Promise<void>
    {
        const container = this.instanceContainers.get(instanceId);
        if (!container) return;

        const player = this.machine.state.players.player;
        const remaining = player.hand.filter((c) => c.instanceId !== instanceId);
        const layout = this.handRowLayout(remaining.length);

        remaining.forEach((sibling, siblingIndex) =>
        {
            const sibContainer = this.instanceContainers.get(sibling.instanceId);
            if (!sibContainer) return;
            const slot = this.handCardSlot(siblingIndex, remaining.length, layout, PLAYER_HAND_POKE_Y, 1);
            this.tweens.add({ targets: sibContainer, x: slot.x, y: slot.y, rotation: slot.rotation, scale: slot.scale, duration: 250, ease: 'Cubic.easeOut' });
        });

        container.setDepth(2500);
        await this.tweenPromise({ targets: container, x: SPOTLIGHT_X, y: CENTER_Y, rotation: 0, scale: 1.25, duration: 300, ease: 'Cubic.easeOut' });
    }

    /**
     * Flies a held card (see playTargetBeginAnimation above) back into the hand fan when its cast is
     * cancelled (TurnStateMachine's 'state:target-cancelled') — the card's index in player.hand never
     * changed (cancelTarget never touches the hand array), so its post-cancel slot is simply its
     * normal full-fan position. Only ever fired for the human player's own hand (see
     * targetCancelledHandler).
     */
    private async playTargetCancelledAnimation (instanceId: string): Promise<void>
    {
        const container = this.instanceContainers.get(instanceId);
        if (!container) return;

        const player = this.machine.state.players.player;
        const index = player.hand.findIndex((c) => c.instanceId === instanceId);
        if (index === -1) return;

        const layout = this.handRowLayout(player.hand.length);

        player.hand.forEach((sibling, siblingIndex) =>
        {
            if (sibling.instanceId === instanceId) return;
            const sibContainer = this.instanceContainers.get(sibling.instanceId);
            if (!sibContainer) return;
            const slot = this.handCardSlot(siblingIndex, player.hand.length, layout, PLAYER_HAND_POKE_Y, 1);
            this.tweens.add({ targets: sibContainer, x: slot.x, y: slot.y, rotation: slot.rotation, scale: slot.scale, duration: 250, ease: 'Cubic.easeOut' });
        });

        const destSlot = this.handCardSlot(index, player.hand.length, layout, PLAYER_HAND_POKE_Y, 1);
        await this.tweenPromise({ targets: container, x: destSlot.x, y: destSlot.y, rotation: destSlot.rotation, scale: destSlot.scale, duration: 300, ease: 'Cubic.easeIn' });
        container.setDepth(destSlot.depth);
    }

    /**
     * Drives one step of the opponent's turn. Executing an action always resolves the state
     * machine back to MainIdle (or GameOver); renderNow() re-schedules this method 600ms after
     * each such settle (see its tail), so a full turn is a chain of these calls, paced 600ms
     * apart and naturally waiting out any in-flight animation along the way.
     */
    private runOpponentTurn (): void
    {
        const state = this.machine.state;
        if (state.phase !== TurnPhase.MainIdle || state.activePlayer !== 'opponent') return;

        const action = decideOpponentAction(state);
        if (!action)
        {
            this.machine.endTurn();
            return;
        }

        if (action.kind === 'playCard') this.machine.playCard(action.instanceId);
        else this.machine.declareAttack(action.attackerInstanceId);

        if (this.machine.state.phase === TurnPhase.AwaitingTarget)
        {
            this.machine.selectTarget(action.targetId!);
        }
    }

    constructor ()
    {
        super('CardGame');
    }

    create ()
    {
        // scene.restart() (the Play Again button) reuses this same class instance, so field
        // initializers do NOT re-run — construct fresh cardView/helpBoxController/pileView so
        // their internal state (including which pile-view overlay was open) doesn't leak from a
        // finished game into the next one.
        this.cardView = new CardView(this);
        this.helpBoxController = new HelpBoxController(this, () => this.draggedContainer);
        // Playtesting-only cheat wiring (debugDrawCard) — see SPEC.md's "Playtesting-only
        // features" section for why this exists and where it needs to be ripped out.
        this.pileView = new PileViewController(this, this.cardView, this.helpBoxController,
            (playerId, instanceId) => this.machine.debugDrawCard(playerId, instanceId));

        this.add.rectangle(CENTER_X, CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x161b26);

        this.turnBannerText = this.add.text(38, 6, '', SMALL_STYLE).setDepth(200);

        this.opponentManaText = this.add.text(38, 30, '', statStyle('#5c9cff', true, '32px')).setDepth(200);

        this.playerManaText = this.add.text(38, 1023, '', statStyle('#5c9cff', true, '32px')).setDepth(200);

        const boardZoneH = CARD_H + 30;
        this.add.rectangle(CENTER_X, PLAYER_BOARD_Y, BOARD_ZONE_W, boardZoneH).setStrokeStyle(2, 0x3a4a6b, 0.6);

        // The only registered drag drop zone now — releasing a dragged hand card over it cancels
        // the cast; releasing anywhere else on screen attempts one (see wireDragEvents' dragend
        // handler, which reads Phaser's own `dropped` flag rather than checking a board zone).
        this.add
            .zone(CENTER_X, GAME_HEIGHT, HAND_DROP_ZONE_W, HAND_DROP_ZONE_H * 2)
            .setRectangleDropZone(HAND_DROP_ZONE_W, HAND_DROP_ZONE_H * 2);

        this.createEndTurnButton();
        this.createCancelButton();
        this.wireDragEvents();
        this.input.keyboard?.on('keydown-ESC', () => this.pileView.close());

        // Drives hand-card peek hover for every currently-rendered card in one place, using a
        // manual rectangle check against handPeekZones (populated by renderHand) rather than
        // Phaser's per-object pointerover/pointerout. Those per-object events are filtered by
        // Phaser's default topOnly input priority — with a card's own hit area stacked on top of
        // its hover-padding zone, only one of the two ever receives events for a given pointer
        // position, which previously left the padding-only area silently unresponsive (and, in an
        // earlier attempt, left pointerout undelivered once the pointer left through it, sticking
        // the card mid-peek forever). A scene-level 'pointermove' event is dispatched unconditionally
        // on every pointer move, independent of any game object's hit test, so it can't be starved
        // by topOnly — this is the single source of truth for peek state.
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
        {
            for (const [container, zone] of this.handPeekZones)
            {
                if (container === this.draggedContainer || this.isAnimating) continue;
                const inside = pointer.worldX >= zone.left && pointer.worldX <= zone.right && pointer.worldY >= zone.top && pointer.worldY <= zone.bottom;
                if (inside === zone.peeked) continue;
                zone.peeked = inside;
                if (inside) zone.peekIn(); else zone.peekOut();
            }
        });

        EventBus.on('state:phase-change', this.phaseChangeHandler);
        EventBus.on('state:card-drawn', this.cardDrawnHandler);
        EventBus.on('state:card-played', this.cardPlayedHandler);
        EventBus.on('state:attack', this.attackHandler);
        EventBus.on('state:card-died', this.cardDiedHandler);
        EventBus.on('state:target-begin', this.targetBeginHandler);
        EventBus.on('state:target-cancelled', this.targetCancelledHandler);
        this.events.once('shutdown', () =>
        {
            EventBus.removeListener('state:phase-change', this.phaseChangeHandler);
            EventBus.removeListener('state:card-drawn', this.cardDrawnHandler);
            EventBus.removeListener('state:card-played', this.cardPlayedHandler);
            EventBus.removeListener('state:attack', this.attackHandler);
            EventBus.removeListener('state:target-begin', this.targetBeginHandler);
            EventBus.removeListener('state:target-cancelled', this.targetCancelledHandler);
            EventBus.removeListener('state:card-died', this.cardDiedHandler);
        });

        this.machine = new TurnStateMachine(createInitialState(generateDeck(), generateDeck()));

        // Paint the empty board (deck piles included) before startGame() fires its opening-hand
        // draws, so the draw animation has a visible deck pile to fly from. Everything from here
        // on is driven by 'state:phase-change' via phaseChangeHandler/requestRender.
        this.renderNow();
        this.machine.startGame();

        EventBus.emit('current-scene-ready', this);
    }

    // --- one-time setup --------------------------------------------------------

    private wireDragEvents (): void
    {
        this.input.on('dragstart', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) =>
        {
            const container = gameObject as Phaser.GameObjects.Container;
            // Kill any in-flight peek tween so it can't fight this handler's own per-pointermove
            // setPosition() below, and snap upright — a rotated card being dragged around the
            // battlefield would look broken, and "animate upright" is peek's own language for a
            // picked-up card anyway.
            this.tweens.killTweensOf(container);
            container.setRotation(0);
            container.setDepth(1000);
            this.draggedContainer = container;

            // The keyword tooltip that was showing for this card (hovering it is how the drag
            // started) would otherwise linger for the whole drag — pointerout never fires for the
            // dragged object since it stays centered under the pointer throughout.
            this.helpBoxController.hideHelpBox();
        });

        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) =>
        {
            (gameObject as Phaser.GameObjects.Container).setPosition(dragX, dragY);
        });

        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropped: boolean) =>
        {
            const container = gameObject as Phaser.GameObjects.Container;
            if (this.draggedContainer === container) this.draggedContainer = null;
            if (!container.active) return; // already destroyed by a re-render triggered from playCard below

            if (this.isAnimating) return;

            if (!dropped)
            {
                // Released anywhere but the hand (handZone is the only registered drop zone, so
                // Phaser's own `dropped` flag already tells us whether the hand was hit) — attempt
                // the cast. If this needs a target, playCard synchronously drives the state machine
                // into AwaitingTarget, which re-renders (destroying `container`) before this call
                // returns — nothing below touches it again, so that's safe.
                const instanceId = this.cardInstanceByContainer.get(container);
                if (instanceId) this.machine.playCard(instanceId);
                return;
            }

            // Released back over the hand: cancel — fly back to its idle slot rather than snapping.
            const slot = this.handSlots.get(container);
            if (slot)
            {
                this.tweens.add({ targets: container, x: slot.x, y: slot.y, rotation: slot.rotation, duration: 200, ease: 'Cubic.easeOut' });
                container.setDepth(slot.depth);
            }
        });
    }

    private createEndTurnButton (): void
    {
        const container = this.add.container(1744, CENTER_Y);
        const bg = this.add.rectangle(0, 0, 160, 65, 0x3a4a6b).setStrokeStyle(2, 0x8fa8d6);
        const text = this.add.text(0, 0, 'End Turn', SMALL_STYLE).setOrigin(0.5);
        container.add([bg, text]);
        container.setSize(160, 65);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerup', this.guarded(() => this.machine.endTurn()));
        this.endTurnButton = container;
    }

    private createCancelButton (): void
    {
        const container = this.add.container(1744, 633);
        const bg = this.add.rectangle(0, 0, 160, 54, 0x6b3a3a).setStrokeStyle(2, 0xd68f8f);
        const text = this.add.text(0, 0, 'Cancel', SMALL_STYLE).setOrigin(0.5);
        container.add([bg, text]);
        container.setSize(160, 54);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerup', this.guarded(() => this.machine.cancelTarget()));
        container.setVisible(false);
        this.cancelButton = container;
    }

    // --- render ------------------------------------------------------------------

    /** Banner text, health/mana readouts, and End Turn/Cancel button state — cheap, and safe to refresh immediately even while the heavy board rebuild below is deferred behind an in-flight animation. */
    private updateChrome (state: GameState): void
    {
        this.turnBannerText.setText(this.describePhase(state));

        this.opponentManaText.setText(`♦ ${state.players.opponent.mana}/${state.players.opponent.maxMana}`);
        this.playerManaText.setText(`♦ ${state.players.player.mana}/${state.players.player.maxMana}`);

        this.updateEndTurnButton(state);
        this.updateCancelButton(state);
    }

    private renderNow (): void
    {
        this.clearRendered();
        const state = this.machine.state;

        this.updateChrome(state);

        this.renderHero('opponent', OPPONENT_HERO_Y);
        this.renderHero('player', PLAYER_HERO_Y);

        this.renderPile(state.players.opponent, 'graveyard', OPPONENT_GRAVEYARD_Y);
        this.renderPile(state.players.opponent, 'deck', OPPONENT_DECK_Y);
        this.renderPile(state.players.player, 'deck', PLAYER_DECK_Y);
        this.renderPile(state.players.player, 'graveyard', PLAYER_GRAVEYARD_Y);

        this.renderHand(state.players.opponent, OPPONENT_HAND_Y, true);
        this.renderHand(state.players.player, PLAYER_HAND_POKE_Y, false);

        this.renderBoard('opponent', state.players.opponent, OPPONENT_BOARD_Y);
        this.renderBoard('player', state.players.player, PLAYER_BOARD_Y);

        if (state.phase === TurnPhase.GameOver)
        {
            this.showGameOver(state.winner);
        }

        // Repaint last so the overlay lands on top of, and re-reads, the board just rebuilt above —
        // an open pile therefore keeps showing live contents as cards are drawn or die beneath it.
        this.pileView.render(state);

        // The opponent's turn is only picked up here — the one place the board is guaranteed to
        // actually reflect state.phase === MainIdle — rather than off the phase-change event
        // itself, since that event can fire well before any in-flight animation has drained.
        if (state.phase === TurnPhase.MainIdle && state.activePlayer === 'opponent')
        {
            this.time.delayedCall(600, () => this.runOpponentTurn());
        }
    }

    private clearRendered (): void
    {
        this.helpBoxController.hideHelpBox();
        this.pileView.clear();
        for (const obj of this.renderedObjects) obj.destroy();
        this.renderedObjects = [];
        this.cardInstanceByContainer.clear();
        this.handSlots.clear();
        this.handPeekZones.clear();
        this.instanceContainers.clear();
        this.heroContainers.clear();
    }

    private describePhase (state: GameState): string
    {
        if (state.phase === TurnPhase.GameOver)
        {
            return state.winner === 'player' ? 'You win!' : 'You lose!';
        }
        const whoseTurn = state.activePlayer === 'player' ? 'Your' : "Opponent's";
        if (state.phase === TurnPhase.AwaitingTarget) return `${whoseTurn} turn — choose a target`;
        return `${whoseTurn} turn (Turn ${state.turnNumber})`;
    }

    /** Shared spacing/start-x math for a horizontal row of `count` cards centered on CENTER_X, used by both the hand and board rows (and by the played-card/draw animations to predict a card's resting slot ahead of the next real render). */
    private rowLayout (count: number, maxGap: number): { spacing: number; startX: number }
    {
        const spacing = Math.min(CARD_W + maxGap, BOARD_ZONE_W / count);
        const startX = CENTER_X - ((count - 1) * spacing) / 2;
        return { spacing, startX };
    }

    /**
     * Hand-specific row layout — kept separate from `rowLayout` (which still serves the board's
     * cost-badge-less 'simplified' cards untouched) because a hand needs an anti-crowding floor:
     * once even-spread spacing would drop below HAND_MIN_SPACING, further shrinking it starts
     * covering a card's cost badge (see that constant's doc comment in cardLayout.ts) — no
     * z-order fix avoids that, so instead the whole row scales down uniformly around CENTER_X,
     * preserving the spacing:CARD_W ratio (and therefore corner clearance) at any hand size.
     */
    private handRowLayout (count: number): { spacing: number; startX: number; scale: number }
    {
        const footprint = (count - 1) * HAND_MIN_SPACING + CARD_W;
        const scale = Math.min(1, BOARD_ZONE_W / footprint);
        return { spacing: HAND_MIN_SPACING * scale, startX: CENTER_X - ((count - 1) * HAND_MIN_SPACING * scale) / 2, scale };
    }

    /**
     * A hand card's own applied rotation at index `index` of `count` — the fan's only shape
     * input (see cardLayout.ts's HAND_ARC_* block). `liftSign` flips its sign for the opponent,
     * matching handCardSlot's edge-chain direction (see there).
     */
    private handCardRotation (index: number, count: number, liftSign: 1 | -1): number
    {
        const mid = (count - 1) / 2;
        const rawDeg = (index - mid) * HAND_ARC_ANGLE_STEP_DEG;
        const deg = Math.max(-HAND_ARC_MAX_ANGLE_DEG, Math.min(HAND_ARC_MAX_ANGLE_DEG, rawDeg));
        const theta = (deg * Math.PI) / 180;
        return liftSign === 1 ? theta : -theta;
    }

    /**
     * A hand card's idle "slot" — its arced position/rotation for index `index` of `count`,
     * given `layout` (from handRowLayout) and the row's flush poke edge Y. `liftSign` is `+1`
     * for the player (bottom edge, lift rises off it) and `-1` for the opponent (top edge, lift
     * drops past it). Shared by renderHand (idle layout), playDrawAnimation (sibling re-tween /
     * fly-in destination), and indirectly by peek/dragend restore via the handSlots map
     * renderHand populates from this.
     *
     * Positions cards as a "hinge chain": each card's own visible edge (top edge for the player,
     * bottom edge for the opponent — whichever one is actually poking into view) is CARD_W long
     * and runs in the direction its own rotation points it, and each card's edge starts exactly
     * where the previous card's edge ends — like a real fanned hand of cards, so neighboring
     * cards' corners always meet with no seam, at any hand size or rotation. `x` still comes from
     * the flat per-index spacing (handRowLayout) — only `y` needs the chain, since the seam this
     * fixes is purely vertical (a card's rotation swings its own corners up/down relative to a
     * flat-spaced neighbor, not sideways by any visible amount).
     *
     * `edgeChainOffset(i)` is the unanchored, cumulative Y position of the chain's `i`-th joint
     * (the point shared by card `i-1`'s trailing corner and card `i`'s leading corner), built by
     * summing each card's own edge-segment Y-delta (`CARD_W * sin(rotation)`) in turn — computed
     * fresh per call since a hand is always small enough that this is cheap, and it keeps every
     * call site above (all of which already call this once per card, per index) unchanged.
     * `K` is the joint that sits at the fan's own center — the hinge between the two center cards
     * for an even hand, or the exact center card's own (upright, zero-rotation) edge for an odd
     * one — which is what HAND_ARC_LIFT's amplitude anchors to, matching the old code's "how high
     * the hand's center reaches" meaning even though the shape underneath it is now derived
     * differently.
     */
    private handCardSlot (index: number, count: number, layout: { spacing: number; startX: number; scale: number }, edgeY: number, liftSign: 1 | -1): HandSlot
    {
        const x = layout.startX + index * layout.spacing;
        const cardW = CARD_W * layout.scale;
        const cardH = CARD_H * layout.scale;

        const edgeChainOffset = (i: number): number =>
        {
            let offset = 0;
            for (let k = 0; k < i; k++) offset += cardW * Math.sin(this.handCardRotation(k, count, liftSign));
            return offset;
        };

        const rotation = this.handCardRotation(index, count, liftSign);
        const anchorTarget = edgeY - liftSign * HAND_ARC_LIFT * layout.scale;
        const shift = anchorTarget - edgeChainOffset(Math.floor(count / 2));

        const y = edgeChainOffset(index) + shift + (cardW / 2) * Math.sin(rotation) + liftSign * (cardH / 2) * Math.cos(rotation);
        return { x, y, rotation, scale: layout.scale, depth: index };
    }

    private renderHero (id: PlayerId, y: number): void
    {
        const state = this.machine.state;
        const container = this.add.container(CENTER_X, y);
        container.setDepth(HERO_DEPTH);

        // Active player's turn is shown by the circle's own fill shimmering yellow instead of its
        // usual flat color, rather than a border glow — a stroke-only circle layered on top keeps
        // the same white ring the flat-fill case also has.
        const isActivePlayer = state.activePlayer === id;
        if (isActivePlayer)
        {
            this.addShimmeringFill(container, HERO_RADIUS, OUTLINE_COLOR_TARGETABLE);
            container.add(this.add.circle(0, 0, HERO_RADIUS, 0x000000, 0).setStrokeStyle(2, 0xffffff));
        }
        else
        {
            container.add(this.add.circle(0, 0, HERO_RADIUS, id === 'player' ? 0x2f6fed : 0xb0413e).setStrokeStyle(2, 0xffffff));
        }
        const healthLabel = this.add.text(0, 0, `${state.players[id].health}`, HERO_HP_STYLE).setOrigin(0.5);
        container.add(healthLabel);
        container.setSize(HERO_SIZE, HERO_SIZE);
        // Container hit-testing shifts the local point by +displayOriginX/Y (= width/2, height/2 for a
        // Container) before testing it against the hit area, so a hit area centered on the visuals at
        // local (0,0) must itself be defined centered on (width/2, height/2), not on (0,0).
        container.setInteractive(new Geom.Circle(HERO_RADIUS, HERO_RADIUS, HERO_RADIUS), Geom.Circle.Contains);

        this.heroContainers.set(id, container);

        // pendingTarget's owner is always state.activePlayer (beginTargeting is only ever called
        // from playCard/declareAttack on the active player's own card) — gating on that here stops
        // the human from resolving the opponent's pending target (or vice versa) by clicking through
        // it, which is otherwise indistinguishable from a legitimate target prompt for either side.
        const isValidTarget =
            state.phase === TurnPhase.AwaitingTarget &&
            state.activePlayer === 'player' &&
            state.pendingTarget?.validTargetIds.includes(id);
        if (isValidTarget)
        {
            this.addShimmeringOutline(container, HERO_SIZE, HERO_SIZE, OUTLINE_COLOR_TARGETABLE);
            container.on('pointerup', this.guarded(() => this.machine.selectTarget(id)));
        }

        this.renderedObjects.push(container);
    }

    /**
     * Small stacked pile with a card-count readout centered over it, for either off-board zone.
     * Doubles as the origin point draw animations fly from (see deckPilePosition) and as the click
     * target that opens the pile-inspect overlay.
     */
    private renderPile (playerState: PlayerState, zone: PileZone, y: number): void
    {
        const style = PILE_STYLES[zone];
        const cards = getPileCards(playerState, zone);
        const container = this.add.container(PILE_X, y);

        // An empty pile still draws one faded card outline rather than nothing, so the zone keeps
        // its slot in the column and stays clickable (an empty graveyard is the normal opening state).
        // Only the deck pile uses the card-back texture — a deck is genuinely face-down, unlike a
        // graveyard, which stays on the plain colored-rectangle stack it always had.
        const showCardBack = zone === 'deck' && this.textures.exists(CARD_BACK_KEY);
        const layers = Math.min(3, Math.max(1, cards.length));
        for (let i = 0; i < layers; i++)
        {
            const offset = i * 4;
            let card: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
            if (showCardBack)
            {
                card = this.add.image(-offset, -offset, CARD_BACK_KEY);
                coverFit(card, DECK_PILE_W, DECK_PILE_H);
            }
            else
            {
                card = this.add.rectangle(-offset, -offset, DECK_PILE_W, DECK_PILE_H, style.fill).setStrokeStyle(2, style.stroke);
            }
            if (cards.length === 0) card.setAlpha(0.3);
            container.add(card);
        }

        // Centered on top of the stack rather than below it, now that there's no zone label above
        // competing for the spot.
        container.add(this.add.text(0, 0, `${cards.length}`, statStyle('#ffffff', true, '22px')).setOrigin(0.5));

        // Hit region is deliberately generous enough to cover the stack's offset corner. Top-left-
        // based per the Container hit-area rule (see renderHero).
        const hitW = DECK_PILE_W + 16;
        const hitH = DECK_PILE_H + 16;
        container.setSize(hitW, hitH);
        container.setInteractive({
            hitArea: new Geom.Rectangle(0, 0, hitW, hitH),
            hitAreaCallback: Geom.Rectangle.Contains,
            useHandCursor: true,
        });
        let hoverShimmer: { destroy: () => void } | null = null;
        container.on('pointerover', () =>
        {
            hoverShimmer = this.addShimmeringOutline(container, DECK_PILE_W + 16, DECK_PILE_H + 16, OUTLINE_COLOR_HOVER);
        });
        container.on('pointerout', () =>
        {
            hoverShimmer?.destroy();
            hoverShimmer = null;
        });
        // Deliberately not guarded(): opening a read-only pile view mutates no game state, so
        // there is no reason to swallow the click just because an animation is in flight.
        container.on('pointerup', () => this.pileView.open(playerState.id, zone, this.machine.state));

        this.renderedObjects.push(container);
    }

    private renderHand (playerState: PlayerState, y: number, faceDown: boolean): void
    {
        const cards = playerState.hand;
        if (cards.length === 0) return;

        const state = this.machine.state;
        const isMyTurn = !faceDown && playerState.id === 'player' && state.activePlayer === 'player';

        // A card the player pulled out of hand and is holding at the spotlight while picking a
        // target (see TurnStateMachine's 'state:target-begin'/'state:target-cancelled' emits and
        // playTargetBeginAnimation/playTargetCancelledAnimation below) — rendered separately further
        // down instead of taking a normal fan slot, only for the human's own hand. The opponent AI
        // can pass through AwaitingTarget too, but it resolves synchronously in the same call and
        // its hand is always face-down, so it never needs this staged visual.
        const heldInstanceId =
            !faceDown && playerState.id === 'player' && state.phase === TurnPhase.AwaitingTarget
                ? state.pendingTarget?.sourceInstanceId
                : undefined;
        const heldCard = heldInstanceId ? cards.find((c) => c.instanceId === heldInstanceId) : undefined;
        const fanCards = heldCard ? cards.filter((c) => c.instanceId !== heldInstanceId) : cards;

        const layout = this.handRowLayout(fanCards.length);
        // +1 (player, bottom edge): lift rises off the poke edge. -1 (opponent, top edge): lift
        // drops past it — mirrored fan, see handCardSlot/HAND_ARC_* in cardLayout.ts.
        const liftSign: 1 | -1 = faceDown ? -1 : 1;

        fanCards.forEach((instance, index) =>
        {
            const container = this.cardView.createCardContainer(instance, faceDown ? 'faceDown' : 'full');
            const slot = this.handCardSlot(index, fanCards.length, layout, y, liftSign);
            container.setPosition(slot.x, slot.y);
            container.setRotation(slot.rotation);
            container.setScale(slot.scale);
            container.setDepth(slot.depth);
            this.renderedObjects.push(container);
            this.instanceContainers.set(instance.instanceId, container);

            if (faceDown) return;

            container.setInteractive(
                // See the comment in renderHero — Container hit-testing shifts the point by
                // +width/2, +height/2 first, so this must be top-left-based (0,0), not centered.
                new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                Geom.Rectangle.Contains
            );
            // 'full' mode cards already print their cost on-card — no need for the tooltip to repeat it.
            this.helpBoxController.attachKeywordHover(container, instance, false);

            // Every hand card (not just currently-playable ones) gets an idle slot and can peek —
            // it's a read-only "let me see this clearly" affordance, independent of playability,
            // same spirit as the keyword tooltip above having no turn/phase gating either.
            this.handSlots.set(container, slot);

            const peekIn = () =>
            {
                // draggedContainer only covers the *active* drag — a card that was just released
                // (dragend clears draggedContainer immediately) can still have a queued animation
                // flying it elsewhere (e.g. playTargetBeginAnimation's spotlight hold), so isAnimating
                // is checked too: without it, a stray pointerover/pointerout from the mouse merely
                // moving away after drop killTweensOf's that in-flight tween — which, if something is
                // awaiting it (tweenPromise), never resolves, permanently stranding isAnimating true
                // and silently swallowing every future click via guarded(). Confirmed live: dragging a
                // targeted spell/minion out then immediately moving toward the Cancel button reliably
                // triggered exactly this softlock before this guard was added.
                if (container === this.draggedContainer || this.isAnimating) return;
                this.tweens.killTweensOf(container);
                this.tweens.add({
                    targets: container, y: PLAYER_HAND_PEEK_Y, rotation: 0, duration: 150, ease: 'Cubic.easeOut',
                    // Keeps the keyword tooltip (anchored to this card's bounds at hover-start,
                    // before this tween moves it) tracking the card as it rises, instead of staying
                    // pinned to the card's pre-peek position near the bottom of the screen.
                    onUpdate: () => this.helpBoxController.refreshPosition(container),
                });
                container.setDepth(HAND_PEEK_DEPTH);
            };
            const peekOut = () =>
            {
                // See peekIn's comment above — same reasoning applies here.
                if (container === this.draggedContainer || this.isAnimating) return;
                this.tweens.killTweensOf(container);
                const idleSlot = this.handSlots.get(container)!;
                this.tweens.add({ targets: container, y: idleSlot.y, rotation: idleSlot.rotation, duration: 150, ease: 'Cubic.easeOut' });
                container.setDepth(idleSlot.depth);
            };
            // Peek hover is driven entirely by the scene-level 'pointermove' listener in create(),
            // which walks handPeekZones and calls peekIn/peekOut on state transitions — deliberately
            // NOT by Phaser's own pointerover/pointerout on either the card or a separate zone
            // GameObject. Both were tried and both broke: wiring only a zone below the card left the
            // card's own footprint (the majority of the hoverable area) dead, because Phaser's default
            // topOnly input priority means the higher card always wins that overlap and the zone
            // underneath never sees an event there; wiring the card directly on top of the zone fixed
            // that but reintroduced pointerout events firing (or failing to fire) based on whichever
            // object happened to be topmost at each instant as the card's own hit area moved during
            // the tween, which got the card stuck permanently peeked once a pointerout was missed on
            // the way out. A manual rectangle check against the pointer's real, current world position
            // — bypassing GameObject hit-testing and topOnly altogether — is the only source of truth
            // that stays correct regardless of where the card's hit area currently is mid-animation.
            // Bounds span the card's full idle-to-peeked travel range (down through where it pokes
            // off-screen, up through PLAYER_HAND_PEEK_Y) plus HAND_PEEK_HOVER_MARGIN of breathing room
            // on top, and the original 10% width allowance for a forgiving trigger on an overlapped
            // idle card.
            const peekHalfW = (CARD_W * slot.scale * 1.1) / 2;
            this.handPeekZones.set(container, {
                left: slot.x - peekHalfW,
                right: slot.x + peekHalfW,
                top: PLAYER_HAND_PEEK_Y - (CARD_H / 2) * slot.scale - HAND_PEEK_HOVER_MARGIN,
                bottom: slot.y + (CARD_H / 2) * slot.scale + HAND_PEEK_HOVER_MARGIN,
                peeked: false,
                peekIn,
                peekOut,
            });

            if (!isMyTurn || state.phase !== TurnPhase.MainIdle) return;

            const definition = CARD_DEFINITIONS[instance.definitionId];
            if (!definition || playerState.mana < definition.cost) return;

            // Playable: outline instead of the old dim-when-unaffordable treatment — every card
            // stays at full opacity regardless, this just marks the ones actionable right now.
            this.addShimmeringOutline(container, CARD_W, CARD_H, OUTLINE_COLOR_READY);

            // Minions and spells drag out identically — the drop location (anywhere but the hand,
            // see wireDragEvents) is what casts them, not a per-type click/drag split.
            this.cardInstanceByContainer.set(container, instance.instanceId);
            this.input.setDraggable(container);
        });

        if (heldCard)
        {
            const container = this.cardView.createCardContainer(heldCard, 'full');
            container.setPosition(SPOTLIGHT_X, CENTER_Y);
            container.setScale(1.25);
            container.setDepth(2500);
            this.renderedObjects.push(container);
            this.instanceContainers.set(heldCard.instanceId, container);
            this.addShimmeringOutline(container, CARD_W, CARD_H, OUTLINE_COLOR_TARGETABLE);
            // No interactivity: this card is mid-cast — the player backs out via the Cancel button.
        }
    }

    private renderBoard (ownerId: PlayerId, playerState: PlayerState, y: number): void
    {
        const cards = playerState.board;
        if (cards.length === 0) return;

        const { spacing, startX } = this.rowLayout(cards.length, 25);
        const state = this.machine.state;

        cards.forEach((instance, index) =>
        {
            const isSummoningSick = ownerId === 'player' && instance.summoningSick && !hasKeyword(instance, 'charge');
            // Unlike summoning sickness (only meaningful for the player's own board — it's about
            // whether *you* can act with this card), frozen is informative for either side: an
            // enemy minion frozen by e.g. Glacial Grasp can't attack either, and the player needs
            // to see that.
            const isFrozen = instance.frozen;

            const container = this.cardView.createCardContainer(instance, 'simplified', undefined, isSummoningSick, isFrozen);
            container.setPosition(startX + index * spacing, y);
            this.renderedObjects.push(container);
            this.instanceContainers.set(instance.instanceId, container);

            container.setInteractive(
                // See the comment in renderHero — Container hit-testing shifts the point by
                // +width/2, +height/2 first, so this must be top-left-based (0,0), not centered.
                new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                Geom.Rectangle.Contains
            );
            // 'simplified' mode never prints cost on-card — the tooltip is the only place to see it.
            this.helpBoxController.attachKeywordHover(container, instance, true);

            // See the matching comment in renderHero — only the player whose pending action this is
            // (always state.activePlayer) may resolve its target.
            const isValidTarget =
                state.phase === TurnPhase.AwaitingTarget &&
                state.activePlayer === 'player' &&
                state.pendingTarget?.validTargetIds.includes(instance.instanceId);
            const canAttack =
                state.phase === TurnPhase.MainIdle &&
                ownerId === 'player' &&
                state.activePlayer === 'player' &&
                canDeclareAttack(instance);

            if (isValidTarget)
            {
                this.addShimmeringOutline(container, CARD_W, CARD_H, OUTLINE_COLOR_TARGETABLE);
                container.on('pointerup', this.guarded(() => this.machine.selectTarget(instance.instanceId)));
            }
            else if (canAttack)
            {
                this.addShimmeringOutline(container, CARD_W, CARD_H, OUTLINE_COLOR_READY);
                container.on('pointerup', this.guarded(() => this.machine.declareAttack(instance.instanceId)));
            }
            else
            {
                // Both branches below can fire together (a minion can be frozen AND summoning-sick) —
                // see CLAUDE.md's "silent state-machine rejection" gotcha for why every reason a
                // minion can't act needs its own cue, not just the first one checked.
                if (isSummoningSick) this.addStaticOutline(container, CARD_W, CARD_H, OUTLINE_COLOR_SICK);
                if (isFrozen) this.addStaticOutline(container, CARD_W, CARD_H, OUTLINE_COLOR_FROZEN, isSummoningSick ? 10 : 5);
            }
        });
    }

    private updateEndTurnButton (state: GameState): void
    {
        const enabled = state.activePlayer === 'player' && state.phase === TurnPhase.MainIdle;
        this.endTurnButton.setAlpha(enabled ? 1 : 0.4);
        if (enabled) this.endTurnButton.setInteractive({ useHandCursor: true });
        else this.endTurnButton.disableInteractive();
    }

    private updateCancelButton (state: GameState): void
    {
        this.cancelButton.setVisible(state.phase === TurnPhase.AwaitingTarget);
    }

    private showGameOver (winner?: PlayerId): void
    {
        const overlay = this.add.rectangle(CENTER_X, CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.6);
        const label = this.add.text(CENTER_X, 478, winner === 'player' ? 'Victory!' : 'Defeat', {
            fontFamily: 'Arial Black', fontSize: 90, color: '#ffffff',
            stroke: '#000000', strokeThickness: 11, align: 'center'
        }).setOrigin(0.5);
        const button = this.add.text(CENTER_X, 591, 'Play Again', {
            fontFamily: 'Arial', fontSize: '32px', color: '#ffffff', backgroundColor: '#3a4a6b'
        }).setOrigin(0.5).setPadding(20, 10, 20, 10).setInteractive({ useHandCursor: true });
        button.on('pointerup', () => this.scene.restart());

        this.renderedObjects.push(overlay, label, button);
    }

    /**
     * Draws a colored border whose own material sweeps light→bright→light along the bottom-left→
     * top-right diagonal, twice in quick succession, then pauses, then repeats. Replaces the old
     * static outline for every highlight in this file — any future color variant is just a new call
     * with a different hex, via OUTLINE_COLOR_* in cardLayout.ts.
     *
     * The border is a Graphics frame (4 filled strips, not a Rectangle+strokeStyle) so each strip
     * can be painted with fillGradientStyle's per-corner colors — a WebGL-only Phaser feature this
     * project already relies on elsewhere (see CardView.ts's createHeaderGradient) since the AUTO
     * renderer type resolves to WebGL in real browsers. Every vertex's color is a pure function of
     * its (x, y) position (see `colorAt`), so shared corners between adjacent strips always compute
     * identically — no visible seam at the frame's 4 corners.
     *
     * The tween targets the frame GameObject directly via a plain custom `shimmerCycle` property
     * (0-1 progress through one full sweep-sweep-pause cycle) rather than a detached proxy object:
     * this file has no existing pattern for manually killing tweens on renderNow()'s teardown (see
     * clearRendered()), so every tween here — including this one — relies on Phaser's own
     * auto-cleanup, which only fires for a tween's direct GameObject target. A proxy target would
     * have no such lifecycle and leak one runaway repeat(-1) tween per historical outline for the
     * rest of the session. Driving the whole sweep-sweep-pause cycle off one repeating tween (rather
     * than chaining sweeps with time.delayedCall) keeps that same guarantee — a delayedCall timer
     * isn't a tween and isn't covered by the destroy cascade, so it would need its own manual
     * teardown wiring that nothing else in this file has.
     *
     * Returns a handle to tear the outline down early (stopping the tween and destroying the
     * frame) — every static-render call site here ignores it, relying on the auto-cleanup above,
     * but a transient hover highlight (see renderPile) needs to remove its shimmer on pointerout
     * without waiting for the next renderNow() teardown.
     */
    /** Plain, unanimated border frame — same w+10/h+10 default sizing convention as addShimmeringOutline (so it
     * reads as the same "outline" visual language) but drawn once with no tween, since these mark passive
     * statuses (summoning sickness, frozen) rather than something the player can act on right now. `margin`
     * lets two statuses that can both be true at once (a minion can be frozen AND summoning-sick) render as
     * concentric rings instead of one flat color silently overdrawing the other. */
    private addStaticOutline (container: Phaser.GameObjects.Container, width: number, height: number, color: number, margin = 5): void
    {
        const frame = this.add.graphics();
        frame.lineStyle(4, color, 1);
        frame.strokeRect(-width / 2 - margin, -height / 2 - margin, width + margin * 2, height + margin * 2);
        container.addAt(frame, 0);
    }

    private addShimmeringOutline (container: Phaser.GameObjects.Container, width: number, height: number, color: number): { destroy: () => void }
    {
        const w = width + 10, h = height + 10;
        const halfW = w / 2, halfH = h / 2;
        const strokeWidth = 4;

        // Diagonal axis (bottom-left → top-right) the shimmer sweeps along: project any frame vertex
        // onto a single 0..diagLen scalar, then measure the sweep's current peak against it.
        const diagLen = Math.hypot(w, h);
        const dirX = w / diagLen, dirY = -h / diagLen;
        const originX = -halfW, originY = halfH; // bottom-left corner == s(0)
        const project = (x: number, y: number) => (x - originX) * dirX + (y - originY) * dirY;

        const colorAt = (x: number, y: number, peakS: number | null): number =>
        {
            if (peakS === null) return color;
            const brightness = Math.max(0, 1 - Math.abs(project(x, y) - peakS) / SHIMMER_BAND_WIDTH);
            return lightenColor(color, brightness * SHIMMER_BRIGHTEN_AMOUNT);
        };

        const frame = this.add.graphics() as Phaser.GameObjects.Graphics & { shimmerCycle: number };
        frame.shimmerCycle = 0;
        container.addAt(frame, 0);

        const strips: [number, number, number, number][] = [
            [-halfW, -halfH, w, strokeWidth], // top
            [-halfW, halfH - strokeWidth, w, strokeWidth], // bottom
            [-halfW, -halfH, strokeWidth, h], // left
            [halfW - strokeWidth, -halfH, strokeWidth, h], // right
        ];
        const drawFrame = (peakS: number | null) =>
        {
            frame.clear();
            for (const [x, y, sw, sh] of strips)
            {
                frame.fillGradientStyle(
                    colorAt(x, y, peakS), colorAt(x + sw, y, peakS),
                    colorAt(x, y + sh, peakS), colorAt(x + sw, y + sh, peakS), 1
                );
                frame.fillRect(x, y, sw, sh);
            }
        };

        // One repeating tween drives the whole cycle: two quick sweeps (each SHIMMER_SWEEP_MS) back
        // to back, then a flat-color pause (SHIMMER_PAUSE_MS) before it loops.
        const redraw = () => drawFrame(this.shimmerPeakAt(frame.shimmerCycle, diagLen));

        drawFrame(null);
        const cycleMs = SHIMMER_SWEEP_MS * 2 + SHIMMER_PAUSE_MS;
        const tween = this.tweens.add({ targets: frame, shimmerCycle: 1, duration: cycleMs, repeat: -1, ease: 'Linear', onUpdate: redraw });
        // Random phase so multiple simultaneous shimmers (e.g. several attackable minions at once)
        // don't all sweep in lockstep. seek() takes ms (not the old 0-1 fraction) and doesn't fire
        // onUpdate while fast-forwarding, so redraw() once more manually right after — otherwise the
        // frame sits at its cycle-start appearance for up to a frame, and this spawn path recurs
        // constantly (renderNow() reruns on every state change, and every ~600ms during the
        // opponent's turn), so it's worth the extra line rather than a once-off cosmetic nit.
        tween.seek(Math.random() * cycleMs);
        redraw();

        return { destroy: () => { tween.stop(); frame.destroy(); } };
    }

    /**
     * Where the shimmer's bright band currently sits along a diagonal of length `diagLen`, given
     * `cycleT` (0-1 progress through addShimmeringOutline/addShimmeringFill's shared sweep-sweep-
     * pause cycle) — shared so both methods' redraw loops stay in step with the same timing.
     */
    private shimmerPeakAt (cycleT: number, diagLen: number): number | null
    {
        const sweepFrac = SHIMMER_SWEEP_MS / (SHIMMER_SWEEP_MS * 2 + SHIMMER_PAUSE_MS);
        if (cycleT < sweepFrac) return -SHIMMER_BAND_WIDTH + (diagLen + SHIMMER_BAND_WIDTH * 2) * (cycleT / sweepFrac);
        if (cycleT < sweepFrac * 2) return -SHIMMER_BAND_WIDTH + (diagLen + SHIMMER_BAND_WIDTH * 2) * ((cycleT - sweepFrac) / sweepFrac);
        return null;
    }

    /**
     * Same shimmer sweep as addShimmeringOutline, but filling a solid disc rather than tracing a
     * border — used for the active player's hero circle, whose own fill shimmers instead of
     * getting an outline glow. Phaser's gradient fill only interpolates cleanly across a single
     * quad (see addShimmeringOutline's per-strip fillRect calls); a circle has no such quad, so
     * this instead triangulates the disc into pie slices from its center and fills each slice with
     * a single flat color sampled at its midpoint — enough slices reads as a smooth sweep at this
     * circle's size, in the same spirit as the border's own 4-strip approximation of a continuous
     * gradient.
     */
    private addShimmeringFill (container: Phaser.GameObjects.Container, radius: number, color: number): { destroy: () => void }
    {
        const sliceCount = 40;

        // Diagonal axis (bottom-left → top-right) of the disc's bounding square — same convention
        // as addShimmeringOutline's `project`.
        const diagLen = radius * 2 * Math.SQRT2;
        const dirX = Math.SQRT1_2, dirY = -Math.SQRT1_2;
        const originX = -radius, originY = radius;
        const project = (x: number, y: number) => (x - originX) * dirX + (y - originY) * dirY;

        const colorAt = (x: number, y: number, peakS: number | null): number =>
        {
            if (peakS === null) return color;
            const brightness = Math.max(0, 1 - Math.abs(project(x, y) - peakS) / SHIMMER_BAND_WIDTH);
            return lightenColor(color, brightness * SHIMMER_BRIGHTEN_AMOUNT);
        };

        const disc = this.add.graphics() as Phaser.GameObjects.Graphics & { shimmerCycle: number };
        disc.shimmerCycle = 0;
        container.addAt(disc, 0);

        const drawDisc = (peakS: number | null) =>
        {
            disc.clear();
            for (let i = 0; i < sliceCount; i++)
            {
                const a0 = (i / sliceCount) * Math.PI * 2;
                const a1 = ((i + 1) / sliceCount) * Math.PI * 2;
                const x1 = Math.cos(a0) * radius, y1 = Math.sin(a0) * radius;
                const x2 = Math.cos(a1) * radius, y2 = Math.sin(a1) * radius;
                disc.fillStyle(colorAt((x1 + x2) / 2, (y1 + y2) / 2, peakS), 1);
                disc.fillTriangle(0, 0, x1, y1, x2, y2);
            }
        };

        const redraw = () => drawDisc(this.shimmerPeakAt(disc.shimmerCycle, diagLen));

        drawDisc(null);
        const cycleMs = SHIMMER_SWEEP_MS * 2 + SHIMMER_PAUSE_MS;
        const tween = this.tweens.add({ targets: disc, shimmerCycle: 1, duration: cycleMs, repeat: -1, ease: 'Linear', onUpdate: redraw });
        tween.seek(Math.random() * cycleMs);
        redraw();

        return { destroy: () => { tween.stop(); disc.destroy(); } };
    }
}
