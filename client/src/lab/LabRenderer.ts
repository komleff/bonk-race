/**
 * LabRenderer — Canvas 2D рендерер для BonkLab.
 *
 * Рендерит арену, персонажа, векторы и отладочные оверлеи.
 * Камера следует за персонажем с трансформацией мир→экран.
 */

import type { SandboxState } from "./labTypes";
import type { LabInputState } from "./LabInput";
import { ZONE_LABELS } from "./labConstants";
import {
    COUNTDOWN_STEP_S,
    COUNTDOWN_STEPS,
    COUNTDOWN_TOTAL_S,
    DEATH_FREEZE_S,
    RESPAWN_GO_STEP_S,
    RESPAWN_GO_TOTAL_S,
    computePunchIn,
} from "@bonk-race/shared";
import { drawFinishLine } from "../rendering/track";
import { lerpColor, hslToHex, getDriftAngle } from "./colorUtils";

// ─── Константы ───────────────────────────────────────────────────────────────

const BG_COLOR = "#1a1a2e";
const GRID_COLOR = "#2a2a3e";
const GRID_SPACING = 100; // метры

const ZONE_COLORS: Record<string, string> = {
    ice: "#4488cc",
    mud: "#6B3A1F",
    turbo: "#ff8800",
    sand: "#c2a64e",
};
const ZONE_ALPHA = 0.3;

const WALL_COLOR = "#ffffff";
const WALL_LINE_WIDTH = 4;

