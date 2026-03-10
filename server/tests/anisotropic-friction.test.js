/**
 * Anisotropic friction tests — validates exp(-k*dt) decay model
 * and ISurfaceParams/ISurfaceAssistParams behavior.
 */
const path = require("path");
const sharedDist = path.resolve(__dirname, "../../shared/dist");

const { integratePhysics, DEFAULT_SURFACE_PARAMS } = require(sharedDist);

const DT = 1 / 60; // 60 Hz

// Minimal SlimeConfig stub for tests
function makeSlimeConfig() {
    return {
        limits: { angularSpeedLimitRadps: 20 },
        massScaling: {
            angularSpeedLimitRadps: { type: "power", exp: 0 },
        },
        geometry: { baseRadiusM: 1 },
        mass: 100,
    };
}

function makeState(overrides = {}) {
    return {
        x: 0, y: 0,
        vx: 0, vy: 0,
        angle: 0, angVel: 0,
        ...overrides,
    };
}

const NO_FORCES = { assistFx: 0, assistFy: 0, assistTorque: 0 };

let passed = 0;
let failed = 0;

function assert(condition, msg) {
    if (!condition) {
        console.error(`FAIL: ${msg}`);
        failed++;
    } else {
        console.log(`OK: ${msg}`);
        passed++;
    }
}

// ─── Test 1: lateralGripMultiplier=1.0 → same decay forward/lateral ─────
{
    const drag = { forwardDragK: 0.1, lateralGripMultiplier: 1.0, angularDragK: 0 };
    const surface = { ...DEFAULT_SURFACE_PARAMS };
    const sc = makeSlimeConfig();

    // Forward velocity (angle=0, so forward = +x)
    const fwdState = makeState({ vx: 100, vy: 0, angle: 0 });
    const fwdResult = integratePhysics(fwdState, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);

    // Lateral velocity (angle=0, so lateral = -y direction for right vector)
    const latState = makeState({ vx: 0, vy: 100, angle: 0 });
    const latResult = integratePhysics(latState, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);

    // With grip=1.0, forward and lateral decay should be identical
    const fwdDecay = fwdResult.vx / 100;
    const latDecay = Math.hypot(latResult.vx, latResult.vy) / 100;
    assert(Math.abs(fwdDecay - latDecay) < 0.001, "grip=1.0: forward and lateral decay match");
}

// ─── Test 2: lateralGripMultiplier=80 → lateral decays to < 5% in 0.5s ──
{
    const drag = { forwardDragK: 0.12, lateralGripMultiplier: 80.0, angularDragK: 0 };
    const surface = { ...DEFAULT_SURFACE_PARAMS };
    const sc = makeSlimeConfig();

    // Pure lateral velocity (angle=0, vy=100 = fully lateral)
    let state = makeState({ vx: 0, vy: 100, angle: 0 });
    for (let i = 0; i < 30; i++) { // 30 ticks = 0.5s at 60Hz
        const result = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);
        state = { ...state, ...result };
    }
    const lateralRemaining = Math.abs(state.vy) / 100;
    // k = 0.12 * 80 = 9.6, exp(-9.6 * 0.5) = exp(-4.8) ≈ 0.008 = 0.8%
    assert(lateralRemaining < 0.05, `grip=80: lateral velocity < 5% after 0.5s (got ${(lateralRemaining * 100).toFixed(1)}%)`);
}

// ─── Test 3: exp(-k*dt) at extreme k → no inversion or zero ────────────
{
    const drag = { forwardDragK: 100, lateralGripMultiplier: 1.0, angularDragK: 0 };
    const surface = { ...DEFAULT_SURFACE_PARAMS };
    const sc = makeSlimeConfig();

    const state = makeState({ vx: 100, vy: 0, angle: 0 });
    const result = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);

    assert(result.vx > 0, "extreme k: velocity stays positive (no inversion)");
    assert(result.vx < 100, "extreme k: velocity decreases");
}

// ─── Test 4: zoneThrustN → monotonic speed increase ────────────────────
{
    const drag = { forwardDragK: 0.01, lateralGripMultiplier: 1.0, angularDragK: 0 };
    const surface = { ...DEFAULT_SURFACE_PARAMS, zoneThrustN: 15000 };
    const sc = makeSlimeConfig();

    let state = makeState({ angle: 0 });
    let prevSpeed = 0;
    let monotonic = true;
    for (let i = 0; i < 10; i++) {
        const result = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);
        state = { ...state, ...result };
        const speed = Math.hypot(state.vx, state.vy);
        if (speed < prevSpeed - 0.001) monotonic = false;
        prevSpeed = speed;
    }
    assert(monotonic && prevSpeed > 0, "zoneThrustN: monotonic speed increase over 10 ticks");
}

// ─── Test 6: all surface multipliers=1.0, grip=1.0 → ~same as before ──
{
    const drag = { forwardDragK: 0.1, lateralGripMultiplier: 1.0, angularDragK: 1.3 };
    const surface = { ...DEFAULT_SURFACE_PARAMS };
    const sc = makeSlimeConfig();

    const state = makeState({ vx: 50, vy: 30, angle: 0.5, angVel: 2 });
    const result = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);

    // With grip=1 and all multipliers=1, exp(-k*dt) ≈ 1-k*dt for small k*dt
    // forwardDragK * dt = 0.1/60 ≈ 0.00167
    // exp(-0.00167) ≈ 0.998333 vs 1-0.00167 = 0.998333 → negligible diff
    const expectedDecay = Math.exp(-0.1 * DT);
    const speed = Math.hypot(50, 30);
    const resultSpeed = Math.hypot(result.vx, result.vy);
    const actualDecay = resultSpeed / speed;
    assert(Math.abs(actualDecay - expectedDecay) < 0.001, "default surface: decay matches exp(-k*dt)");
}

// ─── Test 7: angularDragMultiplier=0.3 (ice) → angular decay slower ───
{
    const drag = { forwardDragK: 0, lateralGripMultiplier: 1, angularDragK: 1.3 };
    const surfaceNormal = { ...DEFAULT_SURFACE_PARAMS };
    const surfaceIce = { ...DEFAULT_SURFACE_PARAMS, angularDragMultiplier: 0.3 };
    const sc = makeSlimeConfig();

    const state = makeState({ angVel: 5 });
    const normalResult = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surfaceNormal, false, 1, DT);
    const iceResult = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surfaceIce, false, 1, DT);

    assert(Math.abs(iceResult.angVel) > Math.abs(normalResult.angVel),
        "ice angularDragMultiplier=0.3: angular velocity decays slower than normal");
}

// ─── Test 10: forwardDragK=0 → no friction (velocity preserved) ────────
{
    const drag = { forwardDragK: 0, lateralGripMultiplier: 50, angularDragK: 0 };
    const surface = { ...DEFAULT_SURFACE_PARAMS };
    const sc = makeSlimeConfig();

    const state = makeState({ vx: 100, vy: 50, angVel: 3 });
    const result = integratePhysics(state, NO_FORCES, 100, 1, sc, drag, surface, false, 1, DT);

    // exp(0) = 1, so velocities should be unchanged after decay
    assert(Math.abs(result.vx - 100) < 0.001, "forwardDragK=0: vx preserved");
    assert(Math.abs(result.vy - 50) < 0.001, "forwardDragK=0: vy preserved");
    assert(Math.abs(result.angVel - 3) < 0.001, "angularDragK=0: angVel preserved");
}

// ─── Summary ────────────────────────────────────────────────────────────
console.log();
console.log(`Anisotropic friction tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
