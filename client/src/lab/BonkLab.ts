/**
 * BonkLab — standalone sandbox orchestrator for testing physics/FA tuning.
 *
 * Uses the EXACT same physics pipeline as the server:
 *   computeFlightAssist() → integratePhysics() → collisions
 *
 * Fully client-side, no server connection required.
 */

import type {
    SlimeConfig,
    WorldPhysicsConfig,
} from "@bonk-race/shared";
import {
    resolveBalanceConfig,
    computeFlightAssist,
    integratePhysics,
    resolveWallCollision,
    resolveCircleStaticCollision,
    Rng,
} from "@bonk-race/shared";
import type {
    ISlimePhysicsState,
    ISlimeModifiers,
    IExternalMultipliers,
    IWorldPhysicsParams,
    IFlightAssistOutput,
    IWorldDragParams,
    ICircleBody,
    IStaticObstacle,
    IWallBounds,
    Arena,
    ArenaZone,
} from "@bonk-race/shared";
import { generateArena } from "@bonk-race/shared";

import balanceJson from "../../../config/balance.json";

// ─── SandboxState ────────────────────────────────────────────────────────────

export interface SandboxState {
    // Character
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angularVelocity: number;
    mass: number;
    radius: number;

    // Input
    inputX: number;
    inputY: number;
    inputMagnitude: number;

    // FA output (for visualization)
    assistFx: number;
    assistFy: number;
    assistTorque: number;
    faState: "accel" | "brake" | "drift-correction" | "idle";

    // Correction vector (for orange arrow)
    correctionFx: number;
    correctionFy: number;

    // Arena
    arena: Arena;

    // Timing
    elapsedTime: number;

    // Current zone
    currentZone: string | null;

    // Death state (spike hit)
    deathTimer: number;
    deathX: number;
    deathY: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_DT = 1 / 60; // 16.7ms — 60 Hz, smooth rendering (server runs 30 Hz)
const DEATH_FREEZE_S = 0.8; // seconds to freeze after spike death (GDD §4.2)

/**
 * Determines the FA state label based on input and velocity error.
 */
function classifyFaState(
    hasInput: boolean,
    faOutput: IFlightAssistOutput,
    vx: number,
    vy: number,
    correctionFx: number,
    correctionFy: number,
): SandboxState["faState"] {
    if (!hasInput) {
        const hasBrakingForce = Math.abs(faOutput.assistFx) > 0.01 || Math.abs(faOutput.assistFy) > 0.01;
        return hasBrakingForce ? "brake" : "idle";
    }

    const speed = Math.hypot(vx, vy);
    const forceMag = Math.hypot(faOutput.assistFx, faOutput.assistFy);

    if (forceMag < 0.01) return "idle";

    // Detect drift correction: correction vector is >40% of total force
    const corrMag = Math.hypot(correctionFx, correctionFy);
    if (corrMag > forceMag * 0.4 && speed > 5) return "drift-correction";

    // Check if force opposes velocity (braking)
    if (speed > 1) {
        const dot = (faOutput.assistFx * vx + faOutput.assistFy * vy) / (forceMag * speed);
        if (dot < -0.3) return "brake";
    }

    return "accel";
}

/**
 * Set a deep property on a nested object using a dotted key path.
 * e.g. setNestedValue(obj, "propulsion.thrustForwardN", 5000)
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (UNSAFE_KEYS.has(key)) return;
        if (current[key] === undefined || typeof current[key] !== "object") {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    const finalKey = keys[keys.length - 1];
    if (UNSAFE_KEYS.has(finalKey)) return;
    current[finalKey] = value;
}

/**
 * Deep-clone a plain object (no functions/dates/etc).
 */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// ─── BonkLab ─────────────────────────────────────────────────────────────────

export class BonkLab {
    /** All tunable parameters, initialized from balance.json defaults */
    params: Record<string, number | boolean>;

    // Stored for future LabRenderer use
    readonly canvas: HTMLCanvasElement;
    private running = false;
    private rafId = 0;
    private accumulator = 0;
    private lastTimestamp = 0;

