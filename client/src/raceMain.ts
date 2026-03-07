/**
 * BonkRace MVP — Client-side physics time-trial entry point.
 *
 * Architecture (GDD §10.1):
 * - Physics runs locally in the browser (no Colyseus real-time).
 * - Track config loaded from REST API (GET /api/v1/tracks/today).
 * - After finish: POST /api/v1/runs/submit with replay + result.
 * - Ghosts loaded from GET /api/v1/ghosts and rendered as visual overlays.
 *
 * Systems order per physics tick (GDD §3.2):
 * FlightAssist → Physics (with surface effects) → Collision (walls + obstacles) → CheckpointDetection
 */

import type { TrackConfig, TrackCheckpoint, TrackWall } from "@bonk-race/shared";
import {
    clamp, wrapAngle, distance,
    SURFACE_SLOW, SURFACE_BOOST, SURFACE_ICE,
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
import { metaServerClient } from "./api/metaServerClient";

// ─── Physics constants ──────────────────────────────────────────────────────
const BOOST_SPEED_CAP = 200;
const WALL_RESTITUTION = 1.6;
const OBSTACLE_RESTITUTION = 1.8;
const DRAG_MULT_SLOW = 3.0;
const DRAG_MULT_ICE = 0.05;
const DRAG_MULT_BOOST = 0.3;
const ANGULAR_DAMPING_COEFF = 3;
const LATERAL_COMPENSATION_FACTOR = 0.3;
const POINTER_DRAG_THRESHOLD_PX = 100;
const STATIC_BOOST_FACTOR = 0.5;
const WALL_THRUST_MIN_SPEED = 10;

// ─── Camera / rendering constants ───────────────────────────────────────────
const CAMERA_FOLLOW_LERP = 0.1;
const COLOR_BG_DARK = "#1a1a2e";
const COLOR_BG_GRID = "#2a2a3e";

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
        input.moveX = clamp(dx / POINTER_DRAG_THRESHOLD_PX, -1, 1);
        input.moveY = clamp(dy / POINTER_DRAG_THRESHOLD_PX, -1, 1);
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

// ─── Surface effects (GDD §4.2) ─────────────────────────────────────────────

/**
 * Returns the drag multiplier based on which surface(s) the player overlaps.
 * Default 1.0; SLOW → 3.0; ICE → 0.05; BOOST → 0.3 (with additional continuous speed clamp in applySurfaceBoost()).
 */
function getSurfaceDragMultiplier(player: PlayerState, config: TrackConfig): number {
    for (const surface of config.surfaces) {
        const dist = distance(player.x, player.y, surface.x, surface.y);
        if (dist < surface.radius + player.radius) {
            switch (surface.type) {
                case SURFACE_SLOW: return DRAG_MULT_SLOW;
                case SURFACE_ICE: return DRAG_MULT_ICE;
                case SURFACE_BOOST: return DRAG_MULT_BOOST;
            }
        }
    }
    return 1.0;
}

/**
 * Apply continuous speed clamp while on a BOOST surface.
 * Called every tick; clamps speed up to boostSpeed while overlapping the pad.
 */
function applySurfaceBoost(player: PlayerState, config: TrackConfig): void {
    for (const surface of config.surfaces) {
        if (surface.type !== SURFACE_BOOST) continue;
        const dist = distance(player.x, player.y, surface.x, surface.y);
        if (dist < surface.radius + player.radius) {
            const speed = Math.sqrt(player.vx ** 2 + player.vy ** 2);
            if (speed < BOOST_SPEED_CAP) {
                const factor = speed > 0.1 ? BOOST_SPEED_CAP / speed : BOOST_SPEED_CAP;
                const cosA = Math.cos(player.angle);
                const sinA = Math.sin(player.angle);
                if (speed > 0.1) {
                    player.vx *= factor;
                    player.vy *= factor;
                } else {
                    player.vx += cosA * BOOST_SPEED_CAP * STATIC_BOOST_FACTOR;
                    player.vy += sinA * BOOST_SPEED_CAP * STATIC_BOOST_FACTOR;
                }
            }
        }
    }
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
        const latCompF = -lateralV * phys.thrustLateralN * LATERAL_COMPENSATION_FACTOR;

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
        player.angVel *= (1 - ANGULAR_DAMPING_COEFF * dt);
    }
}

