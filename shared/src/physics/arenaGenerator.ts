/**
 * Упрощённый генератор арены для песочницы BonkLab.
 * Детерминированный через Rng seed. Без зависимостей от Colyseus.
 */

import { Rng } from "../rng";

// ─── Интерфейсы ──────────────────────────────────────────────────────────────

export interface ArenaConfig {
    seed: number;
    widthM: number;
    heightM: number;
    /** Множитель количества объектов (0.1 – 25.0) */
    objectDensity: number;
    /** Configurable obstacle radii (optional, defaults to constants) */
    pillarRadius?: number;
    spikeRadius?: number;
    passageRadius?: number;
    passageGap?: number;
    /** Orb generation parameters */
    orbCount?: number;
    orbMinRadius?: number;
    orbMaxRadius?: number;
    orbDensity?: number;
    orbMinSpeed?: number;
    orbMaxSpeed?: number;
}

export interface ArenaObject {
    type: "pillar" | "spike" | "passage" | "wall";
    x: number;
    y: number;
    radius: number;
    width?: number;   // для стен / проходов
    height?: number;
    alive?: boolean;  // false = шип уничтожен после столкновения
}

export interface ArenaZone {
    type: "ice" | "mud" | "turbo" | "sand";
    x: number;
    y: number;
    radius: number;
    params: Record<string, number>;
}

export interface ArenaOrb {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
    alive: boolean;
}

export interface Arena {
    width: number;
    height: number;
    walls: ArenaObject[];
    obstacles: ArenaObject[];
    zones: ArenaZone[];
    orbs: ArenaOrb[];
    spawnPoint: { x: number; y: number };
    finishPoint: { x: number; y: number };
}

// ─── Константы ───────────────────────────────────────────────────────────────

const BASE_PILLAR_COUNT = 4;
const BASE_SPIKE_COUNT = 2;
const BASE_PASSAGE_COUNT = 1;
const BASE_ZONE_COUNT = 8;

const PILLAR_RADIUS = 20;
const SPIKE_RADIUS = 16;
const PASSAGE_PILLAR_RADIUS = 18;
const PASSAGE_GAP_WIDTH = 25;

const ZONE_RADIUS_MIN = 60;
const ZONE_RADIUS_MAX = 100;

const WALL_THICKNESS = 10;

const PLACEMENT_RETRIES = 30;
const OBSTACLE_SPACING = 8;
const SPAWN_EXCLUSION_RADIUS = 60;

// Вероятности: turbo 50%, ice 30%, sand 10%, mud 10%
const ZONE_TYPES: ArenaZone["type"][] = [
    "turbo", "turbo", "turbo", "turbo", "turbo",
    "ice", "ice", "ice",
    "sand",
    "mud",
];

// DEPRECATED: Устаревшие параметры зон — физика теперь использует пресеты SurfaceConfig из surfaceConfig.ts.
// Эти значения по-прежнему записываются в ArenaZone.params для обратной совместимости со схемой Colyseus.
// TODO(LG-5): Удалить после завершения серверной миграции зон.
const ZONE_PARAMS: Record<ArenaZone["type"], Record<string, number>> = {
    ice:   { frictionMultiplier: 0.1 },
    mud: { speedMultiplier: 0.5, frictionMultiplier: 500 },
    turbo: { accelBoost: 1000 },
    sand:  { frictionMultiplier: 1.5 },
};

// ─── Вспомогательные функции ──────────────────────────────────────────────────

function clampDensity(d: number): number {
    return Math.max(0.1, Math.min(25.0, d));
}

function scaledCount(base: number, density: number): number {
    return Math.max(1, Math.round(base * clampDensity(density)));
}