    // Physics state
    private slimeConfig: SlimeConfig;
    private worldPhysics: WorldPhysicsConfig;
    private arena: Arena;
    private mass: number;
    private yawSignHistory: number[] = [];

    // Position / velocity
    private x = 0;
    private y = 0;
    private vx = 0;
    private vy = 0;
    private angle = 0;
    private angVel = 0;

    // Input
    private inputX = 0;
    private inputY = 0;
    private inputMagnitude = 0;

    // Last FA output (for visualization)
    private lastFaOutput: IFlightAssistOutput = { assistFx: 0, assistFy: 0, assistTorque: 0 };
    private lastFaState: SandboxState["faState"] = "idle";
    private correctionFx = 0;
    private correctionFy = 0;

    // Timing
    private elapsedTime = 0;

    // Zone
    private currentZone: string | null = null;

    // Arena generation state (remembered for re-generation on size change)
    private lastSeed = 42;
    private lastDensity = 1.0;

    // Death state (spike hit — GDD §4.2: instant defeat → restart)
    private deathTimer = 0;
    private deathX = 0;
    private deathY = 0;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        // Resolve balance.json through the shared config parser
        const resolved = resolveBalanceConfig(balanceJson);
        this.slimeConfig = deepClone(resolved.slimeConfigs.base);
        this.worldPhysics = deepClone(resolved.worldPhysics);
        this.mass = resolved.slime.initialMass;

        // Build flat params from balance.json defaults
        this.params = this.buildFlatParams();

        // Generate initial arena
        const rng = new Rng(42);
        this.arena = generateArena(
            {
                seed: 42,
                widthM: this.worldPhysics.widthM ?? 1000,
                heightM: this.worldPhysics.heightM ?? 1000,
                objectDensity: 1.0,
            },
            rng,
        );

        // Place character at spawn
        this.x = this.arena.spawnPoint.x;
        this.y = this.arena.spawnPoint.y;

        console.log("[BonkLab] initialized", {
            mass: this.mass,
            arenaSize: `${this.arena.width}x${this.arena.height}`,
            obstacles: this.arena.obstacles.length,
            zones: this.arena.zones.length,
        });
    }

    // ── Public API ───────────────────────────────────────────────────────────

    start(): void {
        if (this.running) return;
        this.running = true;
        this.lastTimestamp = 0;
        this.accumulator = 0;
        this.rafId = requestAnimationFrame((ts) => this.loop(ts));
        console.log("[BonkLab] simulation started");
    }

    stop(): void {
        if (!this.running) return;
        this.running = false;
        cancelAnimationFrame(this.rafId);
        console.log("[BonkLab] simulation stopped");
    }

    reset(): void {
        this.x = this.arena.spawnPoint.x;
        this.y = this.arena.spawnPoint.y;
        this.vx = 0;
        this.vy = 0;
        this.angle = 0;
        this.angVel = 0;
        this.elapsedTime = 0;
        this.accumulator = 0;
        this.lastTimestamp = 0;
        this.yawSignHistory.length = 0;
        this.inputX = 0;
        this.inputY = 0;
        this.inputMagnitude = 0;
        this.lastFaOutput = { assistFx: 0, assistFy: 0, assistTorque: 0 };
        this.lastFaState = "idle";
        this.correctionFx = 0;
        this.correctionFy = 0;
        this.currentZone = null;
        this.deathTimer = 0;
        this.deathX = 0;
        this.deathY = 0;
        console.log("[BonkLab] state reset");
    }

    updateParams(key: string, value: number | boolean): void {
        this.params[key] = value;

        // Handle special keys
        if (key === "mass") {
            this.mass = value as number;
            return;
        }

        // Map worldPhysics params
        if (key.startsWith("worldPhysics.")) {
            const wpKey = key.replace("worldPhysics.", "");
            setNestedValue(this.worldPhysics as unknown as Record<string, unknown>, wpKey, value);
            // Re-generate arena when map dimensions change
            if (wpKey === "widthM" || wpKey === "heightM") {
                this.regenerateArena(this.lastSeed, this.lastDensity);
            }
            return;
        }

        // Zone params → update arena zones live
        if (key.startsWith("zones.")) {
            this.syncZoneParams(key, value as number);
            return;
        }

        // All other keys map to slimeConfig
        setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
    }

