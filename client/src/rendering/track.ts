import type { TrackCheckpoint, TrackSurface, TrackObstacle, TrackWall, TrackPickup } from "@bonk-race/shared";
import { SURFACE_SLOW, SURFACE_BOOST, SURFACE_ICE, PICKUP_NITRO } from "@bonk-race/shared";

/**
 * Track rendering functions (GDD §4).
 * All coordinates are in world space; caller applies camera transform.
 */

// ─── Surface colors ──────────────────────────────────────────────────────────

const SURFACE_COLORS: Record<number, string> = {
    [SURFACE_SLOW]: "rgba(139, 90, 43, 0.35)",   // brown/mud
    [SURFACE_BOOST]: "rgba(0, 255, 128, 0.25)",   // green glow
    [SURFACE_ICE]: "rgba(150, 220, 255, 0.30)",    // light blue
};

export function drawSurfaces(
    ctx: CanvasRenderingContext2D,
    surfaces: TrackSurface[],
): void {
    for (const s of surfaces) {
        const color = SURFACE_COLORS[s.type];
        if (!color) continue;  // SURFACE_NORMAL — no visual

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
}

// ─── Walls ───────────────────────────────────────────────────────────────────

export function drawWalls(
    ctx: CanvasRenderingContext2D,
    walls: TrackWall[],
): void {
    for (const w of walls) {
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = w.isDangerous ? "#ff3333" : "#4488ff";
        ctx.stroke();
    }
}

// ─── Obstacles ───────────────────────────────────────────────────────────────

export function drawObstacles(
    ctx: CanvasRenderingContext2D,
    obstacles: TrackObstacle[],
): void {
    for (const o of obstacles) {
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.radius, 0, Math.PI * 2);
        ctx.fillStyle = o.isDangerous ? "#cc2222" : "#666666";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = o.isDangerous ? "#ff4444" : "#888888";
        ctx.stroke();
    }
}

// ─── Checkpoints ─────────────────────────────────────────────────────────────

export function drawCheckpoints(
    ctx: CanvasRenderingContext2D,
    checkpoints: TrackCheckpoint[],
    currentCheckpoint: number,
): void {
    for (const cp of checkpoints) {
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, cp.radius, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        if (cp.index < currentCheckpoint) {
            // Already passed
            ctx.strokeStyle = "rgba(0, 200, 0, 0.3)";
        } else if (cp.index === currentCheckpoint) {
            // Next target
            ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
            ctx.setLineDash([8, 4]);
        } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// ─── Pickups ─────────────────────────────────────────────────────────────────

export function drawPickups(
    ctx: CanvasRenderingContext2D,
    pickups: TrackPickup[],
): void {
    for (const p of pickups) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = p.type === PICKUP_NITRO ? "#ff8800" : "#aa00ff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
    }
}

// ─── Finish line ─────────────────────────────────────────────────────────────

export function drawFinishLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    angle: number,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const segments = 8;
    const segW = width / segments;
    const segH = 6;

    for (let i = 0; i < segments; i++) {
        ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#222222";
        ctx.fillRect(-width / 2 + i * segW, -segH / 2, segW, segH);
    }

    ctx.restore();
}
