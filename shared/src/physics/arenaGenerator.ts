/**
 * Simplified arena generator for BonkLab sandbox.
 * Deterministic via Rng seed. No Colyseus dependencies.
 */

import { Rng } from "../rng";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ArenaConfig {
    seed: number;
    widthM: number;
    heightM: number;
    /** Object count multiplier (0.1 – 3.0) */
    objectDensity: number;
}

export interface ArenaObject {
    type: "pillar" | "spike" | "passage" | "wall";
    x: number;
    y: number;
    radius: number;
    width?: number;   // for walls / passages
    height?: number;
}

export interface ArenaZone {
    type: "ice" | "slime" | "turbo" | "lava";
    x: number;
    y: number;
    radius: number;
    params: Record<string, number>;
}

export interface Arena {
    width: number;
    height: number;
    walls: ArenaObject[];
    obstacles: ArenaObject[];
    zones: ArenaZone[];
    spawnPoint: { x: number; y: number };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const BASE_PILLAR_COUNT = 6;
const BASE_SPIKE_COUNT = 4;
const BASE_PASSAGE_COUNT = 2;
const BASE_ZONE_COUNT = 4;

const PILLAR_RADIUS = 20;
const SPIKE_RADIUS = 16;
const PASSAGE_PILLAR_RADIUS = 18;
const PASSAGE_GAP_WIDTH = 25;

const ZONE_RADIUS_MIN = 60;
const ZONE_RADIUS_MAX = 100;

const WALL_THICKNESS = 10;

const PLACEMENT_RETRIES = 30;
const OBSTACLE_SPACING = 8;

const ZONE_TYPES: ArenaZone["type"][] = ["ice", "slime", "turbo", "lava"];

const ZONE_PARAMS: Record<ArenaZone["type"], Record<string, number>> = {
    ice:   { frictionMultiplier: 0.3 },
    slime: { speedMultiplier: 0.5, frictionMultiplier: 2.0 },
    turbo: { speedMultiplier: 1.4 },
    lava:  { damagePctPerSec: 0.02 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clampDensity(d: number): number {
    return Math.max(0.1, Math.min(3.0, d));
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
): boolean {
    // Must be inside arena bounds (with margin)
    if (Math.abs(x) + radius > halfW - WALL_THICKNESS) return false;
    if (Math.abs(y) + radius > halfH - WALL_THICKNESS) return false;

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

// ─── Generator ───────────────────────────────────────────────────────────────

export function generateArena(config: ArenaConfig, rng: Rng): Arena {
    const { widthM, heightM, objectDensity } = config;
    const halfW = widthM / 2;
    const halfH = heightM / 2;

    // 1. Boundary walls (4 sides)
    const walls: ArenaObject[] = [
        { type: "wall", x: 0, y: -halfH, radius: 0, width: widthM, height: WALL_THICKNESS },  // top
        { type: "wall", x: 0, y: halfH,  radius: 0, width: widthM, height: WALL_THICKNESS },  // bottom
        { type: "wall", x: -halfW, y: 0, radius: 0, width: WALL_THICKNESS, height: heightM }, // left
        { type: "wall", x: halfW,  y: 0, radius: 0, width: WALL_THICKNESS, height: heightM }, // right
    ];

    const obstacles: ArenaObject[] = [];

    // 2. Passages (two pillars forming a narrow gap)
    const passageCount = scaledCount(BASE_PASSAGE_COUNT, objectDensity);
    const halfPassageDist = PASSAGE_GAP_WIDTH / 2 + PASSAGE_PILLAR_RADIUS;

    for (let i = 0; i < passageCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const margin = PASSAGE_PILLAR_RADIUS + OBSTACLE_SPACING + halfPassageDist;
            const center = randomPoint(rng, halfW, halfH, margin);
            const angle = rng.range(0, Math.PI * 2);
            const ox = Math.cos(angle) * halfPassageDist;
            const oy = Math.sin(angle) * halfPassageDist;

            const ax = center.x - ox;
            const ay = center.y - oy;
            const bx = center.x + ox;
            const by = center.y + oy;

            if (
                canPlace(ax, ay, PASSAGE_PILLAR_RADIUS, obstacles, halfW, halfH) &&
                canPlace(bx, by, PASSAGE_PILLAR_RADIUS, obstacles, halfW, halfH)
            ) {
                obstacles.push(
                    { type: "passage", x: ax, y: ay, radius: PASSAGE_PILLAR_RADIUS },
                    { type: "passage", x: bx, y: by, radius: PASSAGE_PILLAR_RADIUS },
                );
                break;
            }
        }
    }

    // 3. Pillars
    const pillarCount = scaledCount(BASE_PILLAR_COUNT, objectDensity);
    for (let i = 0; i < pillarCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const pt = randomPoint(rng, halfW, halfH, PILLAR_RADIUS + OBSTACLE_SPACING);
            if (canPlace(pt.x, pt.y, PILLAR_RADIUS, obstacles, halfW, halfH)) {
                obstacles.push({ type: "pillar", x: pt.x, y: pt.y, radius: PILLAR_RADIUS });
                break;
            }
        }
    }

    // 4. Spikes (damaging obstacles)
    const spikeCount = scaledCount(BASE_SPIKE_COUNT, objectDensity);
    for (let i = 0; i < spikeCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const pt = randomPoint(rng, halfW, halfH, SPIKE_RADIUS + OBSTACLE_SPACING);
            if (canPlace(pt.x, pt.y, SPIKE_RADIUS, obstacles, halfW, halfH)) {
                obstacles.push({ type: "spike", x: pt.x, y: pt.y, radius: SPIKE_RADIUS });
                break;
            }
        }
    }

    // 5. Zones
    const zones: ArenaZone[] = [];
    const zoneCount = scaledCount(BASE_ZONE_COUNT, objectDensity);

    for (let i = 0; i < zoneCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const zoneRadius = rng.range(ZONE_RADIUS_MIN, ZONE_RADIUS_MAX);
            const margin = zoneRadius + OBSTACLE_SPACING;
            const pt = randomPoint(rng, halfW, halfH, margin);

            // Check distance to other zones
            let tooClose = false;
            for (const z of zones) {
                const minDist = zoneRadius + z.radius + OBSTACLE_SPACING * 2;
                if (distSq(pt.x, pt.y, z.x, z.y) < minDist * minDist) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const zoneType = ZONE_TYPES[rng.int(0, ZONE_TYPES.length)];

            // Lava zones should not be near center spawn
            if (zoneType === "lava") {
                const distFromCenter = Math.sqrt(pt.x * pt.x + pt.y * pt.y);
                if (distFromCenter < 100 + zoneRadius) continue;
            }

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

    // 6. Spawn point — center of arena, guaranteed safe
    const spawnPoint = { x: 0, y: 0 };

    return {
        width: widthM,
        height: heightM,
        walls,
        obstacles,
        zones,
        spawnPoint,
    };
}
