/**
 * BonkLab — автономный оркестратор-песочница для тестирования физики и FA.
 *
 * Использует тот же конвейер физики, что и сервер:
 *   computeFlightAssist() → integratePhysics() → collisions
 *
 * Полностью клиентский, соединение с сервером не требуется.
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
export type { SandboxOrb, SandboxState } from "./labTypes";
import { createSpaceProfile, hullInertia, hullCircleRadius, SPACE_RANGES, spaceParams, spaceTowingProfile, geometrySize, TUG_SIZES, TRAILER_SIZES, HULL_CATALOG, fittedTug, recommendedLength, type HullSize, type SpaceProfile } from "../u2taglab/profile";
import { CATALOG_SPACE_SHARE_SCHEMA, CATALOG_SPACE_SHARE_MODEL, SPACE_SHARE_SCHEMA, SPACE_SHARE_MODEL, SPACE_SHARE_GENERATOR, SPACE_SHARE_DEFAULTS, LEGACY_SPACE_SHARE_KEYS, LEGACY_SPACE_SHARE_MODEL, validateSpaceShareSnapshot, spaceProfileFromParams, type SpaceShareSnapshot, type SpaceWorldRecipe } from "../u2taglab/share";
import { spaceEngineWrench, spaceInputFrame } from "../u2taglab/physics/flightAssist";
import { advanceSpaceWorld, cloneSpaceWorld, createSpaceWorld, spaceWorldArena, SPACE_WORLD_DEFAULTS, type SpaceWorld } from "../u2taglab/world";
import { sampleSpaceFieldResponse, SPACE_FIELD_DEFAULTS, validSpaceFieldSettings, type SpaceFieldSettings } from "../u2taglab/fields";
import { LabTowing, TOW_DEFAULTS } from "../tuglab/labTowing";
import type { BodyState, CaptureResult } from "../tuglab/types";
import { tickOrbs } from "./orbSimulator";
import { resolveSpikeCollision } from "./spikeResolver";
import { generateArena } from "@bonk-race/shared";
import { LabParamManager } from "./LabParamManager";

import { SHARE_SCHEMA, SHARE_GENERATOR, validateShareSnapshot, type ShareSnapshot } from "../tuglab/share";

import balanceJson from "../../../config/balance.json";

/**
 * Максимальная скорость после knockback (м/с).
 * Выбрано чтобы блоб не телепортировался через стены при экстремальном импульсе.
 */
const MAX_KNOCKBACK_SPEED = 2000;

// ─── Соответствие имени зоны → SurfaceConfig для строк ArenaZone.type ────────
// Мутабельный во время выполнения, чтобы ползунки зон LabPanel могли переопределять пресеты.
function buildZoneSurfaces(): Record<string, SurfaceConfig> {
    return {
        ice: { ...SURFACE_PRESETS.ice },
        mud: { ...SURFACE_PRESETS.mud },
        turbo: { ...SURFACE_PRESETS.turbo },
        sand: { ...SURFACE_PRESETS.sand },
    };
}


// ─── Вспомогательные функции ─────────────────────────────────────────────────

const FIXED_DT = 1 / 60; // 16.7мс — 60 Гц, плавный рендеринг (сервер работает на 30 Гц)
// DEATH_FREEZE_S, COUNTDOWN_TOTAL_S, RESPAWN_GO_TOTAL_S — импортируются из @bonk-race/shared

/**
 * Линейная интерполяция угла по кратчайшей дуге.
 * Корректно обрабатывает переход через ±π.
 */
function lerpAngle(a: number, b: number, t: number): number {
    let delta = b - a;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    return a + delta * t;
}

/**
 * Определяет метку состояния FA на основе ввода и ошибки скорости.
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

    // Обнаружение коррекции сноса: вектор коррекции составляет >40% от общей силы
    const corrMag = Math.hypot(correctionFx, correctionFy);
    if (corrMag > forceMag * 0.4 && speed > 5) return "drift-correction";

    // Проверка, противодействует ли сила скорости (торможение)
    if (speed > 1) {
        const dot = (faOutput.assistFx * vx + faOutput.assistFy * vy) / (forceMag * speed);
        if (dot < -0.3) return "brake";
    }

    return "accel";
}

/**
 * Глубокое клонирование простого объекта (без функций/дат и т.п.).
 */
function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

// ─── BonkLab ─────────────────────────────────────────────────────────────────

export class BonkLab {
    /** Делегированный менеджер параметров (плоские параметры, патчинг вложенных конфигов, синхронизация плотности орбов) */
    private paramManager: LabParamManager;

    /** Все настраиваемые параметры, делегированные paramManager */
    get params(): Record<string, number | boolean | string> {
        return this.towing ? { ...this.paramManager.params, ...this.towing.params,
            ...(this.space ? { ...spaceParams(this.space), "space.fa": this.spaceFA,
                "space.asteroidMaxSpeed": this.spaceWorldSettings.asteroidMaxSpeed,
                "space.collisionRestitution": this.spaceWorldSettings.collisionRestitution,
                ...Object.fromEntries(Object.entries(this.spaceFieldSettings).map(([key, value]) => [`space.${key}`, value])) } : {}) } : this.paramManager.params;
    }

    // Сохранено для будущего использования в LabRenderer
    readonly canvas: HTMLCanvasElement;
    private running = false;
    private towing?: LabTowing;
    private space?: SpaceProfile;
    private spaceWorld?: SpaceWorld;
    private spaceWorldRecipe?: SpaceWorldRecipe;
    private spaceGeometryDirty = false;
    private legacySpaceShare = false;
    private catalogSpaceShare = false;
    private spaceWorldSettings = { asteroidMaxSpeed: SPACE_WORLD_DEFAULTS.asteroidMaxSpeed, collisionRestitution: SPACE_WORLD_DEFAULTS.restitution };
    private spaceFieldSettings: SpaceFieldSettings = { fieldsEnabled: SPACE_FIELD_DEFAULTS.fieldsEnabled,
        fieldPressure: SPACE_FIELD_DEFAULTS.fieldPressure, resistiveK: SPACE_FIELD_DEFAULTS.resistiveK };
    private prevAsteroids?: SpaceWorld["asteroids"];
    private spaceFA = true;
    private spaceBrake = false;
    private prevB?: BodyState;
    private started = false;
    private readonly onBlur = (): void => { this.pause("Потеря фокуса: нажмите Продолжить"); };
    private readonly onHidden = (): void => {
        if (typeof document !== "undefined" && document.hidden) this.onBlur();
    };
    private accumulator = 0;

    // Предыдущее состояние для интерполяции между тиками физики
    private prevX = 0;
    private prevY = 0;
    private prevVx = 0;
    private prevVy = 0;
    private prevAngle = -Math.PI / 2;
    private prevAngVel = 0;

    // Состояние физики
    private slimeConfig: SlimeConfig;
    private worldPhysics: WorldPhysicsConfig;
    private arena: Arena;
    private mass: number;
    private yawSignHistory: number[] = [];

