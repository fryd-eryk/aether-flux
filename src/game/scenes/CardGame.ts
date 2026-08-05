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

const CARD_W = 105;
const CARD_H = 132;
const CENTER_X = 512;

// Row Y-positions are hand-tuned so hero/hand/board rows clear each other with a small
// gap given CARD_H above — see the git history of this file if CARD_H changes again.
const OPPONENT_HERO_Y = 50;
const OPPONENT_HAND_Y = 164;
const OPPONENT_BOARD_Y = 304;
const PLAYER_BOARD_Y = 464;
const PLAYER_HAND_Y = 604;
const PLAYER_HERO_Y = 718;

const NAME_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '10px', color: '#ffffff', align: 'left' };
const RULE_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '9px', color: '#b8c4d9', fontStyle: 'italic', align: 'center' };
const SMALL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = { fontFamily: 'Arial', fontSize: '14px', color: '#ffffff' };

function statStyle(color: string): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: 'Arial Black', fontSize: '16px', color };
}

/**
 * Renders TurnStateMachine's GameState and forwards input into it. This scene owns no
 * game rules of its own — every button/drag/click just calls a TurnStateMachine method,
 * and the whole board is torn down and rebuilt from scratch on every 'state:phase-change'
 * event rather than incrementally patched, which keeps this file simple at the cost of
 * being wasteful for a game this small (acceptable trade for a turn-based card game).
 */
export class CardGame extends Scene
{
    private machine!: TurnStateMachine;

    private renderedObjects: Phaser.GameObjects.GameObject[] = [];
    private cardInstanceByContainer = new Map<Phaser.GameObjects.Container, string>();
    private originalPositions = new Map<Phaser.GameObjects.Container, { x: number; y: number }>();

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

    private phaseChangeHandler = (phase: TurnPhase, state: GameState): void =>
    {
        this.render();

        if (phase === TurnPhase.MainIdle && state.activePlayer === 'opponent')
        {
            this.time.delayedCall(600, () => this.runOpponentTurn());
        }
    };

