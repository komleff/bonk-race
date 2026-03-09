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
    /** Object count multiplier (0.1 – 25.0) */
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
    width?: number;   // for walls / passages
    height?: number;
}

export interface ArenaZone {
    type: "ice" | "mud" | "turbo";
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
const SPAWN_EXCLUSION_RADIUS = 60;

const ZONE_TYPES: ArenaZone["type"][] = ["ice", "mud", "turbo"];

const ZONE_PARAMS: Record<ArenaZone["type"], Record<string, number>> = {
    ice:   { frictionMultiplier: 0.1 },
    mud: { speedMultiplier: 0.5, frictionMultiplier: 500 },
    turbo: { accelBoost: 1000 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    // Must be inside arena bounds (with margin)
    if (Math.abs(x) + radius > halfW - WALL_THICKNESS) return false;
    if (Math.abs(y) + radius > halfH - WALL_THICKNESS) return false;

    // Keep clear of spawn/finish points
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

// ─── Generator ───────────────────────────────────────────────────────────────

export function generateArena(config: ArenaConfig, rng: Rng): Arena {
    const { widthM, heightM, objectDensity } = config;
    const halfW = widthM / 2;
    const halfH = heightM / 2;

    // Configurable radii (fall back to constants)
    const pillarR = config.pillarRadius ?? PILLAR_RADIUS;
    const spikeR = config.spikeRadius ?? SPIKE_RADIUS;
    const passageR = config.passageRadius ?? PASSAGE_PILLAR_RADIUS;
    const passageGap = config.passageGap ?? PASSAGE_GAP_WIDTH;

    // Spawn/finish computed early for obstacle exclusion
    const spawnMargin = 50;
    const spawnPoint = { x: 0, y: halfH - spawnMargin };
    const finishPoint = { x: 0, y: -(halfH - spawnMargin) };
    const exclusionPoints = [spawnPoint, finishPoint];

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
    const halfPassageDist = passageGap / 2 + passageR;

    for (let i = 0; i < passageCount; i++) {
        for (let attempt = 0; attempt < PLACEMENT_RETRIES; attempt++) {
            const margin = passageR + OBSTACLE_SPACING + halfPassageDist;
            const center = randomPoint(rng, halfW, halfH, margin);
            const angle = rng.range(0, Math.PI * 2);
            const ox = Math.cos(angle) * halfPassageDist;
            const oy = Math.sin(angle) * halfPassageDist;

            const ax = center.x - ox;
            const ay = center.y - oy;
            const bx = center.x + ox;
            const by = center.y + oy;

            if (
                canPlace(ax, ay, passageR, obstacles, halfW, halfH, exclusionPoints) &&
                canPlace(bx, by, passageR, obstacles, halfW, halfH, exclusionPoints)
            ) {
                obstacles.push(
                    { type: "passage", x: ax, y: ay, radius: passageR },
                    { type: "passage", x: bx, y: by, radius: passageR },
                );
                break;
            }
        }
    }

    // 3. Pillars
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

    // 4. Spikes (damaging obstacles)
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

    // 6. Orbs (dynamic bodies)
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
            if (canPlace(pt.x, pt.y, r, obstacles, halfW, halfH, exclusionPoints)) {
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