    // Позиция / скорость
    private x = 0;
    private y = 0;
    private vx = 0;
    private vy = 0;
    private angle = -Math.PI / 2; // направлен вверх (к финишу)
    private angVel = 0;

    // Ввод
    private inputX = 0;
    private inputY = 0;
    private inputMagnitude = 0;

    // Последний результат FA (для визуализации)
    private lastFaOutput: IFlightAssistOutput = { assistFx: 0, assistFy: 0, assistTorque: 0 };
    private lastFaState: SandboxState["faState"] = "idle";
    private correctionFx = 0;
    private correctionFy = 0;

    // Время
    private elapsedTime = 0;

    // Зона
    private currentZone: string | null = null;
    private currentSurface: SurfaceConfig = DEFAULT_SURFACE_CONFIG;
    private zoneSurfaces: Record<string, SurfaceConfig> = buildZoneSurfaces();

    // Состояние генерации арены (сохраняется для повторной генерации при изменении размера)
    private lastSeed = 42;
    private lastDensity = 5.0;

    // Состояние смерти (попадание на шип — GDD §4.2: мгновенное поражение → рестарт)
    private deathTimer = 0;
    private deathX = 0;
    private deathY = 0;
    private deathDistanceM = 0;
    /** Обратный отсчёт Go!-Go! после респауна (2×0.4с заморозка) */
    private respawnCountdown = 0;
    /** Стартовый обратный отсчёт 3-2-1-Go! */
    private startCountdown = 0;

    // Состояние финиша
    private finished = false;
    private finishTime = 0;
    private bestTime = 0;
    private isNewRecord = false;

    // Орбы
    private orbs: SandboxOrb[] = [];

    /** Истинные значения по умолчанию (balance.json + переопределения BonkLab, до применения стартового пресета) */
    private readonly trueDefaults: Record<string, number | boolean | string>;

    constructor(canvas: HTMLCanvasElement, options?: { towing?: boolean; space?: boolean }) {
        this.canvas = canvas;

        // Разрешить balance.json через общий парсер конфигурации
        const resolved = resolveBalanceConfig(balanceJson);
        this.slimeConfig = deepClone(resolved.slimeConfigs.base);
        this.worldPhysics = deepClone(resolved.worldPhysics);
        this.mass = resolved.slime.initialMass;

        // Переопределения по умолчанию для BonkLab (TZ v1.2 §A1)
        this.slimeConfig.geometry.baseRadiusM = 20;
        this.worldPhysics.widthM = 800;
        this.worldPhysics.heightM = 10130;
        if (options?.space && options.towing) {
            this.space = createSpaceProfile();
            this.mass = this.space.massA;
            this.slimeConfig.geometry.baseRadiusM = this.space.radiusA;
            this.worldPhysics.widthM = 6000; this.worldPhysics.heightM = 18000;
            this.worldPhysics.forwardDragK = 0; this.worldPhysics.angularDragK = 0;
            this.worldPhysics.lateralGripMultiplier = 1;
            this.worldPhysics.restitution = SPACE_WORLD_DEFAULTS.restitution;
        }

        // Создать менеджер параметров (владеет плоскими параметрами, патчингом вложенных конфигов, синхронизацией плотности орбов)
        this.paramManager = new LabParamManager(
            this.slimeConfig,
            this.worldPhysics,
            this.zoneSurfaces,
            this.mass,
        );

        // Построить плоские параметры из значений по умолчанию balance.json + переопределения
        this.paramManager.params = this.paramManager.buildFlatParams(this.lastDensity);
        // Сохранить снимок истинных значений по умолчанию до применения стартового пресета
        this.trueDefaults = { ...this.params, ...(this.space ? SPACE_SHARE_DEFAULTS : {}), ...(options?.towing ? (this.space ? spaceTowingProfile(this.space).defaults : TOW_DEFAULTS) : {}) };

        // Сгенерировать начальную арену (использовать lastDensity для соответствия значению UI по умолчанию)
        this.arena = this.buildArena(42, this.lastDensity);

        // Инициализировать орбы из арены
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        // Передать ссылку на орбы в paramManager (для autoSyncOrbDensity)
        this.paramManager.orbs = this.orbs;
        this.paramManager.initialOrbs = this.arena.orbs;

        // Поместить персонажа на точку спауна
        this.x = this.arena.spawnPoint.x;
        this.y = this.arena.spawnPoint.y;
        if (options?.towing) {
            this.towing = new LabTowing(this.towingBodyA(), this.space ? spaceTowingProfile(this.space) : undefined);
            this.resetTowing();
        }
        // Инициализировать prev-состояние, чтобы интерполяция не зависела от порядка вызова start()
        this.syncPrevState();

        console.log("[BonkLab] initialized", {
            mass: this.mass,
            arenaSize: `${this.arena.width}x${this.arena.height}`,
            obstacles: this.arena.obstacles.length,
            zones: this.arena.zones.length,
            orbs: this.orbs.length,
        });
    }

    // ── Публичный API ────────────────────────────────────────────────────────

    get isSpace(): boolean { return !!this.space; }
    getScenarioInfo(): { seed: number; density: number } { return { seed: this.lastSeed, density: this.lastDensity }; }
    setSpaceFA(enabled: boolean): boolean {
        if (!this.space || typeof enabled !== "boolean") return false;
        this.spaceFA = enabled;
        return true;
    }
    setSpaceBrake(enabled: boolean): void { this.spaceBrake = this.isSpace && enabled; }
    resetSpaceParams(): void {
        if (!this.space || !this.towing) return;
        this.space = createSpaceProfile(); this.spaceFA = true;
        this.spaceWorldSettings = { asteroidMaxSpeed: SPACE_WORLD_DEFAULTS.asteroidMaxSpeed, collisionRestitution: SPACE_WORLD_DEFAULTS.restitution };
        this.spaceFieldSettings = { fieldsEnabled: SPACE_FIELD_DEFAULTS.fieldsEnabled,
            fieldPressure: SPACE_FIELD_DEFAULTS.fieldPressure, resistiveK: SPACE_FIELD_DEFAULTS.resistiveK };
        this.mass = this.space.massA; this.paramManager.mass = this.mass;
        this.paramManager.params.mass = this.mass;
        this.legacySpaceShare = false; this.catalogSpaceShare = false;
        this.slimeConfig.geometry.baseRadiusM = this.space.radiusA;
        this.paramManager.params["geometry.baseRadiusM"] = this.space.radiusA;
        this.spaceGeometryDirty = true;
        this.towing = new LabTowing(this.towingBodyA(), spaceTowingProfile(this.space));
        this.regenerateArena(this.lastSeed, 5);
    }

    get hasStarted(): boolean { return this.started; }

    start(): void {
        if (this.running) return;
        if (this.towing && this.started) { this.resume(); return; }
        if (this.towing?.needsRestart) return;
        this.started = true;
        this.startCountdown = COUNTDOWN_TOTAL_S;
        this.running = true;
        this.listenForFocus(true);
        this.accumulator = 0;
        this.syncPrevState();
        console.log(`[BonkLab] simulation started (countdown ${COUNTDOWN_TOTAL_S.toFixed(1)}s)`);
    }

