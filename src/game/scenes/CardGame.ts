import { Geom, Scene } from 'phaser';

import { decideOpponentAction } from '../ai/OpponentAI';
import { CARD_DEFINITIONS } from '../data/cards';
import { generateDeck } from '../data/deckGenerator';
import { KEYWORD_METADATA } from '../data/keywordMetadata';
import { EventBus } from '../EventBus';
import { canDeclareAttack, hasKeyword } from '../state/keywordRules';
import { createInitialState } from '../state/createInitialState';
import { TurnStateMachine } from '../state/TurnStateMachine';
import type { CardInstance } from '../types/Card';
import type { PlayerId } from '../types/common';
import type { GameState, PlayerState } from '../types/GameState';
import { TurnPhase } from '../types/GameState';

// Base game resolution — must match the `width`/`height` in game/main.ts's Scale config.
const GAME_WIDTH = 1920;
const GAME_HEIGHT = 1080;
const CENTER_X = GAME_WIDTH / 2;
const CENTER_Y = GAME_HEIGHT / 2;

const CARD_W = 155;
const CARD_H = 220;
const HERO_RADIUS = 28;
const HERO_SIZE = HERO_RADIUS * 2;
const BOARD_ZONE_W = 1600;

// Row Y-positions are hand-tuned so hero/board rows and the two hand states below clear each
// other with a small gap given CARD_H/HERO_RADIUS above — see the git history of this file if
// those change again.
//
// Hands no longer occupy a permanent dedicated row. Each hand rests "poked" against its owner's
// screen edge — card center pinned exactly on the edge, so only the CARD_H/2 half that's on-screen
// is visible (Phaser/the canvas clips the rest for free, no mask needed) — and its owner's hero
// overlaps that poke, drawn on top via HERO_DEPTH, like the hero is standing in front of a mostly
// tucked-away fan of cards. The opponent's hand *only* ever exists in this poked state (see the
// "twist" in wirePlayerHandPeekEvents — hovering it does nothing). The player's hand additionally has a
// "peeked" state, entered by hovering the trigger band below the battlefield (see
// PEEK_TRIGGER_*): the hand rises to PLAYER_HAND_PEEK_Y (fully visible) and the hero rises off the
// poke to PLAYER_HERO_PEEK_Y (just clear of the battlefield) so neither obscures the other. Both
// are derived from PLAYER_BOARD_Y (via PEEK_GAP) so the peeked hand+hero always fit exactly
// between the board and the bottom edge: 767 (board bottom) + 14 (gap) + 56 (hero) + 14 (gap) +
// 220 (hand) + 9 (margin) = 1080.
//
// Freeing the opponent's hand from its own row lets OPPONENT_BOARD_Y move up (it no longer needs
// to clear a full hand row below the opponent's hero), which in turn opens up a deliberately
// generous gap between the two boards — the freed space's biggest single beneficiary, giving the
// battlefield itself more visual weight instead of the two rows sitting seam-to-seam.
const OPPONENT_HERO_Y = 37;
const OPPONENT_HAND_Y = 0; // poked flush against the top edge — always, see above
const OPPONENT_BOARD_Y = 265;
const PLAYER_BOARD_Y = 657;
const PLAYER_HAND_POKE_Y = GAME_HEIGHT; // poked flush against the bottom edge
const PLAYER_HERO_Y = 1043; // idle, i.e. poked-hand state

const PEEK_GAP = 14;
const PLAYER_HERO_PEEK_Y = PLAYER_BOARD_Y + CARD_H / 2 + PEEK_GAP + HERO_RADIUS;
const PLAYER_HAND_PEEK_Y = PLAYER_HERO_PEEK_Y + HERO_RADIUS + PEEK_GAP + CARD_H / 2;

// Hero containers must out-rank hand containers' depth (hand fans out over 0..handSize-1 — see
// renderHand) so each hero visually sits in front of its own poked hand rather than being
// half-buried under it, while staying well clear of drag(1000)/animation depths above.
const HERO_DEPTH = 100;

// Hovering this band under the battlefield toggles the player's hand between poked and peeked
// (see wirePlayerHandPeekEvents). It's exactly the row-layout footprint (rowLayout's BOARD_ZONE_W-wide
// span) from the board's bottom edge down to the screen edge, so it naturally covers the poke
// sliver, the fully peeked hand, and the peeked hero without also catching the End Turn/Cancel
// buttons or the deck/graveyard piles, which all live further out at PILE_X.
const PEEK_TRIGGER_Y = PLAYER_BOARD_Y + CARD_H / 2;
const PEEK_TRIGGER_X_MIN = CENTER_X - BOARD_ZONE_W / 2;
const PEEK_TRIGGER_X_MAX = CENTER_X + BOARD_ZONE_W / 2;

// Deck/graveyard piles share the end-turn/cancel buttons' column, offset further right so hand
// cards (which can extend close to x=1760 at max hand size) never overlap them.
const PILE_X = 1860;
const OPPONENT_DECK_Y = 300;
const PLAYER_DECK_Y = 750;
const DECK_PILE_W = 80;
const DECK_PILE_H = 100;

