import { Geom, Scene } from 'phaser';

import { decideOpponentAction } from '../ai/OpponentAI';
import { CARD_DEFINITIONS, STARTER_DECK } from '../data/cards';
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

const CARD_W = 140;
const CARD_H = 176;
const HERO_RADIUS = 53;
const HERO_SIZE = HERO_RADIUS * 2;
const BOARD_ZONE_W = 1600;

// Row Y-positions are hand-tuned so hero/hand/board rows clear each other with a small
// gap given CARD_H/HERO_RADIUS above — see the git history of this file if those change again.
const OPPONENT_HERO_Y = 70;
const OPPONENT_HAND_Y = 230;
const OPPONENT_BOARD_Y = 427;
const PLAYER_BOARD_Y = 652;
const PLAYER_HAND_Y = 849;
const PLAYER_HERO_Y = 1009;

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

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff', align: 'left' };
const RULE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '12px', color: '#b8c4d9', fontStyle: 'italic', align: 'center' };
const SMALL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '18px', color: '#ffffff' };
const PILE_LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '12px', color: '#9aa7bd' };

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
    private originalPositions = new Map<Phaser.GameObjects.Container, { x: number; y: number }>();
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

    /** Flies a temporary card preview from the drawing player's deck pile to the drawn card's computed hand slot, then discards the preview — the real hand container appears once the deferred render catches up. */
    private async playDrawAnimation (playerId: PlayerId, instanceId: string): Promise<void>
    {
        const player = this.machine.state.players[playerId];
        const index = player.hand.findIndex((c) => c.instanceId === instanceId);
        if (index === -1) return;

        const faceDown = playerId === 'opponent';
        const { spacing, startX } = this.rowLayout(player.hand.length, 15);
        const destY = playerId === 'opponent' ? OPPONENT_HAND_Y : PLAYER_HAND_Y;
        const destX = startX + index * spacing;

        const origin = this.deckPilePosition(playerId);
        const flying = this.createCardContainer(player.hand[index], faceDown);
        flying.setPosition(origin.x, origin.y);
        flying.setDepth(3000);
        flying.setScale(0.6);

        await this.tweenPromise({ targets: flying, x: destX, y: destY, scale: 1, duration: 400, ease: 'Cubic.easeOut' });
        flying.destroy();
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

        this.add.rectangle(CENTER_X, CENTER_Y, GAME_WIDTH, GAME_HEIGHT, 0x161b26);

        this.turnBannerText = this.add.text(38, 28, '', SMALL_STYLE).setDepth(200);

        this.opponentHealthText = this.add.text(38, 65, '', statStyle('#ff5c5c')).setDepth(200);
        this.opponentManaText = this.add.text(38, 96, '', statStyle('#5c9cff')).setDepth(200);

        this.playerHealthText = this.add.text(38, 970, '', statStyle('#ff5c5c')).setDepth(200);
        this.playerManaText = this.add.text(38, 1001, '', statStyle('#5c9cff')).setDepth(200);

        const boardZoneH = CARD_H + 30;
        this.playerBoardZone = this.add.zone(CENTER_X, PLAYER_BOARD_Y, BOARD_ZONE_W, boardZoneH).setRectangleDropZone(BOARD_ZONE_W, boardZoneH);
        this.add.rectangle(CENTER_X, PLAYER_BOARD_Y, BOARD_ZONE_W, boardZoneH).setStrokeStyle(2, 0x3a4a6b, 0.6);

        this.createEndTurnButton();
        this.createCancelButton();
        this.createHelpBox();
        this.wireDragEvents();
        this.wireHelpBoxEvents();
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

        this.machine = new TurnStateMachine(createInitialState(STARTER_DECK, STARTER_DECK));

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
            (gameObject as Phaser.GameObjects.Container).setDepth(1000);
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
            if (!container.active) return; // already destroyed by a re-render triggered from the drop above

            const original = this.originalPositions.get(container);
            if (original) container.setPosition(original.x, original.y);
        });
    }

    private wireHelpBoxEvents (): void
    {
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) =>
        {
            if (this.helpBox.visible) this.positionHelpBox(pointer.x, pointer.y);
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
        this.renderHero('player', PLAYER_HERO_Y);

        this.renderPile(state.players.opponent, 'graveyard', OPPONENT_GRAVEYARD_Y);
        this.renderPile(state.players.opponent, 'deck', OPPONENT_DECK_Y);
        this.renderPile(state.players.player, 'deck', PLAYER_DECK_Y);
        this.renderPile(state.players.player, 'graveyard', PLAYER_GRAVEYARD_Y);

        this.renderHand(state.players.opponent, OPPONENT_HAND_Y, true);
        this.renderHand(state.players.player, PLAYER_HAND_Y, false);

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
                this.originalPositions.set(container, { x, y });
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
                .setWordWrapWidth(CARD_W - 45, true);
            const costBadge = this.add.circle(CARD_W / 2 - 19, -CARD_H / 2 + 19, 17, 0x2f6fed);
            const costText = this.add.text(CARD_W / 2 - 19, -CARD_H / 2 + 19, `${definition.cost}`, SMALL_STYLE).setOrigin(0.5);
            container.add([nameText, costBadge, costText]);

            const ruleText = this.add.text(0, -8, definition.text, RULE_TEXT_STYLE)
                .setOrigin(0.5, 0)
                .setWordWrapWidth(CARD_W - 21, true);
            container.add(ruleText);

            if (definition.type === 'minion')
            {
                container.add(this.createKeywordBadges(instance));

                // Colored circle behind the number, same visual language as the cost badge above.
                const attackBg = this.add.circle(-CARD_W / 2 + 21, CARD_H / 2 - 21, 19, 0xd68f3f);
                const attackText = this.add.text(-CARD_W / 2 + 21, CARD_H / 2 - 21, `${instance.currentAttack ?? 0}`, statStyle('#ffffff')).setOrigin(0.5);
                const healthBg = this.add.circle(CARD_W / 2 - 21, CARD_H / 2 - 21, 19, 0xb0413e);
                const healthText = this.add.text(CARD_W / 2 - 21, CARD_H / 2 - 21, `${instance.currentHealth ?? 0}`, statStyle('#ffffff')).setOrigin(0.5);
                container.add([attackBg, attackText, healthBg, healthText]);
            }
        }

        container.setSize(CARD_W, CARD_H);
        return container;
    }

    /**
     * Small colored abbreviation badges for a minion's active keywords, rendered under the
     * name. Iterates instance.keywords (runtime, mutable) rather than the card's static
     * definition.keywords — a consumed keyword like divineShield must stop rendering once
     * popped, and the definition never changes to reflect that.
     */
    private createKeywordBadges (instance: CardInstance): Phaser.GameObjects.GameObject[]
    {
        const keywords = [...instance.keywords];
        if (keywords.length === 0) return [];

        const badgeW = 30, badgeH = 19, gap = 5;
        const totalWidth = keywords.length * badgeW + (keywords.length - 1) * gap;
        const startX = -totalWidth / 2 + badgeW / 2;
        const y = 35;

        return keywords.flatMap((keyword, index) =>
        {
            const meta = KEYWORD_METADATA[keyword];
            const x = startX + index * (badgeW + gap);
            const bg = this.add.rectangle(x, y, badgeW, badgeH, meta.color);
            const text = this.add.text(x, y, meta.abbr, { fontFamily: 'Arial', fontSize: '12px', color: '#1a1a1a' }).setOrigin(0.5);
            return [bg, text];
        });
    }

    /** Wires the cursor-following keyword help box to a card container. A no-op for cards with no keywords. */
    private attachKeywordHover (container: Phaser.GameObjects.Container, instance: CardInstance): void
    {
        if (instance.keywords.size === 0) return;

        container.on('pointerover', () => this.showHelpBox(instance));
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