    stop(): void {
        this.listenForFocus(false);
        if (!this.running) return;
        this.running = false;
        console.log("[BonkLab] simulation stopped");
    }

    /** Пауза/одиночный шаг доступны только явно включённому TugLab. */
    pause(reason?: string): void {
        if (!this.towing) return;
        // Пауза сохраняет обработчики фокуса; terminal stop снимает их даже без running.
        this.running = false;
        this.listenForFocus(true);
        this.accumulator = 0;
        this.inputX = this.inputY = this.inputMagnitude = 0; this.spaceBrake = false;
        if (reason && !this.towing.needsRestart) this.towing.reason = reason;
        this.syncPrevState();
    }

    resume(): void {
        if (!this.towing || this.towing.needsRestart || this.running) return;
        if (!this.started) { this.start(); return; }
        this.towing.reason = undefined;
        this.running = true;
        this.accumulator = 0;
        this.syncPrevState();
        this.listenForFocus(true);
    }

    stepOnce(): boolean {
        if (!this.towing || !this.started || this.running || this.towing.needsRestart) return false;
        this.tick(FIXED_DT);
        this.accumulator = 0;
        this.syncPrevState();
        return !this.towing.needsRestart;
    }

    setTowingConnection(connected: boolean): CaptureResult {
        if (!this.towing) return { ok: false, reason: "Буксировка не включена", distance: 0, relativeSpeed: 0 };
        const limits = [this.params["limits.speedLimitForwardMps"], this.params["limits.speedLimitReverseMps"],
            this.params["limits.speedLimitLateralMps"]];
        const captureMaxSpeed = this.space ? this.space.speedLimit : limits.every(value => typeof value === "number" && Number.isFinite(value) && value > 0)
            ? Math.min(...limits as number[]) : NaN;
        return this.towing.setConnection(connected, this.towingBodyA(), captureMaxSpeed);
    }

    private listenForFocus(enabled: boolean): void {
        if (!this.towing) return;
        if (typeof window !== "undefined") {
            if (enabled) window.addEventListener("blur", this.onBlur);
            else window.removeEventListener("blur", this.onBlur);
        }
        if (typeof document !== "undefined") {
            if (enabled) document.addEventListener("visibilitychange", this.onHidden);
            else document.removeEventListener("visibilitychange", this.onHidden);
        }
    }

    private towingBodyA(): BodyState {
        const radius = this.slimeConfig.geometry.baseRadiusM;
        return { position: { x: this.x, y: this.y }, velocity: { x: this.vx, y: this.vy },
            angle: this.angle, angularVelocity: this.angVel, mass: this.mass, radius,
            inertia: this.space ? hullInertia(this.mass, this.space.geometryA) : this.slimeConfig.geometry.inertiaFactor * this.mass * radius * radius };
    }

    private applyTowingA(a: BodyState): void {
        this.x = a.position.x; this.y = a.position.y;
        this.vx = a.velocity.x; this.vy = a.velocity.y;
        this.angle = a.angle; this.angVel = a.angularVelocity;
    }

    private towingStartArena(arena: Arena, world?: SpaceWorld): Arena {
        if (!world) return arena;
        // При старте проверяем также подвижные тела; во время полёта ими владеет SpaceWorld.
        return { ...arena, obstacles: [...arena.obstacles, ...world.asteroids.map(body => ({ type: "pillar" as const,
            x: body.position.x, y: body.position.y, radius: body.radius, alive: true }))] };
    }

    private resetTowing(): void {
        if (!this.towing) return;
        const a = this.towing.reset(this.towingBodyA(), this.towingStartArena(this.arena, this.spaceWorld));
        if (a) {
            this.applyTowingA(a);
            if (this.space) this.arena.spawnPoint = { ...a.position };
        }
        else this.pause();
    }

    reset(): void { this.resetRun(); }

    private resetRun(preparedA?: BodyState): void {
        if (this.towing) { this.stop(); this.started = false; }
        if (this.space && !preparedA) this.arena = this.buildArena(this.lastSeed, this.lastDensity);
        this.x = this.arena.spawnPoint.x;
        this.y = this.arena.spawnPoint.y;
        this.vx = 0;
        this.vy = 0;
        this.angle = -Math.PI / 2; // направлен вверх (к финишу)
        this.angVel = 0;
        this.elapsedTime = 0;
        this.accumulator = 0;
        this.yawSignHistory.length = 0;
        this.inputX = 0;
        this.inputY = 0;
        this.inputMagnitude = 0; this.spaceBrake = false;
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
        // bestTime сохраняется между сбросами (отслеживание рекорда)
        // Сбросить автосинхронизацию плотности орбов (пользователь не устанавливал вручную через сброс)
        if (!this.towing) this.paramManager.orbDensityManual = false;
        this.restoreDestroyedObstacles();
        // Сбросить орбы в начальное состояние из сида арены
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        // Поддерживать синхронизацию ссылки на орбы в paramManager
        this.paramManager.orbs = this.orbs;
        this.paramManager.initialOrbs = this.arena.orbs;
        if (preparedA) this.applyTowingA(preparedA);
        else this.resetTowing();
        // Синхронизировать prev-состояние, чтобы интерполяция не дёргала после сброса
        this.syncPrevState();
        console.log("[BonkLab] state reset");
    }

    /** Восстанавливает уничтоженные шипы (после сброса/респауна) */
    private restoreDestroyedObstacles(): void {
        for (const obs of this.arena.obstacles) {
            if (obs.alive === false) obs.alive = true;
        }
    }

