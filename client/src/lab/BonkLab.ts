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
    COUNTDOWN_TOTAL_S,
    DEATH_FREEZE_S,
    RESPAWN_GO_TOTAL_S,
    resolveBalanceConfig,
    computeFlightAssist,
    integratePhysics,
    resolveWallCollision,
    resolveCircleStaticCollision,
    Rng,
    DEFAULT_SURFACE_CONFIG,
    SURFACE_PRESETS,
    toSurfaceParams,
    toSurfaceAssistParams,
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
    ArenaObject,
    SurfaceConfig,
} from "@bonk-race/shared";
import type { SandboxOrb, SandboxState } from "./labTypes";
import { tickOrbs } from "./orbSimulator";
import { generateArena } from "@bonk-race/shared";
import { LabParamManager } from "./LabParamManager";

import balanceJson from "../../../config/balance.json";

/**
 * Максимальная скорость после knockback (м/с).
 * Выбрано чтобы блоб не телепортировался через стены при extreme impulse.
 */
const MAX_KNOCKBACK_SPEED = 2000;

// ─── Zone name → SurfaceConfig mapping for ArenaZone.type strings ───────────
// Mutable at runtime so LabPanel zone sliders can override presets.
function buildZoneSurfaces(): Record<string, SurfaceConfig> {
    return {
        ice: { ...SURFACE_PRESETS.ice },
        mud: { ...SURFACE_PRESETS.mud },
        turbo: { ...SURFACE_PRESETS.turbo },
        sand: { ...SURFACE_PRESETS.sand },
    };
}


// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXED_DT = 1 / 60; // 16.7ms — 60 Hz, smooth rendering (server runs 30 Hz)
// DEATH_FREEZE_S, COUNTDOWN_TOTAL_S, RESPAWN_GO_TOTAL_S — импортируются из @bonk-race/shared

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
 * Deep-clone a plain object (no functions/dates/etc).
 */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// ─── BonkLab ─────────────────────────────────────────────────────────────────

export class BonkLab {
    /** Delegated parameter manager (flat params, nested config patching, orb density sync) */
    private paramManager: LabParamManager;

    /** All tunable parameters, delegated to paramManager */
    get params(): Record<string, number | boolean | string> {
        return this.paramManager.params;
    }

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
    private angle = -Math.PI / 2; // face up (toward finish)
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
    private currentSurface: SurfaceConfig = DEFAULT_SURFACE_CONFIG;
    private zoneSurfaces: Record<string, SurfaceConfig> = buildZoneSurfaces();

    // Arena generation state (remembered for re-generation on size change)
    private lastSeed = 42;
    private lastDensity = 5.0;

    // Death state (spike hit — GDD §4.2: instant defeat → restart)
    private deathTimer = 0;
    private deathX = 0;
    private deathY = 0;
    private deathDistanceM = 0;
    /** Обратный отсчёт Go!-Go! после респауна (2×0.4с заморозка) */
    private respawnCountdown = 0;
    /** Стартовый обратный отсчёт 3-2-1-Go! */
    private startCountdown = 0;

    // Finish state
    private finished = false;
    private finishTime = 0;
    private bestTime = 0;
    private isNewRecord = false;

    // Orbs
    private orbs: SandboxOrb[] = [];

    /** True defaults (balance.json + BonkLab overrides, before any startup preset) */
    private readonly trueDefaults: Record<string, number | boolean | string>;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;

        // Resolve balance.json through the shared config parser
        const resolved = resolveBalanceConfig(balanceJson);
        this.slimeConfig = deepClone(resolved.slimeConfigs.base);
        this.worldPhysics = deepClone(resolved.worldPhysics);
        this.mass = resolved.slime.initialMass;

        // BonkLab-override defaults (TZ v1.2 §A1)
        this.slimeConfig.geometry.baseRadiusM = 20;
        this.worldPhysics.widthM = 800;
        this.worldPhysics.heightM = 10130;

