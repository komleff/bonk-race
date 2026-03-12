/**
 * orbSimulator — физика орбов (мутирующая функция).
 *
 * Извлечено из BonkLab.tickOrbs(). Автономная функция без зависимости от класса.
 * Мутирует массив orbs и playerBody на месте.
 */

import type { ICircleBody, IStaticObstacle, IWallBounds, ArenaObject } from "@bonk-race/shared";
import { resolveCircleCircleCollision, resolveCircleStaticCollision, resolveWallCollision } from "@bonk-race/shared";
import type { SandboxOrb } from "./labTypes";

/** Длительность анимации сжатия орба при гибели (секунды). */
const ORB_DEATH_DURATION = 0.5;

/** Конфиг для tickOrbs — группирует параметры физики орбов */
export interface OrbTickConfig {
    collisionConfig: { correctionPercent: number; slop: number; maxCorrection: number };
    dragK: number;
    restitution: number;
    passageRestitution: number;
    spikeKill: boolean;
}

/**
 * Тик всех орбов: торможение, интеграция, столкновения со стенами/препятствиями/игроком, анимация гибели.
 * Мутирует массив `orbs` и `playerBody` на месте.
 */
export function tickOrbs(
    orbs: SandboxOrb[],
    dt: number,
    playerBody: ICircleBody,
    obstacles: ArenaObject[],
    wallBounds: IWallBounds,
    config: OrbTickConfig,
): void {
    const { collisionConfig, dragK, restitution, passageRestitution, spikeKill } = config;
    // 1. Торможение + интеграция позиции для живых орбов
    for (const orb of orbs) {
        if (!orb.alive) {
            // Продвинуть анимацию гибели
            if (orb.deathProgress >= 0 && orb.deathProgress < 1) {
                orb.deathProgress += dt / ORB_DEATH_DURATION;
                if (orb.deathProgress > 1) orb.deathProgress = 1;
            }
            continue;
        }
        // Экспоненциальное затухание (изотропное для орбов)
        const damping = Math.exp(-dragK * dt);
        orb.vx *= damping;
        orb.vy *= damping;
        // Полу-неявный Эйлер
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
    }

    // 2. Разрешение столкновений (4 итерации)
    // Параллельные массивы: orbBodies для физики, orbIndices для обратного маппинга
    const orbBodies: ICircleBody[] = [];
    const orbIndices: number[] = [];
    const spikeHit: boolean[] = [];
    for (let idx = 0; idx < orbs.length; idx++) {
        const o = orbs[idx];
        if (!o.alive) continue;
        orbBodies.push({ x: o.x, y: o.y, vx: o.vx, vy: o.vy, radius: o.radius, mass: o.mass });
        orbIndices.push(idx);
        spikeHit.push(false);
    }

    for (let iter = 0; iter < 4; iter++) {
        for (let i = 0; i < orbBodies.length; i++) {
            const ob = orbBodies[i];

            // Столкновения орб-препятствие
            for (const obs of obstacles) {
                if (obs.alive === false) continue; // Пропустить уничтоженные
                const staticObs: IStaticObstacle = {
                    x: obs.x, y: obs.y, radius: obs.radius,
                    type: obs.type === "passage" ? "pillar" : (obs.type as "pillar" | "spike" | "wall"),
                };
                const obsRestitution = obs.type === "passage" ? passageRestitution : restitution;
                const collided = resolveCircleStaticCollision(ob, staticObs, obsRestitution, collisionConfig);
                if (collided && obs.type === "spike") spikeHit[i] = true;
            }

            // Столкновения орб-стена
            resolveWallCollision(ob, wallBounds, restitution);

            // Столкновение орб-игрок
            resolveCircleCircleCollision(ob, playerBody, restitution, collisionConfig);

            // Столкновения орб-орб
            for (let j = i + 1; j < orbBodies.length; j++) {
                resolveCircleCircleCollision(ob, orbBodies[j], restitution, collisionConfig);
            }
        }
    }

    // 3. Записать результаты столкновений обратно в орбы + применить гибель от шипов
    for (let i = 0; i < orbBodies.length; i++) {
        const orb = orbs[orbIndices[i]];
        const ob = orbBodies[i];
        orb.x = ob.x;
        orb.y = ob.y;
        orb.vx = ob.vx;
        orb.vy = ob.vy;

        if (spikeKill && spikeHit[i]) {
            orb.alive = false;
            orb.deathProgress = 0;
        }
    }

    // 4. playerBody мутируется на месте столкновениями орб-игрок выше;
    //    вызывающий код читает обновлённые значения из playerBody после вызова.
}
