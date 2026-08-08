# Card Game

A simplified 2D card game (MTG / Hearthstone), built with [Phaser 4](https://github.com/phaserjs/phaser)
and [Next.js](https://github.com/vercel/next.js), started from Phaser Studio's official
Next.js template.

## Requirements

[Node.js](https://nodejs.org) is required to install dependencies and run scripts via `npm`.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install project dependencies |
| `npm run dev` | Launch a development web server |
| `npm run build` | Create a production build in the `dist` folder |
| `npm run dev-nolog` | Launch a development web server without sending anonymous data (see "About log.js" below) |
| `npm run build-nolog` | Create a production build in the `dist` folder without sending anonymous data (see "About log.js" below) |

## Writing Code

After cloning the repo, run `npm install` from your project directory. Then, you can start the local development server by running `npm run dev`.

The local development server runs on `http://localhost:8080` by default. The game launches straight into the `CardGame` scene — there's no menu screen.

Once the server is running you can edit any of the files in the `src` folder. Next.js will automatically recompile your code and then reload the browser.

## Project Structure

| Path                              | Description                                                                 |
|------------------------------------|-----------------------------------------------------------------------------|
| `src/pages/index.tsx`             | Next.js entry point. Dynamically imports `src/App.tsx` with SSR disabled.  |
| `src/App.tsx`                     | Bare React shell that mounts the Phaser game.                              |
| `src/PhaserGame.tsx`              | Bridge component: constructs the Phaser game and exposes it to React.      |
| `src/game/EventBus.ts`            | Shared event bus, used for React↔Phaser communication and by the game's own state machine. |
| `src/game/main.ts`                | Phaser game config and scene list.                                         |
| `src/game/scenes/`                | `Boot` → `Preloader` → `CardGame`.                                         |
| `src/game/types/`                 | Card, player, and game-state type definitions.                             |
| `src/game/data/`                  | Card definitions (`cards.ts`) and deck-building helpers (`cardFactory.ts`).|
| `src/game/state/TurnStateMachine.ts` | Turn/phase state machine driving the game loop — no Phaser dependency.  |
| `public/assets`                   | Static game assets (currently empty — the game renders placeholder shapes/text; add card art here). |

## Game Architecture

The game loop is a turn-based state machine (`TurnStateMachine`), not Phaser's
per-frame `update()` — a card game only needs to react to player actions, not
render ticks. `CardGame` (the only gameplay scene) renders whatever
`TurnStateMachine.state` currently says and forwards input (drag a card to
play a minion, click a spell/attacker then a target, click End Turn) into the
state machine's methods. The state machine emits `EventBus` events
(`state:phase-change`, `state:card-played`, `state:attack`, `state:card-died`,
`state:game-over`, ...) that the scene listens to and fully re-renders on.

Cards are data, not classes: a `CardDefinition` (`src/game/data/cards.ts`) is
plain JSON-like data (`{ id, name, cost, type, attack?, health?, effects? }`);
playing one creates a `CardInstance` that tracks its own runtime state
(current attack/health, zone, summoning sickness). Effects are a small
discriminated union (`damage` / `heal` / `draw` / `buff` / `summon`) resolved
generically by the state machine — adding a new card is a new data entry, not
new code.

The opponent currently has a placeholder "AI": it just ends its turn
immediately. See `CardGame.phaseChangeHandler` to replace it with real
decision-making.

## React ↔ Phaser Bridge

`App.tsx` doesn't currently drive any Phaser behavior, but the bridge
infrastructure is there for when you want React-rendered UI (a deck list, a
settings panel) to talk to the game:

```js
// In React
import { EventBus } from './game/EventBus';

EventBus.emit('event-name', data);

// In Phaser
EventBus.on('event-name', (data) => {
    // Do something with the data
});
```

`PhaserGame` exposes the live Phaser game instance and the most recently
active Scene via a ref (`phaserRef.current.game` / `phaserRef.current.scene`),
updated whenever a Scene emits `'current-scene-ready'` (see `CardGame.create()`).

**Import caveat:** Next.js bundles Phaser's ESM/CJS build, which does *not*
attach a `window.Phaser` global (only Phaser's standalone `<script>`-tag build
does). Always import runtime values by name — `import { Geom } from 'phaser'`
— rather than referencing a bare global `Phaser.x`.

## Handling Assets

Static assets (images, audio, card art, etc.) go in `public/assets`, loaded
in a scene's `preload()`:

```js
preload ()
{
    this.load.image('card-back', 'card-back.png');
}
```

`npm run build` copies everything in `public/assets` into `dist/assets`.

## Deploying to Production

After `npm run build`, the game is a static bundle in `dist/`. Upload its contents to any static web host.

## About log.js

`log.js` makes a single silent API call to `gryzor.co` (owned by Phaser
Studio Inc.), sending only: the template name, whether the build was 'dev' or
'prod', and the Phaser version — no personal data. Use `npm run dev-nolog` /
`npm run build-nolog` to skip it, or delete `log.js` and its references in
`package.json`'s `scripts` to disable it entirely.
