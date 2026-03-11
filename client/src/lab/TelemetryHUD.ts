/**
 * TelemetryHUD — compact debug overlay rendered directly on the game canvas.
 *
 * Displays real-time physics telemetry: speed, angular velocity, mass,
 * velocity/heading misalignment, FA state, zone, and elapsed time.
 */

import type { SandboxState } from "./BonkLab";

// ─── Constants ───────────────────────────────────────────────────────────────

const PAD = 10;
const LINE_H = 20;
const PANEL_W = 210;
const PANEL_H = 9 * LINE_H + PAD * 2;
const FONT = "14px monospace";
const CORNER_R = 6;

const COL_LABEL = "#888888";
const COL_VALUE = "#e0e0e0";
const COL_BG = "rgba(0,0,0,0.7)";

// Speed bar colors
const COL_BAR_BG = "#333333";
const COL_BAR_GREEN = "#4caf50";
const COL_BAR_YELLOW = "#ffeb3b";
const COL_BAR_RED = "#f44336";

const RAD2DEG = 180 / Math.PI;

// FA state display names
const FA_LABELS: Record<string, string> = {
    "accel": "Разгон",
    "brake": "Торможение",
    "drift-correction": "Дрейф-коррекция",
    "idle": "Холостой ход",
};

// Zone display names
const ZONE_LABELS: Record<string, string> = {
    "ice": "Лёд",
    "turbo": "Турбо",
    "mud": "Грязь",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Lerp between two colors based on ratio. Returns hex-ish for simple cases. */
function speedBarColor(ratio: number): string {
    if (ratio < 0.6) return COL_BAR_GREEN;
    if (ratio < 0.85) return COL_BAR_YELLOW;
    return COL_BAR_RED;
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const mm = String(mins).padStart(2, "0");
    const ss = secs.toFixed(1).padStart(4, "0");
    return `${mm}:${ss}`;
}

// ─── TelemetryHUD ────────────────────────────────────────────────────────────

export class TelemetryHUD {
    constructor() {
        // nothing to init
    }

    render(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        params: Record<string, number | boolean | string>,
    ): void {
        const x0 = PAD;
        const y0 = PAD;

        // ── Background panel ──
        ctx.save();
        ctx.beginPath();
        this.roundRect(ctx, x0, y0, PANEL_W, PANEL_H, CORNER_R);
        ctx.fillStyle = COL_BG;
        ctx.fill();

        ctx.font = FONT;
        ctx.textBaseline = "top";

        // ── Compute values ──
        const speed = Math.hypot(state.vx, state.vy);
        const speedLimit = (params["limits.speedLimitForwardMps"] as number) ?? 260;
        const angVelDeg = Math.abs(state.angularVelocity) * RAD2DEG;
        const angLimitDeg = ((params["limits.angularSpeedLimitRadps"] as number) || Math.PI) * RAD2DEG;

        // Misalignment: angle between velocity vector and character heading
        let misalignment = 0;
        if (speed > 0.5) {
            const velAngle = Math.atan2(state.vy, state.vx);
            let diff = velAngle - state.angle;
            // Normalize to [-PI, PI]
            diff = diff - Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
            misalignment = Math.abs(diff) * RAD2DEG;
        }

        const faLabel = FA_LABELS[state.faState] || state.faState;
        const zoneLabel = state.currentZone ? (ZONE_LABELS[state.currentZone] || state.currentZone) : "Нет";
        const timeStr = formatTime(state.elapsedTime);

        // ── Draw rows ──
        let rowY = y0 + PAD;
        const labelX = x0 + PAD;
        const valueX = x0 + PANEL_W - PAD;

        // Row 1: Speed with mini bar
        this.drawLabel(ctx, labelX, rowY, "Скорость");
        const speedText = `${Math.round(speed)} / ${Math.round(speedLimit)}`;
        this.drawValue(ctx, valueX - 60, rowY, speedText);
        // Mini progress bar
        const barX = valueX - 50;
        const barW = 40;
        const barH = 8;
        const barY = rowY + 6;
        const speedRatio = Math.min(speed / speedLimit, 1);
        ctx.fillStyle = COL_BAR_BG;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = speedBarColor(speedRatio);
        ctx.fillRect(barX, barY, barW * speedRatio, barH);
        rowY += LINE_H;

        // Row 2: Angular velocity
        this.drawLabel(ctx, labelX, rowY, "Угл.скор.");
        this.drawValue(ctx, valueX, rowY, `${Math.round(angVelDeg)} / ${Math.round(angLimitDeg)} °/с`);
        rowY += LINE_H;

        // Row 3: Mass
        this.drawLabel(ctx, labelX, rowY, "Масса");
        this.drawValue(ctx, valueX, rowY, `${Math.round(state.mass)} кг`);
        rowY += LINE_H;

        // Row 4: Misalignment
        this.drawLabel(ctx, labelX, rowY, "Рассогл.");
        this.drawValue(ctx, valueX, rowY, `${Math.round(misalignment)}°`);
        rowY += LINE_H;

        // Row 5: FA state
        this.drawLabel(ctx, labelX, rowY, "FA");
        this.drawValue(ctx, valueX, rowY, faLabel);
        rowY += LINE_H;

        // Row 6: Zone
        this.drawLabel(ctx, labelX, rowY, "Зона");
        this.drawValue(ctx, valueX, rowY, zoneLabel);
        rowY += LINE_H;

        // Row 7: Time
        this.drawLabel(ctx, labelX, rowY, "Время");
        this.drawValue(ctx, valueX, rowY, timeStr);
        rowY += LINE_H;

        // Row 8: Distance
        this.drawLabel(ctx, labelX, rowY, "Дистанция");
        this.drawValue(ctx, valueX, rowY, `${Math.round(state.distanceM)} м`);
        rowY += LINE_H;

        // Row 9: Progress bar
        this.drawLabel(ctx, labelX, rowY, "Прогресс");
        const pctText = `${Math.round(state.progressPct * 100)}%`;
        this.drawValue(ctx, valueX - 60, rowY, pctText);
        const pBarX = valueX - 50;
        const pBarW = 40;
        const pBarH = 8;
        const pBarY = rowY + 6;
        ctx.fillStyle = COL_BAR_BG;
        ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
        ctx.fillStyle = "#42a5f5";
        ctx.fillRect(pBarX, pBarY, pBarW * Math.min(state.progressPct, 1), pBarH);

        ctx.restore();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
        ctx.fillStyle = COL_LABEL;
        ctx.textAlign = "left";
        ctx.fillText(text, x, y);
    }

    private drawValue(ctx: CanvasRenderingContext2D, x: number, y: number, text: string): void {
        ctx.fillStyle = COL_VALUE;
        ctx.textAlign = "right";
        ctx.fillText(text, x, y);
    }

    private roundRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ): void {
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }
}
