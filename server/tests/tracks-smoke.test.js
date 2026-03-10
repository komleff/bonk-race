/**
 * BonkRace Integration Smoke Test — Tracks API
 *
 * Validates that:
 * 1. GET /api/v1/tracks/today returns a valid TrackConfig (First Run preset)
 * 2. GET /api/v1/tracks/first-run returns the same preset by ID
 * 3. GET /api/v1/tracks/list returns available track IDs
 * 4. TrackConfig contains required fields: checkpoints, obstacles, surfaces, walls, physics
 *
 * Does NOT require PostgreSQL/Redis — tracks API is purely in-memory.
 */

const path = require("path");
const express = require("express");

// Import the tracks router from built output
const tracksRouter = require(path.resolve(__dirname, "../dist/server/src/meta/routes/tracks.js")).default;

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/v1/tracks", tracksRouter);
    return app;
}

// Simple test runner
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        passed++;
    } else {
        failed++;
        failures.push(message);
        console.error(`  FAIL: ${message}`);
    }
}

async function fetchJSON(app, urlPath) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, "127.0.0.1", () => {
            const port = server.address().port;
            const http = require("http");
            http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
                let data = "";
                res.on("data", (chunk) => data += chunk);
                res.on("end", () => {
                    server.close();
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            }).on("error", (err) => {
                server.close();
                reject(err);
            });
        });
    });
}

async function main() {
    console.log("BonkRace Integration Smoke Test — Tracks API\n");

    const app = createTestApp();

    // Test 1: GET /api/v1/tracks/today
    console.log("Test 1: GET /api/v1/tracks/today");
    const todayRes = await fetchJSON(app, "/api/v1/tracks/today");
    assert(todayRes.status === 200, "tracks/today returns 200");
    const track = todayRes.body;
    assert(typeof track.id === "string" && track.id.length > 0, "track has non-empty id");
    assert(typeof track.name === "string", "track has name");
    assert(typeof track.seed === "number", "track has seed");
    assert(typeof track.width === "number" && track.width > 0, "track has positive width");
    assert(typeof track.height === "number" && track.height > 0, "track has positive height");
    assert(Array.isArray(track.checkpoints) && track.checkpoints.length > 0, "track has checkpoints");
    assert(Array.isArray(track.obstacles), "track has obstacles array");
    assert(Array.isArray(track.surfaces), "track has surfaces array");
    assert(Array.isArray(track.walls), "track has walls array");
    assert(Array.isArray(track.pickups), "track has pickups array");
    assert(track.physics !== null && typeof track.physics === "object", "track has physics config");
    assert(typeof track.physics.thrustForwardN === "number", "physics has thrustForwardN");
    assert(typeof track.physics.wallThrustCoeff === "number", "physics has wallThrustCoeff");
    assert(typeof track.physics.tickRate === "number", "physics has tickRate");
    assert(track.medalTimesMs !== null && typeof track.medalTimesMs === "object", "track has medalTimesMs");
    assert(typeof track.maxSessionSec === "number", "track has maxSessionSec");
    console.log();

    // Test 2: GET /api/v1/tracks/first-run
    console.log("Test 2: GET /api/v1/tracks/first-run");
    const presetRes = await fetchJSON(app, "/api/v1/tracks/first-run");
    assert(presetRes.status === 200, "tracks/first-run returns 200");
    const preset = presetRes.body;
    assert(preset.id === "first-run", "preset id is 'first-run'");
    assert(preset.name === "First Run", "preset name is 'First Run'");
    assert(preset.checkpoints.length === 10, "preset has 10 checkpoints");
    assert(preset.obstacles.length === 9, "preset has 9 obstacles");
    assert(preset.surfaces.length === 4, "preset has 4 surfaces");
    assert(preset.walls.length === 7, "preset has 7 walls");
    assert(preset.pickups.length === 2, "preset has 2 pickups");
    // Verify checkpoint structure
    const cp0 = preset.checkpoints[0];
    assert(typeof cp0.x === "number" && typeof cp0.y === "number" && typeof cp0.radius === "number", "checkpoint has x, y, radius");
    assert(cp0.index === 0, "first checkpoint index is 0");
    // Verify wall structure
    const wall0 = preset.walls[0];
    assert(typeof wall0.x1 === "number" && typeof wall0.y1 === "number", "wall has x1, y1");
    assert(typeof wall0.x2 === "number" && typeof wall0.y2 === "number", "wall has x2, y2");
    assert(typeof wall0.isDangerous === "boolean", "wall has isDangerous flag");
    // Verify surface structure
    const surf0 = preset.surfaces[0];
    assert(typeof surf0.x === "number" && typeof surf0.type === "number", "surface has x and type");
    console.log();

    // Test 3: GET /api/v1/tracks/list
    console.log("Test 3: GET /api/v1/tracks/list");
    const listRes = await fetchJSON(app, "/api/v1/tracks/list");
    assert(listRes.status === 200, "tracks/list returns 200");
    assert(Array.isArray(listRes.body.tracks), "list has tracks array");
    assert(listRes.body.tracks.includes("first-run"), "list includes first-run");
    console.log();

    // Test 4: Medal thresholds ordering
    console.log("Test 4: Medal thresholds ordering");
    const medals = preset.medalTimesMs;
    assert(medals.author < medals.gold, "author < gold");
    assert(medals.gold < medals.silver, "gold < silver");
    assert(medals.silver < medals.bronze, "silver < bronze");
    console.log();

    // Test 5: Physics config sanity
    console.log("Test 5: Physics config sanity");
    const phys = preset.physics;
    assert(phys.thrustForwardN > 0, "thrustForwardN is positive");
    assert(phys.forwardDragK > 0 && phys.forwardDragK < 1, "forwardDragK is in (0, 1)");
    assert(phys.wallThrustCoeff >= 0 && phys.wallThrustCoeff <= 1, "wallThrustCoeff is in [0, 1]");
    assert(phys.tickRate === 60, "tickRate is 60 Hz");
    console.log();

    // Summary
    console.log("═══════════════════════════════════════");
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("\nFailures:");
        failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    }
    console.log("═══════════════════════════════════════");

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error("Smoke test error:", err);
    process.exit(1);
});