// Each player's graveyard sits one row from its own deck, on that player's side of the column:
// the player's below its deck, the opponent's above its deck. PILE_ROW_GAP has to clear a pile's
// *full* drawn extent — the stack offset and zone label above it, the count label below it
// (~152px in total) — not merely DECK_PILE_H, or the two piles' labels overlap.
const PILE_ROW_GAP = 165;
const OPPONENT_GRAVEYARD_Y = OPPONENT_DECK_Y - PILE_ROW_GAP;
const PLAYER_GRAVEYARD_Y = PLAYER_DECK_Y + PILE_ROW_GAP;

// Click-a-pile-to-inspect overlay. Depth sits above every in-game depth — including the 3000 an
// in-flight draw animation uses — so the overlay stays readable if a pile is opened mid-animation.
const PILE_VIEW_DEPTH = 5000;
const PILE_VIEW_MAX_COLUMNS = 8;
const PILE_VIEW_GAP = 22;
const PILE_VIEW_TOP = 150;
const PILE_VIEW_BOTTOM = 1020;

// Where a played card is held for a beat before flying to its resting place.
const SPOTLIGHT_X = 260;

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '14px', color: '#ffffff', align: 'left' };
const RULE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '10px', color: '#b8c4d9', fontStyle: 'italic', align: 'center' };
const SMALL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '18px', color: '#ffffff' };
const PILE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '12px', color: '#9aa7bd' };
const COST_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '19px', color: '#ffffff' };
const TYPE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '11px', color: '#9aa7bd', fontStyle: 'bold' };
const KEYWORD_LABEL_BASE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '11px', fontStyle: 'bold' };
const MISSING_ASSET_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '10px', color: '#888888', align: 'center' };

// Card art zone: ~65% of CARD_H, inset from the card's edges — shared by the art image/fallback
// box and by the attack/health badges, which anchor to the art's bottom corners, not the card's.
const ART_W = CARD_W - 16;
const ART_H = Math.round(CARD_H * 0.65);
const ART_TOP = -CARD_H / 2 + 42;
const ART_BOTTOM = ART_TOP + ART_H;
const ART_CENTER_Y = ART_TOP + ART_H / 2;

/** The two off-board card zones that get a pile visual and a click-to-inspect overlay. */
type PileZone = 'deck' | 'graveyard';

function statStyle(color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Arial Black', fontSize: '20px', color };
}

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
 */
export class CardGame extends Scene
{
    private static readonly RENDERABLE_PHASES: ReadonlySet<TurnPhase> = new Set([
        TurnPhase.MainIdle,
        TurnPhase.AwaitingTarget,
        TurnPhase.GameOver,
    ]);

    /** Per-zone pile chrome. The deck keeps the card-back blue it has always used; the graveyard takes a desaturated maroon so the two read apart at a glance in the same column. */
    private static readonly PILE_STYLES: Record<PileZone, { fill: number; stroke: number; label: string; title: string }> = {
        deck: { fill: 0x24304a, stroke: 0x8fa8d6, label: 'DECK', title: 'Deck' },
        graveyard: { fill: 0x33262c, stroke: 0xc08a94, label: 'GRAVE', title: 'Graveyard' },
    };

    private machine!: TurnStateMachine;

    private renderedObjects: Phaser.GameObjects.GameObject[] = [];
    private cardInstanceByContainer = new Map<Phaser.GameObjects.Container, string>();
    // x only — a draggable hand card's y is always the current playerHandY(), so dragend re-reads
    // that live instead of risking a second, staler copy of it drifting out of sync.
    private originalPositions = new Map<Phaser.GameObjects.Container, number>();
    private instanceContainers = new Map<string, Phaser.GameObjects.Container>();
    private heroContainers = new Map<PlayerId, Phaser.GameObjects.Container>();

    private playerBoardZone!: Phaser.GameObjects.Zone;
    private turnBannerText!: Phaser.GameObjects.Text;
    private endTurnButton!: Phaser.GameObjects.Container;
    private cancelButton!: Phaser.GameObjects.Container;
    private helpBox!: Phaser.GameObjects.Container;
    private helpBoxBg!: Phaser.GameObjects.Rectangle;
    private helpBoxText!: Phaser.GameObjects.Text;
    private playerHealthText!: Phaser.GameObjects.Text;
    private playerManaText!: Phaser.GameObjects.Text;
    private opponentHealthText!: Phaser.GameObjects.Text;
    private opponentManaText!: Phaser.GameObjects.Text;

    // The pile-inspect overlay is tracked separately from renderedObjects: which pile is open is
    // *state* that has to survive a board rebuild (the opponent's turn rebuilds the board every
    // 600ms, which would otherwise snap the overlay shut mid-read), so renderNow() tears the
    // overlay down with everything else and then repaints it from openPileView at its tail.
    private pileViewObjects: Phaser.GameObjects.GameObject[] = [];
    private openPileView?: { playerId: PlayerId; zone: PileZone };

    // Whether the player's hand is currently peeked (raised, fully visible) vs. its default poked
    // state — see the big comment above PLAYER_HAND_POKE_Y. Persists across renderNow() rebuilds
    // the same way openPileView does, so a mid-peek board rebuild (e.g. a card drawn) repaints the
    // hand/hero in the right state instead of snapping back to poked.
    private handPeekActive = false;

