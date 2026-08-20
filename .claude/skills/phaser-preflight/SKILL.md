---
name: phaser-preflight
description: Use before writing or editing Phaser rendering/interaction code in this repo — CardView.ts, cardLayout.ts, CardGame/index.ts, HelpBoxController.ts, PileViewController.ts, or anything touching setInteractive, setCrop/setDisplaySize, containers, filters, or update(). Surfaces four hard-won gotchas from CLAUDE.md before code is written, and flags when live-browser verification is required before calling the change done.
---

Before touching Phaser rendering/interaction code in this repo, check the change against these four landmines (all documented, all hit for real, all silent-failure-shaped — none of them throw or type-error). If none apply, say so briefly and proceed; don't pad the response.

## 1. Container hit areas must be top-left-based, not centered

If the change adds/edits `setInteractive({ hitArea: ... })` on a `Phaser.GameObjects.Container`: the custom `hitArea`/`hitAreaCallback` must be `Rectangle(0, 0, width, height)` / `Circle(width/2, height/2, r)` — **not** centered on the container's local origin, even though that's where the visuals are drawn. Phaser's container `displayOriginX/Y` defaults to `width/2, height/2` (unlike a Sprite's `0,0`), and the hit-test adds that offset before comparing. Getting this wrong doesn't error — it silently shrinks the clickable region to one quadrant. Calling `setInteractive()` with no custom hit area is unaffected (Phaser auto-generates the correct rectangle).

## 2. Never `setDisplaySize()` after `setCrop()`

If the change crops an Image/Sprite to a target aspect ratio: `setCrop()` doesn't change what `width`/`height` report, so a following `setDisplaySize(w, h)` scales against the *full uncropped frame*, silently distorting the image the moment the crop ratio differs from the source's native ratio. Use `image.setScale(w / cropW)` instead (equal to `h / cropH` by construction). See `coverFit` in `cardLayout.ts` for the reference implementation.

## 3. No `window.Phaser` runtime global

If the change references `Phaser.Something` as a **value** (not a type annotation): import it by name instead — `import { Geom, Math as PhaserMath } from 'phaser'`. Next.js bundles the ESM/CJS build, which doesn't attach `window.Phaser`; `tsc` won't catch this either since Phaser's `.d.ts` declares it as a type-only ambient global. Type-position usage (`Phaser.GameObjects.Container` in an annotation) is fine as-is.

## 4. Don't drive game logic off `update()`

This is a turn-based card game — `TurnStateMachine` reacts to explicit player/AI actions, not frame ticks. If the change adds polling or animation-driven state transitions inside a Scene's `update()`, that's very likely the wrong layer; the state machine should stay Phaser-independent and `CardGame` should only render `state` and forward input into it.

## Before calling it done

Per CLAUDE.md, don't unilaterally boot the dev server and script a Playwright pass — ask first; the user often tests faster manually against a server they already have running. But if the change touches card rendering broadly (a new visual element, a filter/mask, a shared texture helper), flag explicitly that it needs live-browser confirmation across **hand, draw animation, board (simplified mode), and pile-inspect (peek) views** before being called done — a prior per-card WebGL filter mask compiled clean and passed type-checking but broke all four of those flows, and was only caught by actually looking at the browser.
