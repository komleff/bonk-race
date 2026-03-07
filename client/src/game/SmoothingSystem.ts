/**
 * Система сглаживания позиций (U2-style predictive smoothing).
 * Визуальное состояние плавно догоняет серверное с предсказанием.
 */

import { clamp, lerp, wrapAngle } from "@bonk-race/shared";

// ─── Типы ────────────────────────────────────────────────────────────────────

/**
 * Визуальное состояние сущности для интерполяции.
 */
export type VisualEntity = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
};

/**
 * Конфигурация сглаживания.
 */
export type SmoothingConfig = {
    /** Время предсказания вперёд (мс) */
    lookAheadMs: number;
    /** Вес скорости: 0 = только catch-up, 1 = только velocity */
    velocityWeight: number;
    /** Базовая скорость догоняния */
    catchUpSpeed: number;
    /** Максимальная скорость догоняния */
    maxCatchUpSpeed: number;
    /** Порог телепортации (при большей ошибке — телепорт) */
    teleportThreshold: number;
    /** Скорость догоняния угла */
    angleCatchUpSpeed: number;
};

/** Конфигурация по умолчанию */
export const DEFAULT_SMOOTHING_CONFIG: SmoothingConfig = {
    lookAheadMs: 150,
    velocityWeight: 0.7,
    catchUpSpeed: 10.0,
    maxCatchUpSpeed: 800,
    teleportThreshold: 100,
    angleCatchUpSpeed: 12.0,
};

// ─── Класс системы сглаживания ───────────────────────────────────────────────

/**
 * Система сглаживания для плавного отображения сетевых сущностей.
 * Использует гибридный подход: интеграция скорости + догоняющая коррекция.
 */
export class SmoothingSystem {
    private visualPlayers = new Map<string, VisualEntity>();
    private visualOrbs = new Map<string, VisualEntity>();
    private visualChests = new Map<string, VisualEntity>();
    private lastRenderMs = 0;
    private frozen = false;
    private configGetter: () => SmoothingConfig;

    constructor(configGetter?: () => SmoothingConfig) {
        this.configGetter = configGetter ?? (() => DEFAULT_SMOOTHING_CONFIG);
    }

    /** Получить текущую конфигурацию */
    getConfig(): SmoothingConfig {
        return this.configGetter();
    }

    /** Установить функцию получения конфигурации */
    setConfigGetter(getter: () => SmoothingConfig): void {
        this.configGetter = getter;
    }

    /** Заморозить/разморозить визуальное состояние */
    setFrozen(frozen: boolean): void {
        this.frozen = frozen;
    }

    /** Проверить, заморожено ли визуальное состояние */
    isFrozen(): boolean {
        return this.frozen;
    }

    /** Очистить все визуальные состояния */
    clear(): void {
        this.visualPlayers.clear();
        this.visualOrbs.clear();
        this.visualChests.clear();
        this.lastRenderMs = 0;
    }

    /**
     * Вычислить дельту времени и обновить lastRenderMs.
     * @returns дельта времени в секундах (ограничена 0.1)
     */
    updateDeltaTime(nowMs: number): number {
        const dtSec = this.lastRenderMs > 0
            ? Math.min((nowMs - this.lastRenderMs) / 1000, 0.1)
            : 0;
        this.lastRenderMs = nowMs;
        return dtSec;
    }

    /**
     * Сгладить позицию игрока.
     * @returns Визуальное состояние игрока
     */
    smoothPlayer(
        id: string,
        serverX: number,
        serverY: number,
        serverVx: number,
        serverVy: number,
        serverAngle: number,
        serverAngVel: number,
        dtSec: number
    ): VisualEntity {
        const cfg = this.getConfig();
        const lookAheadSec = cfg.lookAheadMs / 1000;

        // Целевая позиция с предсказанием
        const targetX = serverX + serverVx * lookAheadSec;
        const targetY = serverY + serverVy * lookAheadSec;
        const targetAngle = wrapAngle(serverAngle + serverAngVel * lookAheadSec);

        let visual = this.visualPlayers.get(id);
        if (!visual) {
            visual = {
                x: serverX,
                y: serverY,
                vx: serverVx,
                vy: serverVy,
                angle: serverAngle,
            };
            this.visualPlayers.set(id, visual);
        }

        if (dtSec > 0) {
            this.smoothStep(visual, targetX, targetY, serverVx, serverVy, targetAngle, dtSec);
        }

        return visual;
    }

    /**
     * Сгладить позицию орба (упрощённое сглаживание).
     */
    smoothOrb(
        id: string,
        serverX: number,
        serverY: number,
        serverVx: number,
        serverVy: number,
        dtSec: number
    ): VisualEntity {
        const cfg = this.getConfig();
        const lookAheadSec = cfg.lookAheadMs / 1000;

        const targetX = serverX + serverVx * lookAheadSec;
        const targetY = serverY + serverVy * lookAheadSec;

        let visual = this.visualOrbs.get(id);
        if (!visual) {
            visual = { x: serverX, y: serverY, vx: serverVx, vy: serverVy, angle: 0 };
            this.visualOrbs.set(id, visual);
        }

        // При заморозке не обновляем позицию
        if (dtSec > 0 && !this.frozen) {
            const dx = targetX - visual.x;
            const dy = targetY - visual.y;
            const error = Math.sqrt(dx * dx + dy * dy);

            if (error > cfg.teleportThreshold) {
                visual.x = targetX;
                visual.y = targetY;
            } else if (error > 0.01) {
                // Орбы догоняют быстрее (коэффициент 1.5)
                const catchUpSpeed = Math.min(error * cfg.catchUpSpeed * 1.5, cfg.maxCatchUpSpeed);
                const t = Math.min(catchUpSpeed * dtSec / error, 1);
                visual.x = lerp(visual.x, targetX, t);
                visual.y = lerp(visual.y, targetY, t);
            }
            visual.vx = serverVx;
            visual.vy = serverVy;
        }

        return visual;
    }

