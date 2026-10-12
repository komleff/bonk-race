/**
 * TelemetryHUD — компактная отладочная панель поверх игрового холста.
 *
 * Отображает телеметрию физики в реальном времени: скорость, угловую скорость,
 * массу, рассогласование вектора/курса, состояние FA, зону и время.
 */

import type { SandboxState } from "./labTypes";
import { SPACE_OVERLAY_WIDTH, SPACE_OVERLAY_HEIGHT, formatHudMass } from "../u2taglab/overlayLayout";
import { formatTime, ZONE_LABELS, FA_LABELS } from "./labConstants";

// ─── Константы ──────────────────────────────────────────────────────────────

const PAD = 10;
const LINE_H = 20;
const PANEL_W = 210;
const PANEL_H = 9 * LINE_H + PAD * 2;
const FONT = "14px monospace";
const SPACE_SPEED_H = 46;
const CORNER_R = 6;

const COL_LABEL = "#888888";
const COL_VALUE = "#e0e0e0";
const COL_BG = "rgba(0,0,0,0.7)";

// Цвета шкалы скорости
const COL_BAR_BG = "#333333";
const COL_BAR_GREEN = "#4caf50";
const COL_BAR_YELLOW = "#ffeb3b";
const COL_BAR_RED = "#f44336";

const RAD2DEG = 180 / Math.PI;

// ─── Вспомогательные функции ─────────────────────────────────────────────────

/** Цвет шкалы скорости по соотношению текущей к лимиту. */
function speedBarColor(ratio: number): string {
    if (ratio < 0.6) return COL_BAR_GREEN;
    if (ratio < 0.85) return COL_BAR_YELLOW;
    return COL_BAR_RED;
}

// ─── TelemetryHUD ────────────────────────────────────────────────────────────

export class TelemetryHUD {
    constructor() {
        // нечего инициализировать
    }

    private renderTrain(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const train = state.train!;
        const n = (value: number) => Number.isFinite(value) ? value.toFixed(1) : '—';
        const bodies = { A: { position: { x: state.x, y: state.y }, velocity: { x: state.vx, y: state.vy }, angle: state.angle, angularVelocity: state.angularVelocity, radius: state.radius }, B: train.B, C: train.C };
        let rows = [`ABC · ${train.paused ? 'Пауза' : 'Полёт'} · ${formatTime(state.elapsedTime)}`];
        for (const id of ['A', 'B', 'C'] as const) {
            const b = bodies[id]; rows.push(`${id} ${n(Math.hypot(b.velocity.x, b.velocity.y))} м/с · ω ${n(b.angularVelocity * RAD2DEG)}°/с`);
        }
        for (const l of train.connections) {
            const a = bodies[l.bodyA], b = bodies[l.bodyB], sa = l.attachmentA === 'nose' ? 1 : -1, sb = l.attachmentB === 'nose' ? 1 : -1;
            const d = Math.hypot(b.position.x + Math.cos(b.angle) * b.radius * sb - a.position.x - Math.cos(a.angle) * a.radius * sa,
                b.position.y + Math.sin(b.angle) * b.radius * sb - a.position.y - Math.sin(a.angle) * a.radius * sa);
            rows.push(`${l.id} ${l.connected ? 'ON' : 'OFF'} · d/l₀ ${n(d)}/${n(l.restLength)} м`);
        }
        rows.push(`C: ${{ coast: 'Накат', guard: 'Страховка', brake: 'Помощь при торможении' }[train.settings.mode]} · g ${n(train.settings.g * 100)}% · Δt ${n(train.settings.delay)} с`);
        const c = train.commandC; rows.push(`Команды C: R ${n(c.retro * 100)}% L ${n(c.lateral * 100)}%`); rows.push(`Момент C ${n(c.yaw * 100)}% · марш 0`);
        rows.push(`Двигатели сейчас ${train.paused ? 'OFF' : 'ON'} · принятые средние:`);
        for (const id of ['A', 'C'] as const) { const w = train.engineWrenches[id]; rows.push(`${id} F ${n(w ? Math.hypot(w.force.x, w.force.y) / 1000 : 0)} кН · τ ${n((w?.torque ?? 0) / 1000)} кН·м`); }
        if (ctx.canvas.clientHeight < 350) {
            const speeds = (['A', 'B', 'C'] as const).map(id => `${id} ${n(Math.hypot(bodies[id].velocity.x, bodies[id].velocity.y))}`).join(' · ');
            rows = [rows[0], `${speeds} м/с`, rows[4], rows[5], rows[6], `C: ретро ${n(c.retro * 100)}% · бок ${n(c.lateral * 100)}%`, `Момент ${n(c.yaw * 100)}% · ${train.paused ? 'двигатели выкл.' : 'двигатели вкл.'}`];
        }
        ctx.save(); ctx.scale(ctx.canvas.width / (ctx.canvas.clientWidth || ctx.canvas.width), ctx.canvas.height / (ctx.canvas.clientHeight || ctx.canvas.height));
        const width = Math.min(235, (ctx.canvas.clientWidth || 390) - SPACE_OVERLAY_HEIGHT - 16), height = rows.length * 14 + 12;
        this.roundRect(ctx, 5, 5, width, height, 4); ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill(); ctx.font = '11px monospace'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = '#eee';
        rows.forEach((row, i) => ctx.fillText(row, 11, 11 + i * 14, width - 12)); ctx.restore();
    }