function physicsSystem(
    player: PlayerState,
    config: TrackConfig,
    dt: number,
): void {
    const baseDrag = config.physics.linearDragK;
    const surfaceMul = getSurfaceDragMultiplier(player, config);
    const drag = baseDrag * surfaceMul;

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

    // Apply surface boost (continuous speed clamp on boost pads)
    applySurfaceBoost(player, config);
}

// ─── Line-segment wall collision (GDD §3.4) ─────────────────────────────────

/**
 * Closest point on line segment (x1,y1)→(x2,y2) to point (px,py).
 */
function closestPointOnSegment(
    px: number, py: number,
    x1: number, y1: number, x2: number, y2: number,
): { x: number; y: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-6) return { x: x1, y: y1 };
    const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
    return { x: x1 + t * dx, y: y1 + t * dy };
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

    // Line-segment wall collisions
    for (const wall of config.walls) {
        collideWithWall(player, wall, config);
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
                player.vx -= OBSTACLE_RESTITUTION * dotN * nx;
                player.vy -= OBSTACLE_RESTITUTION * dotN * ny;
            }

            if (obs.isDangerous) {
                player.isDead = true;
            }
        }
    }
}

function collideWithWall(
    player: PlayerState,
    wall: TrackWall,
    config: TrackConfig,
): void {
    const cp = closestPointOnSegment(
        player.x, player.y,
        wall.x1, wall.y1, wall.x2, wall.y2,
    );
    const dx = player.x - cp.x;
    const dy = player.y - cp.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < player.radius) {
        let nx: number, ny: number;
        if (dist > 0.001) {
            // Normal from wall toward player
            nx = dx / dist;
            ny = dy / dist;
        } else {
            // Center is exactly on the wall — use perpendicular to wall direction
            const wallDx = wall.x2 - wall.x1;
            const wallDy = wall.y2 - wall.y1;
            const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
            if (wallLen < 0.001) return; // дегенеративная стена (точка)
            // Perpendicular to wall segment
            nx = -wallDy / wallLen;
            ny = wallDx / wallLen;
            // Orient normal so it opposes player velocity
            const dotV = player.vx * nx + player.vy * ny;
            if (dotV > 0) {
                nx = -nx;
                ny = -ny;
            }
        }

        // Dangerous wall kills on any contact, regardless of velocity direction
        if (wall.isDangerous) {
            player.isDead = true;
        }

        // Push out
        player.x = cp.x + nx * player.radius;
        player.y = cp.y + ny * player.radius;

        applyWallBounce(player, nx, ny, config);
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
        // Отскок с коэффициентом WALL_RESTITUTION (сейчас ≈1.6)
        player.vx -= WALL_RESTITUTION * dotN * normalX;
        player.vy -= WALL_RESTITUTION * dotN * normalY;

        // Wall-thrust (GDD §3.4): tangential boost when sliding along safe wall
        const wallThrustCoeff = config.physics.wallThrustCoeff;
        if (wallThrustCoeff > 0 && Math.abs(dotN) > WALL_THRUST_MIN_SPEED) {
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
    private countdownTicks = 0;
    private leaderboardPosition = 0;

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

        // Рестарт по R или tap на экране результатов
        window.addEventListener("keydown", (e) => {
            if (e.key.toLowerCase() === "r" && this.phase === RACE_PHASE_RESULTS) {
                this.restart();
            }
        });
        canvas.addEventListener("pointerdown", () => {
            if (this.phase === RACE_PHASE_RESULTS) {
                this.restart();
            }
        });
    }

    addGhost(ghost: GhostPlayer): void {
        this.ghosts.push(ghost);
    }

    start(): void {
        this.phase = RACE_PHASE_COUNTDOWN;
        this.tick = 0;
        this.accumulator = 0;
        this.lastFrameTime = performance.now();
        this.countdownTicks = 3 * this.config.physics.tickRate;

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

    /** Отправить результат на сервер (fire-and-forget, не блокирует UI) */
    private submitResult(): void {
        const result = this.getResult();
        metaServerClient.post<{ position?: number }>("/api/v1/runs/submit", result)
            .then((resp) => {
                console.log("[BonkRace] Run submitted:", resp);
                if (resp.position) this.leaderboardPosition = resp.position;
            })
            .catch((err: unknown) => {
                console.warn("[BonkRace] Failed to submit run:", err);
            });
    }

    /** Мгновенный рестарт (GDD §2: <0.5 сек) */
    restart(): void {
        this.stop();
        const start = this.config.checkpoints[0] ?? { x: 0, y: 0 };
        this.player = createPlayer(start.x, start.y);
        this.camera.x = start.x;
        this.camera.y = start.y;
        this.recorder = new GhostRecorder();
        this.leaderboardPosition = 0;
        for (const g of this.ghosts) g.reset();
        this.start();
    }

    // ─── Main loop ───────────────────────────────────────────────────────

    private loop = (now: number): void => {
        const dt = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        const fixedDt = 1 / this.config.physics.tickRate;

        if (this.phase === RACE_PHASE_COUNTDOWN) {
            this.accumulator += Math.min(dt, 0.1);

            while (this.accumulator >= fixedDt) {
                this.countdownTicks--;
                if (this.countdownTicks <= 0) {
                    this.phase = RACE_PHASE_RACING;
                    this.startTimeMs = performance.now();
                    this.recorder.start();
                    this.accumulator = 0;
                    break;
                }
                this.accumulator -= fixedDt;
            }
        } else if (this.phase === RACE_PHASE_RACING) {
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

            // Смерть прерывает тик — нельзя засчитывать прогресс после гибели
            if (this.player.isDead) {
                return;
            }

            // Checkpoint detection
            const finished = checkpointDetection(this.player, this.config.checkpoints);
            if (finished && this.phase === RACE_PHASE_RACING) {
                this.finishTimeMs = performance.now() - this.startTimeMs;
                this.phase = RACE_PHASE_RESULTS;
                this.recorder.stop();
                this.submitResult();
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

        // Smooth camera follow с опережением вверх (GDD §1.5)
        const CAMERA_LOOKAHEAD_Y = -120; // камера смещена выше блоба
        camera.x += (player.x - camera.x) * CAMERA_FOLLOW_LERP;
        camera.y += ((player.y + CAMERA_LOOKAHEAD_Y) - camera.y) * CAMERA_FOLLOW_LERP;

        // Background
        ctx.fillStyle = COLOR_BG_DARK;
        ctx.fillRect(0, 0, W, H);

        ctx.save();

        // Camera transform
        ctx.translate(W / 2, H / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x, -camera.y);

        // Draw track arena background
        const hw = config.width / 2;
        const hh = config.height / 2;
        ctx.fillStyle = COLOR_BG_GRID;
        ctx.fillRect(-hw, -hh, config.width, config.height);

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
            const secondsLeft = Math.ceil(this.countdownTicks / this.config.physics.tickRate);
            ctx.fillText(secondsLeft > 0 ? String(secondsLeft) : "GO!", W / 2, H / 2);
        } else if (phase === RACE_PHASE_RACING) {
            const elapsed = performance.now() - this.startTimeMs;
            ctx.textAlign = "left";
            ctx.fillText(`Time: ${(elapsed / 1000).toFixed(2)}s`, margin, margin);
            ctx.fillText(`CP: ${player.checkpoint}/${config.checkpoints.length}`, margin, margin + fontSize + 4);
            ctx.fillText(`Coins: ${player.coinsCollected}`, margin, margin + (fontSize + 4) * 2);
            // Track name
            ctx.textAlign = "right";
            ctx.fillText(config.name, W - margin, margin);
        } else if (phase === RACE_PHASE_RESULTS) {
            ctx.font = `bold ${fontSize * 2}px sans-serif`;
            ctx.textAlign = "center";
            ctx.fillText("FINISH!", W / 2, H / 3);
            ctx.font = `${fontSize * 1.5}px monospace`;
            ctx.fillText(`${(this.finishTimeMs / 1000).toFixed(3)}s`, W / 2, H / 3 + fontSize * 3);

            // Medal indicator
            const medals = config.medalTimesMs;
            let medal = "";
            if (this.finishTimeMs <= medals.author) medal = "AUTHOR";
            else if (this.finishTimeMs <= medals.gold) medal = "GOLD";
            else if (this.finishTimeMs <= medals.silver) medal = "SILVER";
            else if (this.finishTimeMs <= medals.bronze) medal = "BRONZE";
            if (medal) {
                ctx.font = `bold ${fontSize * 1.2}px sans-serif`;
                ctx.fillStyle = medal === "AUTHOR" ? "#ff44ff" :
                    medal === "GOLD" ? "#ffd700" :
                    medal === "SILVER" ? "#c0c0c0" : "#cd7f32";
                ctx.fillText(`${medal} MEDAL`, W / 2, H / 3 + fontSize * 5);
            }

            // Позиция в лидерборде
            if (this.leaderboardPosition > 0) {
                ctx.font = `${fontSize}px monospace`;
                ctx.fillStyle = "#aaaaaa";
                ctx.fillText(`#${this.leaderboardPosition} on leaderboard`, W / 2, H / 3 + fontSize * 7);
            }

            // Подсказка рестарта
            ctx.font = `${fontSize * 0.9}px monospace`;
            ctx.fillStyle = "#888888";
            ctx.fillText("Press R or tap to restart", W / 2, H - fontSize * 3);
        }

        ctx.restore();
    }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

interface GuestAuthResponse {
    guestToken: string;
    guestSubjectId: string;
    expiresAt: string;
}

/**
 * Авторизация: получить guest-токен если нет сохранённого.
 * В dev-режиме можно также использовать DevAuth через /api/v1/auth/verify.
 */
async function ensureAuth(): Promise<void> {
    // Уже есть токен — ничего не делаем
    if (metaServerClient.getToken()) return;

    // Получаем guest-токен (работает без предварительной авторизации)
    const resp = await metaServerClient.post<GuestAuthResponse>("/api/v1/auth/guest", {});
    metaServerClient.setToken(resp.guestToken);
    console.log("[BonkRace] Guest auth OK, expires:", resp.expiresAt);
}

// ─── Bootstrap: load track and start game ────────────────────────────────────

/**
 * Load track config from the meta-server API.
 */
export async function loadTrackOfDay(): Promise<TrackConfig> {
    return metaServerClient.get<TrackConfig>("/api/v1/tracks/today");
}

/**
 * Load track config by ID from the meta-server API.
 */
export async function loadTrack(trackId: string): Promise<TrackConfig> {
    return metaServerClient.get<TrackConfig>(`/api/v1/tracks/${encodeURIComponent(trackId)}`);
}

/**
 * Загрузить ghost-соперников для трассы (GDD §5).
 * Возвращает массив GhostPlayer (personal best + opponent).
 */
interface GhostApiEntry {
    type: string;
    nickname: string;
    spriteId: string;
    finishMs: number;
    replayData: number[];
}

async function loadGhosts(trackId: string): Promise<GhostPlayer[]> {
    try {
        const resp = await metaServerClient.get<{ ghosts: GhostApiEntry[] }>(
            `/api/v1/ghosts?trackId=${encodeURIComponent(trackId)}`,
        );
        return resp.ghosts.map((g) => {
            const replay = GhostRecorder.unpack(g.replayData);
            const opacity = g.type === "personal_best" ? 0.3 : 0.4;
            return new GhostPlayer(replay, g.nickname, g.spriteId, opacity);
        });
    } catch (err) {
        console.warn("[BonkRace] Failed to load ghosts:", err);
        return [];
    }
}

/**
 * Bootstrap the BonkRace game.
 * Creates a full-screen canvas, loads track from API, and starts the game.
 */
export async function bootstrapRace(
    containerId = "game-container",
): Promise<RaceGame> {
    // 1. Авторизация (guest-токен)
    await ensureAuth();

    // 2. Создать или найти canvas
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement("div");
        container.id = containerId;
        container.style.cssText = `position:fixed;inset:0;background:${COLOR_BG_DARK};`;
        document.body.appendChild(container);
    }

    let canvas = container.querySelector("canvas");
    if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.style.cssText = "width:100%;height:100%;display:block;";
        container.appendChild(canvas);
    }

    // 3. Загрузить трассу дня
    const config = await loadTrackOfDay();

    // 4. Загрузить ghost-соперников (GDD §5)
    const ghosts = await loadGhosts(config.id);

    // Hide inline boot screen if present
    const bootScreen = document.getElementById("inline-boot");
    if (bootScreen) bootScreen.style.display = "none";

    // 5. Создать и запустить игру
    const game = new RaceGame(canvas, config);
    for (const g of ghosts) game.addGhost(g);
    game.start();

    return game;
}

// ─── Auto-bootstrap when loaded as entry point ──────────────────────────────

bootstrapRace().catch((err) => {
    console.error("[BonkRace] Failed to start:", err);
    const el = document.getElementById("inline-boot");
    if (el) {
        el.innerHTML = `<div style="color:#ff4444;text-align:center;padding:2em;font-family:monospace;">
            <h2>Failed to load track</h2>
            <p>${err.message}</p>
            <p style="color:#888;">Make sure meta-server is running on :3000</p>
        </div>`;
    }
});