    /**
     * Сгладить позицию сундука (более медленное сглаживание).
     */
    smoothChest(
        id: string,
        serverX: number,
        serverY: number,
        serverVx: number,
        serverVy: number,
        dtSec: number
    ): VisualEntity {
        const cfg = this.getConfig();
        const lookAheadSec = cfg.lookAheadMs / 1000;

        const targetX = serverX + serverVx * lookAheadSec;
        const targetY = serverY + serverVy * lookAheadSec;

        let visual = this.visualChests.get(id);
        if (!visual) {
            visual = { x: serverX, y: serverY, vx: serverVx, vy: serverVy, angle: 0 };
            this.visualChests.set(id, visual);
        }

        // При заморозке не обновляем позицию
        if (dtSec > 0 && !this.frozen) {
            const dx = targetX - visual.x;
            const dy = targetY - visual.y;
            const error = Math.sqrt(dx * dx + dy * dy);

            if (error > cfg.teleportThreshold) {
                visual.x = targetX;
                visual.y = targetY;
            } else if (error > 0.01) {
                // Сундуки догоняют медленнее (тяжёлые)
                const catchUpSpeed = Math.min(error * cfg.catchUpSpeed * 0.8, cfg.maxCatchUpSpeed * 0.5);
                const t = Math.min(catchUpSpeed * dtSec / error, 1);
                visual.x = lerp(visual.x, targetX, t);
                visual.y = lerp(visual.y, targetY, t);
            }
            visual.vx = serverVx;
            visual.vy = serverVy;
        }

        return visual;
    }

    /** Удалить игрока из визуального состояния */
    removePlayer(id: string): void {
        this.visualPlayers.delete(id);
    }

    /** Удалить орб из визуального состояния */
    removeOrb(id: string): void {
        this.visualOrbs.delete(id);
    }

    /** Удалить сундук из визуального состояния */
    removeChest(id: string): void {
        this.visualChests.delete(id);
    }

    /** Получить все ID игроков в визуальном состоянии */
    getPlayerIds(): IterableIterator<string> {
        return this.visualPlayers.keys();
    }

    /** Получить все ID орбов в визуальном состоянии */
    getOrbIds(): IterableIterator<string> {
        return this.visualOrbs.keys();
    }

    /** Получить все ID сундуков в визуальном состоянии */
    getChestIds(): IterableIterator<string> {
        return this.visualChests.keys();
    }

    /**
     * Основная функция сглаживания для игроков.
     * Гибрид: интегрируем velocity для предсказуемости + catch-up для коррекции.
     */
    private smoothStep(
        visual: VisualEntity,
        targetX: number,
        targetY: number,
        targetVx: number,
        targetVy: number,
        targetAngle: number,
        dtSec: number
    ): void {
        const cfg = this.getConfig();

        // Вычисляем ошибку позиции
        const dx = targetX - visual.x;
        const dy = targetY - visual.y;
        const error = Math.sqrt(dx * dx + dy * dy);

        // Телепорт при большой ошибке (например, респаун)
        if (error > cfg.teleportThreshold) {
            visual.x = targetX;
            visual.y = targetY;
            visual.vx = targetVx;
            visual.vy = targetVy;
            visual.angle = targetAngle;
            return;
        }

        // Интегрируем целевую velocity (предсказуемое движение)
        const velocityMoveX = targetVx * dtSec;
        const velocityMoveY = targetVy * dtSec;

        // Вычисляем catch-up коррекцию
        let correctionX = 0;
        let correctionY = 0;
        if (error > 0.01) {
            const catchUpSpeed = Math.min(error * cfg.catchUpSpeed, cfg.maxCatchUpSpeed);
            correctionX = (dx / error) * catchUpSpeed * dtSec;
            correctionY = (dy / error) * catchUpSpeed * dtSec;

            // Не перескакивать с коррекцией
            if (Math.abs(correctionX) > Math.abs(dx)) correctionX = dx;
            if (Math.abs(correctionY) > Math.abs(dy)) correctionY = dy;
        }

        // Комбинируем: velocity + взвешенная коррекция
        visual.x += velocityMoveX * cfg.velocityWeight + correctionX * (1 - cfg.velocityWeight);
        visual.y += velocityMoveY * cfg.velocityWeight + correctionY * (1 - cfg.velocityWeight);

        // Плавно приближаем velocity
        const velocityLerp = clamp(dtSec * 8, 0, 1);
        visual.vx = lerp(visual.vx, targetVx, velocityLerp);
        visual.vy = lerp(visual.vy, targetVy, velocityLerp);

        // Сглаживание угла
        const angleDelta = wrapAngle(targetAngle - visual.angle);
        const angleError = Math.abs(angleDelta);
        if (angleError > 0.001) {
            const angleCatchUp = Math.min(angleError * cfg.angleCatchUpSpeed, Math.PI * 4) * dtSec;
            if (angleCatchUp >= angleError) {
                visual.angle = targetAngle;
            } else {
                visual.angle = wrapAngle(visual.angle + Math.sign(angleDelta) * angleCatchUp);
            }
        }
    }
}
