import {
    OBSTACLE_TYPE_PILLAR,
    OBSTACLE_TYPE_SPIKES,
    ZONE_TYPE_NECTAR,
    ZONE_TYPE_ICE,
    ZONE_TYPE_MUD,
    ZONE_TYPE_LAVA,
    ZONE_TYPE_TURBO,
    type MapSizeConfig,
    type ObstacleConfig,
    type SafeZoneConfig,
    type WorldPhysicsConfig,
    type ZonesConfig,
} from "@bonk-race/shared";

type RngLike = {
    range: (min: number, max: number) => number;
    next: () => number;
};

type MapSizeKey = keyof MapSizeConfig;

export interface ObstacleSeed {
    type: number;
    x: number;
    y: number;
    radius: number;
}

export interface SafeZoneSeed {
    x: number;
    y: number;
    radius: number;
}

export interface ZoneSeed {
    type: number;
    x: number;
    y: number;
    radius: number;
}

export function getMapSizeKey(mapSize: number): MapSizeKey {
    if (mapSize <= 900) return "small";
    if (mapSize <= 1400) return "medium";
    return "large";
}

export function randomPointInMapWithMargin(
    rng: RngLike,
    world: WorldPhysicsConfig,
    mapSize: number,
    margin: number
): { x: number; y: number } {
    const safeMargin = Math.max(0, margin);
    if (world.worldShape === "circle") {
        const radius = Math.max(0, (world.radiusM ?? mapSize / 2) - safeMargin);
        const angle = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * radius;
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    }

    const width = Math.max(0, (world.widthM ?? mapSize) - safeMargin * 2);
    const height = Math.max(0, (world.heightM ?? mapSize) - safeMargin * 2);
    return {
        x: rng.range(-width / 2, width / 2),
        y: rng.range(-height / 2, height / 2),
    };
}

export function isInsideWorld(
    world: WorldPhysicsConfig,
    mapSize: number,
    x: number,
    y: number,
    radius: number
): boolean {
    const safeRadius = Math.max(0, radius);
    if (world.worldShape === "circle") {
        const limit = Math.max(0, (world.radiusM ?? mapSize / 2) - safeRadius);
        return x * x + y * y <= limit * limit;
    }
    const halfW = (world.widthM ?? mapSize) / 2 - safeRadius;
    const halfH = (world.heightM ?? mapSize) / 2 - safeRadius;
    return Math.abs(x) <= halfW && Math.abs(y) <= halfH;
}

export function generateObstacleSeeds(
    rng: RngLike,
    world: WorldPhysicsConfig,
    mapSize: number,
    config: ObstacleConfig
): ObstacleSeed[] {
    const obstacles: ObstacleSeed[] = [];
    const sizeKey = getMapSizeKey(mapSize);
    const totalCount = Math.max(0, Math.floor(config.countByMapSize[sizeKey]));
    const maxPassages = Math.floor(totalCount / 2);
    const passageCount = Math.min(maxPassages, Math.max(0, Math.floor(config.passageCountByMapSize[sizeKey])));
    const spacing = Math.max(0, config.spacing);
    const retries = Math.max(1, Math.floor(config.placementRetries));
    const passageRadius = Math.max(0, config.passagePillarRadius);
    const passageGap = Math.max(0, config.passageGapWidth);
    const halfPassageDist = passageGap / 2 + passageRadius;

    const canPlaceObstacle = (x: number, y: number, radius: number, minSpacing: number) => {
        if (!isInsideWorld(world, mapSize, x, y, radius)) return false;
        const safeSpacing = Math.max(0, minSpacing);
        for (const obstacle of obstacles) {
            const dx = x - obstacle.x;
            const dy = y - obstacle.y;
            const minDist = radius + obstacle.radius + safeSpacing;
            if (dx * dx + dy * dy < minDist * minDist) {
                return false;
            }
        }
        return true;
    };

    const addObstacle = (type: number, x: number, y: number, radius: number) => {
        obstacles.push({ type, x, y, radius });
    };

    for (let i = 0; i < passageCount; i += 1) {
        let placed = false;
        for (let attempt = 0; attempt < retries; attempt += 1) {
            const margin = passageRadius + spacing + halfPassageDist;
            const center = randomPointInMapWithMargin(rng, world, mapSize, margin);
            const angle = rng.range(0, Math.PI * 2);
            const offsetX = Math.cos(angle) * halfPassageDist;
            const offsetY = Math.sin(angle) * halfPassageDist;
            const ax = center.x - offsetX;
            const ay = center.y - offsetY;
            const bx = center.x + offsetX;
            const by = center.y + offsetY;
            if (!canPlaceObstacle(ax, ay, passageRadius, spacing)) continue;
            if (!canPlaceObstacle(bx, by, passageRadius, spacing)) continue;
            addObstacle(OBSTACLE_TYPE_PILLAR, ax, ay, passageRadius);
            addObstacle(OBSTACLE_TYPE_PILLAR, bx, by, passageRadius);
            placed = true;
            break;
        }
        if (!placed) {
            console.warn("Не удалось разместить проход");
        }
    }

    const remaining = Math.max(0, totalCount - obstacles.length);
    const spikeChance = Math.max(0, Math.min(1, config.spikeChance));
    const pillarRadius = Math.max(0, config.pillarRadius);
    const spikeRadius = Math.max(0, config.spikeRadius);
    for (let i = 0; i < remaining; i += 1) {
        let placed = false;
        for (let attempt = 0; attempt < retries; attempt += 1) {
            const isSpike = rng.next() < spikeChance;
            const radius = isSpike ? spikeRadius : pillarRadius;
            const margin = radius + spacing;
            const point = randomPointInMapWithMargin(rng, world, mapSize, margin);
            if (!canPlaceObstacle(point.x, point.y, radius, spacing)) continue;
            addObstacle(isSpike ? OBSTACLE_TYPE_SPIKES : OBSTACLE_TYPE_PILLAR, point.x, point.y, radius);
            placed = true;
            break;
        }
        if (!placed) {
            console.warn("Не удалось разместить препятствие");
        }
    }

    return obstacles;
}

