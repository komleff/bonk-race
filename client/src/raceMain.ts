/**
 * BonkRace MVP — Client-side physics time-trial entry point.
 *
 * Architecture (GDD §10.1):
 * - Physics runs locally in the browser (no Colyseus real-time).
 * - Track config loaded from REST API (GET /api/track-of-day).
 * - After finish: POST /api/submit-run with replay + result.
 * - Ghosts loaded from GET /api/ghosts and rendered as visual overlays.
 *
 * Systems order per physics tick (GDD §3.2):
 * FlightAssist → Physics → Collision → CheckpointDetection
 */

import type { TrackConfig, TrackCheckpoint } from "@bonk-race/shared";
import {
    clamp, wrapAngle, distance,
    RACE_PHASE_LOBBY, RACE_PHASE_COUNTDOWN, RACE_PHASE_RACING, RACE_PHASE_RESULTS,
    type RacePhase,
} from "@bonk-race/shared";
import { GhostRecorder } from "./game/GhostRecorder";
import { GhostPlayer } from "./game/GhostPlayer";
import { drawBlob } from "./rendering/blob";
import {
    drawSurfaces, drawWalls, drawObstacles,
    drawCheckpoints, drawPickups,
} from "./rendering/track";

// ─── Player state ────────────────────────────────────────────────────────────

interface PlayerState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angVel: number;
    mass: number;
    radius: number;
    checkpoint: number;
    coinsCollected: number;
    isDead: boolean;
}

function createPlayer(startX: number, startY: number): PlayerState {
    return {
        x: startX,
        y: startY,
        vx: 0,
        vy: 0,
        angle: 0,
        angVel: 0,
        mass: 50,
        radius: 12,
        checkpoint: 0,
        coinsCollected: 0,
        isDead: false,
    };
}

// ─── Camera ──────────────────────────────────────────────────────────────────

