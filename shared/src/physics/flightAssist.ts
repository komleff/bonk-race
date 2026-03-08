/**
 * Flight Assist — pure functions for fly-by-wire slime control.
 *
 * No Colyseus schema dependencies. All state is passed via plain interfaces.
 * All parameters come from config (SlimeConfig).
 */

import { clamp, wrapAngle } from "../mathUtils";
import { scaleSlimeValue } from "../formulas";
import type { SlimeConfig } from "../config";

// ─── Interfaces ──────────────────────────────────────────────────────────────

/** Minimal physics state needed by FlightAssist */
export interface ISlimePhysicsState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angVel: number;
    mass: number;
    inputX: number;
    inputY: number;
    isDead: boolean;
    isLastBreath: boolean;
    slowPct: number;
    /** Mutable yaw sign history for oscillation damping */
    yawSignHistory: number[];
}

/** Talent / modifier bonuses applied to the slime */
export interface ISlimeModifiers {
    thrustForwardBonus: number;
    thrustReverseBonus: number;
    thrustLateralBonus: number;
    turnBonus: number;
    speedLimitBonus: number;
    lightningSpeedBonus: number;
}

/** External multipliers (haste, zone, etc.) */
export interface IExternalMultipliers {
    hasteSpeedMultiplier: number;
    zoneSpeedMultiplier: number;
    lastBreathSpeedPenalty: number;
}

/** Output forces from FlightAssist */
export interface IFlightAssistOutput {
    assistFx: number;
    assistFy: number;
    assistTorque: number;
}

/** World-physics constants needed by FA (from balance.worldPhysics) */
export interface IWorldPhysicsParams {
    angularDragK: number;
}

// ─── Yaw Oscillation Damping ─────────────────────────────────────────────────

/**
 * Detects yaw oscillation and dampens command when flipping too fast.
 * Mutates `yawSignHistory` in place (same semantics as the original).
 */
export function applyYawOscillationDamping(
    yawSignHistory: number[],
    yawCmd: number,
    windowFrames: number,
    signFlipsThreshold: number,
    dampingBoostFactor: number,
): number {
    if (windowFrames <= 0 || signFlipsThreshold <= 0 || dampingBoostFactor <= 1) return yawCmd;

    const sign = yawCmd === 0 ? 0 : Math.sign(yawCmd);
    if (sign === 0) return yawCmd;

    yawSignHistory.push(sign);
    if (yawSignHistory.length > windowFrames) {
        yawSignHistory.splice(0, yawSignHistory.length - windowFrames);
    }

    let flips = 0;
    let lastSign = 0;
    for (const s of yawSignHistory) {
        if (s === 0) continue;
        if (lastSign !== 0 && s !== lastSign) {
            flips += 1;
        }
        lastSign = s;
    }

    if (flips >= signFlipsThreshold) {
        return yawCmd / dampingBoostFactor;
    }

    return yawCmd;
}

// ─── Main FlightAssist ───────────────────────────────────────────────────────

/**
 * Computes FA forces + torque for a single slime.
 *
 * Pure function: reads state & config, returns forces.
 * The only mutation is appending to `state.yawSignHistory`.
 */
