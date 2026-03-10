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
    resolveCircleCircleCollision,
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
    SurfaceConfig,
} from "@bonk-race/shared";
import { generateArena } from "@bonk-race/shared";

import balanceJson from "../../../config/balance.json";

// ─── Zone name → SurfaceConfig mapping for ArenaZone.type strings ───────────
const ZONE_NAME_TO_SURFACE: Record<string, SurfaceConfig> = {
    ice: SURFACE_PRESETS.ice,
    mud: SURFACE_PRESETS.mud,
    turbo: SURFACE_PRESETS.turbo,
    sand: SURFACE_PRESETS.sand,
};

// ─── SandboxState ────────────────────────────────────────────────────────────

export interface SandboxOrb {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
    alive: boolean;
    /** Death animation progress (0 = just died, 1 = animation done) */
    deathProgress: number;
}

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

    // Orbs
    orbs: SandboxOrb[];

    // Timing
    elapsedTime: number;

    // Current zone
    currentZone: string | null;

    // Progress
    distanceM: number;       // distance from spawn toward finish (metres)
    progressPct: number;     // 0..1 progress from spawn to finish

    // Death state (spike hit)
    deathTimer: number;
    deathX: number;
    deathY: number;
    deathDistanceM: number;  // distance at moment of death (for death message)
    respawnCountdown: number; // таймер заморозки Go!-Go! после респауна
    startCountdown: number;   // pre-race 3-2-1-Go! countdown timer

    // Finish state
    finished: boolean;
    finishTime: number;      // elapsed time when crossed finish
    bestTime: number;        // best time across runs (0 = no record yet)
    isNewRecord: boolean;    // true if finishTime < previous bestTime
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
    /** Flag: user manually set orb density (disables auto-sync) */
    private orbDensityManual = false;

    /** True defaults (balance.json + BonkLab overrides, before any startup preset) */
    private readonly trueDefaults: Record<string, number | boolean>;

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

        // Build flat params from balance.json defaults + overrides
        this.params = this.buildFlatParams();
        // Snapshot true defaults before any startup preset is applied
        this.trueDefaults = { ...this.params };

        // Generate initial arena (use lastDensity to match UI default)
        this.arena = this.buildArena(42, this.lastDensity);

        // Initialize orbs from arena
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));

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
        this.orbDensityManual = false;
        // Reset orbs to initial state from arena seed
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        console.log("[BonkLab] state reset");
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

    updateParams(key: string, value: number | boolean): void {
        this.params[key] = value;

        // Handle special keys
        if (key === "mass") {
            this.mass = value as number;
            // Auto-sync orb density (unless user manually overrode it)
            if (!this.orbDensityManual) {
                this.autoSyncOrbDensity();
            }
            return;
        }

        if (key === "geometry.baseRadiusM") {
            setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
            // Auto-sync orb density
            if (!this.orbDensityManual) {
                this.autoSyncOrbDensity();
            }
            return;
        }

        if (key === "arena.objectDensity") {
            this.lastDensity = value as number;
            this.regenerateArena(this.lastSeed, this.lastDensity);
            return;
        }

        // Arena geometry params → regenerate arena
        if (key.startsWith("arena.")) {
            this.regenerateArena(this.lastSeed, this.lastDensity);
            return;
        }

        // Orb params → regenerate arena (orbs are generated from seed)
        if (key.startsWith("orbs.")) {
            if (key === "orbs.density") {
                this.orbDensityManual = true;
            }
            if (key !== "orbs.spikeKill") {
                this.regenerateArena(this.lastSeed, this.lastDensity);
            }
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

        // All other keys map to slimeConfig
        setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
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

    /** Recalculate orb density from player mass/radius and update existing orb masses */
    private autoSyncOrbDensity(): void {
        const r = this.slimeConfig.geometry.baseRadiusM;
        const density = this.mass / (Math.PI * r * r);
        this.params["orbs.density"] = density;
        // Update masses of existing live orbs to reflect new density
        for (const orb of this.orbs) {
            if (orb.alive) {
                orb.mass = density * Math.PI * orb.radius * orb.radius;
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
    getDefaults(): Record<string, number | boolean> {
        return this.trueDefaults;
    }

    /** Reset orbDensityManual flag (called before batch reset/preset application) */
    resetOrbDensityManual(): void {
        this.orbDensityManual = false;
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
        const savedOrbDensityManual = this.orbDensityManual;
        // Full state reset (position, velocity, FA state, timers, orbs)
        this.reset();
        this.orbDensityManual = savedOrbDensityManual;
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
            if (this.startCountdown <= 0) this.startCountdown = 0;
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
                const rest = obs.type === "passage"
                    ? (this.params["worldPhysics.passageRestitution"] as number ?? this.worldPhysics.restitution * 0.5)
                    : this.worldPhysics.restitution;
                const collided = resolveCircleStaticCollision(body, staticObs, rest, collisionConfig);
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
            this.deathDistanceM = this.computeDistance();
            this.vx = 0;
            this.vy = 0;
            this.angVel = 0;
            return;
        }

        // ── 5. Zone detection (point-in-circle) ──
        this.currentZone = null;
        this.currentSurface = DEFAULT_SURFACE_CONFIG;
        for (const zone of this.arena.zones) {
            const dx = this.x - zone.x;
            const dy = this.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                this.currentZone = zone.type;
                this.currentSurface = ZONE_NAME_TO_SURFACE[zone.type] ?? DEFAULT_SURFACE_CONFIG;
                break;
            }
        }

        // ── 6. Orb physics ──
        this.tickOrbs(dt, body, wallBounds, collisionConfig);

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

    /** Orb simulation: drag, integration, collisions, spike death */
    private tickOrbs(
        dt: number,
        playerBody: ICircleBody,
        wallBounds: IWallBounds,
        collisionConfig: { correctionPercent: number; slop: number; maxCorrection: number },
    ): void {
        const dragK = this.worldPhysics.forwardDragK;
        const spikeKill = this.params["orbs.spikeKill"] as boolean ?? true;
        const restitution = this.worldPhysics.restitution;
        const passageRestitution = (this.params["worldPhysics.passageRestitution"] as number) ?? restitution * 0.5;
        const ORB_DEATH_DURATION = 0.5; // seconds

        // 1. Drag + position integration for each live orb
        for (const orb of this.orbs) {
            if (!orb.alive) {
                // Advance death animation
                if (orb.deathProgress >= 0 && orb.deathProgress < 1) {
                    orb.deathProgress += dt / ORB_DEATH_DURATION;
                    if (orb.deathProgress > 1) orb.deathProgress = 1;
                }
                continue;
            }
            // Exponential drag decay (isotropic for orbs)
            const damping = Math.exp(-dragK * dt);
            orb.vx *= damping;
            orb.vy *= damping;
            // Semi-implicit Euler
            orb.x += orb.vx * dt;
            orb.y += orb.vy * dt;
        }

        // 2. Collision resolution (4 iterations)
        // Build parallel arrays: orbBodies for physics, orbIndices to map back to this.orbs
        const orbBodies: ICircleBody[] = [];
        const orbIndices: number[] = [];
        const spikeHit: boolean[] = [];
        for (let idx = 0; idx < this.orbs.length; idx++) {
            const o = this.orbs[idx];
            if (!o.alive) continue;
            orbBodies.push({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, radius: o.radius, mass: o.mass });
            orbIndices.push(idx);
            spikeHit.push(false);
        }

        for (let iter = 0; iter < 4; iter++) {
            for (let i = 0; i < orbBodies.length; i++) {
                const ob = orbBodies[i];

                // Orb-obstacle collisions
                for (const obs of this.arena.obstacles) {
                    const staticObs: IStaticObstacle = {
                        x: obs.x, y: obs.y, radius: obs.radius,
                        type: obs.type === "passage" ? "pillar" : (obs.type as "pillar" | "spike" | "wall"),
                    };
                    const obsRestitution = obs.type === "passage" ? passageRestitution : restitution;
                    const collided = resolveCircleStaticCollision(ob, staticObs, obsRestitution, collisionConfig);
                    if (collided && obs.type === "spike") spikeHit[i] = true;
                }

                // Orb-wall collisions
                resolveWallCollision(ob, wallBounds, restitution);

                // Orb-player collision
                resolveCircleCircleCollision(ob, playerBody, restitution, collisionConfig);

                // Orb-orb collisions
                for (let j = i + 1; j < orbBodies.length; j++) {
                    resolveCircleCircleCollision(ob, orbBodies[j], restitution, collisionConfig);
                }
            }
        }

        // 3. Write collision results back to orbs + apply spike deaths
        for (let i = 0; i < orbBodies.length; i++) {
            const orb = this.orbs[orbIndices[i]];
            const ob = orbBodies[i];
            orb.x = ob.x;
            orb.y = ob.y;
            orb.vx = ob.vx;
            orb.vy = ob.vy;

            if (spikeKill && spikeHit[i]) {
                orb.alive = false;
                orb.deathProgress = 0;
            }
        }

        // 4. Write player body back (orb-player collision may have changed it)
        this.x = playerBody.x;
        this.y = playerBody.y;
        this.vx = playerBody.vx;
        this.vy = playerBody.vy;
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

            // Arena generation
            "arena.objectDensity": this.lastDensity,

            // Arena geometry (TZ v1.2 §A5)
            "arena.pillarRadius": sc.geometry.baseRadiusM,
            "arena.spikeRadius": sc.geometry.baseRadiusM,
            "arena.passageRadius": sc.geometry.baseRadiusM,
            "arena.passageGap": sc.geometry.baseRadiusM * 2 * 1.2,

            // Orbs (TZ v1.2 §A7)
            "orbs.count": 25,
            "orbs.density": this.mass / (Math.PI * sc.geometry.baseRadiusM * sc.geometry.baseRadiusM),
            "orbs.minRadius": 5,
            "orbs.maxRadius": 25,
            "orbs.minSpeed": 0,
            "orbs.maxSpeed": 50,
            "orbs.spikeKill": true,

            // World physics
            "worldPhysics.widthM": wp.widthM ?? 800,
            "worldPhysics.heightM": wp.heightM ?? 10130,
            "worldPhysics.forwardDragK": wp.forwardDragK,
            "worldPhysics.lateralGripMultiplier": wp.lateralGripMultiplier,
            "worldPhysics.angularDragK": wp.angularDragK,
            "worldPhysics.restitution": wp.restitution,
            "worldPhysics.passageRestitution": wp.restitution * 0.5,
        };
    }
}
