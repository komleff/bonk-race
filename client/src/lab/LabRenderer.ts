/**
 * LabRenderer — Pure Canvas 2D renderer for BonkLab.
 *
 * Renders arena, character, vectors, and debug overlays.
 * Camera follows the character with world-to-screen viewport transform.
 */

import { DEATH_FREEZE_S, type SandboxState } from "./BonkLab";
import type { LabInputState } from "./LabInput";
import type { ArenaZone } from "@bonk-race/shared";
import { drawFinishLine } from "../rendering/track";

// ─── Constants ───────────────────────────────────────────────────────────────

const BG_COLOR = "#1a1a2e";
const GRID_COLOR = "#2a2a3e";
const GRID_SPACING = 100; // metres

const ZONE_COLORS: Record<ArenaZone["type"], string> = {
    ice: "#4488cc",
    mud: "#6B3A1F",
    turbo: "#ff8800",
};
const ZONE_ALPHA = 0.3;

const WALL_COLOR = "#ffffff";
const WALL_LINE_WIDTH = 4;

const OBSTACLE_STYLES: Record<string, { fill: string; stroke: string }> = {
    pillar: { fill: "#555555", stroke: "#888888" },
    spike: { fill: "#cc3333", stroke: "#991111" },
    passage: { fill: "transparent", stroke: "#666666" },
};

const CHAR_FILL_OUTER = "#44aaff";
const CHAR_FILL_INNER = "#2288dd";
const CHAR_BORDER = "#ffffff";
const CHAR_BORDER_WIDTH = 2;

const ORB_COLOR = "#00cccc";
const ORB_DEATH_COLOR = "#33ffff";

const BEACON_COLOR = "#ffee44";
const BEACON_RADIUS = 5;

const VEC_VELOCITY_COLOR = "#44aaff";
const VEC_FORCE_COLOR = "#44ff44";
const VEC_CORRECTION_COLOR = "#ffaa44";

const ARROW_HEAD_LEN = 8;
const ARROW_HEAD_ANGLE = Math.PI / 6;

/** World-metres visible around the character (half-extent). */
const DEFAULT_VIEW_RANGE = 400;

/**
 * Vertical screen ratio where the character is rendered.
 * 0.65 = 65% from top → character in lower part, more view ahead (upward race).
 * Exported so LabInput can use the same value for mouse direction origin.
 */
export const CHAR_SCREEN_Y_RATIO = 0.65;

const MINIMAP_SIZE = 140;
const MINIMAP_MARGIN = 12;
const MINIMAP_BG = "rgba(0,0,0,0.55)";
const MINIMAP_BORDER = "rgba(255,255,255,0.25)";

// ─── LabRenderer ─────────────────────────────────────────────────────────────

