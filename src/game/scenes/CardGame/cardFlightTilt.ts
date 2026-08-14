import type { Scene } from 'phaser';

import {
    CARD_H,
    CARD_W,
    FLIGHT_TILT_DRAG_MAX_SPEED_REF,
    FLIGHT_TILT_MAX_ROTATION_RAD,
    FLIGHT_TILT_MAX_SQUASH,
    FLIGHT_TILT_SHADOW_MAX_ALPHA,
    FLIGHT_TILT_SHADOW_OFFSET,
    FLIGHT_TILT_SMOOTHING,
} from './cardLayout';

/**
 * A card's "flight tilt" — the fake-3D lean/squash/trailing-shadow applied while a card is
 * mid-drag or mid-zone-transition (draw/play/death/snap-back), see SPEC.md-adjacent plan doc.
 * Phaser 4 has no true 3D GameObject (verified against the installed package — Plane/Mesh with
 * per-corner perspective doesn't exist in any published 4.x release), so this fakes depth with
 * plain Container transforms: a small rotation lean, a slight non-uniform squash along the travel
 * axis, and a soft elevation shadow that trails opposite the lean and grows with tilt intensity.
 *
 * `rotationDriven`/`scaleDriven` matter because some wrapped Phaser tweens already animate
 * `rotation`/`scale` themselves (e.g. playDrawAnimation's fly-in lands on a specific hand-slot
 * rotation). For a property a tween is actively driving, Phaser rewrites it to a fresh
 * true value every step *before* that tween's own onUpdate fires — so it's safe to read the
 * current value as "base" and nudge it for just that frame; next step the tween overwrites it
 * again regardless of our nudge, so nothing drifts. For a property nothing else is driving
 * (rotation during a play/graveyard flight, scale during a snap-back/graveyard flight, both
 * during live drag), nothing re-establishes a true value between our own calls, so reading
 * "current" would just be reading our own last write and compounding forever — those use a fixed
 * base captured once at beginFlightTilt instead, and always write an absolute (not incremental)
 * result.
 */
export type FlightTiltHandle = {
    container: Phaser.GameObjects.Container;
    shadow: Phaser.GameObjects.Ellipse;
    rotationDriven: boolean;
    scaleDriven: boolean;
    baseRotation: number;
    baseScaleX: number;
    baseScaleY: number;
    tiltX: number; // smoothed, roughly -1..1
    tiltY: number;
    lastPointerX?: number;
    lastPointerY?: number;
    lastPointerT?: number;
};

/**
 * Starts a flight: creates the trailing shadow (depth = container's current depth - 1, so callers
 * should set the container's flight depth before calling this) and captures whatever
 * rotation/scale baseline `updateFlightTilt` should measure offsets against for any property the
 * caller says nothing else is animating. Does not itself touch the container's transform.
 */
export function beginFlightTilt(
    scene: Scene,
    container: Phaser.GameObjects.Container,
    options: { rotationDriven?: boolean; scaleDriven?: boolean } = {},
): FlightTiltHandle
{
    const shadow = scene.add.ellipse(container.x, container.y, CARD_W * 0.85, CARD_H * 0.22, 0x000000, 0);
    shadow.setDepth(container.depth - 1);

    return {
        container,
        shadow,
        rotationDriven: options.rotationDriven ?? false,
        scaleDriven: options.scaleDriven ?? false,
        baseRotation: container.rotation,
        baseScaleX: container.scaleX,
        baseScaleY: container.scaleY,
        tiltX: 0,
        tiltY: 0,
    };
}

/**
 * Call every relevant tick — a tween's `onUpdate`, or drag's per-pointermove handler.
 * `dirX`/`dirY` need not be normalized (direction is derived internally); `intensity01` is 0
 * (flat) to 1 (max tilt). Internally lerps the handle's stored tilt toward this new target
 * (FLIGHT_TILT_SMOOTHING) rather than snapping, so direction reversals/velocity changes don't pop.
 */
