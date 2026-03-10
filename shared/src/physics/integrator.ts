/**
 * Physics integrator — semi-implicit Euler.
 *
 * Pure functions: state + forces + dt → new state.
 * No Colyseus dependencies.
 */

import { wrapAngle } from "../mathUtils";
import { scaleSlimeValue } from "../formulas";
import type { SlimeConfig } from "../config";

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Mutable physics state for integration */
export interface IIntegratorState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angVel: number;
}

/** Forces to apply during this tick */
export interface IIntegratorForces {
    assistFx: number;
    assistFy: number;
    assistTorque: number;
}

/** World-physics drag constants */
export interface IWorldDragParams {
    forwardDragK: number;
    lateralGripMultiplier: number;
    angularDragK: number;
}

/** Surface-zone physics parameters (per-zone overrides for integrator) */
export interface ISurfaceParams {
    forwardDragMultiplier: number;   // 1.0 = normal
    lateralGripMultiplier: number;   // 1.0 = same as forward drag
    angularDragMultiplier: number;   // 1.0 = normal
    zoneThrustN: number;             // 0 = no extra thrust
}

export const DEFAULT_SURFACE_PARAMS: ISurfaceParams = {
    forwardDragMultiplier: 1.0,
    lateralGripMultiplier: 1.0,
    angularDragMultiplier: 1.0,
    zoneThrustN: 0,
};

/** Result of a single integration step */
export interface IIntegratorResult {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angVel: number;
}

// ─── Integration ─────────────────────────────────────────────────────────────

/**
 * Anisotropic physics integration with exponential decay.
 *
 * Steps:
 *   1. Apply FA forces to velocity (semi-implicit Euler)
 *   2. Apply zoneThrustN along heading
 *   3. Decompose velocity into forward/lateral components
 *   4. Apply exponential decay: vFwd *= exp(-forwardDragK * surfaceFwdMul * dt)
 *      and vLat *= exp(-forwardDragK * gripMul * surfaceGripMul * dt)
 *   5. Reassemble velocity from decayed components
 *   6. Apply angular decay: angVel *= exp(-angularDragK * surfaceAngMul * dt)
 *   7. Clamp angular velocity, update position and angle
 */
export function integratePhysics(
    state: IIntegratorState,
    forces: IIntegratorForces,
    mass: number,
    inertia: number,
    slimeConfig: SlimeConfig,
    drag: IWorldDragParams,
    surface: ISurfaceParams,
    isLastBreath: boolean,
    lastBreathSpeedPenalty: number,
    dt: number,
): IIntegratorResult {
    const safeMass = Math.max(mass, 1e-6);

    // ── 1. Apply FA forces to velocity (semi-implicit Euler) ──
    let vx = state.vx + (forces.assistFx / safeMass) * dt;
    let vy = state.vy + (forces.assistFy / safeMass) * dt;

    // ── 2. Apply zone thrust along heading ──
    if (surface.zoneThrustN > 0) {
        const thrustAx = (surface.zoneThrustN / safeMass) * Math.cos(state.angle);
        const thrustAy = (surface.zoneThrustN / safeMass) * Math.sin(state.angle);
        vx += thrustAx * dt;
        vy += thrustAy * dt;
    }

    // ── 3. Decompose velocity into forward/lateral ──
    const fwdX = Math.cos(state.angle);
    const fwdY = Math.sin(state.angle);
    const rightX = -fwdY;
    const rightY = fwdX;

    const vFwd = vx * fwdX + vy * fwdY;
    const vLat = vx * rightX + vy * rightY;

    // ── 4. Anisotropic exponential decay (clamp drag >= 0 to prevent growth) ──
    const fwdK = Math.max(0, drag.forwardDragK * surface.forwardDragMultiplier);
    const decayFwd = Math.exp(-fwdK * dt);
    const lateralK = Math.max(0, drag.forwardDragK * drag.lateralGripMultiplier * surface.lateralGripMultiplier);
    const decayLat = Math.exp(-lateralK * dt);

    const vFwdNew = vFwd * decayFwd;
    const vLatNew = vLat * decayLat;

    // ── 5. Reassemble velocity ──
    vx = fwdX * vFwdNew + rightX * vLatNew;
    vy = fwdY * vFwdNew + rightY * vLatNew;

    // ── 6. Update position ──
    const newX = state.x + vx * dt;
    const newY = state.y + vy * dt;

    // ── 7. Angular: apply FA torque then exponential decay ──
    let newAngVel = state.angVel + (forces.assistTorque / Math.max(inertia, 1e-6)) * dt;
    const angK = Math.max(0, drag.angularDragK * surface.angularDragMultiplier);
    const angDecay = Math.exp(-angK * dt);
    newAngVel *= angDecay;

    // ── Angular speed limit ──
    let angularLimit = scaleSlimeValue(
        slimeConfig.limits.angularSpeedLimitRadps,
        mass, slimeConfig,
        slimeConfig.massScaling.angularSpeedLimitRadps,
    );
    if (isLastBreath) {
        angularLimit *= lastBreathSpeedPenalty;
    }
    if (angularLimit > 0 && Math.abs(newAngVel) > angularLimit) {
        newAngVel = Math.sign(newAngVel) * angularLimit;
    }

    // ── Update angle ──
    const newAngle = wrapAngle(state.angle + newAngVel * dt);

    return {
        x: newX,
        y: newY,
        vx,
        vy,
        angle: newAngle,
        angVel: newAngVel,
    };
}
