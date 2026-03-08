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

/**
 * Клетчатая финишная черта в стиле гонок (GDD §4).
 * Два ряда чёрно-белых клеток + флаги по краям.
 */
export function drawFinishLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
): void {
    const CELL = 12;
    const ROWS = 2;
    const cols = Math.ceil(width / CELL);
    const totalW = cols * CELL;
    const startX = x - totalW / 2;

    // Клетчатый паттерн (2 ряда)
    for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < cols; col++) {
            const isWhite = (row + col) % 2 === 0;
            ctx.fillStyle = isWhite ? "#ffffff" : "#111111";
            ctx.fillRect(startX + col * CELL, y - ROWS * CELL / 2 + row * CELL, CELL, CELL);
        }
    }

    // Контур
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, y - ROWS * CELL / 2, totalW, ROWS * CELL);

    // Флаги по краям
    const flagH = 30;
    const flagW = 18;
    for (const side of [-1, 1]) {
        const fx = x + side * (totalW / 2 + 8);
        const fy = y - flagH;
        // Шест
        ctx.strokeStyle = "#888888";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx, y);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        // Полотно флага (клетчатое)
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                ctx.fillStyle = (r + c) % 2 === 0 ? "#ffffff" : "#111111";
                ctx.fillRect(
                    fx + (side > 0 ? 2 : -flagW - 2) + c * (flagW / 3),
                    fy + r * (flagH / 3),
                    flagW / 3,
                    flagH / 3,
                );
            }
        }
    }
}