interface Camera {
    x: number;
    y: number;
    zoom: number;
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface InputState {
    moveX: number;
    moveY: number;
}

const input: InputState = { moveX: 0, moveY: 0 };

function initInput(canvas: HTMLCanvasElement): void {
    // Keyboard
    const keys = new Set<string>();
    window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

    // Pointer (drag-to-steer)
    let pointerDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;

    canvas.addEventListener("pointerdown", (e) => {
        pointerDown = true;
        pointerStartX = e.clientX;
        pointerStartY = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
        if (!pointerDown) return;
        const dx = e.clientX - pointerStartX;
        const dy = e.clientY - pointerStartY;
        const maxDrag = 100;
        input.moveX = clamp(dx / maxDrag, -1, 1);
        input.moveY = clamp(dy / maxDrag, -1, 1);
    });
    window.addEventListener("pointerup", () => {
        pointerDown = false;
        input.moveX = 0;
        input.moveY = 0;
    });

    // Poll keyboard input in a timer
    setInterval(() => {
        if (pointerDown) return; // pointer overrides keyboard
        let kx = 0, ky = 0;
        if (keys.has("a") || keys.has("arrowleft")) kx -= 1;
        if (keys.has("d") || keys.has("arrowright")) kx += 1;
        if (keys.has("w") || keys.has("arrowup")) ky -= 1;
        if (keys.has("s") || keys.has("arrowdown")) ky += 1;
        input.moveX = kx;
        input.moveY = ky;
    }, 16);
}

// ─── Physics systems (client-side, from shared principles) ───────────────────

function flightAssistSystem(
    player: PlayerState,
    inputState: InputState,
    config: TrackConfig,
    dt: number,
): void {
    const phys = config.physics;
    const mag = Math.sqrt(inputState.moveX ** 2 + inputState.moveY ** 2);

    if (mag > 0.01) {
        // Target angle from input
        const targetAngle = Math.atan2(inputState.moveY, inputState.moveX);
        const angleDiff = wrapAngle(targetAngle - player.angle);

        // Apply torque toward target angle
        const torque = phys.turnTorqueNm * clamp(angleDiff / Math.PI, -1, 1);
        const inertia = player.mass * player.radius * player.radius * 0.5;
        player.angVel += (torque / inertia) * dt;

        // Forward thrust
        const thrustMag = mag;
        const fx = Math.cos(player.angle) * phys.thrustForwardN * thrustMag;
        const fy = Math.sin(player.angle) * phys.thrustForwardN * thrustMag;

        // Lateral compensation (reduce sideways drift)
        const cosA = Math.cos(player.angle);
        const sinA = Math.sin(player.angle);
        const lateralV = -player.vx * sinA + player.vy * cosA;
        const latCompF = -lateralV * phys.thrustLateralN * 0.3;

        player.vx += (fx + latCompF * -sinA) / player.mass * dt;
        player.vy += (fy + latCompF * cosA) / player.mass * dt;
    } else {
        // Auto-brake when no input
        const brakeForce = player.mass / Math.max(0.1, phys.comfortableBrakingTimeS);
        const speed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
        if (speed > 0.1) {
            const brakeFactor = Math.min(brakeForce * dt / (player.mass * speed), 1);
            player.vx *= (1 - brakeFactor);
            player.vy *= (1 - brakeFactor);
        }
        // Angular damping
        player.angVel *= (1 - 3 * dt);
    }
}

function physicsSystem(
    player: PlayerState,
    config: TrackConfig,
    dt: number,
): void {
    const drag = config.physics.linearDragK;

    // Linear drag
    player.vx -= player.vx * drag * dt;
    player.vy -= player.vy * drag * dt;

    // Angular drag
    player.angVel *= (1 - drag * 2 * dt);

    // Integrate position
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    player.angle += player.angVel * dt;
    player.angle = wrapAngle(player.angle);
}

function collisionSystem(
    player: PlayerState,
    config: TrackConfig,
): void {
    // World bounds collision
    const hw = config.width / 2;
    const hh = config.height / 2;
    const r = player.radius;

    if (player.x - r < -hw) {
        player.x = -hw + r;
        applyWallBounce(player, 1, 0, config);
    }
    if (player.x + r > hw) {
        player.x = hw - r;
        applyWallBounce(player, -1, 0, config);
    }
    if (player.y - r < -hh) {
        player.y = -hh + r;
        applyWallBounce(player, 0, 1, config);
    }
    if (player.y + r > hh) {
        player.y = hh - r;
        applyWallBounce(player, 0, -1, config);
    }

    // Obstacle collisions
    for (const obs of config.obstacles) {
        const dx = player.x - obs.x;
        const dy = player.y - obs.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = player.radius + obs.radius;

        if (dist < minDist && dist > 0) {
            // Push out
            const nx = dx / dist;
            const ny = dy / dist;
            player.x = obs.x + nx * minDist;
            player.y = obs.y + ny * minDist;

            // Elastic bounce
            const dotN = player.vx * nx + player.vy * ny;
            if (dotN < 0) {
                player.vx -= 1.8 * dotN * nx;
                player.vy -= 1.8 * dotN * ny;
            }

            if (obs.isDangerous) {
                player.isDead = true;
            }
        }
    }
}

function applyWallBounce(
    player: PlayerState,
    normalX: number,
    normalY: number,
    config: TrackConfig,
): void {
    const dotN = player.vx * normalX + player.vy * normalY;
    if (dotN < 0) {
        // Elastic bounce (restitution ~0.6)
        player.vx -= 1.6 * dotN * normalX;
        player.vy -= 1.6 * dotN * normalY;

        // Wall-thrust (GDD §3.4): tangential boost when sliding along safe wall
        const wallThrustCoeff = config.physics.wallThrustCoeff;
        if (wallThrustCoeff > 0 && Math.abs(dotN) > 10) {
            const tangentX = -normalY;
            const tangentY = normalX;
            const tangentV = player.vx * tangentX + player.vy * tangentY;
            const boostForce = wallThrustCoeff * Math.abs(dotN);
            const sign = tangentV >= 0 ? 1 : -1;
            player.vx += sign * boostForce * tangentX / player.mass;
            player.vy += sign * boostForce * tangentY / player.mass;
        }
    }
}

function checkpointDetection(
    player: PlayerState,
    checkpoints: TrackCheckpoint[],
): boolean {
    if (player.checkpoint >= checkpoints.length) return true; // already finished

    const target = checkpoints[player.checkpoint];
    if (!target) return false;

    const dist = distance(player.x, player.y, target.x, target.y);
    if (dist < target.radius + player.radius) {
        player.checkpoint++;
        if (player.checkpoint >= checkpoints.length) {
            return true; // FINISH!
        }
    }
    return false;
}

// ─── Main game class ─────────────────────────────────────────────────────────

export class RaceGame {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private config: TrackConfig;
    private player: PlayerState;
    private camera: Camera;
    private phase: RacePhase = RACE_PHASE_LOBBY;
    private tick = 0;
    private startTimeMs = 0;
    private finishTimeMs = 0;
    private recorder: GhostRecorder;
    private ghosts: GhostPlayer[] = [];
    private rafId = 0;
    private lastFrameTime = 0;
    private accumulator = 0;

    constructor(canvas: HTMLCanvasElement, config: TrackConfig) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.config = config;

        // Spawn at first checkpoint
        const start = config.checkpoints[0] ?? { x: 0, y: 0 };
        this.player = createPlayer(start.x, start.y);

        this.camera = { x: start.x, y: start.y, zoom: 1.5 };
        this.recorder = new GhostRecorder();

        initInput(canvas);
    }

    addGhost(ghost: GhostPlayer): void {
        this.ghosts.push(ghost);
    }

    start(): void {
        this.phase = RACE_PHASE_COUNTDOWN;
        this.tick = 0;
        this.accumulator = 0;
        this.lastFrameTime = performance.now();

        // Start countdown → racing after 3 seconds
        setTimeout(() => {
            this.phase = RACE_PHASE_RACING;
            this.startTimeMs = performance.now();
            this.recorder.start();
        }, 3000);

        this.loop(performance.now());
    }

    stop(): void {
        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.recorder.stop();
    }