    /**
     * Drives one step of the opponent's turn. Executing an action always resolves the state
     * machine back to MainIdle (or GameOver), which re-emits 'state:phase-change' and re-enters
     * this method via phaseChangeHandler above — so a full turn is a chain of these calls, each
     * paced 600ms apart, until decideOpponentAction returns null and the turn ends.
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
        this.add.rectangle(CENTER_X, 384, 1024, 768, 0x161b26);

        this.turnBannerText = this.add.text(20, 20, '', SMALL_STYLE).setDepth(200);

        this.opponentHealthText = this.add.text(20, 46, '', statStyle('#ff5c5c')).setDepth(200);
        this.opponentManaText = this.add.text(20, 68, '', statStyle('#5c9cff')).setDepth(200);

        this.playerHealthText = this.add.text(20, 690, '', statStyle('#ff5c5c')).setDepth(200);
        this.playerManaText = this.add.text(20, 712, '', statStyle('#5c9cff')).setDepth(200);

        this.playerBoardZone = this.add.zone(CENTER_X, PLAYER_BOARD_Y, 860, CARD_H + 30).setRectangleDropZone(860, CARD_H + 30);
        this.add.rectangle(CENTER_X, PLAYER_BOARD_Y, 860, CARD_H + 30).setStrokeStyle(2, 0x3a4a6b, 0.6);

        this.createEndTurnButton();
        this.createCancelButton();
        this.createHelpBox();
        this.wireDragEvents();
        this.wireHelpBoxEvents();

        EventBus.on('state:phase-change', this.phaseChangeHandler);
        this.events.once('shutdown', () =>
        {
            EventBus.removeListener('state:phase-change', this.phaseChangeHandler);
        });

        this.machine = new TurnStateMachine(createInitialState(STARTER_DECK, STARTER_DECK));
        this.machine.startGame();

        this.render();

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
        const container = this.add.container(930, 384);
        const bg = this.add.rectangle(0, 0, 120, 50, 0x3a4a6b).setStrokeStyle(2, 0x8fa8d6);
        const text = this.add.text(0, 0, 'End Turn', SMALL_STYLE).setOrigin(0.5);
        container.add([bg, text]);
        container.setSize(120, 50);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerup', () => this.machine.endTurn());
        this.endTurnButton = container;
    }

    private createCancelButton (): void
    {
        const container = this.add.container(930, 450);
        const bg = this.add.rectangle(0, 0, 120, 40, 0x6b3a3a).setStrokeStyle(2, 0xd68f8f);
        const text = this.add.text(0, 0, 'Cancel', SMALL_STYLE).setOrigin(0.5);
        container.add([bg, text]);
        container.setSize(120, 40);
        container.setInteractive({ useHandCursor: true });
        container.on('pointerup', () => this.machine.cancelTarget());
        container.setVisible(false);
        this.cancelButton = container;
    }

    private createHelpBox (): void
    {
        this.helpBoxBg = this.add.rectangle(0, 0, 10, 10, 0x11151f, 0.95).setOrigin(0, 0).setStrokeStyle(1, 0x8fa8d6);
        this.helpBoxText = this.add.text(8, 8, '', {
            fontFamily: 'Arial', fontSize: '12px', color: '#ffffff', wordWrap: { width: 220 }
        }).setOrigin(0, 0);
        this.helpBox = this.add.container(0, 0, [this.helpBoxBg, this.helpBoxText]);
        this.helpBox.setDepth(2000);
        this.helpBox.setVisible(false);
    }

    // --- render ------------------------------------------------------------------

    private render (): void
    {
        this.clearRendered();
        const state = this.machine.state;

        this.turnBannerText.setText(this.describePhase(state));

        this.opponentHealthText.setText(`❤ ${state.players.opponent.health}/${state.players.opponent.maxHealth}`);
        this.opponentManaText.setText(`♦ ${state.players.opponent.mana}/${state.players.opponent.maxMana}`);

        this.playerHealthText.setText(`❤ ${state.players.player.health}/${state.players.player.maxHealth}`);
        this.playerManaText.setText(`♦ ${state.players.player.mana}/${state.players.player.maxMana}`);

        this.renderHero('opponent', OPPONENT_HERO_Y);
        this.renderHero('player', PLAYER_HERO_Y);

        this.renderHand(state.players.opponent, OPPONENT_HAND_Y, true);
        this.renderHand(state.players.player, PLAYER_HAND_Y, false);

        this.renderBoard('opponent', state.players.opponent, OPPONENT_BOARD_Y);
        this.renderBoard('player', state.players.player, PLAYER_BOARD_Y);

        this.updateEndTurnButton(state);
        this.updateCancelButton(state);

        if (state.phase === TurnPhase.GameOver)
        {
            this.showGameOver(state.winner);
        }
    }

    private clearRendered (): void
    {
        this.hideHelpBox();
        for (const obj of this.renderedObjects) obj.destroy();
        this.renderedObjects = [];
        this.cardInstanceByContainer.clear();
        this.originalPositions.clear();
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

    private renderHero (id: PlayerId, y: number): void
    {
        const state = this.machine.state;
        const container = this.add.container(CENTER_X, y);

        const circle = this.add.circle(0, 0, 40, id === 'player' ? 0x2f6fed : 0xb0413e).setStrokeStyle(2, 0xffffff);
        const label = this.add.text(0, 0, id === 'player' ? 'You' : 'Opponent', SMALL_STYLE).setOrigin(0.5);
        container.add([circle, label]);
        container.setSize(80, 80);
        // Container hit-testing shifts the local point by +displayOriginX/Y (= width/2, height/2 for a
        // Container) before testing it against the hit area, so a hit area centered on the visuals at
        // local (0,0) must itself be defined centered on (width/2, height/2), not on (0,0).
        container.setInteractive(new Geom.Circle(40, 40, 40), Geom.Circle.Contains);

        const isValidTarget = state.phase === TurnPhase.AwaitingTarget && state.pendingTarget?.validTargetIds.includes(id);
        if (isValidTarget)
        {
            this.addOutline(container, 80, 80, 0xffd23f);
            container.on('pointerup', () => this.machine.selectTarget(id));
        }

        this.renderedObjects.push(container);
    }

    private renderHand (playerState: PlayerState, y: number, faceDown: boolean): void
    {
        const cards = playerState.hand;
        if (cards.length === 0) return;

        const spacing = Math.min(CARD_W + 15, 860 / cards.length);
        const startX = CENTER_X - ((cards.length - 1) * spacing) / 2;
        const state = this.machine.state;
        const isMyTurn = !faceDown && playerState.id === 'player' && state.activePlayer === 'player';

        cards.forEach((instance, index) =>
        {
            const container = this.createCardContainer(instance, faceDown);
            const x = startX + index * spacing;
            container.setPosition(x, y);
            container.setDepth(index);
            this.renderedObjects.push(container);

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
                container.on('pointerup', () => this.machine.playCard(instance.instanceId));
            }
        });
    }

    private renderBoard (ownerId: PlayerId, playerState: PlayerState, y: number): void
    {
        const cards = playerState.board;
        if (cards.length === 0) return;

        const spacing = Math.min(CARD_W + 25, 860 / cards.length);
        const startX = CENTER_X - ((cards.length - 1) * spacing) / 2;
        const state = this.machine.state;

        cards.forEach((instance, index) =>
        {
            const container = this.createCardContainer(instance, false);
            container.setPosition(startX + index * spacing, y);
            this.renderedObjects.push(container);

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
                container.on('pointerup', () => this.machine.selectTarget(instance.instanceId));
            }
            else if (canAttack)
            {
                this.addOutline(container, CARD_W, CARD_H, 0x38d97b);
                container.on('pointerup', () => this.machine.declareAttack(instance.instanceId));
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
        const overlay = this.add.rectangle(CENTER_X, 384, 1024, 768, 0x000000, 0.6);
        const label = this.add.text(CENTER_X, 340, winner === 'player' ? 'Victory!' : 'Defeat', {
            fontFamily: 'Arial Black', fontSize: 64, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8, align: 'center'
        }).setOrigin(0.5);
        const button = this.add.text(CENTER_X, 420, 'Play Again', {
            fontFamily: 'Arial', fontSize: '24px', color: '#ffffff', backgroundColor: '#3a4a6b'
        }).setOrigin(0.5).setPadding(16, 8, 16, 8).setInteractive({ useHandCursor: true });
        button.on('pointerup', () => this.scene.restart());

        this.renderedObjects.push(overlay, label, button);
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
            const nameText = this.add.text(-CARD_W / 2 + 6, -CARD_H / 2 + 6, definition.name, NAME_STYLE)
                .setOrigin(0, 0)
                .setWordWrapWidth(CARD_W - 34, true);
            const costBadge = this.add.circle(CARD_W / 2 - 14, -CARD_H / 2 + 14, 13, 0x2f6fed);
            const costText = this.add.text(CARD_W / 2 - 14, -CARD_H / 2 + 14, `${definition.cost}`, SMALL_STYLE).setOrigin(0.5);
            container.add([nameText, costBadge, costText]);

            const ruleText = this.add.text(0, -6, definition.text, RULE_TEXT_STYLE)
                .setOrigin(0.5, 0)
                .setWordWrapWidth(CARD_W - 16, true);
            container.add(ruleText);

            if (definition.type === 'minion')
            {
                container.add(this.createKeywordBadges(instance));

                // Colored circle behind the number, same visual language as the cost badge above.
                const attackBg = this.add.circle(-CARD_W / 2 + 16, CARD_H / 2 - 16, 14, 0xd68f3f);
                const attackText = this.add.text(-CARD_W / 2 + 16, CARD_H / 2 - 16, `${instance.currentAttack ?? 0}`, statStyle('#ffffff')).setOrigin(0.5);
                const healthBg = this.add.circle(CARD_W / 2 - 16, CARD_H / 2 - 16, 14, 0xb0413e);
                const healthText = this.add.text(CARD_W / 2 - 16, CARD_H / 2 - 16, `${instance.currentHealth ?? 0}`, statStyle('#ffffff')).setOrigin(0.5);
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

        const badgeW = 22, badgeH = 14, gap = 4;
        const totalWidth = keywords.length * badgeW + (keywords.length - 1) * gap;
        const startX = -totalWidth / 2 + badgeW / 2;
        const y = 26;

        return keywords.flatMap((keyword, index) =>
        {
            const meta = KEYWORD_METADATA[keyword];
            const x = startX + index * (badgeW + gap);
            const bg = this.add.rectangle(x, y, badgeW, badgeH, meta.color);
            const text = this.add.text(x, y, meta.abbr, { fontFamily: 'Arial', fontSize: '9px', color: '#1a1a1a' }).setOrigin(0.5);
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
        this.helpBoxBg.setSize(this.helpBoxText.width + 16, this.helpBoxText.height + 16);
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
        const offset = 16;
        const width = this.helpBoxBg.width;
        const height = this.helpBoxBg.height;

        const px = x + offset + width > 1024 ? x - offset - width : x + offset;
        const py = y + offset + height > 768 ? y - offset - height : y + offset;

        this.helpBox.setPosition(px, py);
    }

    private addOutline (container: Phaser.GameObjects.Container, width: number, height: number, color: number): void
    {
        const outline = this.add.rectangle(0, 0, width + 8, height + 8).setStrokeStyle(3, color);
        container.addAt(outline, 0);
    }
}