    render(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        params: Record<string, number | boolean | string>,
    ): void {
        if (state.train) { this.renderTrain(ctx, state); return; }
        const space = Boolean(state.spaceWorld);
        const pad = space ? PAD / 2 : PAD;
        const panelW = space ? SPACE_OVERLAY_WIDTH : PANEL_W;
        const lineH = space ? 8 : LINE_H;
        const x0 = pad;
        const y0 = pad;

        // ── Фоновая панель ──
        ctx.save();
        if (space) {
            // CSS-размеры телеметрии сохраняют читаемость на экранах с высоким DPR.
            ctx.scale(ctx.canvas.width / (ctx.canvas.clientWidth || ctx.canvas.width),
                ctx.canvas.height / (ctx.canvas.clientHeight || ctx.canvas.height));
        }
        ctx.beginPath();
        this.roundRect(ctx, x0, y0, panelW, space ? SPACE_OVERLAY_HEIGHT : PANEL_H, space ? CORNER_R / 2 : CORNER_R);
        ctx.fillStyle = space ? "rgba(0,0,0,0.35)" : COL_BG;
        ctx.fill();

        ctx.font = space ? "7px monospace" : FONT;
        ctx.textBaseline = "top";

        // ── Вычисление значений ──
        const speed = Math.hypot(state.vx, state.vy);
        const speedLimit = ((params["space.speedLimit"] ?? params["limits.speedLimitForwardMps"]) as number) ?? 260;
        const angVelDeg = Math.abs(state.angularVelocity) * RAD2DEG;
        const angLimitDeg = (((params["space.yawLimit"] ?? params["limits.angularSpeedLimitRadps"]) as number) || Math.PI) * RAD2DEG;

        // Рассогласование: угол между вектором скорости и курсом персонажа
        let misalignment = 0;
        if (speed > 0.5) {
            const velAngle = Math.atan2(state.vy, state.vx);
            let diff = velAngle - state.angle;
            // Нормализация к [-PI, PI]
            diff = diff - Math.round(diff / (2 * Math.PI)) * 2 * Math.PI;
            misalignment = Math.abs(diff) * RAD2DEG;
        }

        const faLabel = params["space.fa"] === false ? "OFF" : FA_LABELS[state.faState] || state.faState;
        const zoneLabel = state.currentZone ? (ZONE_LABELS[state.currentZone] || state.currentZone) : "Нет";
        const timeStr = formatTime(state.elapsedTime, true);

        // ── Отрисовка строк ──
        let rowY = y0 + pad;
        const labelX = x0 + pad;
        const valueX = x0 + panelW - pad;

        if (space) {
            // Крупные цифры сохраняют читаемость внутри уменьшенной панели.
            const speedY = rowY;
            ctx.font = "6px monospace";
            this.drawLabel(ctx, labelX, rowY, "Скорость");
            if (state.spaceBrake) {
                // Индикатор показывает удерживаемую команду даже при нулевой силе.
                ctx.font = "8px monospace";
                ctx.fillStyle = "#ffb05c";
                ctx.textAlign = "right";
                ctx.fillText("BRAKE", valueX, rowY);
            }
            rowY += 8;
            ctx.font = "24px monospace";
            let currentText = String(Math.round(speed));
            const currentWidth = panelW - pad * 2 - 20;
            if (ctx.measureText(currentText).width > currentWidth) {
                currentText = speed.toExponential(1);
                const size = Math.min(24, 24 * currentWidth / ctx.measureText(currentText).width);
                ctx.font = `${size}px monospace`;
            }
            ctx.textAlign = "left";
            ctx.fillStyle = COL_VALUE;
            ctx.fillText(currentText, labelX, rowY);
            const unitX = labelX + ctx.measureText(currentText).width + 3;
            ctx.font = "7px monospace";
            ctx.fillText("м/с", unitX, rowY + 15);
            ctx.font = "6px monospace";
            this.drawLabel(ctx, labelX, speedY + 34, `V_FA ${Math.round(speedLimit)} м/с`);
            const barW = panelW - pad * 2;
            const speedRatio = Math.max(0, Math.min(speed / speedLimit, 1));
            ctx.fillStyle = COL_BAR_BG;
            ctx.fillRect(labelX, speedY + 42, barW, 4);
            ctx.fillStyle = speedBarColor(speedRatio);
            ctx.fillRect(labelX, speedY + 42, barW * speedRatio, 4);
            rowY = speedY + SPACE_SPEED_H;
            ctx.font = "7px monospace";
        } else {
            // Строка 1: Скорость с мини-шкалой
            this.drawLabel(ctx, labelX, rowY, "Скорость");
            const speedText = `${Math.round(speed)} / ${Math.round(speedLimit)}`;
            this.drawValue(ctx, valueX - 60, rowY, speedText);
            // Мини-шкала прогресса
            const barX = valueX - 50;
            const barW = 40;
            const barH = 8;
            const barY = rowY + 6;
            const speedRatio = Math.min(speed / speedLimit, 1);
            ctx.fillStyle = COL_BAR_BG;
            ctx.fillRect(barX, barY, barW, barH);
            ctx.fillStyle = speedBarColor(speedRatio);
            ctx.fillRect(barX, barY, barW * speedRatio, barH);
            rowY += lineH;
        }

        // Строка 2: Угловая скорость
        this.drawLabel(ctx, labelX, rowY, "Угл.скор.");
        this.drawValue(ctx, valueX, rowY, `${Math.round(angVelDeg)} / ${Math.round(angLimitDeg)} °/с`);
        rowY += lineH;

        // Строка 3: Масса
        this.drawLabel(ctx, labelX, rowY, "Масса");
        this.drawValue(ctx, valueX, rowY, formatHudMass(state.mass));
        rowY += lineH;

        // Строка 4: Рассогласование
        this.drawLabel(ctx, labelX, rowY, "Рассогл.");
        this.drawValue(ctx, valueX, rowY, `${Math.round(misalignment)}°`);
        rowY += lineH;

        // Строка 5: Состояние FA
        this.drawLabel(ctx, labelX, rowY, "FA");
        this.drawValue(ctx, valueX, rowY, faLabel);
        rowY += lineH;

        // Строка 6: Зона
        this.drawLabel(ctx, labelX, rowY, "Зона");
        this.drawValue(ctx, valueX, rowY, zoneLabel);
        rowY += lineH;

        // Строка 7: Время
        this.drawLabel(ctx, labelX, rowY, "Время");
        this.drawValue(ctx, valueX, rowY, timeStr);
        rowY += lineH;

        if (space && state.towing) {
            this.drawLabel(ctx, labelX, rowY, "Путь/прогр.");
            this.drawValue(ctx, valueX, rowY, `${Math.round(state.distanceM)} м/${Math.round(state.progressPct * 100)}%`);
            rowY += lineH;
            const tow = state.towing, coupling = tow.coupling;
            this.drawLabel(ctx, labelX, rowY, `${{ rod: "Штанга", rope: "Трос", spring: "Пружина", rigid: "Жёсткая" }[coupling.type]}: ${coupling.connected ? "соединено" : "расцеплено"}`);
            rowY += lineH;
            ctx.font = "6px monospace";
            this.drawLabel(ctx, labelX, rowY, coupling.type === 'rigid' ? `${coupling.attachmentA === 'nose' ? 'Нос' : 'Хвост'} A / ${coupling.attachmentB === 'nose' ? 'нос' : 'хвост'} B` : `L ${Math.round(tow.distance)} / N ${Math.round(coupling.restLength)} м`);
            rowY += lineH;
            if (coupling.type === "spring") {
                // Абсолютная шкала относится к длиннейшей рекомендуемой пружине корпуса A.
                const reference = { S: 180, M: 360, L: 720, XL: 1440 }[state.spaceTugSize as "S" | "M" | "L" | "XL"];
                if (reference) {
                    const max = reference * 2, width = panelW - pad * 2;
                    const ratio = (length: number) => Math.max(0, Math.min(1, length / max));
                    ctx.fillStyle = COL_BAR_BG; ctx.fillRect(labelX, rowY, width, 3);
                    if (coupling.connected) {
                        ctx.fillStyle = tow.distance > max ? COL_BAR_RED : "#63c9e5";
                        ctx.fillRect(labelX, rowY, width * ratio(tow.distance), 3);
                    }
                    // Светлая середина — эталон; оранжевая отметка — фактическая норма захвата.
                    ctx.fillStyle = "#e0e0e0";
                    ctx.fillRect(labelX + width / 2, rowY - 1, 1, 5);
                    ctx.fillStyle = coupling.connected ? "#ffb05c" : "#aaaaaa";
                    ctx.fillRect(labelX + Math.min(width - 1, width * ratio(coupling.restLength)), rowY - 2, 1, 7);
                    const overflow = `${tow.distance > max ? " L>" : ""}${coupling.restLength > max ? " N>" : ""}`;
                    this.drawLabel(ctx, labelX, rowY + 6, `0${coupling.connected ? "" : " —"}${overflow}`);
                    ctx.fillStyle = COL_LABEL; ctx.textAlign = "center";
                    ctx.fillText(String(reference), labelX + width / 2, rowY + 6);
                    this.drawValue(ctx, valueX, rowY + 6, `${max} м`);
                } else this.drawLabel(ctx, labelX, rowY + 6, "Шкала A: custom");
            }
            ctx.restore();
            return;
        }

        // Строка 8: Дистанция
        this.drawLabel(ctx, labelX, rowY, "Дистанция");
        this.drawValue(ctx, valueX, rowY, `${Math.round(state.distanceM)} м`);
        rowY += lineH;

        // Строка 9: Прогресс-бар
        this.drawLabel(ctx, labelX, rowY, "Прогресс");
        const pctText = `${Math.round(state.progressPct * 100)}%`;
        this.drawValue(ctx, valueX - (space ? 30 : 60), rowY, pctText);
        const pBarX = valueX - (space ? 25 : 50);
        const pBarW = space ? 20 : 40;
        const pBarH = space ? 4 : 8;
        const pBarY = rowY + (space ? 3 : 6);
        ctx.fillStyle = COL_BAR_BG;
        ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
        ctx.fillStyle = "#42a5f5";
        ctx.fillRect(pBarX, pBarY, pBarW * Math.min(state.progressPct, 1), pBarH);

        ctx.restore();
    }

    // ── Приватные вспомогательные методы ────────────────────────────────────

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