    /** Построить арену из сида, плотности и текущих параметров */
    private buildArena(seed: number, density: number, freshSpace = false): Arena {
        if (this.space) {
            if (freshSpace || this.spaceGeometryDirty || !this.spaceWorldRecipe) {
                this.spaceWorldRecipe = { ...(this.catalogSpaceShare ? { radiusA: this.space.radiusA } : {}), radiusB: Number(this.towing?.params["tow.radiusB"] ?? this.space.radiusB),
                    couplingLength: Number(this.towing?.params["tow.length"] ?? spaceTowingProfile(this.space).defaults["tow.length"]),
                    asteroidMaxSpeed: this.spaceWorldSettings.asteroidMaxSpeed, fields: { ...this.spaceFieldSettings } };
            }
            this.spaceWorld = createSpaceWorld({ ...this.space, radiusA: this.spaceWorldRecipe.radiusA ?? this.space.radiusA, radiusB: this.spaceWorldRecipe.radiusB }, seed, density, this.spaceWorldRecipe);
            this.spaceGeometryDirty = false;
            return spaceWorldArena(this.spaceWorld);
        }
        const rng = new Rng(seed);
        const baseRadius = this.slimeConfig.geometry.baseRadiusM;
        const arena = generateArena(
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
        return arena;
    }

    updateParams(key: string, value: number | boolean | string): void {
        if (this.space) {
            const fieldKey = key.slice(6);
            if (key.startsWith("space.") && Object.hasOwn(this.spaceFieldSettings, fieldKey)) {
                const candidate = { ...this.spaceFieldSettings, [fieldKey]: value };
                if (!validSpaceFieldSettings(candidate)) return;
                this.spaceFieldSettings = candidate;
                this.regenerateArena(this.lastSeed, this.lastDensity);
                return;
            }
            if (key === "space.asteroidMaxSpeed" || key === "space.collisionRestitution") {
                const max = key === "space.asteroidMaxSpeed" ? SPACE_WORLD_DEFAULTS.validatedAsteroidMaxSpeed : 1;
                if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return;
                this.spaceWorldSettings[key.slice(6) as keyof typeof this.spaceWorldSettings] = value;
                if (key === "space.asteroidMaxSpeed") this.regenerateArena(this.lastSeed, this.lastDensity);
                return;
            }
            if (key === "space.fa") { if (typeof value === "boolean") this.setSpaceFA(value); return; }
            if (key === "space.enginesEnabled") { if (typeof value === "boolean") this.space.enginesEnabled = value; return; }
            if (key === "mass" || key.startsWith("space.")) {
                const range = SPACE_RANGES[key];
                if (!range || typeof value !== "number" || !Number.isFinite(value) || value < range[0] || value > range[1]) return;
                if (key === "mass") {
                    this.space.massA = this.mass = this.paramManager.mass = value;
                    this.paramManager.params.mass = value;
                    this.towing!.refresh(this.towingBodyA());
                } else {
                    const field = key.slice(6) as keyof SpaceProfile;
                    (this.space as unknown as Record<string, unknown>)[field] = value;
                }
                return;
            }
            if (!key.startsWith("tow.") && key !== "arena.objectDensity" && !key.startsWith("trail.")) return;
            if (key === "arena.objectDensity" && (typeof value !== "number" || !Number.isFinite(value) || value < 0.1 || value > 25)) return;
        }
        if (key.startsWith("tow.")) {
            if (this.towing?.update(key, value, this.towingBodyA(), this.arena)) {
                if (this.space && this.towing.params["tow.dampingMode"] === "fixed") this.legacySpaceShare = false;
                if (this.space && ["tow.length", "tow.radiusB", "tow.type"].includes(key)) this.spaceGeometryDirty = true;
                if (this.towing.needsRestart) this.pause();
                this.syncPrevState();
            }
            return;
        }
        // В TugLab пустое/нечисловое значение не должно разрушать физическое состояние.
        if (this.towing && typeof this.params[key] === "number"
            && (typeof value !== "number" || !Number.isFinite(value))) return;
        if (this.towing && ["mass", "geometry.baseRadiusM", "geometry.inertiaFactor"].includes(key)
            && (typeof value !== "number" || value <= 0)) return;
        const effect = this.paramManager.update(key, value);
        if (effect.massChanged) {
            this.mass = this.paramManager.mass;
        }
        if (effect.newDensity !== undefined) {
            this.lastDensity = effect.newDensity;
        }
        if (effect.regenerateArena) {
            this.regenerateArena(this.lastSeed, this.lastDensity);
        }
        if (this.towing) {
            const a = this.towingBodyA();
            this.towing.refresh(a);
            if (!this.towing.validGeometry(a, this.arena)) {
                this.towing.fail("Геометрия состава несовместима с настройками: нужен Restart");
                this.pause();
            }
            if (this.worldPhysics.restitution < 0 || this.worldPhysics.restitution > 1) {
                this.towing.fail("TugLab поддерживает restitution стен в диапазоне 0–1; нужен Restart после исправления");
                this.pause();
            }
        }
    }

    /** Расстояние от точки спауна до финиша (метры, 0 на спауне, положительное вверх) */
    private computeDistance(): number {
        return Math.max(0, this.arena.spawnPoint.y - this.y);
    }

    /** Прогресс от спауна до финиша как 0..1 */
    private computeProgress(): number {
        const total = this.arena.spawnPoint.y - this.arena.finishPoint.y;
        if (total <= 0) return 0;
        return Math.max(0, Math.min(1, this.computeDistance() / total));
    }

    getState(): SandboxState {
        return {
            ...(this.towing ? { towing: this.towing.snapshot(this.towingBodyA(), !this.running) } : {}),
            ...(this.spaceWorld ? { spaceWorld: cloneSpaceWorld(this.spaceWorld) } : {}),
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

    /** Возвращает истинные значения по умолчанию (balance.json + переопределения BonkLab, до стартового пресета) */
    getDefaults(): Record<string, number | boolean | string> {
        return this.trueDefaults;
    }

    /** Снимок начальных условий, без текущей траектории, скоростей и таймера. */
    exportShareSnapshot(): ShareSnapshot {
        if (this.space) throw new Error("Ссылка U2TagLab: ссылки TugLab v1 несовместимы");
        if (!this.towing) throw new Error("Обмен доступен только в TugLab");
        return { schema: SHARE_SCHEMA, generator: SHARE_GENERATOR,
            seed: this.lastSeed, density: this.lastDensity,
            orbDensityManual: this.paramManager.orbDensityManual,
            params: { ...this.params, "arena.objectDensity": this.lastDensity } };
    }

    /** Сначала проверяем весь снимок; генерация и сброс выполняются ровно один раз. */
    applyShareSnapshot(value: unknown): void {
        if (this.space) throw new Error("Ссылка U2TagLab: ссылки TugLab v1 несовместимы");
        if (!this.towing) throw new Error("Обмен доступен только в TugLab");
        const snapshot = validateShareSnapshot(value, this.trueDefaults);
        this.stop();
        this.paramManager.orbDensityManual = true;
        for (const [key, current] of Object.entries(snapshot.params)) {
            if (key.startsWith("tow.")) this.towing.params[key] = current as number | string;
            else this.paramManager.update(key, current);
        }
        this.mass = this.paramManager.mass;
        this.paramManager.orbDensityManual = snapshot.orbDensityManual;
        this.regenerateArena(snapshot.seed, snapshot.density);
        this.pause();
    }

    getSpaceSize(id: 'A' | 'B'): HullSize | undefined {
        if (!this.space || !this.towing) return;
        const size = geometrySize(id === 'A' ? this.space.geometryA : this.space.geometryB);
        if (!size) return;
        const close = (a: number, b: number) => Math.abs(a-b) <= 1e-8 * Math.max(1, Math.abs(b));
        if (id === 'B') return close(this.towing.B.mass, HULL_CATALOG[size].mass)
            && close(this.towing.B.radius, hullCircleRadius(HULL_CATALOG[size])) ? size : undefined;
        if (!TUG_SIZES.includes(size as typeof TUG_SIZES[number])) return;
        const fitted = fittedTug(size as typeof TUG_SIZES[number]);
        return close(this.mass, fitted.mass) && ['forwardForce', 'reverseForce', 'lateralForce', 'yawTorque', 'yawLimit']
            .every(key => close(Number(this.params[`space.${key}`]), Number(fitted[key as keyof typeof fitted])))
            && this.params['tow.dampingMode'] === 'fixed' && this.params['tow.module'] === size
            && close(Number(this.params['tow.stiffness']), fitted.k) && close(Number(this.params['tow.dampingCoefficient']), fitted.c) ? size : undefined;
    }

    selectSpaceSize(id: 'A' | 'B', size: string): void {
        if (!this.space || !this.towing || !['A', 'B'].includes(id)
            || !(id === 'A' ? TUG_SIZES : TRAILER_SIZES).includes(size as never)) throw new Error('U2TagLab: неизвестный размер');
        const snapshot = this.exportSpaceShareSnapshot(), hull = HULL_CATALOG[size as HullSize];
        snapshot.schema = CATALOG_SPACE_SHARE_SCHEMA; snapshot.model = CATALOG_SPACE_SHARE_MODEL;
        snapshot.world.radiusA ??= this.space.radiusA;
        snapshot.geometry = { A: { ...this.space.geometryA }, B: { ...this.space.geometryB } };
        snapshot.geometry[id] = { length: hull.length, width: hull.width };
        // Масса противоположного корпуса абсолютна, включая ручную настройку.
        if (id === 'A') {
            const fitted = fittedTug(size as typeof TUG_SIZES[number]), massB = this.towing.B.mass;
            snapshot.params.mass = fitted.mass; snapshot.params['tow.massRatio'] = massB / fitted.mass;
            for (const key of ['forwardForce', 'reverseForce', 'lateralForce', 'yawTorque', 'yawLimit'] as const) snapshot.params[`space.${key}`] = fitted[key];
            Object.assign(snapshot.params, { 'tow.module': size, 'tow.dampingMode': 'fixed', 'tow.stiffness': fitted.k, 'tow.dampingCoefficient': fitted.c });
        } else {
            snapshot.params['tow.massRatio'] = hull.mass / Number(snapshot.params.mass);
            snapshot.params['tow.radiusB'] = hullCircleRadius(hull);
        }
        // Старый источник ζ не содержит новых ключей: явно сохраняем его эффективный режим.
        for (const key of ['tow.dampingMode', 'tow.dampingCoefficient', 'tow.module']) snapshot.params[key] ??= this.params[key];
        snapshot.params['tow.length'] = recommendedLength(snapshot.geometry.A, snapshot.geometry.B);
        this.applySpaceShareSnapshot(snapshot);
    }

    restoreSpaceRadiusB(): void {
        if (this.space) this.updateParams("tow.radiusB", hullCircleRadius(this.space.geometryB));
    }

    /** Исходный генератор хранится отдельно от параметров, изменённых во время полёта. */
    exportSpaceShareSnapshot(): SpaceShareSnapshot {
        if (!this.space || !this.spaceWorldRecipe) throw new Error("Ссылка U2TagLab: режим недоступен");
        const current = this.params;
        const legacy = this.legacySpaceShare && current["tow.dampingMode"] === "legacy";
        return validateSpaceShareSnapshot({ schema: legacy ? 1 : this.catalogSpaceShare ? 3 : SPACE_SHARE_SCHEMA, model: legacy ? LEGACY_SPACE_SHARE_MODEL : this.catalogSpaceShare ? CATALOG_SPACE_SHARE_MODEL : SPACE_SHARE_MODEL, generator: SPACE_SHARE_GENERATOR,
            ...(legacy ? {} : { geometry: { A: this.space.geometryA, B: this.space.geometryB } }),
            seed: this.lastSeed, density: this.lastDensity,
            params: Object.fromEntries((legacy ? LEGACY_SPACE_SHARE_KEYS : Object.keys(SPACE_SHARE_DEFAULTS)).map(key => [key, current[key]])), world: this.spaceWorldRecipe });
    }

    /** Строим и проверяем кандидата целиком до остановки или изменения текущего заезда. */
    applySpaceShareSnapshot(value: unknown): void {
        if (!this.space || !this.towing) throw new Error("Ссылка U2TagLab: режим недоступен");
        const snapshot = validateSpaceShareSnapshot(value), profile = spaceProfileFromParams(snapshot.params, snapshot.schema === 1
            ? { A: { length: 60, width: 27 }, B: { length: 108, width: 48 } } : snapshot.geometry);
        const world = createSpaceWorld({ ...profile, radiusA: snapshot.world.radiusA ?? profile.radiusA, radiusB: snapshot.world.radiusB }, snapshot.seed, snapshot.density, snapshot.world);
        const arena = spaceWorldArena(world);
        const a: BodyState = { ...this.towingBodyA(), position: { ...arena.spawnPoint }, velocity: { x: 0, y: 0 },
            mass: profile.massA, radius: profile.radiusA, inertia: hullInertia(profile.massA, profile.geometryA), angle: -Math.PI / 2, angularVelocity: 0 };
        const towing = new LabTowing(a, spaceTowingProfile(profile));
        for (const [key, current] of Object.entries(snapshot.params)) if (key.startsWith("tow.")) towing.params[key] = current as number | string;
        if (snapshot.schema === 1) { towing.params["tow.dampingMode"] = "legacy"; towing.params["tow.module"] = "custom"; }
        const startArena = this.towingStartArena(arena, world), start = towing.reset(a, startArena);
        if (!start || towing.needsRestart || !towing.validGeometry(start, startArena)) throw new Error("Ссылка U2TagLab: невозможный безопасный старт выбранного состава на исходной карте");
        arena.spawnPoint = { ...start.position };
        this.stop();
        this.legacySpaceShare = snapshot.schema === 1; this.catalogSpaceShare = snapshot.schema === 3;
        this.space = profile; this.towing = towing; this.spaceFA = Boolean(snapshot.params["space.fa"]);
        this.spaceWorldRecipe = snapshot.world; this.spaceGeometryDirty = false;
        this.spaceWorldSettings = { asteroidMaxSpeed: snapshot.world.asteroidMaxSpeed, collisionRestitution: Number(snapshot.params["space.collisionRestitution"]) };
        this.spaceFieldSettings = { ...snapshot.world.fields };
        this.slimeConfig.geometry.baseRadiusM = profile.radiusA;
        this.paramManager.params["geometry.baseRadiusM"] = profile.radiusA;
        this.mass = profile.massA; this.paramManager.mass = this.mass; this.paramManager.params.mass = this.mass;
        for (const [key, current] of Object.entries(snapshot.params)) if (key.startsWith("trail.")) this.paramManager.update(key, current);
        this.lastSeed = snapshot.seed; this.lastDensity = snapshot.density; this.paramManager.params["arena.objectDensity"] = snapshot.density;
        this.arena = arena; this.spaceWorld = world;
        // При commit используем уже проверенный состав: повторной генерации или поиска нет.
        this.resetRun(start); this.pause();
    }

    /** Сбросить флаг orbDensityManual (вызывается перед пакетным сбросом/применением пресета) */
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
        if (this.towing) this.paramManager.params["arena.objectDensity"] = density;
        this.arena = this.buildArena(seed, density, true);
        // Сохранить orbDensityManual при сбросе (regenerateArena вызывается из
        // путей updateParams, включая ручное изменение orbs.density — reset() не
        // должен затирать только что установленный флаг)
        const savedOrbDensityManual = this.paramManager.orbDensityManual;
        // Полный сброс состояния (позиция, скорость, состояние FA, таймеры, орбы)
        this.reset();
        this.paramManager.orbDensityManual = savedOrbDensityManual;
        this.bestTime = 0; // сбросить рекорд — раскладка трассы изменилась

        console.log("[BonkLab] arena regenerated", { seed, density, obstacles: this.arena.obstacles.length });
    }

    // ── Цикл симуляции (приватный) ───────────────────────────────────────────

    /**
     * Обновляет симуляцию на frameDtSec секунд (вызывается из внешнего RAF-цикла).
     * Аккумулирует время и шагает фиксированными тиками FIXED_DT.
     * Возвращает alpha (0..1) — доля накопленного остатка для интерполяции рендера.
     */
    update(frameDtSec: number): number {
        if (!this.running) return 0;
        if (this.towing && frameDtSec > 0.25) {
            this.pause("Большой интервал кадра: нажмите Продолжить");
            return 0;
        }

        // Ограничение dt: при табах/паузах браузер может передать огромный dt;
        // NaN/Infinity/отрицательный dt возможны при сбое performance.now()
        if (!Number.isFinite(frameDtSec)) return 0;
        const clampedDt = Math.max(0, Math.min(frameDtSec, 0.1));
        this.accumulator += clampedDt;

        while (this.accumulator >= FIXED_DT) {
            this.tick(FIXED_DT);
            this.accumulator -= FIXED_DT;
            if (this.towing && !this.running) { this.accumulator = 0; break; }
        }

        return this.accumulator / FIXED_DT;
    }

    /** Возвращает true, если симуляция запущена (нужно вызывать update). */
    get isRunning(): boolean {
        return this.running;
    }

    /**
     * Копирует текущее состояние в prev*-поля.
     * Вызывается перед каждым тиком физики, а также при телепортации (респаун, сброс),
     * чтобы интерполяция не дёргала персонажа между старой и новой позицией.
     */
    private syncPrevState(): void {
        this.prevX = this.x;
        this.prevY = this.y;
        this.prevVx = this.vx;
        this.prevVy = this.vy;
        this.prevAngle = this.angle;
        this.prevAngVel = this.angVel;
        if (this.towing) {
            const b = this.towing.B;
            this.prevB = { ...b, position: { ...b.position }, velocity: { ...b.velocity } };
        }
        if (this.spaceWorld) this.prevAsteroids = cloneSpaceWorld(this.spaceWorld).asteroids;
    }

    /**
     * Возвращает интерполированное состояние между предыдущим и текущим тиком.
     * alpha = 0 → предыдущий тик, alpha = 1 → текущий тик.
     * При заморозке (смерть, финиш, обратный отсчёт) — возвращает текущее состояние без интерполяции.
     */
    getInterpolatedState(alpha: number): SandboxState {
        // При заморозке — текущее состояние, интерполяция не нужна
        if (this.deathTimer > 0 || this.finished || this.startCountdown > 0 || this.respawnCountdown > 0) {
            return this.getState();
        }
        // Защитный clamp: alpha вне [0,1] возможен при сбое таймера или отрицательном dt
        const a = Math.max(0, Math.min(alpha, 1));
        const state = this.getState();
        state.x = this.prevX + (this.x - this.prevX) * a;
        state.y = this.prevY + (this.y - this.prevY) * a;
        state.vx = this.prevVx + (this.vx - this.prevVx) * a;
        state.vy = this.prevVy + (this.vy - this.prevVy) * a;
        state.angle = lerpAngle(this.prevAngle, this.angle, a);
        state.angularVelocity = this.prevAngVel + (this.angVel - this.prevAngVel) * a;
        if (state.towing && this.prevB) {
            const b = state.towing.B, prev = this.prevB;
            b.position.x = prev.position.x + (b.position.x - prev.position.x) * a;
            b.position.y = prev.position.y + (b.position.y - prev.position.y) * a;
            b.velocity.x = prev.velocity.x + (b.velocity.x - prev.velocity.x) * a;
            b.velocity.y = prev.velocity.y + (b.velocity.y - prev.velocity.y) * a;
            b.angle = lerpAngle(prev.angle, b.angle, a);
            b.angularVelocity = prev.angularVelocity + (b.angularVelocity - prev.angularVelocity) * a;
        }
        if (state.spaceWorld && this.prevAsteroids) {
            const previous = new Map(this.prevAsteroids.map(b => [b.id, b]));
            for (const body of state.spaceWorld.asteroids) {
                const prev = previous.get(body.id);
                if (!prev) continue;
                body.position.x = prev.position.x + (body.position.x - prev.position.x) * a;
                body.position.y = prev.position.y + (body.position.y - prev.position.y) * a;
                body.angle = lerpAngle(prev.angle, body.angle, a);
            }
        }
        // Пересчитать производные поля по интерполированной позиции,
        // чтобы оверлей телеметрии не расходился с отрисованной позицией
        const interpDist = Math.max(0, this.arena.spawnPoint.y - state.y);
        state.distanceM = interpDist;
        const totalDist = this.arena.spawnPoint.y - this.arena.finishPoint.y;
        state.progressPct = totalDist > 0 ? Math.max(0, Math.min(1, interpDist / totalDist)) : 0;
        return state;
    }

    private tick(dt: number): void {
        // Стартовый обратный отсчёт — физика заморожена
        if (this.startCountdown > 0) {
            this.startCountdown -= dt;
            if (this.startCountdown <= 0) {
                this.startCountdown = 0;
                // Сбросить устаревший ввод, чтобы персонаж не двигался после Go!
                this.inputX = 0;
                this.inputY = 0;
                this.inputMagnitude = 0;
            }
            return;
        }

        // Финиш — симуляция заморожена до перезапуска
        if (this.finished) return;

        // Заморозка смерти — ожидание перед респауном (GDD §4.2)
        if (this.deathTimer > 0) {
            this.deathTimer -= dt;
            if (this.deathTimer <= 0) {
                this.deathTimer = 0;
                this.x = this.arena.spawnPoint.x;
                this.y = this.arena.spawnPoint.y;
                this.vx = 0;
                this.vy = 0;
                this.angle = -Math.PI / 2; // направлен вверх (к финишу)
                this.angVel = 0;
                // Сбросить секундомер при респауне (TZ v1.2 §A4)
                this.elapsedTime = 0;
                // Очистить состояние FA для предотвращения устаревшего гашения колебаний после респауна
                this.yawSignHistory.length = 0;
                this.lastFaOutput = { assistFx: 0, assistFy: 0, assistTorque: 0 };
                this.lastFaState = "idle";
                this.correctionFx = 0;
                this.correctionFy = 0;
                this.currentZone = null;
                this.restoreDestroyedObstacles();
                if (this.towing) {
                    this.inputX = this.inputY = this.inputMagnitude = 0;
                    this.accumulator = 0;
                    this.resetTowing();
                }
                // Синхронизировать prev-состояние, чтобы интерполяция не дёргала
                // персонажа от точки смерти к точке респауна
                this.syncPrevState();
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
                // Сбросить устаревший ввод, чтобы персонаж не двигался после Go!
                this.inputX = 0;
                this.inputY = 0;
                this.inputMagnitude = 0;
                // Синхронизировать prev-состояние перед первым «живым» тиком,
                // чтобы интерполяция не прыгнула от стейла заморозки
                this.syncPrevState();
            }
            return;
        }

        // Сохранить предыдущее состояние для интерполяции перед шагом физики
        this.syncPrevState();

        const mass = this.mass;
        const slimeConfig = this.slimeConfig;
        const radius = slimeConfig.geometry.baseRadiusM;
        const inertia = slimeConfig.geometry.inertiaFactor * mass * radius * radius;

        if (this.space) {
            if (!this.tickSpace(dt)) return;
            this.elapsedTime += dt;
            const finish = this.arena.finishPoint;
            if (Math.abs(this.x - finish.x) <= this.arena.width * 0.3 + radius && Math.abs(this.y - finish.y) <= 12 + radius) {
                this.finished = true; this.finishTime = this.elapsedTime;
                this.isNewRecord = this.bestTime === 0 || this.elapsedTime < this.bestTime;
                if (this.isNewRecord) this.bestTime = this.elapsedTime;
            }
            return;
        }

        // ── 1. Определение зоны (точка в окружности) ──
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

        // ── 2. Построить входное состояние FA ──
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

        // Нейтральные модификаторы (в песочнице нет талантов)
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

        // ── 3. Вычислить Flight Assist (с множителями зоны поверхности) ──
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

        // Вычислить вектор коррекции ДО классификации (ей нужны значения correctionF)
        if (hasInput && Math.hypot(this.vx, this.vy) > 1) {
            const inputAngle = Math.atan2(this.inputY, this.inputX);
            const thrustDirX = Math.cos(inputAngle);
            const thrustDirY = Math.sin(inputAngle);
            const forceMag = Math.hypot(faOutput.assistFx, faOutput.assistFy);
            if (forceMag > 0.01) {
                const forceDirX = faOutput.assistFx / forceMag;
                const forceDirY = faOutput.assistFy / forceMag;
                // Коррекция — перпендикулярная составляющая относительно направления ввода
                const dot = forceDirX * thrustDirX + forceDirY * thrustDirY;
                this.correctionFx = faOutput.assistFx - dot * forceMag * thrustDirX;
                this.correctionFy = faOutput.assistFy - dot * forceMag * thrustDirY;
            } else {
                this.correctionFx = 0;
                this.correctionFy = 0;
            }
        } else {
            // Нет ввода — нет значимой коррекции для визуализации
            this.correctionFx = 0;
            this.correctionFy = 0;
        }

        // Классифицировать состояние FA (после вычисления коррекции)
        this.lastFaState = classifyFaState(
            hasInput, faOutput, this.vx, this.vy,
            this.correctionFx, this.correctionFy,
        );

        // ── 4. Интегрировать физику ──
        const dragParams: IWorldDragParams = {
            forwardDragK: this.worldPhysics.forwardDragK,
            lateralGripMultiplier: this.worldPhysics.lateralGripMultiplier,
            angularDragK: this.worldPhysics.angularDragK,
        };

        if (this.towing) {
            if (!this.tickTowing(dt, faOutput, dragParams)) return;
        } else {
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
            false, // последний вздох
            1, // штраф скорости последнего вздоха
            dt,
        );

        this.x = result.x;
        this.y = result.y;
        this.vx = result.vx;
        this.vy = result.vy;
        this.angle = result.angle;
        this.angVel = result.angVel;

        // ── 5. Разрешение столкновений (4 итерации, как на сервере) ──
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

        // Границы стен
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
            // Сначала столкновения с препятствиями (в порядке сервера)
            for (const obs of this.arena.obstacles) {
                // Пропустить уничтоженные шипы
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
                    // Записать шип один раз (избежать повторного подсчёта между итерациями)
                    const dx = body.x - obs.x;
                    const dy = body.y - obs.y;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    spikeNx += dx / dist;
                    spikeNy += dy / dist;
                    hitSpikeSet.add(obs);
                }
            }

            // Столкновения со стенами последними (прямоугольная граница арены)
            resolveWallCollision(body, wallBounds, this.worldPhysics.restitution);
        }

        // Записать результаты столкновений обратно (до проверки смерти — нужна скорректированная позиция)
        this.x = body.x;
        this.y = body.y;
        this.vx = body.vx;
        this.vy = body.vy;

        // Реакция на столкновение с шипом — гибель или knockback
        if (hitSpikeSet.size > 0) {
            const spikeResult = resolveSpikeCollision(
                hitSpikeSet, spikeNx, spikeNy,
                this.vx, this.vy, mass,
                {
                    killOnHit: this.params["spike.killOnHit"] as boolean ?? false,
                    destroyOnHit: this.params["spike.destroyOnHit"] as boolean ?? false,
                    knockbackImpulse: (this.params["spike.knockbackImpulse"] as number) ?? 30_000,
                },
                MAX_KNOCKBACK_SPEED,
            );

            if (spikeResult.died) {
                this.deathTimer = DEATH_FREEZE_S;
                this.deathX = this.x;
                this.deathY = this.y;
                this.deathDistanceM = this.computeDistance();
                this.vx = 0;
                this.vy = 0;
                this.angVel = 0;
                body.vx = 0;
                body.vy = 0;
                // Синхронизировать prev-состояние, чтобы интерполяция не дёргала
                // при изменении guard-условий в getInterpolatedState()
                this.syncPrevState();
                return;
            }

            this.vx = spikeResult.vx;
            this.vy = spikeResult.vy;
            body.vx = this.vx;
            body.vy = this.vy;
        }

        // ── 6. Физика орбов ──
        tickOrbs(
            this.orbs,
            dt,
            body,
            this.arena.obstacles,
            wallBounds,
            {
                collisionConfig,
                dragK: this.worldPhysics.forwardDragK,
                restitution: this.worldPhysics.restitution,
                passageRestitution: (this.params["worldPhysics.passageRestitution"] as number) ?? this.worldPhysics.restitution * 0.5,
                spikeKill: Boolean(this.params["orbs.spikeKill"] ?? true),
            },
        );
        // Записать тело игрока обратно (столкновение орб-игрок могло его изменить)
        this.x = body.x;
        this.y = body.y;
        this.vx = body.vx;
        this.vy = body.vy;

        }