export class LabRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    /** Pixels-per-metre scale, computed from canvas size and view range. */
    private scale = 1;
    /** How many metres of world to show around the character. */
    private viewRange = DEFAULT_VIEW_RANGE;

    /** User-adjustable multiplier for vector arrow length. */
    private arrowScale = 1;

    /** Normalization values for vector arrows (updated from params). */
    private normSpeedLimit = 260;
    private normMaxThrust = 27000;

    /** Cached canvas bounding rect (updated on resize). */
    private cachedRect: DOMRect;

    // Pre-allocated reusable objects to avoid GC in render loop
    private _gradient: CanvasGradient | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.cachedRect = canvas.getBoundingClientRect();
        this.resize();
    }

    // ── Public API ───────────────────────────────────────────────────────────

    setArrowScale(scale: number): void {
        this.arrowScale = scale;
    }

    setNormalization(speedLimit: number, maxThrust: number): void {
        this.normSpeedLimit = speedLimit || 260;
        this.normMaxThrust = maxThrust || 27000;
    }

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        this.cachedRect = this.canvas.getBoundingClientRect();
        this.canvas.width = this.cachedRect.width * dpr;
        this.canvas.height = this.cachedRect.height * dpr;
        this.scale = Math.min(this.canvas.width, this.canvas.height) / (this.viewRange * 2);
    }

    /** Returns cached canvas bounding rect (updated on resize). */
    getCanvasRect(): DOMRect {
        return this.cachedRect;
    }

    render(state: SandboxState, input: LabInputState): void {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // ── Clear ──
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);

        // ── Camera transform (world → screen) ──
        // Character offset to lower 65% of screen — racing game going upward needs more view ahead.
        const cx = w / 2;
        const cy = h * CHAR_SCREEN_Y_RATIO;
        const s = this.scale;

        ctx.setTransform(s, 0, 0, s, cx - state.x * s, cy - state.y * s);

        // ── Draw layers back-to-front ──
        this.drawGrid(ctx, state);
        this.drawZones(ctx, state);
        this.drawSpawnAndFinish(ctx, state);
        this.drawWalls(ctx, state);
        this.drawObstacles(ctx, state);
        this.drawOrbs(ctx, state);
        if (state.deathTimer > 0) {
            this.drawDeathEffect(ctx, state);
        } else {
            this.drawCharacter(ctx, state);
            this.drawBeacon(ctx, state, input);
            this.drawVectors(ctx, state);
        }

        // ── Minimap (screen-space) ──
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.drawMinimap(ctx, state, w, h);

        // ── Touch joystick overlay (screen-space) ──
        if (input.isTouch && input.active) {
            this.drawTouchJoystick(ctx, input);
        }

        // ── Death distance message (screen-space) ──
        if (state.deathTimer > 0) {
            this.drawDeathMessage(ctx, state, w, h);
        }

        // ── Post-respawn "Go!" overlay (screen-space) ──
        if (state.respawnCountdown > 0) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.font = "bold 64px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const goAlpha = Math.min(1, state.respawnCountdown / DEATH_FREEZE_S * 2);
            ctx.fillStyle = `rgba(255, 255, 100, ${goAlpha})`;
            ctx.fillText("Go!", w / 2, h / 2);
            ctx.restore();
        }

        // ── Finish overlay (screen-space) ──
        if (state.finished) {
            this.drawFinishOverlay(ctx, state, w, h);
        }
    }

    // ── Layer: Grid ──────────────────────────────────────────────────────────

    private drawGrid(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const halfW = state.arena.width / 2;
        const halfH = state.arena.height / 2;

        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1 / this.scale; // 1 screen pixel
        ctx.beginPath();

        const startX = Math.ceil(-halfW / GRID_SPACING) * GRID_SPACING;
        const endX = Math.floor(halfW / GRID_SPACING) * GRID_SPACING;
        const startY = Math.ceil(-halfH / GRID_SPACING) * GRID_SPACING;
        const endY = Math.floor(halfH / GRID_SPACING) * GRID_SPACING;

        for (let x = startX; x <= endX; x += GRID_SPACING) {
            ctx.moveTo(x, -halfH);
            ctx.lineTo(x, halfH);
        }
        for (let y = startY; y <= endY; y += GRID_SPACING) {
            ctx.moveTo(-halfW, y);
            ctx.lineTo(halfW, y);
        }
        ctx.stroke();
    }

    // ── Layer: Zones ─────────────────────────────────────────────────────────

    private drawZones(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        for (const zone of state.arena.zones) {
            const color = ZONE_COLORS[zone.type] || "#888888";

            ctx.globalAlpha = ZONE_ALPHA;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Border
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / this.scale;
            ctx.stroke();

            // Label
            const fontSize = Math.max(12, 14 / this.scale);
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillStyle = color;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const ZONE_LABELS: Record<string, string> = { ice: "Лёд", mud: "Грязь", turbo: "Турбо" };
            ctx.fillText(ZONE_LABELS[zone.type] ?? zone.type, zone.x, zone.y);
        }
    }

    // ── Layer: Spawn & Finish ────────────────────────────────────────────────

    private drawSpawnAndFinish(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const markerRadius = 20;
        const fontSize = Math.max(12, 14 / this.scale);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lw = 2 / this.scale;

        // Spawn — green circle at bottom
        const sp = state.arena.spawnPoint;
        ctx.strokeStyle = "#22cc44";
        ctx.lineWidth = lw;
        ctx.setLineDash([6 / this.scale, 4 / this.scale]);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, markerRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#22cc44";
        ctx.fillText("START", sp.x, sp.y - markerRadius - fontSize * 0.8);

        // Finish — checkered line at top (same style as raceMain)
        const fp = state.arena.finishPoint;
        drawFinishLine(ctx, fp.x, fp.y, state.arena.width * 0.6);
    }

    // ── Layer: Walls ─────────────────────────────────────────────────────────

    private drawWalls(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const halfW = state.arena.width / 2;
        const halfH = state.arena.height / 2;

        ctx.strokeStyle = WALL_COLOR;
        ctx.lineWidth = WALL_LINE_WIDTH / this.scale;
        ctx.strokeRect(-halfW, -halfH, state.arena.width, state.arena.height);
    }

    // ── Layer: Obstacles ─────────────────────────────────────────────────────

    private drawObstacles(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        for (const obs of state.arena.obstacles) {
            const style = OBSTACLE_STYLES[obs.type] || OBSTACLE_STYLES.pillar;

            ctx.beginPath();
            ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);

            if (obs.type === "passage") {
                // Dashed outline only
                ctx.setLineDash([6 / this.scale, 4 / this.scale]);
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = 2 / this.scale;
                ctx.stroke();
                ctx.setLineDash([]);
            } else {
                ctx.fillStyle = style.fill;
                ctx.fill();
                ctx.strokeStyle = style.stroke;
                ctx.lineWidth = 2 / this.scale;
                ctx.stroke();
            }
        }
    }

    // ── Layer: Orbs ─────────────────────────────────────────────────────────

    private drawOrbs(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        for (const orb of state.orbs) {
            if (!orb.alive) {
                // Death animation: expanding cyan ring
                if (orb.deathProgress >= 0 && orb.deathProgress < 1) {
                    const progress = orb.deathProgress;
                    const ringRadius = orb.radius * (1 + progress * 3);
                    const alpha = 1 - progress;

                    ctx.beginPath();
                    ctx.arc(orb.x, orb.y, ringRadius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(51, 255, 255, ${(alpha * 0.3).toFixed(2)})`;
                    ctx.fill();
                    ctx.strokeStyle = `rgba(51, 255, 255, ${alpha.toFixed(2)})`;
                    ctx.lineWidth = 2 / this.scale;
                    ctx.stroke();
                }
                continue;
            }

            // Live orb: filled cyan circle with subtle shadow
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
            ctx.fillStyle = ORB_COLOR;
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = ORB_DEATH_COLOR;
            ctx.lineWidth = 1.5 / this.scale;
            ctx.stroke();
        }
    }

    // ── Layer: Character ─────────────────────────────────────────────────────────

    private drawCharacter(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const { x, y, radius, angle } = state;

        // Gradient fill
        this._gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        this._gradient.addColorStop(0, CHAR_FILL_OUTER);
        this._gradient.addColorStop(1, CHAR_FILL_INNER);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = this._gradient;
        ctx.fill();
        ctx.strokeStyle = CHAR_BORDER;
        ctx.lineWidth = CHAR_BORDER_WIDTH / this.scale;
        ctx.stroke();

        // Direction triangle (nose)
        const triLen = radius * 0.7;
        const triHalf = radius * 0.3;
        const tipX = x + Math.cos(angle) * (radius + triLen * 0.3);
        const tipY = y + Math.sin(angle) * (radius + triLen * 0.3);
        const baseX = x + Math.cos(angle) * radius;
        const baseY = y + Math.sin(angle) * radius;
        const perpX = -Math.sin(angle) * triHalf;
        const perpY = Math.cos(angle) * triHalf;

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX + perpX, baseY + perpY);
        ctx.lineTo(baseX - perpX, baseY - perpY);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.fill();
    }

    // ── Layer: Death Effect ─────────────────────────────────────────────────

    private drawDeathEffect(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const { deathX, deathY, deathTimer, radius } = state;
        // Expanding red ring that fades out
        const progress = 1 - deathTimer / DEATH_FREEZE_S; // 0→1
        const ringRadius = radius * (1 + progress * 4);
        const alpha = 1 - progress;

        // Red flash circle
        ctx.beginPath();
        ctx.arc(deathX, deathY, ringRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 50, 50, ${(alpha * 0.4).toFixed(2)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 80, 80, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 3 / this.scale;
        ctx.stroke();

        // "X" marker at death point
        if (alpha > 0.3) {
            const sz = radius * 0.6;
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(2)})`;
            ctx.lineWidth = 2 / this.scale;
            ctx.beginPath();
            ctx.moveTo(deathX - sz, deathY - sz);
            ctx.lineTo(deathX + sz, deathY + sz);
            ctx.moveTo(deathX + sz, deathY - sz);
            ctx.lineTo(deathX - sz, deathY + sz);
            ctx.stroke();
        }
    }

    /** Screen-space death message showing distance traveled */
    private drawDeathMessage(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        w: number,
        h: number,
    ): void {
        const progress = 1 - state.deathTimer / DEATH_FREEZE_S;
        const alpha = Math.min(progress * 3, 1); // fade in quickly

        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Distance text
        const dist = Math.round(state.deathDistanceM);
        const pct = Math.round(state.progressPct * 100);
        ctx.font = "bold 28px monospace";
        ctx.fillStyle = `rgba(255, 80, 80, ${alpha.toFixed(2)})`;
        ctx.fillText(`${dist} м  (${pct}%)`, w / 2, h * 0.38);

        ctx.restore();
    }

    /** Screen-space finish overlay with time and record */
    private drawFinishOverlay(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        w: number,
        h: number,
    ): void {
        ctx.save();

        // Semi-transparent backdrop
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const centerX = w / 2;
        let y = h * 0.35;

        // Title
        ctx.font = "bold 36px monospace";
        ctx.fillStyle = "#ffcc00";
        ctx.fillText(state.isNewRecord ? "Финиш! Новый рекорд!" : "Финиш!", centerX, y);
        y += 50;

        // Time
        const mins = Math.floor(state.finishTime / 60);
        const secs = state.finishTime % 60;
        const timeStr = `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
        ctx.font = "bold 48px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(timeStr, centerX, y);
        y += 50;

        // Best time (if different from current)
        if (state.bestTime > 0 && !state.isNewRecord) {
            const bMins = Math.floor(state.bestTime / 60);
            const bSecs = state.bestTime % 60;
            const bestStr = `${String(bMins).padStart(2, "0")}:${bSecs.toFixed(2).padStart(5, "0")}`;
            ctx.font = "20px monospace";
            ctx.fillStyle = "#888888";
            ctx.fillText(`Рекорд: ${bestStr}`, centerX, y);
            y += 35;
        }

        // Distance
        ctx.font = "20px monospace";
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText(`${Math.round(state.distanceM)} м`, centerX, y);
        y += 50;

        // Restart hint
        ctx.font = "18px monospace";
        ctx.fillStyle = "#ffcc00";
        ctx.fillText("Нажмите Restart для перезапуска", centerX, y);

        ctx.restore();
    }

    // ── Layer: Touch Joystick (screen-space) ───────────────────────────────

    private drawTouchJoystick(
        ctx: CanvasRenderingContext2D,
        input: LabInputState,
    ): void {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.cachedRect;
        // Convert CSS client coordinates to canvas pixel coordinates
        const baseX = (input.baseScreenX - rect.left) * dpr;
        const baseY = (input.baseScreenY - rect.top) * dpr;
        const knobX = (input.screenX - rect.left) * dpr;
        const knobY = (input.screenY - rect.top) * dpr;
        const baseRadius = 50 * dpr;
        const knobRadius = 22 * dpr;

        // Base circle
        ctx.beginPath();
        ctx.arc(baseX, baseY, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        // Knob circle
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
    }

    // ── Layer: Beacon ────────────────────────────────────────────────────────

    private drawBeacon(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        input: LabInputState,
    ): void {
        if (!input.active || input.magnitude < 0.01) return;

        // The beacon is a point in world space. We interpret the input direction
        // as originating from the character and project it some distance away
        // to show where the player is aiming.
        const beaconDist = state.radius * 6;
        const bx = state.x + input.x * beaconDist;
        const by = state.y + input.y * beaconDist;

        // Dashed line from character to beacon
        ctx.setLineDash([6 / this.scale, 4 / this.scale]);
        ctx.strokeStyle = BEACON_COLOR;
        ctx.lineWidth = 1.5 / this.scale;
        ctx.beginPath();
        ctx.moveTo(state.x, state.y);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);

        // Beacon dot
        ctx.beginPath();
        ctx.arc(bx, by, BEACON_RADIUS / this.scale, 0, Math.PI * 2);
        ctx.fillStyle = BEACON_COLOR;
        ctx.fill();
    }

    // ── Layer: Vectors ───────────────────────────────────────────────────────

    private drawVectors(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const baseLen = state.radius * 3 * this.arrowScale;

        // 1. Velocity arrow (blue, solid)
        const speedLimit = this.normSpeedLimit;
        const speed = Math.hypot(state.vx, state.vy);
        if (speed > 0.5) {
            const normSpeed = Math.min(speed / speedLimit, 1);
            const len = baseLen * normSpeed;
            const dirX = state.vx / speed;
            const dirY = state.vy / speed;
            this.drawArrow(
                ctx,
                state.x, state.y,
                state.x + dirX * len, state.y + dirY * len,
                VEC_VELOCITY_COLOR,
                false,
            );
        }

        // 2. FA force arrow (green, solid)
        const maxThrust = this.normMaxThrust;
        const forceMag = Math.hypot(state.assistFx, state.assistFy);
        if (forceMag > 1) {
            const normForce = Math.min(forceMag / maxThrust, 1);
            const len = baseLen * normForce;
            const dirX = state.assistFx / forceMag;
            const dirY = state.assistFy / forceMag;
            this.drawArrow(
                ctx,
                state.x, state.y,
                state.x + dirX * len, state.y + dirY * len,
                VEC_FORCE_COLOR,
                false,
            );
        }

        // 3. Correction arrow (orange, dashed)
        const corrMag = Math.hypot(state.correctionFx, state.correctionFy);
        if (corrMag > 1) {
            const normCorr = Math.min(corrMag / maxThrust, 1);
            const len = baseLen * normCorr;
            const dirX = state.correctionFx / corrMag;
            const dirY = state.correctionFy / corrMag;
            this.drawArrow(
                ctx,
                state.x, state.y,
                state.x + dirX * len, state.y + dirY * len,
                VEC_CORRECTION_COLOR,
                true,
            );
        }
    }

    // ── Arrow helper ─────────────────────────────────────────────────────────

    private drawArrow(
        ctx: CanvasRenderingContext2D,
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
        color: string,
        dashed?: boolean,
    ): void {
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.hypot(dx, dy);
        if (len < 0.1) return;

        const lineWidth = 2 / this.scale;
        const headLen = ARROW_HEAD_LEN / this.scale;
        const angle = Math.atan2(dy, dx);

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = lineWidth;

        if (dashed) {
            ctx.setLineDash([5 / this.scale, 3 / this.scale]);
        }

        // Shaft
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        if (dashed) {
            ctx.setLineDash([]);
        }

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLen * Math.cos(angle - ARROW_HEAD_ANGLE),
            toY - headLen * Math.sin(angle - ARROW_HEAD_ANGLE),
        );
        ctx.lineTo(
            toX - headLen * Math.cos(angle + ARROW_HEAD_ANGLE),
            toY - headLen * Math.sin(angle + ARROW_HEAD_ANGLE),
        );
        ctx.closePath();
        ctx.fill();
    }

    // ── Minimap ──────────────────────────────────────────────────────────────

    private drawMinimap(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        canvasW: number,
        canvasH: number,
    ): void {
        const size = MINIMAP_SIZE;
        const mx = canvasW - size - MINIMAP_MARGIN;
        const my = canvasH - size - MINIMAP_MARGIN;

        // Background
        ctx.fillStyle = MINIMAP_BG;
        ctx.fillRect(mx, my, size, size);
        ctx.strokeStyle = MINIMAP_BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, size, size);

        // Scale: fit arena into minimap
        const arenaW = state.arena.width;
        const arenaH = state.arena.height;
        const ms = Math.min(size / arenaW, size / arenaH) * 0.9;
        const ocx = mx + size / 2;
        const ocy = my + size / 2;

        // Helper: world → minimap screen
        const toMX = (wx: number) => ocx + wx * ms;
        const toMY = (wy: number) => ocy + wy * ms;

        // Arena boundary
        const halfW = arenaW / 2;
        const halfH = arenaH / 2;
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(toMX(-halfW), toMY(-halfH), arenaW * ms, arenaH * ms);

        // Zones (small dots)
        for (const zone of state.arena.zones) {
            ctx.beginPath();
            ctx.arc(toMX(zone.x), toMY(zone.y), Math.max(zone.radius * ms, 2), 0, Math.PI * 2);
            ctx.fillStyle = ZONE_COLORS[zone.type] || "#888";
            ctx.globalAlpha = 0.4;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Obstacles
        for (const obs of state.arena.obstacles) {
            ctx.beginPath();
            ctx.arc(toMX(obs.x), toMY(obs.y), Math.max(obs.radius * ms, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = obs.type === "spike" ? "#cc3333" : "#888888";
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Orbs (small cyan dots)
        for (const orb of state.orbs) {
            if (!orb.alive) continue;
            ctx.beginPath();
            ctx.arc(toMX(orb.x), toMY(orb.y), Math.max(orb.radius * ms, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = ORB_COLOR;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Spawn marker (green)
        ctx.beginPath();
        ctx.arc(toMX(state.arena.spawnPoint.x), toMY(state.arena.spawnPoint.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#22cc44";
        ctx.fill();

        // Finish marker (yellow)
        ctx.beginPath();
        ctx.arc(toMX(state.arena.finishPoint.x), toMY(state.arena.finishPoint.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffcc00";
        ctx.fill();

        // Character dot
        ctx.beginPath();
        ctx.arc(toMX(state.x), toMY(state.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#44aaff";
        ctx.fill();

        // Viewport rectangle (asymmetric: camera places character at 65% from top)
        const vpHalfW = canvasW / (2 * this.scale);
        const vpFullH = canvasH / this.scale;
        const vpTop = state.y - vpFullH * CHAR_SCREEN_Y_RATIO;
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.strokeRect(
            toMX(state.x - vpHalfW),
            toMY(vpTop),
            vpHalfW * 2 * ms,
            vpFullH * ms,
        );
        ctx.setLineDash([]);
    }
}