    /** Sync zone slider values into arena zone objects */
    private syncZoneParams(key: string, value: number): void {
        // key format: "zones.ice.frictionMultiplier" → zoneType="ice", paramKey="frictionMultiplier"
        const parts = key.split(".");
        if (parts.length < 3) return;
        const zoneType = parts[1];
        const paramKey = parts[2];
        for (const zone of this.arena.zones) {
            if (zone.type === zoneType) {
                zone.params[paramKey] = value;
            }
        }
    }

    getState(): SandboxState {
        return {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            angle: this.angle,
            angularVelocity: this.angVel,
            mass: this.mass,
            radius: this.slimeConfig.geometry.baseRadiusM,

            inputX: this.inputX,
            inputY: this.inputY,
            inputMagnitude: this.inputMagnitude,

            assistFx: this.lastFaOutput.assistFx,
            assistFy: this.lastFaOutput.assistFy,
            assistTorque: this.lastFaOutput.assistTorque,
            faState: this.lastFaState,

            correctionFx: this.correctionFx,
            correctionFy: this.correctionFy,

            arena: this.arena,
            elapsedTime: this.elapsedTime,
            currentZone: this.currentZone,

            deathTimer: this.deathTimer,
            deathX: this.deathX,
            deathY: this.deathY,
        };
    }

    setInput(x: number, y: number, magnitude: number): void {
        this.inputX = x;
        this.inputY = y;
        this.inputMagnitude = magnitude;
    }

    regenerateArena(seed: number, density: number): void {
        this.lastSeed = seed;
        this.lastDensity = density;
        const rng = new Rng(seed);
        this.arena = generateArena(
            {
                seed,
                widthM: this.worldPhysics.widthM ?? 1000,
                heightM: this.worldPhysics.heightM ?? 1000,
                objectDensity: density,
            },
            rng,
        );
        // Full state reset (position, velocity, FA state, timers)
        this.reset();
        // Reapply zone overrides from current params to new arena zones
        for (const key of Object.keys(this.params)) {
            if (key.startsWith("zones.")) {
                this.syncZoneParams(key, this.params[key] as number);
            }
        }

        console.log("[BonkLab] arena regenerated", { seed, density, obstacles: this.arena.obstacles.length });
    }

    // ── Simulation Loop (private) ────────────────────────────────────────────

    private loop(timestamp: number): void {
        if (!this.running) return;

        if (this.lastTimestamp === 0) {
            this.lastTimestamp = timestamp;
        }

        const frameDt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1); // cap at 100ms
        this.lastTimestamp = timestamp;
        this.accumulator += frameDt;

        // Fixed timestep simulation at 60 Hz
        while (this.accumulator >= FIXED_DT) {
            this.tick(FIXED_DT);
            this.accumulator -= FIXED_DT;
        }