        // ── 7. Время ──
        this.elapsedTime += dt;

        // ── 8. Финиш ──
        // Полоса: по центру finishPoint, ширина = arena.width * 0.6, высота = ROWS * CELL = 24
        const FINISH_STRIP_HALF_H = 12; // 2 ряда × 12px ячейка / 2
        const finishHalfW = this.arena.width * 0.3;
        const fpx = this.arena.finishPoint.x;
        const fpy = this.arena.finishPoint.y;
        // Окружность-против-AABB: ближайшая точка прямоугольника к центру окружности
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
            return; // заморозить симуляцию
        }
    }
    private tickSpace(dt: number): boolean {
        const profile = this.space!, a = this.towingBodyA();
        const input = spaceInputFrame(a, this.inputX, this.inputY, this.inputMagnitude, profile, this.spaceBrake);
        const wrench = spaceEngineWrench(a, input, this.spaceFA, profile, dt);
        const towing = this.towing!;
        const result = advanceSpaceWorld(a, towing.B, towing.coupling, this.spaceWorld!, dt,
            towing.physicsConfig(this.spaceWorldSettings.collisionRestitution), ({ id, body, time, subDt }) => {
                const engine = id === "A" ? spaceEngineWrench(body,
                    spaceInputFrame(body, this.inputX, this.inputY, this.inputMagnitude, profile, this.spaceBrake), this.spaceFA, profile, subDt)
                    : { force: { x: 0, y: 0 }, torque: 0 };
                return sampleSpaceFieldResponse(this.spaceWorld!, { ...body, id }, time, subDt, engine);
            });
        towing.diagnostics = result.diagnostics;
        if (result.stopReason) { towing.fail(result.stopReason); this.pause(); return false; }
        towing.B = result.B; towing.coupling = result.coupling; this.spaceWorld = result.world;
        this.applyTowingA(result.A);
        this.lastFaOutput = { assistFx: wrench.force.x, assistFy: wrench.force.y, assistTorque: wrench.torque };
        this.lastFaState = classifyFaState(this.inputMagnitude > 0.05, this.lastFaOutput, this.vx, this.vy, 0, 0);
        this.currentZone = null; this.correctionFx = this.correctionFy = 0;
        return true;
    }
    private tickTowing(dt: number, faOutput: IFlightAssistOutput, drag: IWorldDragParams): boolean {
        const towing = this.towing!;
        const passiveConfig = { ...this.slimeConfig,
            limits: { ...this.slimeConfig.limits, angularSpeedLimitRadps: 0 } };
        const a = this.towingBodyA();
        const passageRestitution = Number(this.params["worldPhysics.passageRestitution"] ?? this.worldPhysics.restitution * 0.5);
        const result = towing.advance(a, this.arena, dt, this.worldPhysics.restitution, passageRestitution,
            (trialA, trialB, subDt) => {
                for (const [body, active] of [[trialA, true], [trialB, false]] as const) {
                    let surface = this.currentSurface;
                    if (!active) {
                        surface = DEFAULT_SURFACE_CONFIG;
                        for (const zone of this.arena.zones) {
                            if (Math.hypot(body.position.x - zone.x, body.position.y - zone.y) <= zone.radius) {
                                surface = this.zoneSurfaces[zone.type] ?? DEFAULT_SURFACE_CONFIG;
                                break;
                            }
                        }
                    }
                    const integrated = integratePhysics({ x: body.position.x, y: body.position.y,
                        vx: body.velocity.x, vy: body.velocity.y, angle: body.angle, angVel: body.angularVelocity },
                        active ? faOutput : { assistFx: 0, assistFy: 0, assistTorque: 0 }, body.mass, body.inertia,
                        active ? this.slimeConfig : passiveConfig, drag, toSurfaceParams(surface), false, 1, subDt);
                    // Единственный drift/CCD выполняет advancePair; здесь берём только скорости.
                    body.velocity.x = integrated.vx; body.velocity.y = integrated.vy;
                    body.angularVelocity = integrated.angVel;
                }
            });
        if (result.stopReason) { this.pause(); return false; }
        this.applyTowingA(result.A);

        let died = false;
        for (const id of ["A", "B"] as const) {
            const body = id === "A" ? result.A : towing.B;
            const hit = new Set<ArenaObject>();
            let nx = 0, ny = 0;
            for (const contact of result.contacts) {
                if (contact.body !== id || !contact.other.startsWith("arena:")) continue;
                const obstacle = this.arena.obstacles[Number(contact.other.slice(6))];
                if (obstacle?.type !== "spike" || hit.has(obstacle)) continue;
                hit.add(obstacle); nx += contact.normal.x; ny += contact.normal.y;
            }
            if (hit.size === 0) continue;
            const spike = resolveSpikeCollision(hit, nx, ny, body.velocity.x, body.velocity.y, body.mass,
                { killOnHit: Boolean(this.params["spike.killOnHit"]), destroyOnHit: Boolean(this.params["spike.destroyOnHit"]),
                    knockbackImpulse: Number(this.params["spike.knockbackImpulse"] ?? 30_000) }, MAX_KNOCKBACK_SPEED);
            body.velocity = { x: spike.vx, y: spike.vy };
            if (spike.died) {
                died = true; this.deathX = body.position.x; this.deathY = body.position.y;
            }
        }
        if (died) {
            this.deathTimer = DEATH_FREEZE_S;
            this.deathDistanceM = this.computeDistance();
            this.vx = this.vy = this.angVel = 0;
            towing.B.velocity = { x: 0, y: 0 }; towing.B.angularVelocity = 0;
            this.inputX = this.inputY = this.inputMagnitude = 0;
            this.syncPrevState();
            return false;
        }
        const orbBody = (body: BodyState): ICircleBody => ({ x: body.position.x, y: body.position.y,
            vx: body.velocity.x, vy: body.velocity.y, mass: body.mass, radius: body.radius });
        const orbA = orbBody(result.A), orbB = orbBody(towing.B);
        tickOrbs(this.orbs, dt, orbA, this.arena.obstacles,
            { minX: -this.arena.width / 2, maxX: this.arena.width / 2, minY: -this.arena.height / 2, maxY: this.arena.height / 2 },
            { collisionConfig: { correctionPercent: 0.8, slop: 0.001, maxCorrection: this.worldPhysics.maxPositionCorrectionM ?? 0.5 },
                dragK: this.worldPhysics.forwardDragK, restitution: this.worldPhysics.restitution, passageRestitution,
                spikeKill: Boolean(this.params["orbs.spikeKill"] ?? true), preserveBodyPositions: true }, [orbB]);
        this.x = orbA.x; this.y = orbA.y; this.vx = orbA.vx; this.vy = orbA.vy;
        towing.B.position = { x: orbB.x, y: orbB.y }; towing.B.velocity = { x: orbB.vx, y: orbB.vy };
        towing.updateGeometry(this.towingBodyA());
        return true;
    }

}