export function computeFlightAssist(
    state: ISlimePhysicsState,
    slimeConfig: SlimeConfig,
    inertia: number,
    modifiers: ISlimeModifiers,
    external: IExternalMultipliers,
    worldPhysics: IWorldPhysicsParams,
    dt: number,
): IFlightAssistOutput {
    if (state.isDead) {
        return { assistFx: 0, assistFy: 0, assistTorque: 0 };
    }

    const mass = state.mass;

    // ── Scale propulsion by mass ──
    let thrustForward = scaleSlimeValue(
        slimeConfig.propulsion.thrustForwardN,
        mass, slimeConfig,
        slimeConfig.massScaling.thrustForwardN,
    );
    let thrustReverse = scaleSlimeValue(
        slimeConfig.propulsion.thrustReverseN,
        mass, slimeConfig,
        slimeConfig.massScaling.thrustReverseN,
    );
    let thrustLateral = scaleSlimeValue(
        slimeConfig.propulsion.thrustLateralN,
        mass, slimeConfig,
        slimeConfig.massScaling.thrustLateralN,
    );
    const turnTorque = scaleSlimeValue(
        slimeConfig.propulsion.turnTorqueNm,
        mass, slimeConfig,
        slimeConfig.massScaling.turnTorqueNm,
    );

    // Talent bonuses
    thrustForward *= 1 + modifiers.thrustForwardBonus;
    thrustReverse *= 1 + modifiers.thrustReverseBonus;
    thrustLateral *= 1 + modifiers.thrustLateralBonus;
    const turnTorqueAdjusted = turnTorque * (1 + modifiers.turnBonus);

    // ── Scale speed limits by mass ──
    let speedLimitForward = scaleSlimeValue(
        slimeConfig.limits.speedLimitForwardMps,
        mass, slimeConfig,
        slimeConfig.massScaling.speedLimitForwardMps,
    );
    let speedLimitReverse = scaleSlimeValue(
        slimeConfig.limits.speedLimitReverseMps,
        mass, slimeConfig,
        slimeConfig.massScaling.speedLimitReverseMps,
    );
    let speedLimitLateral = scaleSlimeValue(
        slimeConfig.limits.speedLimitLateralMps,
        mass, slimeConfig,
        slimeConfig.massScaling.speedLimitLateralMps,
    );
    const speedBonus = 1 + modifiers.speedLimitBonus + modifiers.lightningSpeedBonus;
    const totalSpeedMultiplier = speedBonus * external.hasteSpeedMultiplier * external.zoneSpeedMultiplier;
    speedLimitForward *= totalSpeedMultiplier;
    speedLimitReverse *= totalSpeedMultiplier;
    speedLimitLateral *= totalSpeedMultiplier;

    let angularLimit = scaleSlimeValue(
        slimeConfig.limits.angularSpeedLimitRadps,
        mass, slimeConfig,
        slimeConfig.massScaling.angularSpeedLimitRadps,
    );

    // Last-breath penalty
    if (state.isLastBreath) {
        const penalty = external.lastBreathSpeedPenalty;
        thrustForward *= penalty;
        thrustReverse *= penalty;
        thrustLateral *= penalty;
        speedLimitForward *= penalty;
        speedLimitReverse *= penalty;
        speedLimitLateral *= penalty;
        angularLimit *= penalty;
    }

    // Slow effects (SlowZone / Frost / Toxic)
    if (state.slowPct > 0) {
        const slowMult = 1 - state.slowPct;
        speedLimitForward *= slowMult;
        speedLimitReverse *= slowMult;
        speedLimitLateral *= slowMult;
    }

    // Max angular acceleration from specs
    const maxAngularAccel = turnTorqueAdjusted / inertia;

    // Input
    const inputX = state.inputX;
    const inputY = state.inputY;
    const inputMag = Math.hypot(inputX, inputY);
    const hasInput = inputMag > slimeConfig.assist.inputMagnitudeThreshold;

    // Local axes
    const forwardX = Math.cos(state.angle);
    const forwardY = Math.sin(state.angle);
    const rightX = -forwardY;
    const rightY = forwardX;

    // ═══ YAW (fly-by-wire with real physics) ═══
    let yawCmd = 0;
    let predictiveBraking = false;

    if (hasInput) {
        const targetAngle = Math.atan2(inputY, inputX);
        const angleDelta = wrapAngle(targetAngle - state.angle);

        const angularDeadzone = slimeConfig.assist.angularDeadzoneRad;
        if (Math.abs(angleDelta) > angularDeadzone) {
            const yawFull = slimeConfig.assist.yawFullDeflectionAngleRad;
            if (yawFull > 1e-6) {
                // Predictive braking (U2 FA:ON style)
                const angularDragK = worldPhysics.angularDragK;
                const effectiveDecel = maxAngularAccel + angularDragK * Math.abs(state.angVel);
                const stoppingAngle = (state.angVel * state.angVel) / (2 * effectiveDecel + 1e-6);
                const movingTowardsTarget =
                    (state.angVel > 0 && angleDelta > 0) || (state.angVel < 0 && angleDelta < 0);

                if (movingTowardsTarget && stoppingAngle >= Math.abs(angleDelta)) {
                    predictiveBraking = true;
                    yawCmd = 0;
                    state.yawSignHistory.length = 0;
                } else {
                    yawCmd = clamp(angleDelta / yawFull, -1, 1);
                    yawCmd = clamp(yawCmd * slimeConfig.assist.yawRateGain, -1, 1);
                    yawCmd = applyYawOscillationDamping(
                        state.yawSignHistory,
                        yawCmd,
                        slimeConfig.assist.yawOscillationWindowFrames,
                        slimeConfig.assist.yawOscillationSignFlipsThreshold,
                        slimeConfig.assist.yawDampingBoostFactor,
                    );
                }
            }
        } else {
            state.yawSignHistory.length = 0;
        }
    } else {
        state.yawSignHistory.length = 0;
    }

    const hasYawInput = hasInput && Math.abs(yawCmd) >= slimeConfig.assist.yawCmdEps && !predictiveBraking;
    let torque = 0;
    if (hasYawInput) {
        const desiredAngVel = yawCmd * angularLimit;
        const angVelError = desiredAngVel - state.angVel;
        const reactionTime = Math.max(slimeConfig.assist.reactionTimeS, 0.001);
        const desiredAlpha = angVelError / reactionTime;
        const clampedAlpha = clamp(desiredAlpha, -maxAngularAccel, maxAngularAccel);
        torque = inertia * clampedAlpha;
    } else if (Math.abs(state.angVel) > 1e-3) {
        // Brake boost
        const boostFactor = predictiveBraking ? 1.0 : (slimeConfig.assist.angularBrakeBoostFactor || 1.0);
        const brakeTime = predictiveBraking
            ? dt
            : Math.max(slimeConfig.assist.angularStopTimeS / boostFactor, dt);
        const desiredAlpha = -state.angVel / brakeTime;
        const clampedAlpha = clamp(desiredAlpha, -maxAngularAccel, maxAngularAccel);
        torque = inertia * clampedAlpha;
    }

    // ═══ LINEAR MOVEMENT (fly-by-wire with real physics) ═══
    let desiredVx = 0;
    let desiredVy = 0;

    if (hasInput) {
        const inputDirX = inputX / inputMag;
        const inputDirY = inputY / inputMag;

        const inputForward = inputDirX * forwardX + inputDirY * forwardY;
        const inputRight = inputDirX * rightX + inputDirY * rightY;

        const desiredForwardSpeed =
            inputForward >= 0
                ? inputForward * inputMag * speedLimitForward
                : inputForward * inputMag * speedLimitReverse;
        const desiredLateralSpeed = inputRight * inputMag * speedLimitLateral;

        desiredVx = forwardX * desiredForwardSpeed + rightX * desiredLateralSpeed;
        desiredVy = forwardY * desiredForwardSpeed + rightY * desiredLateralSpeed;
    }

    // Velocity error in world coords
    const vErrorX = desiredVx - state.vx;
    const vErrorY = desiredVy - state.vy;

    // Project error onto local axes
    const errorForward = vErrorX * forwardX + vErrorY * forwardY;
    const errorRight = vErrorX * rightX + vErrorY * rightY;

    let forceForward = 0;
    let forceRight = 0;

    const accelTime = hasInput ? slimeConfig.assist.accelTimeS : slimeConfig.assist.comfortableBrakingTimeS;

    // Forward/reverse force
    if (Math.abs(errorForward) > slimeConfig.assist.velocityErrorThreshold) {
        const desiredAccelForward = errorForward / Math.max(accelTime, dt);
        const thrustLimit = errorForward >= 0 ? thrustForward : thrustReverse;
        const maxAccelForward = thrustLimit / mass;
        const clampedAccelForward = clamp(desiredAccelForward, -maxAccelForward, maxAccelForward);
        forceForward = mass * clampedAccelForward;
    }

    // Lateral force
    if (Math.abs(errorRight) > slimeConfig.assist.velocityErrorThreshold) {
        const desiredAccelRight = errorRight / Math.max(accelTime, dt);
        const maxAccelRight = thrustLateral / mass;
        const clampedAccelRight = clamp(desiredAccelRight, -maxAccelRight, maxAccelRight);
        forceRight = mass * clampedAccelRight;
    }

    // ═══ Counter-acceleration ═══
    if (slimeConfig.assist.counterAccelEnabled && hasInput) {
        const currentSpeed = Math.hypot(state.vx, state.vy);
        const desiredSpeed = Math.hypot(desiredVx, desiredVy);

        if (currentSpeed >= slimeConfig.assist.counterAccelMinSpeedMps && desiredSpeed > 1e-3) {
            const currentVelAngle = Math.atan2(state.vy, state.vx);
            const desiredVelAngle = Math.atan2(desiredVy, desiredVx);
            const angleDiff = Math.abs(wrapAngle(desiredVelAngle - currentVelAngle));

            const thresholdRad = (slimeConfig.assist.counterAccelDirectionThresholdDeg * Math.PI) / 180;

            if (angleDiff > thresholdRad) {
                const desiredDirX = desiredVx / desiredSpeed;
                const desiredDirY = desiredVy / desiredSpeed;

                const vParallel = state.vx * desiredDirX + state.vy * desiredDirY;
                const vPerpX = state.vx - vParallel * desiredDirX;
                const vPerpY = state.vy - vParallel * desiredDirY;
                const vPerpMag = Math.hypot(vPerpX, vPerpY);

                if (vPerpMag > 1e-3) {
                    const counterAccelTime = Math.max(slimeConfig.assist.counterAccelTimeS, 0.001);
                    const desiredPerpAccel = -vPerpMag / counterAccelTime;

                    const perpDirX = vPerpX / vPerpMag;
                    const perpDirY = vPerpY / vPerpMag;

                    const perpForward = perpDirX * forwardX + perpDirY * forwardY;
                    const perpRight = perpDirX * rightX + perpDirY * rightY;

                    const counterForceForward = mass * desiredPerpAccel * perpForward;
                    const counterForceRight = mass * desiredPerpAccel * perpRight;

                    const limitedForward = counterForceForward >= 0
                        ? Math.min(counterForceForward, thrustForward)
                        : Math.max(counterForceForward, -thrustReverse);
                    const limitedRight = counterForceRight >= 0
                        ? Math.min(counterForceRight, thrustLateral)
                        : Math.max(counterForceRight, -thrustLateral);

                    forceForward += limitedForward;
                    forceRight += limitedRight;
                }
            }
        }
    }

    // ═══ Overspeed damping ═══
    const overspeedRate = slimeConfig.assist.overspeedDampingRate;
    if (overspeedRate > 0) {
        const vForward = state.vx * forwardX + state.vy * forwardY;
        const forwardLimit = vForward >= 0 ? speedLimitForward : speedLimitReverse;
        const forwardExcess = Math.abs(vForward) - forwardLimit;
        if (forwardExcess > 0) {
            const dvTarget = -Math.sign(vForward) * forwardExcess * overspeedRate;
            const safeDt = dt > 0 ? dt : 1 / 30;
            const desiredAccelForward = dvTarget / safeDt;
            const thrustLimit = vForward >= 0 ? thrustReverse : thrustForward;
            const maxAccelForward = thrustLimit / Math.max(mass, 1e-6);
            let brakeForce = mass * clamp(desiredAccelForward, -maxAccelForward, maxAccelForward);
            if (!hasInput) {
                brakeForce *= slimeConfig.assist.autoBrakeMaxThrustFraction;
            }
            forceForward += brakeForce;
        }

        const vRight = state.vx * rightX + state.vy * rightY;
        const lateralExcess = Math.abs(vRight) - speedLimitLateral;
        if (lateralExcess > 0) {
            const dvTarget = -Math.sign(vRight) * lateralExcess * overspeedRate;
            const desiredAccelRight = dvTarget / (dt > 0 ? dt : 1 / 30);
            const maxAccelRight = thrustLateral / Math.max(mass, 1e-6);
            let brakeForce = mass * clamp(desiredAccelRight, -maxAccelRight, maxAccelRight);
            if (!hasInput) {
                brakeForce *= slimeConfig.assist.autoBrakeMaxThrustFraction;
            }
            forceRight += brakeForce;
        }
    }

    // Clamp total force to available thrust
    forceForward = clamp(forceForward, -thrustReverse, thrustForward);
    forceRight = clamp(forceRight, -thrustLateral, thrustLateral);

    // Convert to world coordinates
    const forceX = forwardX * forceForward + rightX * forceRight;
    const forceY = forwardY * forceForward + rightY * forceRight;

    return { assistFx: forceX, assistFy: forceY, assistTorque: torque };
}
