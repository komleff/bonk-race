/**
 * Утилиты для работы с геометрией мира
 */

import type { ResolvedBalanceConfig } from "@bonk-race/shared";
import { clamp } from "./mathUtils";

export interface WorldBounds {
    shape: "rectangle" | "circle";
    width: number;
    height: number;
    radius: number;
}

/**
 * Извлекает параметры границ мира из конфигурации
 */
export function getWorldBounds(balance: ResolvedBalanceConfig): WorldBounds {
    const world = balance.worldPhysics;
    const shape = world.worldShape;
    const width = world.widthM ?? balance.world.mapSize;
    const height = world.heightM ?? balance.world.mapSize;
    const radius = world.radiusM ?? balance.world.mapSize / 2;
    return { shape, width, height, radius };
}

/**
 * Генерирует случайную точку внутри карты
 */
export function randomPointInMap(
    bounds: WorldBounds,
    rng: { range: (min: number, max: number) => number; next: () => number }
): { x: number; y: number } {
    if (bounds.shape === "circle") {
        const angle = rng.range(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * bounds.radius;
        return {
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r,
        };
    }

    return {
        x: rng.range(-bounds.width / 2, bounds.width / 2),
        y: rng.range(-bounds.height / 2, bounds.height / 2),
    };
}

/**
 * Ограничивает точку границами мира
 */
export function clampPointToWorld(
    x: number,
    y: number,
    bounds: WorldBounds
): { x: number; y: number } {
    if (bounds.shape === "circle") {
        const dist = Math.hypot(x, y);
        if (dist > bounds.radius && dist > 0) {
            const scale = bounds.radius / dist;
            return { x: x * scale, y: y * scale };
        }
        return { x, y };
    }

    return {
        x: clamp(x, -bounds.width / 2, bounds.width / 2),
        y: clamp(y, -bounds.height / 2, bounds.height / 2),
    };
}

/**
 * Применяет коллизию с границами мира для сущности
 */
export function applyWorldBoundsCollision(
    entity: { x: number; y: number; vx: number; vy: number },
    radius: number,
    bounds: WorldBounds,
    restitution: number
): void {
    if (bounds.shape === "circle") {
        const dist = Math.hypot(entity.x, entity.y);
        if (dist + radius > bounds.radius) {
            const nx = dist > 1e-6 ? entity.x / dist : 1;
            const ny = dist > 1e-6 ? entity.y / dist : 0;
            entity.x = nx * (bounds.radius - radius);
            entity.y = ny * (bounds.radius - radius);
            const velAlongNormal = entity.vx * nx + entity.vy * ny;
            entity.vx -= (1 + restitution) * velAlongNormal * nx;
            entity.vy -= (1 + restitution) * velAlongNormal * ny;
        }
        return;
    }

    const halfW = bounds.width / 2;
    const halfH = bounds.height / 2;
    if (entity.x - radius < -halfW) {
        entity.x = -halfW + radius;
        entity.vx = Math.abs(entity.vx) * restitution;
    } else if (entity.x + radius > halfW) {
        entity.x = halfW - radius;
        entity.vx = -Math.abs(entity.vx) * restitution;
    }
    if (entity.y - radius < -halfH) {
        entity.y = -halfH + radius;
        entity.vy = Math.abs(entity.vy) * restitution;
    } else if (entity.y + radius > halfH) {
        entity.y = halfH - radius;
        entity.vy = -Math.abs(entity.vy) * restitution;
    }
}
