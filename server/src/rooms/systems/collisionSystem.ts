import {
    OBSTACLE_TYPE_SPIKES,
    getOrbRadius,
    resolveCircleCircleCollision,
    resolveCircleStaticCollision,
    ICircleBody,
    IStaticObstacle,
    ICollisionConfig,
} from "@bonk-race/shared";

export function collisionSystem(room: any) {
    const players = Array.from(room.state.players.values()) as any[];
    const orbs = Array.from(room.state.orbs.entries()) as any[];
    const chests = Array.from(room.state.chests.entries()) as any[];
    const obstacles = Array.from(room.state.obstacles.values()) as any[];
    const iterations = 4;
    const restitution = room.balance.worldPhysics.restitution;
    const maxCorrection = room.balance.worldPhysics.maxPositionCorrectionM;
    const spikeDamageApplied = new Set<string>();

    const config: ICollisionConfig = {
        correctionPercent: 0.8,
        slop: 0.001,
        maxCorrection,
    };

    for (let iter = 0; iter < iterations; iter += 1) {
        // Столкновения слайм-слайм
        for (let i = 0; i < players.length; i += 1) {
            const p1 = players[i];
            if (p1.isDead) continue;
            for (let j = i + 1; j < players.length; j += 1) {
                const p2 = players[j];
                if (p2.isDead) continue;

                const r1 = room.getPlayerRadius(p1);
                const r2 = room.getPlayerRadius(p2);

                const bodyA: ICircleBody = { x: p1.x, y: p1.y, vx: p1.vx, vy: p1.vy, radius: r1, mass: p1.mass };
                const bodyB: ICircleBody = { x: p2.x, y: p2.y, vx: p2.vx, vy: p2.vy, radius: r2, mass: p2.mass };

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;

                if (resolveCircleCircleCollision(bodyA, bodyB, restitution, config)) {
                    p1.x = bodyA.x; p1.y = bodyA.y; p1.vx = bodyA.vx; p1.vy = bodyA.vy;
                    p2.x = bodyB.x; p2.y = bodyB.y; p2.vx = bodyB.vx; p2.vy = bodyB.vy;

                    room.processCombat(p1, p2, dx, dy);
                    room.processCombat(p2, p1, -dx, -dy);
                }
            }
        }

        // Столкновения слайм-орб (физика + поедание ртом)
        for (const player of players) {
            if (player.isDead) continue;
            const playerRadius = room.getPlayerRadius(player);
            const playerAngleRad = player.angle;
            const mouthHalf = room.getMouthHalfAngle(player);

            for (const [orbId, orb] of orbs) {
                if (!room.state.orbs.has(orbId)) continue;

                const dx = orb.x - player.x;
                const dy = orb.y - player.y;
                const type = room.balance.orbs.types[orb.colorId] ?? room.balance.orbs.types[0];
                const orbRadius = getOrbRadius(orb.mass, type.density);

                const bodyA: ICircleBody = { x: player.x, y: player.y, vx: player.vx, vy: player.vy, radius: playerRadius, mass: player.mass };
                const bodyB: ICircleBody = { x: orb.x, y: orb.y, vx: orb.vx, vy: orb.vy, radius: orbRadius, mass: orb.mass };

                if (resolveCircleCircleCollision(bodyA, bodyB, restitution, config)) {
                    player.x = bodyA.x; player.y = bodyA.y; player.vx = bodyA.vx; player.vy = bodyA.vy;
                    orb.x = bodyB.x; orb.y = bodyB.y; orb.vx = bodyB.vx; orb.vy = bodyB.vy;
                }

                // Проверка поедания ртом — проверяем на исходных dx/dy (до коррекции)
                const angleToOrb = Math.atan2(dy, dx);
                let angleDiff = angleToOrb - playerAngleRad;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                const isMouthHit = Math.abs(angleDiff) <= mouthHalf;

                // Need to check distance for mouth hit — use original distance check
                const distSq = dx * dx + dy * dy;
                const minDist = playerRadius + orbRadius;
                if (distSq >= minDist * minDist) continue;

                // GDD v3.3: GCD между умениями и укусами
                const gcdReady = room.tick >= player.gcdReadyTick;
                if (isMouthHit && gcdReady && room.tick >= player.lastBiteTick + room.biteCooldownTicks) {
                    room.tryEatOrb(player, orbId, orb);
                }
            }
        }

        // Столкновения слайм-сундук (физика)
        for (const player of players) {
            if (player.isDead) continue;
            const playerRadius = room.getPlayerRadius(player);

            for (const [chestId, chest] of chests) {
                if (!room.state.chests.has(chestId)) continue;

                const chestTypeId = chest.type === 0 ? "rare" : chest.type === 1 ? "epic" : "gold";
                const chestMass = Math.max(
                    room.balance.chests.types?.[chestTypeId]?.mass ?? room.balance.chests.mass,
                    50
                );

                const bodyA: ICircleBody = { x: player.x, y: player.y, vx: player.vx, vy: player.vy, radius: playerRadius, mass: player.mass };
                const bodyB: ICircleBody = { x: chest.x, y: chest.y, vx: chest.vx, vy: chest.vy, radius: room.balance.chests.radius, mass: chestMass };

                if (resolveCircleCircleCollision(bodyA, bodyB, restitution, config)) {
                    player.x = bodyA.x; player.y = bodyA.y; player.vx = bodyA.vx; player.vy = bodyA.vy;
                    chest.x = bodyB.x; chest.y = bodyB.y; chest.vx = bodyB.vx; chest.vy = bodyB.vy;
                }
            }
        }

        // Столкновения слайм-препятствие
        for (const player of players) {
            if (player.isDead) continue;
            const playerRadius = room.getPlayerRadius(player);
            for (const obstacle of obstacles) {
                const obstacleBody: IStaticObstacle = {
                    x: obstacle.x,
                    y: obstacle.y,
                    radius: obstacle.radius,
                    type: obstacle.type === OBSTACLE_TYPE_SPIKES ? "spike" : "pillar",
                };

                const body: ICircleBody = { x: player.x, y: player.y, vx: player.vx, vy: player.vy, radius: playerRadius, mass: player.mass };

                if (resolveCircleStaticCollision(body, obstacleBody, restitution, config)) {
                    player.x = body.x; player.y = body.y; player.vx = body.vx; player.vy = body.vy;

                    if (obstacle.type === OBSTACLE_TYPE_SPIKES) {
                        if (spikeDamageApplied.has(player.id)) continue;
                        if (room.tick < player.invulnerableUntilTick) continue;
                        if (player.isLastBreath) continue;
                        const damagePct = Math.max(0, room.balance.obstacles.spikeDamagePct);
                        if (damagePct <= 0) continue;
                        const massLoss = player.mass * damagePct;
                        if (massLoss > 0) {
                            if (!room.tryConsumeGuard(player)) {
                                room.applyMassDelta(player, -massLoss);
                            }
                            spikeDamageApplied.add(player.id);
                        }
                    }
                }
            }
        }

        for (const player of players) {
            if (player.isDead) continue;
            room.applyWorldBounds(player, room.getPlayerRadius(player));
        }

        // Столкновения орб-орб
        room.orbOrbCollisions(restitution);
    }
}