        this.rafId = requestAnimationFrame((ts) => this.loop(ts));
    }

    private tick(dt: number): void {
        // Death freeze — wait before respawn (GDD §4.2)
        if (this.deathTimer > 0) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                this.deathTimer = 0;
                this.x = this.arena.spawnPoint.x;
                this.y = this.arena.spawnPoint.y;
                this.vx = 0;
                this.vy = 0;
                this.angle = 0;
                this.angVel = 0;
                // Clear FA state to prevent stale oscillation damping after respawn
                this.yawSignHistory.length = 0;
                this.lastFaOutput = { assistFx: 0, assistFy: 0, assistTorque: 0 };
                this.lastFaState = "idle";
                this.correctionFx = 0;
                this.correctionFy = 0;
                this.currentZone = null;
            }
            return;
        }

        const mass = this.mass;
        const slimeConfig = this.slimeConfig;
        const radius = slimeConfig.geometry.baseRadiusM;
        const inertia = slimeConfig.geometry.inertiaFactor * mass * radius * radius;

        // ── 1. Build FA input state ──
        const faState: ISlimePhysicsState = {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            angle: this.angle,
            angVel: this.angVel,
            mass,
            inputX: this.inputX,
            inputY: this.inputY,
            isDead: false,
            isLastBreath: false,
            slowPct: 0,
            yawSignHistory: this.yawSignHistory,
        };

        // Apply zone effects to slowPct
        if (this.currentZone === "slime") {
            // slime zone slows the character
            const zoneData = this.findCurrentZone();
            if (zoneData) {
                faState.slowPct = 1 - (zoneData.params.speedMultiplier ?? 1);
            }
        }

        // Neutral modifiers (no talents in sandbox)
        const modifiers: ISlimeModifiers = {
            thrustForwardBonus: 0,
            thrustReverseBonus: 0,
            thrustLateralBonus: 0,
            turnBonus: 0,
            speedLimitBonus: 0,
            lightningSpeedBonus: 0,
        };

        // Zone speed multiplier
        let zoneSpeedMultiplier = 1;
        if (this.currentZone === "turbo") {
            const zoneData = this.findCurrentZone();
            if (zoneData) {
                zoneSpeedMultiplier = zoneData.params.speedMultiplier ?? 1;
            }
        }

        const external: IExternalMultipliers = {
            hasteSpeedMultiplier: 1,
            zoneSpeedMultiplier,
            lastBreathSpeedPenalty: 1,
        };

        const worldPhysicsParams: IWorldPhysicsParams = {
            angularDragK: this.worldPhysics.angularDragK,
        };

        // ── 2. Compute Flight Assist ──
        const faOutput = computeFlightAssist(
            faState,
            slimeConfig,
            inertia,
            modifiers,
            external,
            worldPhysicsParams,
            dt,
        );

        this.lastFaOutput = faOutput;

        const hasInput = this.inputMagnitude > slimeConfig.assist.inputMagnitudeThreshold;

        // Compute correction vector BEFORE classify (it needs correctionF values)
        if (hasInput && Math.hypot(this.vx, this.vy) > 1) {
            const inputAngle = Math.atan2(this.inputY, this.inputX);
            const thrustDirX = Math.cos(inputAngle);
            const thrustDirY = Math.sin(inputAngle);
            const forceMag = Math.hypot(faOutput.assistFx, faOutput.assistFy);
            if (forceMag > 0.01) {
                const forceDirX = faOutput.assistFx / forceMag;
                const forceDirY = faOutput.assistFy / forceMag;
                // Correction is the perpendicular component relative to input direction
                const dot = forceDirX * thrustDirX + forceDirY * thrustDirY;
                this.correctionFx = faOutput.assistFx - dot * forceMag * thrustDirX;
                this.correctionFy = faOutput.assistFy - dot * forceMag * thrustDirY;
            } else {
                this.correctionFx = 0;
                this.correctionFy = 0;
            }
        } else {
            // No input — no meaningful correction to visualize
            this.correctionFx = 0;
            this.correctionFy = 0;
        }

        // Classify FA state (after correction is computed)
        this.lastFaState = classifyFaState(
            hasInput, faOutput, this.vx, this.vy,
            this.correctionFx, this.correctionFy,
        );

        // ── 3. Integrate Physics ──
        const dragParams: IWorldDragParams = {
            linearDragK: this.worldPhysics.linearDragK,
            angularDragK: this.worldPhysics.angularDragK,
        };

        // Zone friction multiplier
        let zoneFrictionMultiplier = 1;
        if (this.currentZone === "ice") {
            const zoneData = this.findCurrentZone();
            if (zoneData) {
                zoneFrictionMultiplier = zoneData.params.frictionMultiplier ?? 1;
            }
        } else if (this.currentZone === "slime") {
            const zoneData = this.findCurrentZone();
            if (zoneData) {
                zoneFrictionMultiplier = zoneData.params.frictionMultiplier ?? 1;
            }
        }

        const integratorState = {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            angle: this.angle,
            angVel: this.angVel,
        };

        const result = integratePhysics(
            integratorState,
            faOutput,
            mass,
            inertia,
            slimeConfig,
            dragParams,
            zoneFrictionMultiplier,
            false, // isLastBreath
            1, // lastBreathSpeedPenalty
            dt,
        );

        this.x = result.x;
        this.y = result.y;
        this.vx = result.vx;
        this.vy = result.vy;
        this.angle = result.angle;
        this.angVel = result.angVel;

        // ── 4. Collision resolution (4 iterations, matching server) ──
        const body: ICircleBody = {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            radius,
            mass,
        };

        const collisionConfig = {
            correctionPercent: 0.8,
            slop: 0.001,
            maxCorrection: this.worldPhysics.maxPositionCorrectionM ?? 0.5,
        };

        // Wall bounds
        const halfW = this.arena.width / 2;
        const halfH = this.arena.height / 2;
        const wallBounds: IWallBounds = {
            minX: -halfW,
            maxX: halfW,
            minY: -halfH,
            maxY: halfH,
        };

        const iterations = 4;
        let hitSpike = false;
        for (let iter = 0; iter < iterations; iter++) {
            // Obstacle collisions first (matching server order)
            for (const obs of this.arena.obstacles) {
                const staticObs: IStaticObstacle = {
                    x: obs.x,
                    y: obs.y,
                    radius: obs.radius,
                    type: obs.type === "passage" ? "pillar" : (obs.type as "pillar" | "spike" | "wall"),
                };
                const collided = resolveCircleStaticCollision(body, staticObs, this.worldPhysics.restitution, collisionConfig);
                if (collided && obs.type === "spike") {
                    hitSpike = true;
                }
            }

            // Wall collisions last (rectangular arena boundary)
            resolveWallCollision(body, wallBounds, this.worldPhysics.restitution);
        }

        // Write collision results back (before death check — need corrected position)
        this.x = body.x;
        this.y = body.y;
        this.vx = body.vx;
        this.vy = body.vy;

        // Spike = instant death → freeze + respawn (GDD §4.2)
        if (hitSpike) {
            this.deathTimer = DEATH_FREEZE_S;
            this.deathX = this.x;
            this.deathY = this.y;
            this.vx = 0;
            this.vy = 0;
            this.angVel = 0;
            return;
        }

        // ── 5. Zone detection (point-in-circle) ──
        this.currentZone = null;
        for (const zone of this.arena.zones) {
            const dx = this.x - zone.x;
            const dy = this.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                this.currentZone = zone.type;
                break;
            }
        }

        // ── 6. Update elapsed time ──
        this.elapsedTime += dt;
    }

    /**
     * Find the ArenaZone the character is currently in (if any).
     */
    private findCurrentZone(): ArenaZone | null {
        for (const zone of this.arena.zones) {
            const dx = this.x - zone.x;
            const dy = this.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                return zone;
            }
        }
        return null;
    }

    // ── Parameter Mapping ────────────────────────────────────────────────────

    /**
     * Builds a flat Record<string, number|boolean> from the resolved balance config
     * for use by the UI panel. Keys use dotted paths matching the SlimeConfig structure.
     */
    private buildFlatParams(): Record<string, number | boolean> {
        const sc = this.slimeConfig;
        const wp = this.worldPhysics;

        return {
            // Mass
            "mass": this.mass,

            // Geometry
            "geometry.baseMassKg": sc.geometry.baseMassKg,
            "geometry.baseRadiusM": sc.geometry.baseRadiusM,
            "geometry.inertiaFactor": sc.geometry.inertiaFactor,

            // Propulsion
            "propulsion.thrustForwardN": sc.propulsion.thrustForwardN,
            "propulsion.thrustReverseN": sc.propulsion.thrustReverseN,
            "propulsion.thrustLateralN": sc.propulsion.thrustLateralN,
            "propulsion.turnTorqueNm": sc.propulsion.turnTorqueNm,

            // Limits
            "limits.speedLimitForwardMps": sc.limits.speedLimitForwardMps,
            "limits.speedLimitReverseMps": sc.limits.speedLimitReverseMps,
            "limits.speedLimitLateralMps": sc.limits.speedLimitLateralMps,
            "limits.angularSpeedLimitRadps": sc.limits.angularSpeedLimitRadps,

            // Assist
            "assist.comfortableBrakingTimeS": sc.assist.comfortableBrakingTimeS,
            "assist.angularStopTimeS": sc.assist.angularStopTimeS,
            "assist.angularBrakeBoostFactor": sc.assist.angularBrakeBoostFactor,
            "assist.autoBrakeMaxThrustFraction": sc.assist.autoBrakeMaxThrustFraction,
            "assist.overspeedDampingRate": sc.assist.overspeedDampingRate,
            "assist.yawFullDeflectionAngleRad": sc.assist.yawFullDeflectionAngleRad,
            "assist.yawOscillationWindowFrames": sc.assist.yawOscillationWindowFrames,
            "assist.yawOscillationSignFlipsThreshold": sc.assist.yawOscillationSignFlipsThreshold,
            "assist.yawDampingBoostFactor": sc.assist.yawDampingBoostFactor,
            "assist.yawCmdEps": sc.assist.yawCmdEps,
            "assist.angularDeadzoneRad": sc.assist.angularDeadzoneRad,
            "assist.yawRateGain": sc.assist.yawRateGain,
            "assist.reactionTimeS": sc.assist.reactionTimeS,
            "assist.accelTimeS": sc.assist.accelTimeS,
            "assist.velocityErrorThreshold": sc.assist.velocityErrorThreshold,
            "assist.inputMagnitudeThreshold": sc.assist.inputMagnitudeThreshold,
            "assist.counterAccelEnabled": sc.assist.counterAccelEnabled,
            "assist.counterAccelDirectionThresholdDeg": sc.assist.counterAccelDirectionThresholdDeg,
            "assist.counterAccelTimeS": sc.assist.counterAccelTimeS,
            "assist.counterAccelMinSpeedMps": sc.assist.counterAccelMinSpeedMps,

            // Reverse zone (locked — not yet implemented)
            "assist.reverseZoneAngleDeg": 0,

            // Mass scaling exponents
            "massScaling.thrustForwardN.exp": sc.massScaling.thrustForwardN.exp ?? 0,
            "massScaling.thrustReverseN.exp": sc.massScaling.thrustReverseN.exp ?? 0,
            "massScaling.thrustLateralN.exp": sc.massScaling.thrustLateralN.exp ?? 0,
            "massScaling.turnTorqueNm.exp": sc.massScaling.turnTorqueNm.exp ?? 0,
            "massScaling.speedLimitForwardMps.exp": sc.massScaling.speedLimitForwardMps.exp ?? 0,
            "massScaling.speedLimitReverseMps.exp": sc.massScaling.speedLimitReverseMps.exp ?? 0,
            "massScaling.speedLimitLateralMps.exp": sc.massScaling.speedLimitLateralMps.exp ?? 0,
            "massScaling.angularSpeedLimitRadps.exp": sc.massScaling.angularSpeedLimitRadps.exp ?? 0,

            // World physics
            "worldPhysics.widthM": wp.widthM ?? 1000,
            "worldPhysics.heightM": wp.heightM ?? 1000,
            "worldPhysics.linearDragK": wp.linearDragK,
            "worldPhysics.angularDragK": wp.angularDragK,
            "worldPhysics.restitution": wp.restitution,

            // Zone defaults (from arenaGenerator)
            "zones.ice.frictionMultiplier": 0.3,
            "zones.slime.frictionMultiplier": 2.0,
            "zones.slime.speedMultiplier": 0.5,
            "zones.turbo.speedMultiplier": 1.4,
        };
    }
}