    // The hand card currently being dragged, if any — excluded from setHandPeek's batched tween
    // (see there) so a peek toggle firing mid-drag (dragging through/past PEEK_TRIGGER_Y is the
    // common case, since the board sits above it) can't fight the drag handler's own per-pointermove
    // setPosition() on the same container. Without this the card visibly detached from the cursor,
    // stuttering between the tween's eased position and the drag's direct one every frame.
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
        // opponent that's always the face-down version. Swap in a face-up one for the reveal
        // so the player can actually see what was played, instead of spotlighting a card back.
        if (playerId === 'opponent')
        {
            const player = this.machine.state.players[playerId];
            const instance = player.board.find((c) => c.instanceId === instanceId)
                ?? player.graveyard.find((c) => c.instanceId === instanceId);
            if (instance)
            {
                const revealed = this.createCardContainer(instance, false);
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
     * computed hand slot, then promotes it into instanceContainers/renderedObjects as that card's
     * resting container instead of discarding it — a full renderNow() stays deferred for the
     * *entire* burst of opening-hand draws (they all queue back-to-back into one animating
     * session, see the class doc comment), so a discarded preview left nothing on screen between
     * draws. Sibling cards already resting in this hand are re-tweened to their updated slot first,
     * since a growing hand recenters the whole row (rowLayout's spacing/startX both shift with
     * count) — without that they'd sit at a stale pre-draw position until the eventual renderNow().
     */
    private async playDrawAnimation (playerId: PlayerId, instanceId: string): Promise<void>
    {
        const player = this.machine.state.players[playerId];
        const index = player.hand.findIndex((c) => c.instanceId === instanceId);
        if (index === -1) return;

        const faceDown = playerId === 'opponent';
        const { spacing, startX } = this.rowLayout(player.hand.length, 15);
        const destY = playerId === 'opponent' ? OPPONENT_HAND_Y : this.playerHandY();
        const destX = startX + index * spacing;

        player.hand.forEach((sibling, siblingIndex) =>
        {
            if (sibling.instanceId === instanceId) return;
            const container = this.instanceContainers.get(sibling.instanceId);
            if (!container) return;
            this.tweens.add({ targets: container, x: startX + siblingIndex * spacing, y: destY, duration: 250, ease: 'Cubic.easeOut' });
        });

        const origin = this.deckPilePosition(playerId);
        const flying = this.createCardContainer(player.hand[index], faceDown);
        flying.setPosition(origin.x, origin.y);
        flying.setDepth(3000);
        flying.setScale(0.6);

        await this.tweenPromise({ targets: flying, x: destX, y: destY, scale: 1, duration: 400, ease: 'Cubic.easeOut' });

        flying.setDepth(index);
        this.renderedObjects.push(flying);
        this.instanceContainers.set(instanceId, flying);
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
        // initializers do NOT re-run — reset the overlay state explicitly or a pile left open
        // when the game ended would reappear over the fresh board, holding dead references.
        this.pileViewObjects = [];
        this.openPileView = undefined;
        this.handPeekActive = false;

        this.add.rectangle(CENTER_X, CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x161b26);

        this.turnBannerText = this.add.text(38, 6, '', SMALL_STYLE).setDepth(200);

        this.opponentHealthText = this.add.text(38, 30, '', statStyle('#ff5c5c')).setDepth(200);
        this.opponentManaText = this.add.text(38, 54, '', statStyle('#5c9cff')).setDepth(200);

        this.playerHealthText = this.add.text(38, 1023, '', statStyle('#ff5c5c')).setDepth(200);
        this.playerManaText = this.add.text(38, 1049, '', statStyle('#5c9cff')).setDepth(200);

        const boardZoneH = CARD_H + 30;
        this.playerBoardZone = this.add.zone(CENTER_X, PLAYER_BOARD_Y, BOARD_ZONE_W, boardZoneH).setRectangleDropZone(BOARD_ZONE_W, boardZoneH);
        this.add.rectangle(CENTER_X, PLAYER_BOARD_Y, BOARD_ZONE_W, boardZoneH).setStrokeStyle(2, 0x3a4a6b, 0.6);

        this.createEndTurnButton();
        this.createCancelButton();
        this.createHelpBox();
        this.wireDragEvents();
        this.wireHelpBoxEvents();
        this.wirePlayerHandPeekEvents();
        this.input.keyboard?.on('keydown-ESC', () => this.closePileView());

        EventBus.on('state:phase-change', this.phaseChangeHandler);
        EventBus.on('state:card-drawn', this.cardDrawnHandler);
        EventBus.on('state:card-played', this.cardPlayedHandler);
        EventBus.on('state:attack', this.attackHandler);
        EventBus.on('state:card-died', this.cardDiedHandler);
        this.events.once('shutdown', () =>
        {
            EventBus.removeListener('state:phase-change', this.phaseChangeHandler);
            EventBus.removeListener('state:card-drawn', this.cardDrawnHandler);
            EventBus.removeListener('state:card-played', this.cardPlayedHandler);
            EventBus.removeListener('state:attack', this.attackHandler);
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
            container.setDepth(1000);
            this.draggedContainer = container;

            // The keyword tooltip that was showing for this card (hovering it is how the drag
            // started) would otherwise linger for the whole drag — pointerout never fires for the
            // dragged object since it stays centered under the pointer throughout.
            this.hideHelpBox();
        });

        this.input.on('drag', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dragX: number, dragY: number) =>
        {
            (gameObject as Phaser.GameObjects.Container).setPosition(dragX, dragY);
        });

        this.input.on('drop', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject, dropZone: Phaser.GameObjects.GameObject) =>
        {
            if (this.isAnimating) return;
            if (dropZone !== this.playerBoardZone) return;
            const instanceId = this.cardInstanceByContainer.get(gameObject as Phaser.GameObjects.Container);
            if (instanceId) this.machine.playCard(instanceId);
        });

        this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) =>
        {
            const container = gameObject as Phaser.GameObjects.Container;
            if (this.draggedContainer === container) this.draggedContainer = null;
            if (!container.active) return; // already destroyed by a re-render triggered from the drop above

            const originalX = this.originalPositions.get(container);
            if (originalX !== undefined) container.setPosition(originalX, this.playerHandY());
        });
    }

    private wireHelpBoxEvents (): void
    {
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
        {
            if (this.helpBox.visible) this.positionHelpBox(pointer.x, pointer.y);
        });
    }

    /** Current Y for the player's hero — PLAYER_HERO_PEEK_Y once peeked, PLAYER_HERO_Y (idle/poked) otherwise. */
    private playerHeroY (): number
    {
        return this.handPeekActive ? PLAYER_HERO_PEEK_Y : PLAYER_HERO_Y;
    }

    /** Current Y for the player's hand row — mirrors playerHeroY() for PLAYER_HAND_PEEK_Y/POKE_Y. */
    private playerHandY (): number
    {
        return this.handPeekActive ? PLAYER_HAND_PEEK_Y : PLAYER_HAND_POKE_Y;
    }

    /**
     * The player's hand toggles poked/peeked purely off cursor position within PEEK_TRIGGER_*
     * (see its comment) — deliberately not a Zone with pointerover/pointerout, since the player's
     * hero sits at a *higher* depth directly over part of that band (see HERO_DEPTH) and Phaser's
     * default topOnly input would let the hero swallow hover events in the overlap instead of
     * passing them through. Polling pointermove, like wireHelpBoxEvents does, sidesteps that
     * entirely. The opponent's hand has no equivalent wiring at all — that's the "nothing happens"
     * twist — so it only ever renders in its poked state.
     */
    private wirePlayerHandPeekEvents (): void
    {
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
        {
            const withinTrigger =
                pointer.x >= PEEK_TRIGGER_X_MIN && pointer.x <= PEEK_TRIGGER_X_MAX && pointer.y >= PEEK_TRIGGER_Y;
            this.setHandPeek(withinTrigger);
        });
    }

    /**
     * Flips handPeekActive and tweens the player's already-rendered hand containers and hero
     * container to their new poked/peeked target position in one batched tween per group. Only
     * used for the live hover transition — a renderNow() that happens mid-peek (e.g. a card drawn)
     * instead reads playerHeroY()/playerHandY() directly in renderHero/renderHand and paints the
     * right position immediately, no tween, the same way a mid-animation board rebuild always
     * paints the current true state rather than an old one.
     */
    private setHandPeek (active: boolean): void
    {
        if (this.handPeekActive === active) return;
        this.handPeekActive = active;

        const hero = this.heroContainers.get('player');
        if (hero) this.tweens.add({ targets: hero, y: this.playerHeroY(), duration: 220, ease: 'Cubic.easeOut' });

        const handY = this.playerHandY();
        const containers = this.machine.state.players.player.hand
            .map((instance) => this.instanceContainers.get(instance.instanceId))
            .filter((container): container is Phaser.GameObjects.Container => !!container && container !== this.draggedContainer);
        if (containers.length > 0) this.tweens.add({ targets: containers, y: handY, duration: 220, ease: 'Cubic.easeOut' });
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

    private createHelpBox (): void
    {
        this.helpBoxBg = this.add.rectangle(0, 0, 10, 10, 0x11151f, 0.95).setOrigin(0, 0).setStrokeStyle(1, 0x8fa8d6);
        this.helpBoxText = this.add.text(10, 10, '', {
            fontFamily: 'Arial', fontSize: '15px', color: '#ffffff', wordWrap: { width: 290 }
        }).setOrigin(0, 0);
        this.helpBox = this.add.container(0, 0, [this.helpBoxBg, this.helpBoxText]);
        // Above PILE_VIEW_DEPTH — cards inside the pile-inspect overlay keep their keyword hover,
        // so the tooltip has to clear the overlay it is being read on top of.
        this.helpBox.setDepth(PILE_VIEW_DEPTH + 100);
        this.helpBox.setVisible(false);
    }

    // --- render ------------------------------------------------------------------

    /** Banner text, health/mana readouts, and End Turn/Cancel button state — cheap, and safe to refresh immediately even while the heavy board rebuild below is deferred behind an in-flight animation. */
    private updateChrome (state: GameState): void
    {
        this.turnBannerText.setText(this.describePhase(state));

        this.opponentHealthText.setText(`❤ ${state.players.opponent.health}/${state.players.opponent.maxHealth}`);
        this.opponentManaText.setText(`♦ ${state.players.opponent.mana}/${state.players.opponent.maxMana}`);

        this.playerHealthText.setText(`❤ ${state.players.player.health}/${state.players.player.maxHealth}`);
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
        this.renderHero('player', this.playerHeroY());

        this.renderPile(state.players.opponent, 'graveyard', OPPONENT_GRAVEYARD_Y);
        this.renderPile(state.players.opponent, 'deck', OPPONENT_DECK_Y);
        this.renderPile(state.players.player, 'deck', PLAYER_DECK_Y);
        this.renderPile(state.players.player, 'graveyard', PLAYER_GRAVEYARD_Y);

        this.renderHand(state.players.opponent, OPPONENT_HAND_Y, true);
        this.renderHand(state.players.player, this.playerHandY(), false);

        this.renderBoard('opponent', state.players.opponent, OPPONENT_BOARD_Y);
        this.renderBoard('player', state.players.player, PLAYER_BOARD_Y);

        if (state.phase === TurnPhase.GameOver)
        {
            this.showGameOver(state.winner);
        }

        // Repaint last so the overlay lands on top of, and re-reads, the board just rebuilt above —
        // an open pile therefore keeps showing live contents as cards are drawn or die beneath it.
        this.renderPileView();

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
        this.hideHelpBox();
        this.clearPileView();
        for (const obj of this.renderedObjects) obj.destroy();
        this.renderedObjects = [];
        this.cardInstanceByContainer.clear();
        this.originalPositions.clear();
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

    private renderHero (id: PlayerId, y: number): void
    {
        const state = this.machine.state;
        const container = this.add.container(CENTER_X, y);
        container.setDepth(HERO_DEPTH);

        const circle = this.add.circle(0, 0, HERO_RADIUS, id === 'player' ? 0x2f6fed : 0xb0413e).setStrokeStyle(2, 0xffffff);
        const label = this.add.text(0, 0, id === 'player' ? 'You' : 'Opponent', SMALL_STYLE).setOrigin(0.5);
        container.add([circle, label]);
        container.setSize(HERO_SIZE, HERO_SIZE);
        // Container hit-testing shifts the local point by +displayOriginX/Y (= width/2, height/2 for a
        // Container) before testing it against the hit area, so a hit area centered on the visuals at
        // local (0,0) must itself be defined centered on (width/2, height/2), not on (0,0).
        container.setInteractive(new Geom.Circle(HERO_RADIUS, HERO_RADIUS, HERO_RADIUS), Geom.Circle.Contains);

        this.heroContainers.set(id, container);

        const isValidTarget = state.phase === TurnPhase.AwaitingTarget && state.pendingTarget?.validTargetIds.includes(id);
        if (isValidTarget)
        {
            this.addOutline(container, HERO_SIZE, HERO_SIZE, 0xffd23f);
            container.on('pointerup', this.guarded(() => this.machine.selectTarget(id)));
        }

        this.renderedObjects.push(container);
    }

    private pileCards (playerState: PlayerState, zone: PileZone): CardInstance[]
    {
        return zone === 'deck' ? playerState.deck : playerState.graveyard;
    }

    /**
     * Small stacked pile with a zone label above and a card-count label below, for either
     * off-board zone. Doubles as the origin point draw animations fly from (see deckPilePosition)
     * and as the click target that opens the pile-inspect overlay.
     */
    private renderPile (playerState: PlayerState, zone: PileZone, y: number): void
    {
        const style = CardGame.PILE_STYLES[zone];
        const cards = this.pileCards(playerState, zone);
        const container = this.add.container(PILE_X, y);

        container.add(this.add.text(0, -DECK_PILE_H / 2 - 22, style.label, PILE_LABEL_STYLE).setOrigin(0.5, 0));

        // An empty pile still draws one faded card outline rather than nothing, so the zone keeps
        // its slot in the column and stays clickable (an empty graveyard is the normal opening state).
        const layers = Math.min(3, Math.max(1, cards.length));
        for (let i = 0; i < layers; i++)
        {
            const offset = i * 4;
            const card = this.add.rectangle(-offset, -offset, DECK_PILE_W, DECK_PILE_H, style.fill).setStrokeStyle(2, style.stroke);
            if (cards.length === 0) card.setAlpha(0.3);
            container.add(card);
        }

        container.add(this.add.text(0, DECK_PILE_H / 2 + 6, `${cards.length}`, statStyle('#ffffff')).setOrigin(0.5, 0));

        const highlight = this.add.rectangle(-4, -4, DECK_PILE_W + 16, DECK_PILE_H + 16).setStrokeStyle(3, 0xffd23f).setVisible(false);
        container.add(highlight);

        // Hit region is deliberately generous enough to cover the stack's offset corner and the
        // count label under it. Top-left-based per the Container hit-area rule (see renderHero).
        const hitW = DECK_PILE_W + 16;
        const hitH = DECK_PILE_H + 40;
        container.setSize(hitW, hitH);
        container.setInteractive({
            hitArea: new Geom.Rectangle(0, 0, hitW, hitH),
            hitAreaCallback: Geom.Rectangle.Contains,
            useHandCursor: true,
        });
        container.on('pointerover', () => highlight.setVisible(true));
        container.on('pointerout', () => highlight.setVisible(false));
        // Deliberately not guarded(): opening a read-only pile view mutates no game state, so
        // there is no reason to swallow the click just because an animation is in flight.
        container.on('pointerup', () => this.showPileView(playerState.id, zone));

        this.renderedObjects.push(container);
    }

    private renderHand (playerState: PlayerState, y: number, faceDown: boolean): void
    {
        const cards = playerState.hand;
        if (cards.length === 0) return;

        const { spacing, startX } = this.rowLayout(cards.length, 15);
        const state = this.machine.state;
        const isMyTurn = !faceDown && playerState.id === 'player' && state.activePlayer === 'player';

        cards.forEach((instance, index) =>
        {
            const container = this.createCardContainer(instance, faceDown);
            const x = startX + index * spacing;
            container.setPosition(x, y);
            container.setDepth(index);
            this.renderedObjects.push(container);
            this.instanceContainers.set(instance.instanceId, container);

            if (faceDown) return;

            container.setInteractive(
                // See the comment in renderHero — Container hit-testing shifts the point by
                // +width/2, +height/2 first, so this must be top-left-based (0,0), not centered.
                new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                Geom.Rectangle.Contains
            );
            this.attachKeywordHover(container, instance);

            if (!isMyTurn || state.phase !== TurnPhase.MainIdle) return;

            const definition = CARD_DEFINITIONS[instance.definitionId];
            if (!definition) return;

            if (playerState.mana < definition.cost)
            {
                // Unaffordable: dim it and leave it non-interactive rather than letting the player
                // drag/click it and have TurnStateMachine silently reject the play (indistinguishable
                // from a broken drag) — see the mana check in TurnStateMachine.playCard/executePlayCard.
                container.setAlpha(0.5);
                return;
            }

            if (definition.type === 'minion')
            {
                this.originalPositions.set(container, x);
                this.cardInstanceByContainer.set(container, instance.instanceId);
                this.input.setDraggable(container);
            }
            else
            {
                container.on('pointerup', this.guarded(() => this.machine.playCard(instance.instanceId)));
            }
        });
    }

    private renderBoard (ownerId: PlayerId, playerState: PlayerState, y: number): void
    {
        const cards = playerState.board;
        if (cards.length === 0) return;

        const { spacing, startX } = this.rowLayout(cards.length, 25);
        const state = this.machine.state;

        cards.forEach((instance, index) =>
        {
            const container = this.createCardContainer(instance, false);
            container.setPosition(startX + index * spacing, y);
            this.renderedObjects.push(container);
            this.instanceContainers.set(instance.instanceId, container);

            container.setInteractive(
                // See the comment in renderHero — Container hit-testing shifts the point by
                // +width/2, +height/2 first, so this must be top-left-based (0,0), not centered.
                new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                Geom.Rectangle.Contains
            );
            this.attachKeywordHover(container, instance);

            const isValidTarget = state.phase === TurnPhase.AwaitingTarget && state.pendingTarget?.validTargetIds.includes(instance.instanceId);
            const canAttack =
                state.phase === TurnPhase.MainIdle &&
                ownerId === 'player' &&
                state.activePlayer === 'player' &&
                canDeclareAttack(instance);

            if (isValidTarget)
            {
                this.addOutline(container, CARD_W, CARD_H, 0xffd23f);
                container.on('pointerup', this.guarded(() => this.machine.selectTarget(instance.instanceId)));
            }
            else if (canAttack)
            {
                this.addOutline(container, CARD_W, CARD_H, 0x38d97b);
                container.on('pointerup', this.guarded(() => this.machine.declareAttack(instance.instanceId)));
            }
            else if (instance.summoningSick && ownerId === 'player' && !hasKeyword(instance, 'charge'))
            {
                container.setAlpha(0.6);
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

    // --- pile inspect overlay --------------------------------------------------------

    private showPileView (playerId: PlayerId, zone: PileZone): void
    {
        this.openPileView = { playerId, zone };
        // Painted directly rather than via requestRender(): the overlay must appear on the click
        // that opened it, and a full render would be deferred behind any in-flight animation.
        this.renderPileView();
    }

    private closePileView (): void
    {
        this.openPileView = undefined;
        this.clearPileView();
    }

    private clearPileView (): void
    {
        for (const obj of this.pileViewObjects) obj.destroy();
        this.pileViewObjects = [];
    }

    /**
     * Full-screen dimmed grid of whichever pile is currently open, or a no-op when none is.
     * Rebuilt wholesale (never patched) on each call, matching how the board itself renders.
     */
    private renderPileView (): void
    {
        this.clearPileView();
        if (!this.openPileView) return;

        this.hideHelpBox();

        const { playerId, zone } = this.openPileView;
        const style = CardGame.PILE_STYLES[zone];
        const cards = this.pileViewCards(playerId, zone);

        // Interactive so a click anywhere off a card dismisses the view — and, more importantly,
        // so the board underneath cannot be clicked through it. Phaser's InputPlugin is topOnly by
        // default, so this full-screen rect swallows every pointer event below PILE_VIEW_DEPTH.
        const dimmer = this.add.rectangle(CENTER_X, CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82)
            .setDepth(PILE_VIEW_DEPTH)
            .setInteractive();
        dimmer.on('pointerup', () => this.closePileView());
        this.pileViewObjects.push(dimmer);

        const owner = playerId === 'player' ? 'Your' : "Opponent's";
        const title = this.add.text(CENTER_X, 52, `${owner} ${style.title} — ${cards.length} card${cards.length === 1 ? '' : 's'}`, {
            fontFamily: 'Arial Black', fontSize: '36px', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(PILE_VIEW_DEPTH + 1);
        this.pileViewObjects.push(title);

        const close = this.add.text(GAME_WIDTH - 48, 52, '✕ Close', {
            fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', backgroundColor: '#3a4a6b',
        }).setOrigin(1, 0).setPadding(16, 9, 16, 9).setDepth(PILE_VIEW_DEPTH + 1).setInteractive({ useHandCursor: true });
        close.on('pointerup', () => this.closePileView());
        this.pileViewObjects.push(close);

        const hint = this.add.text(CENTER_X, GAME_HEIGHT - 34, 'Click anywhere or press Esc to close', {
            fontFamily: 'Arial', fontSize: '16px', color: '#8fa8d6',
        }).setOrigin(0.5, 1).setDepth(PILE_VIEW_DEPTH + 1);
        this.pileViewObjects.push(hint);

        if (cards.length === 0)
        {
            const empty = this.add.text(CENTER_X, CENTER_Y, `This ${style.title.toLowerCase()} is empty.`, {
                fontFamily: 'Arial', fontSize: '28px', color: '#b8c4d9', fontStyle: 'italic',
            }).setOrigin(0.5).setDepth(PILE_VIEW_DEPTH + 1);
            this.pileViewObjects.push(empty);
            return;
        }

        this.renderPileViewGrid(cards);
    }

    /**
     * Deck contents are sorted by cost then name so opening your own deck reads as a deck list
     * and does not leak the shuffled draw order. The graveyard keeps its natural array order,
     * which TurnStateMachine appends to on each death/discard — i.e. chronological.
     */
    private pileViewCards (playerId: PlayerId, zone: PileZone): CardInstance[]
    {
        const cards = this.pileCards(this.machine.state.players[playerId], zone);
        if (zone !== 'deck') return cards;

        return [...cards].sort((a, b) =>
        {
            const defA = CARD_DEFINITIONS[a.definitionId];
            const defB = CARD_DEFINITIONS[b.definitionId];
            return defA.cost - defB.cost || defA.name.localeCompare(defB.name);
        });
    }

    /** Lays the cards out in a centered grid, scaled down just far enough that the whole pile fits on one screen — no scrolling, however big the zone gets. */
    private renderPileViewGrid (cards: CardInstance[]): void
    {
        const columns = Math.min(PILE_VIEW_MAX_COLUMNS, cards.length);
        const rows = Math.ceil(cards.length / columns);

        const availableW = GAME_WIDTH - 160;
        const availableH = PILE_VIEW_BOTTOM - PILE_VIEW_TOP;
        const scale = Math.min(
            1,
            availableW / (columns * (CARD_W + PILE_VIEW_GAP)),
            availableH / (rows * (CARD_H + PILE_VIEW_GAP)),
        );

        const stepX = (CARD_W + PILE_VIEW_GAP) * scale;
        const stepY = (CARD_H + PILE_VIEW_GAP) * scale;
        const originY = PILE_VIEW_TOP + (availableH - rows * stepY) / 2 + stepY / 2;

        cards.forEach((instance, index) =>
        {
            const row = Math.floor(index / columns);
            const column = index % columns;
            // Centre each row on its own count, so a partial final row sits centered rather than
            // left-aligned under a full one.
            const inRow = Math.min(columns, cards.length - row * columns);

            const card = this.createCardContainer(instance, false);
            card.setPosition(CENTER_X + (column - (inRow - 1) / 2) * stepX, originY + row * stepY);
            card.setScale(scale);
            card.setDepth(PILE_VIEW_DEPTH + 1);
            card.setInteractive(
                // See renderHero — top-left-based, not centered. The container's scale applies to
                // the hit area too, so this needs no scale compensation of its own.
                new Geom.Rectangle(0, 0, CARD_W, CARD_H),
                Geom.Rectangle.Contains
            );
            this.attachKeywordHover(card, instance);

            this.pileViewObjects.push(card);
        });
    }

    // --- card visuals --------------------------------------------------------------

    private createCardContainer (instance: CardInstance, faceDown: boolean): Phaser.GameObjects.Container
    {
        const container = this.add.container(0, 0);
        const bg = this.add.rectangle(0, 0, CARD_W, CARD_H, faceDown ? 0x24304a : 0x2f3b52).setStrokeStyle(2, 0x8fa8d6);
        container.add(bg);

        if (!faceDown)
        {
            const definition = CARD_DEFINITIONS[instance.definitionId];

            // Name top-left, cost top-right — name's word-wrap width is clipped short of the
            // card's right edge so it never runs under the cost badge.
            const nameText = this.add.text(-CARD_W / 2 + 8, -CARD_H / 2 + 8, definition.name, NAME_STYLE)
                .setOrigin(0, 0)
                .setWordWrapWidth(CARD_W - 54, true);
            const costBadge = this.add.circle(CARD_W / 2 - 21, -CARD_H / 2 + 21, 19, 0x2f6fed);
            const costText = this.add.text(CARD_W / 2 - 21, -CARD_H / 2 + 21, `${definition.cost}`, COST_TEXT_STYLE).setOrigin(0.5);
            container.add([nameText, costBadge, costText]);

            container.add(this.createArtVisual(definition.art));

            if (definition.type === 'minion')
            {
                // Attack/health anchor to the art zone's bottom corners, not the card's — the
                // footer below the art is reserved for type/text/keywords.
                const attackBg = this.add.circle(-ART_W / 2 + 19, ART_BOTTOM - 23, 19, 0xd68f3f);
                const attackText = this.add.text(-ART_W / 2 + 19, ART_BOTTOM - 23, `${instance.currentAttack ?? 0}`, statStyle('#ffffff')).setOrigin(0.5);
                const healthBg = this.add.circle(ART_W / 2 - 19, ART_BOTTOM - 23, 19, 0xb0413e);
                const healthText = this.add.text(ART_W / 2 - 19, ART_BOTTOM - 23, `${instance.currentHealth ?? 0}`, statStyle('#ffffff')).setOrigin(0.5);
                container.add([attackBg, attackText, healthBg, healthText]);
            }

            // Footer: type (always), then rule text (if any), then keywords (if any) — stacked
            // with a running cursor so an absent row doesn't leave a dead gap in the tight space
            // below the art.
            let cursorY = ART_BOTTOM + 4;

            const typeText = this.add.text(0, cursorY, definition.type === 'minion' ? 'Minion' : 'Spell', TYPE_LABEL_STYLE).setOrigin(0.5, 0);
            container.add(typeText);
            cursorY += typeText.height + 2;

            if (definition.text !== '')
            {
                const ruleText = this.add.text(0, cursorY, definition.text, RULE_TEXT_STYLE)
                    .setOrigin(0.5, 0)
                    .setWordWrapWidth(ART_W, true);
                container.add(ruleText);
                cursorY += ruleText.height + 2;
            }

            if (instance.keywords.size > 0)
            {
                container.add(this.createKeywordLabels(instance, cursorY));
            }
        }

        container.setSize(CARD_W, CARD_H);
        return container;
    }

    /** Card art, ~65% of card height — the actual image if its texture loaded, otherwise a black box with small gray "MISSING ASSET" text (most cards have no art asset yet; see Preloader.preload). */
    private createArtVisual (art: string): Phaser.GameObjects.GameObject[]
    {
        if (this.textures.exists(art))
        {
            return [this.add.image(0, ART_CENTER_Y, art).setDisplaySize(ART_W, ART_H)];
        }

        const box = this.add.rectangle(0, ART_CENTER_Y, ART_W, ART_H, 0x000000).setStrokeStyle(1, 0x333333);
        const label = this.add.text(0, ART_CENTER_Y, 'MISSING ASSET', MISSING_ASSET_STYLE).setOrigin(0.5).setWordWrapWidth(ART_W - 16, true);
        return [box, label];
    }

    /**
     * Full keyword names for a minion's active keywords — bold, colored per KEYWORD_METADATA,
     * wrapped into centered rows under the art. Iterates instance.keywords (runtime, mutable)
     * rather than the card's static definition.keywords — a consumed keyword like divineShield
     * must stop rendering once popped, and the definition never changes to reflect that.
     */
    private createKeywordLabels (instance: CardInstance, startY: number): Phaser.GameObjects.GameObject[]
    {
        const keywords = [...instance.keywords];
        if (keywords.length === 0) return [];

        // One label per line, stacked and centered — minions realistically carry 1-2 keywords, so
        // this trades the horizontal space a wider card might spare for simplicity over packing.
        const lineHeight = 14;
        let cursorY = startY;

        return keywords.map((keyword) =>
        {
            const meta = KEYWORD_METADATA[keyword];
            const hex = `#${meta.color.toString(16).padStart(6, '0')}`;
            const text = this.add.text(0, cursorY, meta.label, { ...KEYWORD_LABEL_BASE_STYLE, color: hex }).setOrigin(0.5, 0);
            cursorY += lineHeight;
            return text;
        });
    }

    /** Wires the cursor-following keyword help box to a card container. A no-op for cards with no keywords. */
    private attachKeywordHover (container: Phaser.GameObjects.Container, instance: CardInstance): void
    {
        if (instance.keywords.size === 0) return;

        // Skip while this card is the one being dragged — see wireDragEvents' dragstart, which
        // hides an already-showing tooltip for it; this stops one from reappearing mid-drag too.
        container.on('pointerover', () => { if (container !== this.draggedContainer) this.showHelpBox(instance); });
        container.on('pointerout', () => this.hideHelpBox());
    }

    private showHelpBox (instance: CardInstance): void
    {
        const lines = [...instance.keywords].map((keyword) =>
        {
            const meta = KEYWORD_METADATA[keyword];
            return `${meta.label}: ${meta.description}`;
        });
        this.helpBoxText.setText(lines.join('\n\n'));
        this.helpBoxBg.setSize(this.helpBoxText.width + 20, this.helpBoxText.height + 20);
        this.helpBox.setVisible(true);

        const pointer = this.input.activePointer;
        this.positionHelpBox(pointer.x, pointer.y);
    }

    private hideHelpBox (): void
    {
        this.helpBox.setVisible(false);
    }

    private positionHelpBox (x: number, y: number): void
    {
        const offset = 20;
        const width = this.helpBoxBg.width;
        const height = this.helpBoxBg.height;

        const px = x + offset + width > GAME_WIDTH ? x - offset - width : x + offset;
        const py = y + offset + height > GAME_HEIGHT ? y - offset - height : y + offset;

        this.helpBox.setPosition(px, py);
    }

    private addOutline (container: Phaser.GameObjects.Container, width: number, height: number, color: number): void
    {
        const outline = this.add.rectangle(0, 0, width + 10, height + 10).setStrokeStyle(4, color);
        container.addAt(outline, 0);
    }
}
