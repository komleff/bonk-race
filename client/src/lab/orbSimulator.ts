/**
 * orbSimulator — pure-function orb physics tick.
 *
 * Extracted from BonkLab.tickOrbs() so that orb simulation is
 * a standalone, testable function with no class dependencies.
 * Mutates the orbs array and playerBody in place.
 */

import type { ICircleBody, IStaticObstacle, IWallBounds, ArenaObject } from "@bonk-race/shared";
import { resolveCircleCircleCollision, resolveCircleStaticCollision, resolveWallCollision } from "@bonk-race/shared";
import type { SandboxOrb } from "./labTypes";

/** Duration of the orb death shrink animation (seconds). */
const ORB_DEATH_DURATION = 0.5;

/**
 * Tick all orbs: drag, integration, wall/obstacle/player collision, death animation.
 * Mutates `orbs` array and `playerBody` in place.
 */
export function tickOrbs(
    orbs: SandboxOrb[],
    dt: number,
    playerBody: ICircleBody,
    obstacles: ArenaObject[],
    wallBounds: IWallBounds,
    collisionConfig: { correctionPercent: number; slop: number; maxCorrection: number },
    dragK: number,
    restitution: number,
    passageRestitution: number,
    spikeKill: boolean,
): void {
    // 1. Drag + position integration for each live orb
    for (const orb of orbs) {
        if (!orb.alive) {
            // Advance death animation
            if (orb.deathProgress >= 0 && orb.deathProgress < 1) {
                orb.deathProgress += dt / ORB_DEATH_DURATION;
                if (orb.deathProgress > 1) orb.deathProgress = 1;
            }
            continue;
        }
        // Exponential drag decay (isotropic for orbs)
        const damping = Math.exp(-dragK * dt);
        orb.vx *= damping;
        orb.vy *= damping;
        // Semi-implicit Euler
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
    }

    // 2. Collision resolution (4 iterations)
    // Build parallel arrays: orbBodies for physics, orbIndices to map back to orbs
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

            // Orb-obstacle collisions
            for (const obs of obstacles) {
                if (obs.alive === false) continue; // Skip destroyed obstacles
                const staticObs: IStaticObstacle = {
                    x: obs.x, y: obs.y, radius: obs.radius,
                    type: obs.type === "passage" ? "pillar" : (obs.type as "pillar" | "spike" | "wall"),
                };
                const obsRestitution = obs.type === "passage" ? passageRestitution : restitution;
                const collided = resolveCircleStaticCollision(ob, staticObs, obsRestitution, collisionConfig);
                if (collided && obs.type === "spike") spikeHit[i] = true;
            }

            // Orb-wall collisions
            resolveWallCollision(ob, wallBounds, restitution);

            // Orb-player collision
            resolveCircleCircleCollision(ob, playerBody, restitution, collisionConfig);

            // Orb-orb collisions
            for (let j = i + 1; j < orbBodies.length; j++) {
                resolveCircleCircleCollision(ob, orbBodies[j], restitution, collisionConfig);
            }
        }
    }

    // 3. Write collision results back to orbs + apply spike deaths
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

    // 4. playerBody is mutated in place by orb-player collisions above;
    //    the caller reads updated values from playerBody after this call.
}
