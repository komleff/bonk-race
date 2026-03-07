const path = require("path");

const serverRoot = path.resolve(__dirname, "..");
process.chdir(serverRoot);

const { ArenaRoom } = require(path.resolve(__dirname, "../dist/server/src/rooms/ArenaRoom.js"));
const { Rng } = require(path.resolve(__dirname, "../dist/server/src/utils/rng.js"));
const {
    generateObstacleSeeds,
    generateSafeZoneSeeds,
    generateZoneSeeds,
} = require(path.resolve(__dirname, "../dist/server/src/rooms/helpers/arenaGeneration.js"));
const { ZONE_TYPE_LAVA } = require("@bonk-race/shared");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message}: ${actual} !== ${expected}`);
    }
}

function runTest(name, fn) {
    try {
        fn();
        console.log(`OK: ${name}`);
    } catch (error) {
        console.error(`FAIL: ${name}`);
        console.error(error);
        process.exit(1);
    }
}

function getMapSizeKey(mapSize) {
    if (mapSize <= 900) return "small";
    if (mapSize <= 1400) return "medium";
    return "large";
}

runTest("arena zones deterministic and respect constraints", () => {
    const room = new ArenaRoom();
    room.setSimulationInterval = () => 0;
    room.onCreate({ seed: 12345 });

    const mapSize = 800;
    room.balance.world.mapSize = mapSize;
    room.balance.worldPhysics.widthM = mapSize;
    room.balance.worldPhysics.heightM = mapSize;

    const rngA = new Rng(777);
    const rngB = new Rng(777);

    const safeZonesA = generateSafeZoneSeeds(rngA, room.balance.worldPhysics, mapSize, room.balance.safeZones);
    const zonesA = generateZoneSeeds(rngA, room.balance.worldPhysics, mapSize, room.balance.zones, safeZonesA);

    const safeZonesB = generateSafeZoneSeeds(rngB, room.balance.worldPhysics, mapSize, room.balance.safeZones);
    const zonesB = generateZoneSeeds(rngB, room.balance.worldPhysics, mapSize, room.balance.zones, safeZonesB);

    assertEqual(JSON.stringify(zonesA), JSON.stringify(zonesB), "zones should be deterministic");
    assertEqual(JSON.stringify(safeZonesA), JSON.stringify(safeZonesB), "safe zones should be deterministic");

    const sizeKey = getMapSizeKey(mapSize);
    const expectedCount = Math.floor(room.balance.zones.countByMapSize[sizeKey]);
    if (expectedCount > 0) {
        assert(zonesA.length > 0, "zone count should be positive");
    }
    assert(zonesA.length <= expectedCount, "zone count");

    const minDistance = Math.max(0, room.balance.zones.minDistance);
    const lavaMinDist = Math.max(0, room.balance.zones.lavaMinDistanceFromSpawn);

    for (const zone of zonesA) {
        const limit = mapSize / 2 - zone.radius;
        assert(Math.abs(zone.x) <= limit && Math.abs(zone.y) <= limit, "zone should be inside world bounds");

        if (zone.type === ZONE_TYPE_LAVA) {
            const distFromSpawn = Math.hypot(zone.x, zone.y);
            assert(
                distFromSpawn >= lavaMinDist,
                "lava zone should be away from spawn"
            );
        }

        for (const safe of safeZonesA) {
            const dx = zone.x - safe.x;
            const dy = zone.y - safe.y;
            const minDist = zone.radius + safe.radius + minDistance;
            assert(dx * dx + dy * dy >= minDist * minDist, "zone should avoid safe zones");
        }
    }

    for (let i = 0; i < zonesA.length; i += 1) {
        for (let j = i + 1; j < zonesA.length; j += 1) {
            const a = zonesA[i];
            const b = zonesA[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const minDist = a.radius + b.radius + minDistance;
            assert(dx * dx + dy * dy >= minDist * minDist, "zones should not overlap");
        }
    }
});

runTest("arena obstacles deterministic and respect spacing", () => {
    const room = new ArenaRoom();
    room.setSimulationInterval = () => 0;
    room.onCreate({ seed: 12345 });

    const mapSize = 1200;
    room.balance.world.mapSize = mapSize;
    room.balance.worldPhysics.widthM = mapSize;
    room.balance.worldPhysics.heightM = mapSize;

    const rngA = new Rng(2024);
    const rngB = new Rng(2024);
    const obstaclesA = generateObstacleSeeds(rngA, room.balance.worldPhysics, mapSize, room.balance.obstacles);
    const obstaclesB = generateObstacleSeeds(rngB, room.balance.worldPhysics, mapSize, room.balance.obstacles);

    assertEqual(JSON.stringify(obstaclesA), JSON.stringify(obstaclesB), "obstacles should be deterministic");

    const sizeKey = getMapSizeKey(mapSize);
    const totalCount = Math.max(0, Math.floor(room.balance.obstacles.countByMapSize[sizeKey]));
    assert(obstaclesA.length <= totalCount, "obstacle count should not exceed total");

    const spacing = Math.max(0, room.balance.obstacles.spacing);
    for (let i = 0; i < obstaclesA.length; i += 1) {
        const a = obstaclesA[i];
        const limit = mapSize / 2 - a.radius;
        assert(Math.abs(a.x) <= limit && Math.abs(a.y) <= limit, "obstacle should be inside world bounds");
        for (let j = i + 1; j < obstaclesA.length; j += 1) {
            const b = obstaclesA[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const minDist = a.radius + b.radius + spacing;
            assert(dx * dx + dy * dy >= minDist * minDist, "obstacles should respect spacing");
        }
    }
});

console.log("Arena generation tests passed");
process.exit(0);
