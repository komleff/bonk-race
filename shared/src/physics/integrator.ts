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
    linearDragK: number;
    angularDragK: number;
}

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
 * Semi-implicit Euler integration for a single slime.
 *
 * Steps:
 *   1. Compute drag forces from current velocity
 *   2. Sum all forces (assist + drag)
 *   3. Update velocity (v += a * dt)
 *   4. Clamp angular velocity to limit
 *   5. Update position (x += v * dt)
 *   6. Normalize angle
 *
 * @param state       Current position, velocity, angle state
 * @param forces      FA forces + torque for this tick
 * @param mass        Effective mass (already clamped to minSlimeMass)
 * @param inertia     Moment of inertia
 * @param slimeConfig Slime configuration (for angular speed limit scaling)
 * @param drag        World drag constants
 * @param zoneFrictionMultiplier  Friction zone multiplier (1.0 = normal)
 * @param isLastBreath Whether last-breath penalty applies
 * @param lastBreathSpeedPenalty Penalty multiplier for last-breath
 * @param dt          Time step in seconds
 */
export function integratePhysics(
    state: IIntegratorState,
    forces: IIntegratorForces,
    mass: number,
    inertia: number,
    slimeConfig: SlimeConfig,
    drag: IWorldDragParams,
    zoneFrictionMultiplier: number,
    isLastBreath: boolean,
    lastBreathSpeedPenalty: number,
    dt: number,
): IIntegratorResult {
    // ── Linear drag ──
    const dragFx = -mass * drag.linearDragK * zoneFrictionMultiplier * state.vx;
    const dragFy = -mass * drag.linearDragK * zoneFrictionMultiplier * state.vy;
    const dragTorque = -inertia * drag.angularDragK * zoneFrictionMultiplier * state.angVel;

    // ── Sum forces ──
    const totalFx = forces.assistFx + dragFx;
    const totalFy = forces.assistFy + dragFy;

    // ── Update velocity (semi-implicit Euler: force → velocity first) ──
    const safeMass = Math.max(mass, 1e-6);
    const newVx = state.vx + (totalFx / safeMass) * dt;
    const newVy = state.vy + (totalFy / safeMass) * dt;

    // ── Update position ──
    const newX = state.x + newVx * dt;
    const newY = state.y + newVy * dt;

    // ── Angular: torque → angular velocity ──
    const totalTorque = forces.assistTorque + dragTorque;
    let newAngVel = state.angVel + (totalTorque / Math.max(inertia, 1e-6)) * dt;

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
        vx: newVx,
        vy: newVy,
        angle: newAngle,
        angVel: newAngVel,
    };
}
