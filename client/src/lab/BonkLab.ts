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
import { tickOrbs } from "./orbSimulator";
import { resolveSpikeCollision } from "./spikeResolver";
import { generateArena } from "@bonk-race/shared";
import { LabParamManager } from "./LabParamManager";

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
        return this.paramManager.params;
    }

    // Сохранено для будущего использования в LabRenderer
    readonly canvas: HTMLCanvasElement;
    private running = false;
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

    constructor(canvas: HTMLCanvasElement) {
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
        this.trueDefaults = { ...this.params };

        // Сгенерировать начальную арену (использовать lastDensity для соответствия значению UI по умолчанию)
        this.arena = this.buildArena(42, this.lastDensity);

        // Инициализировать орбы из арены
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        // Передать ссылку на орбы в paramManager (для autoSyncOrbDensity)
        this.paramManager.orbs = this.orbs;

        // Поместить персонажа на точку спауна
        this.x = this.arena.spawnPoint.x;
        this.y = this.arena.spawnPoint.y;
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

    start(): void {
        if (this.running) return;
        this.startCountdown = COUNTDOWN_TOTAL_S;
        this.running = true;
        this.accumulator = 0;
        this.syncPrevState();
        console.log(`[BonkLab] simulation started (countdown ${COUNTDOWN_TOTAL_S.toFixed(1)}s)`);
    }

    stop(): void {
        if (!this.running) return;
        this.running = false;
        console.log("[BonkLab] simulation stopped");
    }

    reset(): void {
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
        // bestTime сохраняется между сбросами (отслеживание рекорда)
        // Сбросить автосинхронизацию плотности орбов (пользователь не устанавливал вручную через сброс)
        this.paramManager.orbDensityManual = false;
        this.restoreDestroyedObstacles();
        // Сбросить орбы в начальное состояние из сида арены
        this.orbs = this.arena.orbs.map(o => ({ ...o, deathProgress: -1 }));
        // Поддерживать синхронизацию ссылки на орбы в paramManager
        this.paramManager.orbs = this.orbs;
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
        if (effect.newDensity !== undefined) {
            this.lastDensity = effect.newDensity;
        }
        if (effect.regenerateArena) {
            this.regenerateArena(this.lastSeed, this.lastDensity);
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
        this.arena = this.buildArena(seed, density);
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

        // Ограничение dt: при табах/паузах браузер может передать огромный dt
        const clampedDt = Math.min(frameDtSec, 0.1);
        this.accumulator += clampedDt;

        while (this.accumulator >= FIXED_DT) {
            this.tick(FIXED_DT);
            this.accumulator -= FIXED_DT;
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
}