const OBSTACLE_STYLES: Record<string, { fill: string; stroke: string }> = {
    pillar: { fill: "#555555", stroke: "#888888" },
    spike: { fill: "#cc3333", stroke: "#991111" },
    passage: { fill: "rgba(180, 175, 160, 0.12)", stroke: "#b0a898" },
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

/** Мировые метры видимости вокруг персонажа (полуразмер). */
const DEFAULT_VIEW_RANGE = 400;

/**
 * Вертикальная доля экрана, на которой рендерится персонаж.
 * 0.65 = 65% от верха — персонаж в нижней части, больше обзора вперёд (гонка вверх).
 * Экспортируется, чтобы LabInput использовал то же значение для origin направления мыши.
 */
export const CHAR_SCREEN_Y_RATIO = 0.65;

const MINIMAP_SIZE = 140;
const MINIMAP_MARGIN = 12;
const MINIMAP_BG = "rgba(0,0,0,0.55)";
const MINIMAP_BORDER = "rgba(255,255,255,0.25)";

// ─── Типы следов ─────────────────────────────────────────────────────────────

interface TrailPoint {
    x: number;
    y: number;
    age: number;
    color: string;
}

const TRAIL_MAX_POINTS = 600;

// ─── Типы паттернов следа ────────────────────────────────────────────────────
export type TrailPattern = "off" | "drift" | "rainbow";

// ─── LabRenderer ─────────────────────────────────────────────────────────────

export class LabRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    /** Масштаб пикселей/метр, вычисляется из размера canvas и диапазона обзора. */
    private scale = 1;
    /** Сколько метров мира показывать вокруг персонажа. */
    private viewRange = DEFAULT_VIEW_RANGE;

    /** Пользовательский множитель длины стрелок векторов. */
    private arrowScale = 1;

    /** Значения нормализации для стрелок векторов (обновляются из параметров). */
    private normSpeedLimit = 260;
    private normMaxThrust = 27000;

    /** Кэшированный прямоугольник canvas (обновляется при resize). */
    private cachedRect: DOMRect;

    // ── Состояние следов ──
    private trailBuffer: TrailPoint[] = [];
    private trailHead = 0;
    private trailCount = 0;
    private trailEnabled = false;
    private trailMaxAge = 3.5;
    private trailBaseAlpha = 0.6;
    private trailPrevX = NaN;
    private trailPrevY = NaN;
    private lastRenderTs = 0;

    // ── Конфигурация паттерна следов ──
    private trailPattern: TrailPattern = "off";
    private trailPrimaryColor = "#44aaff";
    private trailDriftColor = "#ff4444";
    private trailRainbowPeriodSec = 2.0;
    private trailStartTimeMs = performance.now();

    // Предварительно выделенные объекты для переиспользования, чтобы избежать GC в цикле рендера
    private _gradient: CanvasGradient | null = null;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d")!;
        this.cachedRect = null!; // инициализируется в resize()
        this.resize();
    }

    // ── Публичный API ─────────────────────────────────────────────────────────

    setArrowScale(scale: number): void {
        this.arrowScale = scale;
    }

    setNormalization(speedLimit: number, maxThrust: number): void {
        this.normSpeedLimit = speedLimit || 260;
        this.normMaxThrust = maxThrust || 27000;
    }

    setTrailConfig(config: {
        enabled: boolean;
        maxAge: number;
        baseAlpha: number;
        pattern?: TrailPattern;
        primaryColor?: string;
        driftColor?: string;
        rainbowPeriodSec?: number;
    }): void {
        // Очистить буфер при выключении следов
        if (!config.enabled && this.trailEnabled) {
            this.clearTrail();
        }
        this.trailEnabled = config.enabled;
        this.trailMaxAge = config.maxAge;
        this.trailBaseAlpha = config.baseAlpha;

        // Переключение паттерна: реинициализировать chrono для rainbow
        const oldPattern = this.trailPattern;
        if (config.pattern !== undefined) {
            this.trailPattern = config.pattern;
            if (config.pattern === "rainbow" && oldPattern !== "rainbow") {
                this.trailStartTimeMs = performance.now();
            }
        }

        if (config.primaryColor !== undefined) this.trailPrimaryColor = config.primaryColor;
        if (config.driftColor !== undefined) this.trailDriftColor = config.driftColor;

        // Защита от деления на ноль: минимум 0.1 сек
        if (config.rainbowPeriodSec !== undefined) {
            this.trailRainbowPeriodSec = Math.max(0.1, config.rainbowPeriodSec);
        }
    }

    clearTrail(): void {
        this.trailCount = 0;
        this.trailHead = 0;
        this.trailPrevX = NaN;
        this.trailPrevY = NaN;
    }

    resize(): void {
        const dpr = window.devicePixelRatio || 1;
        this.cachedRect = this.canvas.getBoundingClientRect();
        this.canvas.width = this.cachedRect.width * dpr;
        this.canvas.height = this.cachedRect.height * dpr;
        this.scale = Math.min(this.canvas.width, this.canvas.height) / (this.viewRange * 2);
    }

    /** Возвращает кэшированный прямоугольник canvas (обновляется при resize). */
    getCanvasRect(): DOMRect {
        return this.cachedRect;
    }

    render(state: SandboxState, input: LabInputState): void {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // ── Очистка ──
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);

        // ── Трансформация камеры (мир → экран) ──
        // Смещение персонажа к нижним 65% экрана — в гонке вверх нужен больший обзор впереди.
        const cx = w / 2;
        const cy = h * CHAR_SCREEN_Y_RATIO;
        const s = this.scale;

        ctx.setTransform(s, 0, 0, s, cx - state.x * s, cy - state.y * s);

        // ── Рисуем слои от заднего к переднему ──
        this.drawGrid(ctx, state);
        this.drawZones(ctx, state);
        this.drawSpawnAndFinish(ctx, state);
        this.drawWalls(ctx, state);
        this.drawObstacles(ctx, state);
        this.drawOrbs(ctx, state);

        // Trail: записываем точку и рисуем
        const now = performance.now();
        const trailDt = this.lastRenderTs > 0 ? Math.min((now - this.lastRenderTs) / 1000, 0.1) : 1 / 60;
        this.lastRenderTs = now;
        if (this.trailEnabled && state.deathTimer <= 0) {
            this.pushTrailPoint(state.x, state.y, state.vx, state.vy, state.angle, trailDt, now);
            this.drawTrail(ctx, state.radius);
        }

        if (state.deathTimer > 0) {
            this.drawDeathEffect(ctx, state);
            if (this.trailEnabled) this.clearTrail();
        } else {
            this.drawCharacter(ctx, state);
            this.drawBeacon(ctx, state, input);
            this.drawVectors(ctx, state);
        }

        // ── Миникарта (экранные координаты) ──
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.drawMinimap(ctx, state, w, h);

        // ── Оверлей сенсорного джойстика (экранные координаты) ──
        if (input.isTouch && input.active) {
            this.drawTouchJoystick(ctx, input);
        }

        // ── Сообщение о дистанции смерти (экранные координаты) ──
        if (state.deathTimer > 0) {
            this.drawDeathMessage(ctx, state, w, h);
        }

        // ── Оверлей обратного отсчёта / респауна ──
        this.drawCountdownOverlay(ctx, state, w, h);

        // ── Оверлей финиша (экранные координаты) ──
        if (state.finished) {
            this.drawFinishOverlay(ctx, state, w, h);
        }
    }

    // ── Слой: Сетка ─────────────────────────────────────────────────────────

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

    // ── Слой: Зоны ──────────────────────────────────────────────────────────

    private drawZones(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        for (const zone of state.arena.zones) {
            const color = ZONE_COLORS[zone.type] || "#888888";

            ctx.globalAlpha = ZONE_ALPHA;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Рамка
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 / this.scale;
            ctx.stroke();

            // Подпись
            const fontSize = Math.max(12, 14 / this.scale);
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillStyle = color;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(ZONE_LABELS[zone.type] ?? zone.type, zone.x, zone.y);
        }
    }

    // ── Слой: Старт и финиш ─────────────────────────────────────────────────

    private drawSpawnAndFinish(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const markerRadius = 20;
        const fontSize = Math.max(12, 14 / this.scale);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const lw = 2 / this.scale;

        // Спаун — зелёный круг внизу
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

        // Финиш — клетчатая линия наверху (тот же стиль что в raceMain)
        const fp = state.arena.finishPoint;
        drawFinishLine(ctx, fp.x, fp.y, state.arena.width * 0.6);
    }

    // ── Слой: Стены ──────────────────────────────────────────────────────────

    private drawWalls(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const halfW = state.arena.width / 2;
        const halfH = state.arena.height / 2;

        ctx.strokeStyle = WALL_COLOR;
        ctx.lineWidth = WALL_LINE_WIDTH / this.scale;
        ctx.strokeRect(-halfW, -halfH, state.arena.width, state.arena.height);
    }

    // ── Слой: Препятствия ────────────────────────────────────────────────────

    private drawObstacles(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        for (const obs of state.arena.obstacles) {
            if (obs.alive === false) continue; // Пропускаем уничтоженные препятствия
            const style = OBSTACLE_STYLES[obs.type] || OBSTACLE_STYLES.pillar;

            ctx.beginPath();
            ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);

            ctx.fillStyle = style.fill;
            ctx.fill();
            ctx.strokeStyle = style.stroke;
            ctx.lineWidth = 2 / this.scale;
            ctx.stroke();
        }
    }

    // ── Слой: Орбы ──────────────────────────────────────────────────────────

    private drawOrbs(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        for (const orb of state.orbs) {
            if (!orb.alive) {
                // Анимация смерти: расширяющееся голубое кольцо
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

            // Живой орб: залитый голубой круг с лёгкой тенью
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

    // ── Система следов ─────────────────────────────────────────────────────────

    private calculateTrailColor(vx: number, vy: number, angle: number, nowMs: number): string {
        if (this.trailPattern === "off") {
            return this.trailPrimaryColor;
        }

        if (this.trailPattern === "drift") {
            const driftAngle = getDriftAngle(vx, vy, angle);
            const driftIntensity = Math.abs(Math.sin(driftAngle));
            return lerpColor(this.trailPrimaryColor, this.trailDriftColor, driftIntensity);
        }

        if (this.trailPattern === "rainbow") {
            const elapsedSec = (nowMs - this.trailStartTimeMs) / 1000;
            const periodSec = Math.max(0.1, this.trailRainbowPeriodSec);
            const hue = ((elapsedSec % periodSec) / periodSec) * 360;
            return hslToHex(hue, 1.0, 0.5);
        }

        return this.trailPrimaryColor;
    }

    private pushTrailPoint(x: number, y: number, vx: number, vy: number, angle: number, dt: number, nowMs: number): void {
        // Телепорт: если расстояние слишком большое — очистить буфер (restart/respawn)
        const dx = x - this.trailPrevX;
        const dy = y - this.trailPrevY;
        const distSq = dx * dx + dy * dy;
        if (distSq > 500 * 500) {
            this.clearTrail();
            this.trailPrevX = x;
            this.trailPrevY = y;
            return;
        }
        // Прореживание: записывать точку только если персонаж сдвинулся ≥ 0.4 радиуса
        const minDist = 8; // ~0.4 * baseRadius(20)
        if (distSq < minDist * minDist) {
            this.ageTrail(dt);
            return;
        }
        this.trailPrevX = x;
        this.trailPrevY = y;

        const color = this.calculateTrailColor(vx, vy, angle, nowMs);

        // Инициализация буфера при первом использовании
        if (this.trailBuffer.length < TRAIL_MAX_POINTS) {
            this.trailBuffer.push({ x, y, age: 0, color });
            this.trailCount = this.trailBuffer.length;
            this.trailHead = this.trailCount % TRAIL_MAX_POINTS;
        } else {
            const pt = this.trailBuffer[this.trailHead];
            pt.x = x; pt.y = y; pt.age = 0; pt.color = color;
            this.trailHead = (this.trailHead + 1) % TRAIL_MAX_POINTS;
            if (this.trailCount < TRAIL_MAX_POINTS) this.trailCount++;
        }
        this.ageTrail(dt);
    }

    private ageTrail(dt: number): void {
        for (let i = 0; i < this.trailCount; i++) {
            this.trailBuffer[i].age += dt;
        }
    }

    private drawTrail(ctx: CanvasRenderingContext2D, charRadius: number): void {
        if (this.trailCount === 0) return;
        const maxAge = this.trailMaxAge;
        const baseAlpha = this.trailBaseAlpha;

        for (let i = 0; i < this.trailCount; i++) {
            const pt = this.trailBuffer[i];
            if (pt.age >= maxAge) continue;

            const t = pt.age / maxAge; // 0→1
            ctx.globalAlpha = baseAlpha * (1 - t);
            ctx.fillStyle = pt.color;
            const r = charRadius * (1 - t * 0.6);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Слой: Персонаж ──────────────────────────────────────────────────────────

    private drawCharacter(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const { x, y, radius, angle } = state;

        // Градиентная заливка
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

        // Внутренняя стрелка направления (внутри круга, под клювом)
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const perpXi = -sinA * radius * 0.4;
        const perpYi = cosA * radius * 0.4;
        const innerTipX = x + cosA * radius;
        const innerTipY = y + sinA * radius;
        const innerBaseX = x + cosA * radius * 0.2;
        const innerBaseY = y + sinA * radius * 0.2;

        ctx.beginPath();
        ctx.moveTo(innerTipX, innerTipY);
        ctx.lineTo(innerBaseX + perpXi, innerBaseY + perpYi);
        ctx.lineTo(innerBaseX - perpXi, innerBaseY - perpYi);
        ctx.closePath();
        ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
        ctx.fill();

        // Треугольник направления (нос / клюв за пределами круга)
        const triLen = radius * 0.7;
        const triHalf = radius * 0.3;
        const tipX = x + cosA * (radius + triLen * 0.3);
        const tipY = y + sinA * (radius + triLen * 0.3);
        const baseX = x + cosA * radius;
        const baseY = y + sinA * radius;
        const perpX = -sinA * triHalf;
        const perpY = cosA * triHalf;

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX + perpX, baseY + perpY);
        ctx.lineTo(baseX - perpX, baseY - perpY);
        ctx.closePath();
        ctx.fillStyle = "#ffffff";
        ctx.fill();
    }

    // ── Слой: Эффект смерти ──────────────────────────────────────────────────

    private drawDeathEffect(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const { deathX, deathY, deathTimer, radius } = state;
        // Расширяющееся красное кольцо с затуханием
        const progress = 1 - deathTimer / DEATH_FREEZE_S; // 0→1
        const ringRadius = radius * (1 + progress * 4);
        const alpha = 1 - progress;

        // Красная вспышка
        ctx.beginPath();
        ctx.arc(deathX, deathY, ringRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 50, 50, ${(alpha * 0.4).toFixed(2)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 80, 80, ${alpha.toFixed(2)})`;
        ctx.lineWidth = 3 / this.scale;
        ctx.stroke();

        // Маркер "X" в точке смерти
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

    /** Экранное сообщение о смерти с пройденной дистанцией */
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

        // Текст дистанции
        const dist = Math.round(state.deathDistanceM);
        const pct = Math.round(state.progressPct * 100);
        ctx.font = "bold 28px monospace";
        ctx.fillStyle = `rgba(255, 80, 80, ${alpha.toFixed(2)})`;
        ctx.fillText(`${dist} м  (${pct}%)`, w / 2, h * 0.38);

        ctx.restore();
    }

    /** Экранный оверлей финиша с временем и рекордом */
    private drawFinishOverlay(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        w: number,
        h: number,
    ): void {
        ctx.save();

        // Полупрозрачный фон
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const centerX = w / 2;
        let y = h * 0.35;

        // Заголовок
        ctx.font = "bold 36px monospace";
        ctx.fillStyle = "#ffcc00";
        ctx.fillText(state.isNewRecord ? "Финиш! Новый рекорд!" : "Финиш!", centerX, y);
        y += 50;

        // Время
        const mins = Math.floor(state.finishTime / 60);
        const secs = state.finishTime % 60;
        const timeStr = `${String(mins).padStart(2, "0")}:${secs.toFixed(2).padStart(5, "0")}`;
        ctx.font = "bold 48px monospace";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(timeStr, centerX, y);
        y += 50;

        // Лучшее время (если отличается от текущего)
        if (state.bestTime > 0 && !state.isNewRecord) {
            const bMins = Math.floor(state.bestTime / 60);
            const bSecs = state.bestTime % 60;
            const bestStr = `${String(bMins).padStart(2, "0")}:${bSecs.toFixed(2).padStart(5, "0")}`;
            ctx.font = "20px monospace";
            ctx.fillStyle = "#888888";
            ctx.fillText(`Рекорд: ${bestStr}`, centerX, y);
            y += 35;
        }

        // Дистанция
        ctx.font = "20px monospace";
        ctx.fillStyle = "#aaaaaa";
        ctx.fillText(`${Math.round(state.distanceM)} м`, centerX, y);
        y += 50;

        // Подсказка перезапуска
        ctx.font = "18px monospace";
        ctx.fillStyle = "#ffcc00";
        ctx.fillText("Нажмите Restart для перезапуска", centerX, y);

        ctx.restore();
    }

    // ── Слой: Обратный отсчёт / респаун Go!-Go! ───────────────────────────

    /**
     * Рендерит 3-2-1-Go! при старте или Go!-Go! при респауне.
     * Число появляется крупно и сжимается (масштабный всплеск),
     * затем резко исчезает без плавного затухания.
     */
    private drawCountdownOverlay(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        w: number,
        h: number,
    ): void {
        let label: string;
        let progress: number;
        let isRespawn = false;
        let stepInSequence = 0;

        if (state.startCountdown > 0) {
            // 3-2-1-Go!
            const elapsed = COUNTDOWN_TOTAL_S - state.startCountdown;
            const stepIdx = Math.min(
                Math.floor(elapsed / COUNTDOWN_STEP_S),
                COUNTDOWN_STEPS.length - 1,
            );
            label = COUNTDOWN_STEPS[stepIdx];
            progress = (elapsed % COUNTDOWN_STEP_S) / COUNTDOWN_STEP_S;
        } else if (state.respawnCountdown > 0) {
            // Go!-Go! при респауне
            label = "Go!";
            isRespawn = true;
            const elapsed = RESPAWN_GO_TOTAL_S - state.respawnCountdown;
            stepInSequence = Math.floor(elapsed / RESPAWN_GO_STEP_S);
            progress = (elapsed % RESPAWN_GO_STEP_S) / RESPAWN_GO_STEP_S;
        } else {
            return;
        }

        const isGo = label === "Go!";
        const { scale, alpha } = computePunchIn(progress, isGo);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(w / 2, h / 2);
        ctx.scale(scale, scale);
        ctx.font = "bold 96px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = alpha;

        // Glow для Go! (сильнее для второго Go! при респауне)
        if (isGo) {
            const glowSize = isRespawn && stepInSequence === 1 ? 30 : 20;
            const punchT = Math.min(progress / 0.6, 1);
            const easedT = 1 - (1 - punchT) * (1 - punchT);
            ctx.shadowColor = "rgba(255, 255, 100, 0.8)";
            ctx.shadowBlur = glowSize * (1 - easedT * 0.5);
        }

        ctx.fillStyle = isGo ? "#ffff66" : "#ffffff";
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }

    // ── Слой: Сенсорный джойстик (экранные координаты) ─────────────────────

    private drawTouchJoystick(
        ctx: CanvasRenderingContext2D,
        input: LabInputState,
    ): void {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.cachedRect;
        // Конвертируем CSS-координаты клиента в пиксели canvas
        const baseX = (input.baseScreenX - rect.left) * dpr;
        const baseY = (input.baseScreenY - rect.top) * dpr;
        const knobX = (input.screenX - rect.left) * dpr;
        const knobY = (input.screenY - rect.top) * dpr;
        const baseRadius = 50 * dpr;
        const knobRadius = 22 * dpr;

        // Базовый круг
        ctx.beginPath();
        ctx.arc(baseX, baseY, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();

        // Ручка джойстика
        ctx.beginPath();
        ctx.arc(knobX, knobY, knobRadius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
    }

    // ── Слой: Маяк ──────────────────────────────────────────────────────────

    private drawBeacon(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        input: LabInputState,
    ): void {
        if (!input.active || input.magnitude < 0.01) return;

        // Маяк — точка в мировых координатах. Интерпретируем направление ввода
        // как исходящее от персонажа и проецируем на некоторое расстояние,
        // чтобы показать куда целится игрок.
        const beaconDist = state.radius * 6;
        const bx = state.x + input.x * beaconDist;
        const by = state.y + input.y * beaconDist;

        // Пунктирная линия от персонажа к маяку
        ctx.setLineDash([6 / this.scale, 4 / this.scale]);
        ctx.strokeStyle = BEACON_COLOR;
        ctx.lineWidth = 1.5 / this.scale;
        ctx.beginPath();
        ctx.moveTo(state.x, state.y);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);

        // Точка маяка
        ctx.beginPath();
        ctx.arc(bx, by, BEACON_RADIUS / this.scale, 0, Math.PI * 2);
        ctx.fillStyle = BEACON_COLOR;
        ctx.fill();
    }

    // ── Слой: Векторы ────────────────────────────────────────────────────────

    private drawVectors(ctx: CanvasRenderingContext2D, state: SandboxState): void {
        const baseLen = state.radius * 3 * this.arrowScale;

        // 1. Стрелка скорости (синяя, сплошная)
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

        // 2. Стрелка силы FA (зелёная, сплошная)
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

        // 3. Стрелка коррекции (оранжевая, пунктирная)
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

    // ── Вспомогательная функция стрелки ───────────────────────────────────────

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

        // Стержень
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        if (dashed) {
            ctx.setLineDash([]);
        }

        // Наконечник стрелки
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

    // ── Миникарта ─────────────────────────────────────────────────────────────

    private drawMinimap(
        ctx: CanvasRenderingContext2D,
        state: SandboxState,
        canvasW: number,
        canvasH: number,
    ): void {
        const size = MINIMAP_SIZE;
        const mx = canvasW - size - MINIMAP_MARGIN;
        const my = canvasH - size - MINIMAP_MARGIN;

        // Фон
        ctx.fillStyle = MINIMAP_BG;
        ctx.fillRect(mx, my, size, size);
        ctx.strokeStyle = MINIMAP_BORDER;
        ctx.lineWidth = 1;
        ctx.strokeRect(mx, my, size, size);

        // Масштаб: вписать арену в миникарту
        const arenaW = state.arena.width;
        const arenaH = state.arena.height;
        const ms = Math.min(size / arenaW, size / arenaH) * 0.9;
        const ocx = mx + size / 2;
        const ocy = my + size / 2;

        // Конвертер: мир → экран миникарты
        const toMX = (wx: number) => ocx + wx * ms;
        const toMY = (wy: number) => ocy + wy * ms;

        // Граница арены
        const halfW = arenaW / 2;
        const halfH = arenaH / 2;
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(toMX(-halfW), toMY(-halfH), arenaW * ms, arenaH * ms);

        // Зоны (маленькие точки)
        for (const zone of state.arena.zones) {
            ctx.beginPath();
            ctx.arc(toMX(zone.x), toMY(zone.y), Math.max(zone.radius * ms, 2), 0, Math.PI * 2);
            ctx.fillStyle = ZONE_COLORS[zone.type] || "#888";
            ctx.globalAlpha = 0.4;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Препятствия
        for (const obs of state.arena.obstacles) {
            if (obs.alive === false) continue;
            ctx.beginPath();
            ctx.arc(toMX(obs.x), toMY(obs.y), Math.max(obs.radius * ms, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = obs.type === "spike" ? "#cc3333" : "#888888";
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Орбы (маленькие голубые точки)
        for (const orb of state.orbs) {
            if (!orb.alive) continue;
            ctx.beginPath();
            ctx.arc(toMX(orb.x), toMY(orb.y), Math.max(orb.radius * ms, 1.5), 0, Math.PI * 2);
            ctx.fillStyle = ORB_COLOR;
            ctx.globalAlpha = 0.7;
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Маркер спауна (зелёный)
        ctx.beginPath();
        ctx.arc(toMX(state.arena.spawnPoint.x), toMY(state.arena.spawnPoint.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#22cc44";
        ctx.fill();

        // Маркер финиша (жёлтый)
        ctx.beginPath();
        ctx.arc(toMX(state.arena.finishPoint.x), toMY(state.arena.finishPoint.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#ffcc00";
        ctx.fill();

        // Точка персонажа
        ctx.beginPath();
        ctx.arc(toMX(state.x), toMY(state.y), 3, 0, Math.PI * 2);
        ctx.fillStyle = "#44aaff";
        ctx.fill();

        // Прямоугольник обзора (асимметричный: камера помещает персонажа на 65% от верха)
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