    getResult() {
        return {
            trackId: this.config.id,
            finishMs: this.finishTimeMs,
            coinsCollected: this.player.coinsCollected,
            replayData: this.recorder.getPackedReplay(),
            inputHash: "", // TODO: determinism hash
        };
    }

    // ─── Main loop ───────────────────────────────────────────────────────

    private loop = (now: number): void => {
        const dt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        const fixedDt = 1 / this.config.physics.tickRate;

        if (this.phase === RACE_PHASE_RACING) {
            this.accumulator += Math.min(dt, 0.1); // cap to avoid spiral of death

            while (this.accumulator >= fixedDt) {
                this.physicsTick(fixedDt);
                this.accumulator -= fixedDt;
            }
        }

        this.render();
        this.rafId = requestAnimationFrame(this.loop);
    };

    private physicsTick(dt: number): void {
        this.tick++;

        // Player physics
        if (!this.player.isDead) {
            flightAssistSystem(this.player, input, this.config, dt);
            physicsSystem(this.player, this.config, dt);
            collisionSystem(this.player, this.config);

            // Checkpoint detection
            const finished = checkpointDetection(this.player, this.config.checkpoints);
            if (finished && this.phase === RACE_PHASE_RACING) {
                this.finishTimeMs = performance.now() - this.startTimeMs;
                this.phase = RACE_PHASE_RESULTS;
                this.recorder.stop();
            }

            // Record ghost frame
            this.recorder.record(this.tick, this.player.x, this.player.y, this.player.angle);
        } else {
            // Respawn after death
            this.respawn();
        }

        // Update ghosts
        for (const ghost of this.ghosts) {
            ghost.update(this.tick);
        }
    }

    private respawn(): void {
        // Respawn at last checkpoint
        const cpIdx = Math.max(0, this.player.checkpoint - 1);
        const cp = this.config.checkpoints[cpIdx] ?? { x: 0, y: 0 };
        this.player.x = cp.x;
        this.player.y = cp.y;
        this.player.vx = 0;
        this.player.vy = 0;
        this.player.angVel = 0;
        this.player.isDead = false;
    }

    // ─── Render ──────────────────────────────────────────────────────────

    private render(): void {
        const { ctx, canvas, player, camera, config } = this;
        const W = canvas.width = canvas.clientWidth * devicePixelRatio;
        const H = canvas.height = canvas.clientHeight * devicePixelRatio;

        // Smooth camera follow
        camera.x += (player.x - camera.x) * 0.1;
        camera.y += (player.y - camera.y) * 0.1;

        ctx.clearRect(0, 0, W, H);
        ctx.save();

        // Camera transform
        ctx.translate(W / 2, H / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Draw track elements
        drawSurfaces(ctx, config.surfaces);
        drawWalls(ctx, config.walls);
        drawObstacles(ctx, config.obstacles);
        drawCheckpoints(ctx, config.checkpoints, player.checkpoint);
        drawPickups(ctx, config.pickups);

        // Draw ghosts
        for (const ghost of this.ghosts) {
            if (!ghost.finished) {
                drawBlob(ctx, {
                    x: ghost.x,
                    y: ghost.y,
                    radius: 12,
                    angle: ghost.angle,
                    color: "#8888ff",
                    opacity: ghost.opacity,
                    nickname: ghost.nickname,
                });
            }
        }

        // Draw player
        drawBlob(ctx, {
            x: player.x,
            y: player.y,
            radius: player.radius,
            angle: player.angle,
            color: "#44cc44",
        });

        ctx.restore();

        // HUD overlay
        this.renderHUD(W, H);
    }

    private renderHUD(W: number, H: number): void {
        const { ctx, player, phase, config } = this;
        ctx.save();

        const fontSize = Math.max(14, W * 0.02);
        ctx.font = `${fontSize}px monospace`;
        ctx.fillStyle = "#ffffff";
        ctx.textBaseline = "top";

        const margin = 10;

        if (phase === RACE_PHASE_COUNTDOWN) {
            ctx.font = `bold ${fontSize * 4}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("GET READY", W / 2, H / 2 - fontSize * 2);
        } else if (phase === RACE_PHASE_RACING) {
            const elapsed = performance.now() - this.startTimeMs;
            ctx.textAlign = "left";
            ctx.fillText(`Time: ${(elapsed / 1000).toFixed(2)}s`, margin, margin);
            ctx.fillText(`CP: ${player.checkpoint}/${config.checkpoints.length}`, margin, margin + fontSize + 4);
            ctx.fillText(`Coins: ${player.coinsCollected}`, margin, margin + (fontSize + 4) * 2);
        } else if (phase === RACE_PHASE_RESULTS) {
            ctx.font = `bold ${fontSize * 2}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("FINISH!", W / 2, H / 3);
            ctx.font = `${fontSize * 1.5}px monospace`;
            ctx.fillText(`${(this.finishTimeMs / 1000).toFixed(3)}s`, W / 2, H / 3 + fontSize * 3);
        }

        ctx.restore();
    }
}