export function updateFlightTilt(handle: FlightTiltHandle, dirX: number, dirY: number, intensity01: number): void
{
    const len = Math.hypot(dirX, dirY);
    const clamped = Math.max(0, Math.min(1, intensity01));
    const targetTiltX = len < 0.0001 || clamped <= 0 ? 0 : (dirX / len) * clamped;
    const targetTiltY = len < 0.0001 || clamped <= 0 ? 0 : (dirY / len) * clamped;

    handle.tiltX += (targetTiltX - handle.tiltX) * FLIGHT_TILT_SMOOTHING;
    handle.tiltY += (targetTiltY - handle.tiltY) * FLIGHT_TILT_SMOOTHING;

    const { container, shadow, tiltX, tiltY } = handle;

    const baseRotation = handle.rotationDriven ? container.rotation : handle.baseRotation;
    container.rotation = baseRotation + tiltX * FLIGHT_TILT_MAX_ROTATION_RAD;

    const baseScaleX = handle.scaleDriven ? container.scaleX : handle.baseScaleX;
    const baseScaleY = handle.scaleDriven ? container.scaleY : handle.baseScaleY;
    // Squash the axis perpendicular to the lean — moving mostly horizontally compresses vertical
    // scale (foreshortening as it "tips" away), moving mostly vertically compresses horizontal.
    container.scaleX = baseScaleX * (1 - Math.abs(tiltY) * FLIGHT_TILT_MAX_SQUASH);
    container.scaleY = baseScaleY * (1 - Math.abs(tiltX) * FLIGHT_TILT_MAX_SQUASH);

    const intensity = Math.min(1, Math.hypot(tiltX, tiltY));
    shadow.setPosition(container.x - tiltX * FLIGHT_TILT_SHADOW_OFFSET, container.y - tiltY * FLIGHT_TILT_SHADOW_OFFSET);
    shadow.setScale(container.scaleX, container.scaleY);
    shadow.setAlpha(intensity * FLIGHT_TILT_SHADOW_MAX_ALPHA);
}

/**
 * Drag-specific convenience: derives direction/intensity from the pointer's own movement since
 * the previous call (velocity, not raw position), so callers don't each re-derive this. Call once
 * per 'drag' pointermove event with the live pointer position.
 */
export function updateFlightTiltFromPointer(handle: FlightTiltHandle, pointerX: number, pointerY: number): void
{
    const now = performance.now();
    if (handle.lastPointerT === undefined)
    {
        handle.lastPointerX = pointerX;
        handle.lastPointerY = pointerY;
        handle.lastPointerT = now;
        updateFlightTilt(handle, 0, 0, 0);
        return;
    }

    const dt = Math.max(1, now - handle.lastPointerT);
    const dx = pointerX - (handle.lastPointerX ?? pointerX);
    const dy = pointerY - (handle.lastPointerY ?? pointerY);
    handle.lastPointerX = pointerX;
    handle.lastPointerY = pointerY;
    handle.lastPointerT = now;

    const speed = Math.hypot(dx, dy) / dt;
    updateFlightTilt(handle, dx, dy, speed / FLIGHT_TILT_DRAG_MAX_SPEED_REF);
}

/**
 * Ends a flight: destroys the shadow and restores the container to an untilted, unsquashed state
 * (rotation/scale reset to whichever base this handle was tracking). Must be called exactly once
 * per beginFlightTilt, even for an early-killed flight — nothing else destroys the shadow, since
 * it's a sibling GameObject, not a child of `container`.
 */
export function endFlightTilt(handle: FlightTiltHandle): void
{
    handle.shadow.destroy();
    if (!handle.container.active) return;
    if (!handle.rotationDriven) handle.container.rotation = handle.baseRotation;
    if (!handle.scaleDriven)
    {
        handle.container.scaleX = handle.baseScaleX;
        handle.container.scaleY = handle.baseScaleY;
    }
}