export function generateSafeZoneSeeds(
    rng: RngLike,
    world: WorldPhysicsConfig,
    mapSize: number,
    config: SafeZoneConfig
): SafeZoneSeed[] {
    const zones: SafeZoneSeed[] = [];
    const sizeKey = getMapSizeKey(mapSize);
    const count = Math.max(0, Math.floor(config.countByMapSize[sizeKey]));
    const radius = Math.max(0, config.radiusByMapSize[sizeKey]);
    const minDistance = Math.max(0, config.minDistance);
    const retries = Math.max(1, Math.floor(config.placementRetries));
    const margin = radius + 10;

    for (let i = 0; i < count; i += 1) {
        let placed = false;
        for (let attempt = 0; attempt < retries; attempt += 1) {
            const point = randomPointInMapWithMargin(rng, world, mapSize, margin);
            if (!isInsideWorld(world, mapSize, point.x, point.y, radius)) continue;
            let ok = true;
            for (const zone of zones) {
                const dx = point.x - zone.x;
                const dy = point.y - zone.y;
                if (dx * dx + dy * dy < minDistance * minDistance) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
            zones.push({ x: point.x, y: point.y, radius });
            placed = true;
            break;
        }
        if (!placed) {
            console.warn("Не удалось разместить безопасную зону");
        }
    }

    return zones;
}

export function generateZoneSeeds(
    rng: RngLike,
    world: WorldPhysicsConfig,
    mapSize: number,
    config: ZonesConfig,
    safeZones: SafeZoneSeed[]
): ZoneSeed[] {
    const zones: ZoneSeed[] = [];
    const sizeKey = getMapSizeKey(mapSize);
    const count = Math.max(0, Math.floor(config.countByMapSize[sizeKey]));
    const radius = Math.max(0, config.radiusByMapSize[sizeKey]);
    const minDistance = Math.max(0, config.minDistance);
    const retries = Math.max(1, Math.floor(config.placementRetries));
    const lavaSpawnMin = Math.max(0, config.lavaMinDistanceFromSpawn);
    const weights = config.typeWeights;
    const totalWeight =
        Math.max(0, weights.nectar) +
        Math.max(0, weights.ice) +
        Math.max(0, weights.mud) +
        Math.max(0, weights.lava) +
        Math.max(0, weights.turbo);
    const margin = radius + 10;

    const pickZoneType = () => {
        if (totalWeight <= 0) return ZONE_TYPE_NECTAR;
        let roll = rng.range(0, totalWeight);
        const entries: Array<[number, number]> = [
            [ZONE_TYPE_NECTAR, Math.max(0, weights.nectar)],
            [ZONE_TYPE_ICE, Math.max(0, weights.ice)],
            [ZONE_TYPE_MUD, Math.max(0, weights.mud)],
            [ZONE_TYPE_LAVA, Math.max(0, weights.lava)],
            [ZONE_TYPE_TURBO, Math.max(0, weights.turbo)],
        ];
        for (const [zoneType, weight] of entries) {
            if (roll < weight) return zoneType;
            roll -= weight;
        }
        return ZONE_TYPE_NECTAR;
    };

    const isTooCloseToSafeZone = (x: number, y: number) => {
        for (const zone of safeZones) {
            const dx = x - zone.x;
            const dy = y - zone.y;
            const minDist = zone.radius + radius + minDistance;
            if (dx * dx + dy * dy < minDist * minDist) return true;
        }
        return false;
    };

    let failedCount = 0;
    for (let i = 0; i < count; i += 1) {
        let placed = false;
        for (let attempt = 0; attempt < retries; attempt += 1) {
            const type = pickZoneType();
            const point = randomPointInMapWithMargin(rng, world, mapSize, margin);
            if (!isInsideWorld(world, mapSize, point.x, point.y, radius)) continue;
            if (isTooCloseToSafeZone(point.x, point.y)) continue;
            if (type === ZONE_TYPE_LAVA) {
                const distanceFromSpawn = Math.hypot(point.x, point.y);
                if (distanceFromSpawn < lavaSpawnMin + radius) continue;
            }
            let ok = true;
            for (const zone of zones) {
                const dx = point.x - zone.x;
                const dy = point.y - zone.y;
                const minDist = radius + zone.radius + minDistance;
                if (dx * dx + dy * dy < minDist * minDist) {
                    ok = false;
                    break;
                }
            }
            if (!ok) continue;
            zones.push({ type, x: point.x, y: point.y, radius });
            placed = true;
            break;
        }
        if (!placed) {
            failedCount += 1;
        }
    }

    if (failedCount > 0) {
        console.warn(`Не удалось разместить зон: ${failedCount}`);
    }

    return zones;
}
