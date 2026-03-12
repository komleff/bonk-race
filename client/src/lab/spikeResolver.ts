/**
 * spikeResolver — разрешение столкновений с шипами.
 *
 * Извлечено из BonkLab.tick() для уменьшения размера метода.
 */

import type { ArenaObject } from "@bonk-race/shared";

export interface SpikeResult {
    /** Игрок погиб от шипа */
    died: boolean;
    /** Скорость после отталкивания (или 0 при гибели) */
    vx: number;
    vy: number;
}

export interface SpikeParams {
    killOnHit: boolean;
    destroyOnHit: boolean;
    knockbackImpulse: number;
}

/**
 * Обработка столкновений с шипами: гибель или отталкивание.
 * При destroyOnHit помечает шипы из hitSpikes как уничтоженные (alive = false).
 */
export function resolveSpikeCollision(
    hitSpikes: Set<ArenaObject>,
    spikeNx: number,
    spikeNy: number,
    vx: number,
    vy: number,
    mass: number,
    params: SpikeParams,
    maxKnockbackSpeed: number,
): SpikeResult {
    // Нормализовать накопленную нормаль
    const nLen = Math.sqrt(spikeNx * spikeNx + spikeNy * spikeNy);
    let nx: number, ny: number;
    if (nLen > 1e-6) {
        nx = spikeNx / nLen;
        ny = spikeNy / nLen;
    } else {
        nx = 1;
        ny = 0;
    }

    if (params.killOnHit) {
        if (params.destroyOnHit) {
            for (const obj of hitSpikes) obj.alive = false;
        }
        return { died: true, vx: 0, vy: 0 };
    }

    // Knockback: dv = импульс / масса
    const safeMass = Math.max(mass, 0.01);
    const dv = params.knockbackImpulse / safeMass;
    let rvx = vx + nx * dv;
    let rvy = vy + ny * dv;

    // Ограничение скорости
    const speed = Math.sqrt(rvx * rvx + rvy * rvy);
    if (speed > maxKnockbackSpeed) {
        const scale = maxKnockbackSpeed / speed;
        rvx *= scale;
        rvy *= scale;
    }

    if (params.destroyOnHit) {
        for (const obj of hitSpikes) obj.alive = false;
    }

    return { died: false, vx: rvx, vy: rvy };
}