function distSq(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

function canPlace(
    x: number,
    y: number,
    radius: number,
    existing: ArenaObject[],
    halfW: number,
    halfH: number,
    exclusionPoints?: { x: number; y: number }[],
): boolean {
    // Должен быть внутри границ арены (с отступом)
    if (Math.abs(x) + radius > halfW - WALL_THICKNESS) return false;
    if (Math.abs(y) + radius > halfH - WALL_THICKNESS) return false;

    // Не размещать вблизи точек спауна/финиша
    if (exclusionPoints) {
        for (const ep of exclusionPoints) {
            const minDist = radius + SPAWN_EXCLUSION_RADIUS;
            if (distSq(x, y, ep.x, ep.y) < minDist * minDist) return false;
        }
    }

    for (const obj of existing) {
        const minDist = radius + obj.radius + OBSTACLE_SPACING;
        if (distSq(x, y, obj.x, obj.y) < minDist * minDist) {
            return false;
        }
    }
    return true;
}

function randomPoint(rng: Rng, halfW: number, halfH: number, margin: number) {
    const w = halfW - margin;
    const h = halfH - margin;
    return {
        x: rng.range(-w, w),
        y: rng.range(-h, h),
    };
}

// ─── Генератор ───────────────────────────────────────────────────────────────

export function generateArena(config: ArenaConfig, rng: Rng): Arena {
    const { widthM, heightM, objectDensity } = config;
    const halfW = widthM / 2;
    const halfH = heightM / 2;

    // Настраиваемые радиусы (fallback на константы)
    const pillarR = config.pillarRadius ?? PILLAR_RADIUS;
    const spikeR = config.spikeRadius ?? SPIKE_RADIUS;
    const passageR = config.passageRadius ?? PASSAGE_PILLAR_RADIUS;
    const passageGap = config.passageGap ?? PASSAGE_GAP_WIDTH;

    // Спаун/финиш вычисляются раньше для исключения зоны размещения
    const spawnMargin = 50;
    const spawnPoint = { x: 0, y: halfH - spawnMargin };
    const finishPoint = { x: 0, y: -(halfH - spawnMargin) };
    const exclusionPoints = [spawnPoint, finishPoint];

    // 1. Граничные стены (4 стороны)
    const walls: ArenaObject[] = [
        { type: "wall", x: 0, y: -halfH, radius: 0, width: widthM, height: WALL_THICKNESS },  // верх
        { type: "wall", x: 0, y: halfH,  radius: 0, width: widthM, height: WALL_THICKNESS },  // низ
        { type: "wall", x: -halfW, y: 0, radius: 0, width: WALL_THICKNESS, height: heightM }, // лево
        { type: "wall", x: halfW,  y: 0, radius: 0, width: WALL_THICKNESS, height: heightM }, // право
    ];

    const obstacles: ArenaObject[] = [];

    // 2. Проходы (цепочка 2-3 шаров поперёк трассы с зазорами для прохода)
    const passageCount = scaledCount(BASE_PASSAGE_COUNT, objectDensity);
    // Расстояние между центрами соседних шаров: passageGap (зазор) + 2 * passageR (радиусы)
    const chainStep = passageGap + 2 * passageR;

    for (let i = 0; i < passageCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const chainLength = 2 + Math.floor(rng.range(0, 2)); // 2 или 3
            const totalWidth = (chainLength - 1) * chainStep;
            const margin = passageR + OBSTACLE_SPACING + totalWidth / 2;
            const center = randomPoint(rng, halfW, halfH, margin);
            // Шары горизонтально (по X) поперёк трассы, игрок едет вверх (по Y)
            const startX = center.x - totalWidth / 2;

            // Проверить размещение всех шаров цепочки
            let canPlaceAll = true;
            for (let c = 0; c < chainLength; c++) {
                if (!canPlace(startX + c * chainStep, center.y, passageR, obstacles, halfW, halfH, exclusionPoints)) {
                    canPlaceAll = false;
                    break;
                }
            }

            if (canPlaceAll) {
                for (let c = 0; c < chainLength; c++) {
                    obstacles.push({
                        type: "passage",
                        x: startX + c * chainStep,
                        y: center.y,
                        radius: passageR,
                    });
                }
                break;
            }
        }
    }

    // 3. Столбы
    const pillarCount = scaledCount(BASE_PILLAR_COUNT, objectDensity);
    for (let i = 0; i < pillarCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const pt = randomPoint(rng, halfW, halfH, pillarR + OBSTACLE_SPACING);
            if (canPlace(pt.x, pt.y, pillarR, obstacles, halfW, halfH, exclusionPoints)) {
                obstacles.push({ type: "pillar", x: pt.x, y: pt.y, radius: pillarR });
                break;
            }
        }
    }

    // 4. Шипы (повреждающие препятствия)
    const spikeCount = scaledCount(BASE_SPIKE_COUNT, objectDensity);
    for (let i = 0; i < spikeCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const pt = randomPoint(rng, halfW, halfH, spikeR + OBSTACLE_SPACING);
            if (canPlace(pt.x, pt.y, spikeR, obstacles, halfW, halfH, exclusionPoints)) {
                obstacles.push({ type: "spike", x: pt.x, y: pt.y, radius: spikeR });
                break;
            }
        }
    }

    // 5. Зоны
    const zones: ArenaZone[] = [];
    const zoneCount = scaledCount(BASE_ZONE_COUNT, objectDensity);

    for (let i = 0; i < zoneCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const zoneRadius = rng.range(ZONE_RADIUS_MIN, ZONE_RADIUS_MAX);
            const margin = zoneRadius + OBSTACLE_SPACING;
            const pt = randomPoint(rng, halfW, halfH, margin);

            // Зоны не должны перекрывать точки спауна/финиша
            let tooClose = false;
            for (const ep of exclusionPoints) {
                const minDist = zoneRadius + SPAWN_EXCLUSION_RADIUS;
                if (distSq(pt.x, pt.y, ep.x, ep.y) < minDist * minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            // Проверка расстояния до других зон
            for (const z of zones) {
                const minDist = zoneRadius + z.radius + OBSTACLE_SPACING * 2;
                if (distSq(pt.x, pt.y, z.x, z.y) < minDist * minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const zoneType = ZONE_TYPES[rng.int(0, ZONE_TYPES.length)];

            zones.push({
                type: zoneType,
                x: pt.x,
                y: pt.y,
                radius: zoneRadius,
                params: { ...ZONE_PARAMS[zoneType] },
            });
            break;
        }
    }

    // 6. Орбы (динамические тела)
    const orbs: ArenaOrb[] = [];
    const orbCount = config.orbCount ?? 0;
    const orbMinR = config.orbMinRadius ?? 5;
    const orbMaxR = config.orbMaxRadius ?? 25;
    const orbDensity = config.orbDensity ?? 1;
    const orbMinSpd = config.orbMinSpeed ?? 0;
    const orbMaxSpd = config.orbMaxSpeed ?? 50;

    for (let i = 0; i < orbCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const r = rng.range(orbMinR, orbMaxR);
            const pt = randomPoint(rng, halfW, halfH, r + OBSTACLE_SPACING);
            if (canPlace(pt.x, pt.y, r, obstacles, halfW, halfH, exclusionPoints)
                && !orbs.some(o => Math.hypot(o.x - pt.x, o.y - pt.y) < o.radius + r + OBSTACLE_SPACING)) {
                const speed = rng.range(orbMinSpd, orbMaxSpd);
                const angle = rng.range(0, Math.PI * 2);
                const mass = orbDensity * Math.PI * r * r;
                orbs.push({
                    x: pt.x,
                    y: pt.y,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: r,
                    mass,
                    alive: true,
                });
                break;
            }
        }
    }

    return {
        width: widthM,
        height: heightM,
        walls,
        obstacles,
        zones,
        orbs,
        spawnPoint,
        finishPoint,
    };
}