        // Create parameter manager (owns flat params, nested config patching, orb density sync)
        this.paramManager = new LabParamManager(
            this.slimeConfig,
            this.worldPhysics,
            this.zoneSurfaces,
            this.mass,
            this.lastDensity,
        );

        // Build flat params from balance.json defaults + overrides
        this.paramManager.params = this.paramManager.buildFlatParams();
        // Snapshot true defaults before any startup preset is applied
        this.trueDefaults = { ...this.params };

        // Generate initial arena (use lastDensity to match UI default)
        this.arena = this.buildArena(42, this.lastDensity);

        // Initialize orbs from arena
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        // Share orbs reference with paramManager (for autoSyncOrbDensity)
        this.paramManager.orbs = this.orbs;

        // Place character at spawn
        this.x = this.arena.spawnPoint.x;
        this.y = this.arena.spawnPoint.y;

        console.log("[BonkLab] initialized", {
            mass: this.mass,
            arenaSize: `${this.arena.width}x${this.arena.height}`,
            obstacles: this.arena.obstacles.length,
            zones: this.arena.zones.length,
            orbs: this.orbs.length,
        });
    }

    // ── Public API ───────────────────────────────────────────────────────────

    start(): void {
        if (this.running) return;
        this.startCountdown = COUNTDOWN_TOTAL_S;
        this.running = true;
        this.lastTimestamp = 0;
        this.accumulator = 0;
        this.rafId = requestAnimationFrame((ts) => this.loop(ts));
        console.log(`[BonkLab] simulation started (countdown ${COUNTDOWN_TOTAL_S.toFixed(1)}s)`);
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
        this.angle = -Math.PI / 2; // face up (toward finish)
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
        this.respawnCountdown = 0;
        this.startCountdown = 0;
        this.finished = false;
        this.finishTime = 0;
        this.isNewRecord = false;
        this.deathDistanceM = 0;
        // bestTime persists across resets (record tracking)
        // Reset orb density auto-sync (user didn't manually set it via reset)
        this.paramManager.orbDensityManual = false;
        this.restoreDestroyedObstacles();
        // Reset orbs to initial state from arena seed
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        // Keep paramManager's orbs reference in sync
        this.paramManager.orbs = this.orbs;
        console.log("[BonkLab] state reset");
    }

    /** Восстанавливает уничтоженные шипы (после reset/respawn) */
    private restoreDestroyedObstacles(): void {
        for (const obs of this.arena.obstacles) {
            if (obs.alive === false) obs.alive = true;
        }
    }

    /** Build an Arena from seed+density+current params */
    private buildArena(seed: number, density: number): Arena {
        const rng = new Rng(seed);
        const baseRadius = this.slimeConfig.geometry.baseRadiusM;
        return generateArena(
            {
                seed,
                widthM: this.worldPhysics.widthM ?? 800,
                heightM: this.worldPhysics.heightM ?? 10130,
                objectDensity: density,
                pillarRadius: (this.params["arena.pillarRadius"] as number) ?? baseRadius,
                spikeRadius: (this.params["arena.spikeRadius"] as number) ?? baseRadius,
                passageRadius: (this.params["arena.passageRadius"] as number) ?? baseRadius,
                passageGap: (this.params["arena.passageGap"] as number) ?? baseRadius * 2 * 1.2,
                orbCount: (this.params["orbs.count"] as number) ?? 10,
                orbMinRadius: (this.params["orbs.minRadius"] as number) ?? 5,
                orbMaxRadius: (this.params["orbs.maxRadius"] as number) ?? 25,
                orbDensity: (this.params["orbs.density"] as number) ?? this.mass / (Math.PI * baseRadius * baseRadius),
                orbMinSpeed: (this.params["orbs.minSpeed"] as number) ?? 0,
                orbMaxSpeed: (this.params["orbs.maxSpeed"] as number) ?? 50,
            },
            rng,
        );
    }

    updateParams(key: string, value: number | boolean | string): void {
        const effect = this.paramManager.update(key, value);
        if (effect.massChanged) {
            this.mass = this.paramManager.mass;
        }
        // Sync lastDensity (paramManager owns it for "arena.objectDensity" key)
        this.lastDensity = this.paramManager.lastDensity;
        if (effect.regenerateArena) {
            this.regenerateArena(this.lastSeed, this.lastDensity);
        }
    }

    /** Distance from spawn toward finish (metres, 0 at spawn, positive going up) */
    private computeDistance(): number {
        return Math.max(0, this.arena.spawnPoint.y - this.y);
    }

    /** Progress from spawn to finish as 0..1 */
    private computeProgress(): number {
        const total = this.arena.spawnPoint.y - this.arena.finishPoint.y;
        if (total <= 0) return 0;
        return Math.max(0, Math.min(1, this.computeDistance() / total));
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
            orbs: this.orbs,
            elapsedTime: this.elapsedTime,
            currentZone: this.currentZone,

            distanceM: this.computeDistance(),
            progressPct: this.computeProgress(),

            deathTimer: this.deathTimer,
            deathX: this.deathX,
            deathY: this.deathY,
            deathDistanceM: this.deathDistanceM,
            respawnCountdown: this.respawnCountdown,
            startCountdown: this.startCountdown,

            finished: this.finished,
            finishTime: this.finishTime,
            bestTime: this.bestTime,
            isNewRecord: this.isNewRecord,
        };
    }

    /** Returns true defaults (balance.json + BonkLab overrides, before startup preset) */
    getDefaults(): Record<string, number | boolean | string> {
        return this.trueDefaults;
    }

    /** Reset orbDensityManual flag (called before batch reset/preset application) */
    resetOrbDensityManual(): void {
        this.paramManager.orbDensityManual = false;
    }

    setInput(x: number, y: number, magnitude: number): void {
        this.inputX = x;
        this.inputY = y;
        this.inputMagnitude = magnitude;
    }

    regenerateArena(seed: number, density: number): void {
        this.lastSeed = seed;
        this.lastDensity = density;
        this.arena = this.buildArena(seed, density);
        // Preserve orbDensityManual across reset (regenerateArena is called from
        // updateParams paths including manual orbs.density change — reset() must
        // not clobber the flag that was just set)
        const savedOrbDensityManual = this.paramManager.orbDensityManual;
        // Full state reset (position, velocity, FA state, timers, orbs)
        this.reset();
        this.paramManager.orbDensityManual = savedOrbDensityManual;
        this.bestTime = 0; // reset record — track layout changed

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
        // Стартовый обратный отсчёт — физика заморожена
        if (this.startCountdown > 0) {
            this.startCountdown -= dt;
            if (this.startCountdown <= 0) {
                this.startCountdown = 0;
                // Сбросить stale input чтобы персонаж не двигался после Go!
                this.inputX = 0;
                this.inputY = 0;
                this.inputMagnitude = 0;
            }
            return;
        }

        // Finished — simulation frozen until restart
        if (this.finished) return;

        // Death freeze — wait before respawn (GDD §4.2)
        if (this.deathTimer > 0) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                this.deathTimer = 0;
                this.x = this.arena.spawnPoint.x;
                this.y = this.arena.spawnPoint.y;
                this.vx = 0;
                this.vy = 0;
                this.angle = -Math.PI / 2; // face up (toward finish)
                this.angVel = 0;
                // Reset stopwatch on respawn (TZ v1.2 §A4)
                this.elapsedTime = 0;
                // Clear FA state to prevent stale oscillation damping after respawn
                this.yawSignHistory.length = 0;
                this.lastFaOutput = { assistFx: 0, assistFy: 0, assistTorque: 0 };
                this.lastFaState = "idle";
                this.correctionFx = 0;
                this.correctionFy = 0;
                this.currentZone = null;
                this.restoreDestroyedObstacles();
                // Go!-Go! отсчёт (2×0.4с заморозка после респауна)
                this.respawnCountdown = RESPAWN_GO_TOTAL_S;
            }
            return;
        }

        // Заморозка Go!-Go! после респауна — ввод запрещён
        if (this.respawnCountdown > 0) {
            this.respawnCountdown -= dt;
            if (this.respawnCountdown <= 0) {
                this.respawnCountdown = 0;
                // Сбросить stale input чтобы персонаж не двигался после Go!
                this.inputX = 0;
                this.inputY = 0;
                this.inputMagnitude = 0;
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

        // Neutral modifiers (no talents in sandbox)
        const modifiers: ISlimeModifiers = {
            thrustForwardBonus: 0,
            thrustReverseBonus: 0,
            thrustLateralBonus: 0,
            turnBonus: 0,
            speedLimitBonus: 0,
            lightningSpeedBonus: 0,
        };

        const external: IExternalMultipliers = {
            hasteSpeedMultiplier: 1,
            lastBreathSpeedPenalty: 1,
        };

        const worldPhysicsParams: IWorldPhysicsParams = {
            angularDragK: this.worldPhysics.angularDragK,
        };

        // ── 2. Compute Flight Assist (with surface zone multipliers) ──
        const surfaceAssist = toSurfaceAssistParams(this.currentSurface);
        const faOutput = computeFlightAssist(
            faState,
            slimeConfig,
            inertia,
            modifiers,
            external,
            worldPhysicsParams,
            surfaceAssist,
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
            forwardDragK: this.worldPhysics.forwardDragK,
            lateralGripMultiplier: this.worldPhysics.lateralGripMultiplier,
            angularDragK: this.worldPhysics.angularDragK,
        };

        const integratorState = {
            x: this.x,
            y: this.y,
            vx: this.vx,
            vy: this.vy,
            angle: this.angle,
            angVel: this.angVel,
        };

        const surfaceParams = toSurfaceParams(this.currentSurface);
        const result = integratePhysics(
            integratorState,
            faOutput,
            mass,
            inertia,
            slimeConfig,
            dragParams,
            surfaceParams,
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
        let spikeNx = 0;
        let spikeNy = 0;
        const hitSpikeSet = new Set<ArenaObject>();
        for (let iter = 0; iter < iterations; iter++) {
            // Obstacle collisions first (matching server order)
            for (const obs of this.arena.obstacles) {
                // Skip destroyed spikes
                if (obs.alive === false) continue;

                const staticObs: IStaticObstacle = {
                    x: obs.x,
                    y: obs.y,
                    radius: obs.radius,
                    type: obs.type === "passage" ? "pillar" : (obs.type as "pillar" | "spike" | "wall"),
                };
                const rest = obs.type === "passage"
                    ? (this.params["worldPhysics.passageRestitution"] as number ?? this.worldPhysics.restitution * 0.5)
                    : this.worldPhysics.restitution;
                const collided = resolveCircleStaticCollision(body, staticObs, rest, collisionConfig);
                if (collided && obs.type === "spike" && !hitSpikeSet.has(obs)) {
                    // Record spike once (avoid re-counting across iterations)
                    const dx = body.x - obs.x;
                    const dy = body.y - obs.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    spikeNx += dx / dist;
                    spikeNy += dy / dist;
                    hitSpikeSet.add(obs);
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

        // Spike collision response — knockback is ADDITIVE to post-bounce velocity
        if (hitSpikeSet.size > 0) {
            // Normalize accumulated normal (fallback to (1,0) if degenerate)
            const nLen = Math.sqrt(spikeNx * spikeNx + spikeNy * spikeNy);
            if (nLen > 1e-6) {
                spikeNx /= nLen;
                spikeNy /= nLen;
            } else {
                spikeNx = 1;
                spikeNy = 0;
            }

            const spikeKillOnHit = this.params["spike.killOnHit"] as boolean ?? false;
            const spikeDestroyOnHit = this.params["spike.destroyOnHit"] as boolean ?? false;
            const spikeKnockbackImpulse = (this.params["spike.knockbackImpulse"] as number) ?? 30_000;

            if (spikeKillOnHit) {
                this.deathTimer = DEATH_FREEZE_S;
                this.deathX = this.x;
                this.deathY = this.y;
                this.deathDistanceM = this.computeDistance();
                this.vx = 0;
                this.vy = 0;
                this.angVel = 0;
                body.vx = 0;
                body.vy = 0;
                if (spikeDestroyOnHit) {
                    for (const obj of hitSpikeSet) obj.alive = false;
                }
                return;
            }

            // Knockback: dv = impulse / mass (тяжёлый блоб отлетает меньше)
            const safeMass = Math.max(mass, 0.01);
            const dv = spikeKnockbackImpulse / safeMass;
            this.vx += spikeNx * dv;
            this.vy += spikeNy * dv;

            // Ограничение скорости после knockback
            const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (speed > MAX_KNOCKBACK_SPEED) {
                const scale = MAX_KNOCKBACK_SPEED / speed;
                this.vx *= scale;
                this.vy *= scale;
            }

            // Sync body so tickOrbs doesn't overwrite knockback
            body.vx = this.vx;
            body.vy = this.vy;

            if (spikeDestroyOnHit) {
                for (const obj of hitSpikeSet) obj.alive = false;
            }
        }

        // ── 5. Zone detection (point-in-circle) ──
        this.currentZone = null;
        this.currentSurface = DEFAULT_SURFACE_CONFIG;
        for (const zone of this.arena.zones) {
            const dx = this.x - zone.x;
            const dy = this.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                this.currentZone = zone.type;
                this.currentSurface = this.zoneSurfaces[zone.type] ?? DEFAULT_SURFACE_CONFIG;
                break;
            }
        }

        // ── 6. Orb physics ──
        tickOrbs(
            this.orbs,
            dt,
            body,
            this.arena.obstacles,
            wallBounds,
            collisionConfig,
            this.worldPhysics.forwardDragK,
            this.worldPhysics.restitution,
            (this.params["worldPhysics.passageRestitution"] as number) ?? this.worldPhysics.restitution * 0.5,
            Boolean(this.params["orbs.spikeKill"] ?? true),
        );
        // Write player body back (orb-player collision may have changed it)
        this.x = body.x;
        this.y = body.y;
        this.vx = body.vx;
        this.vy = body.vy;

        // ── 7. Update elapsed time (before finish check so finishTime includes this tick) ──
        this.elapsedTime += dt;

        // ── 8. Finish line detection (circle-vs-rect with checkered strip) ──
        // Strip: centered at finishPoint, width = arena.width * 0.6, height = ROWS * CELL = 24
        const FINISH_STRIP_HALF_H = 12; // 2 rows × 12px cell / 2
        const finishHalfW = this.arena.width * 0.3;
        const fpx = this.arena.finishPoint.x;
        const fpy = this.arena.finishPoint.y;
        // Circle-vs-AABB: closest point on rect to circle center
        const closestX = Math.max(fpx - finishHalfW, Math.min(this.x, fpx + finishHalfW));
        const closestY = Math.max(fpy - FINISH_STRIP_HALF_H, Math.min(this.y, fpy + FINISH_STRIP_HALF_H));
        const distX = this.x - closestX;
        const distY = this.y - closestY;
        const touchesStrip = (distX * distX + distY * distY) <= radius * radius;
        if (!this.finished && touchesStrip) {
            this.finished = true;
            this.finishTime = this.elapsedTime;
            this.isNewRecord = this.bestTime === 0 || this.elapsedTime < this.bestTime;
            if (this.isNewRecord) {
                this.bestTime = this.elapsedTime;
            }
            return; // freeze simulation
        }
    }
}
