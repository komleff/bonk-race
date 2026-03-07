import { OBSTACLE_TYPE_SPIKES, getOrbRadius } from "@bonk-race/shared";

export function collisionSystem(room: any) {
    const players = Array.from(room.state.players.values()) as any[];
    const orbs = Array.from(room.state.orbs.entries()) as any[];
    const chests = Array.from(room.state.chests.entries()) as any[];
    const obstacles = Array.from(room.state.obstacles.values()) as any[];
    const iterations = 4;
    const slop = 0.001;
    const percent = 0.8;
    const restitution = room.balance.worldPhysics.restitution;
    const maxCorrection = room.balance.worldPhysics.maxPositionCorrectionM;
    const spikeDamageApplied = new Set<string>();

    for (let iter = 0; iter < iterations; iter += 1) {
        // Столкновения слайм-слайм
        for (let i = 0; i < players.length; i += 1) {
            const p1 = players[i];
            if (p1.isDead) continue;
            for (let j = i + 1; j < players.length; j += 1) {
                const p2 = players[j];
                if (p2.isDead) continue;

                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const r1 = room.getPlayerRadius(p1);
                const r2 = room.getPlayerRadius(p2);
                const minDist = r1 + r2;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.sqrt(distSq);
                const nx = dist > 0 ? dx / dist : 1;
                const ny = dist > 0 ? dy / dist : 0;
                const penetration = minDist - (dist || 0);
                const invMass1 = p1.mass > 0 ? 1 / p1.mass : 0;
                const invMass2 = p2.mass > 0 ? 1 / p2.mass : 0;
                const invMassSum = invMass1 + invMass2;

                if (invMassSum > 0) {
                    const corrRaw = (Math.max(penetration - slop, 0) / invMassSum) * percent;
                    const corrMag = Math.min(corrRaw, maxCorrection);
                    const corrX = nx * corrMag;
                    const corrY = ny * corrMag;
                    p1.x -= corrX * invMass1;
                    p1.y -= corrY * invMass1;
                    p2.x += corrX * invMass2;
                    p2.y += corrY * invMass2;

                    const rvx = p2.vx - p1.vx;
                    const rvy = p2.vy - p1.vy;
                    const velAlongNormal = rvx * nx + rvy * ny;
                    if (velAlongNormal <= 0) {
                        const jImpulse = (-(1 + restitution) * velAlongNormal) / invMassSum;
                        const impulseX = nx * jImpulse;
                        const impulseY = ny * jImpulse;
                        p1.vx -= impulseX * invMass1;
                        p1.vy -= impulseY * invMass1;
                        p2.vx += impulseX * invMass2;
                        p2.vy += impulseY * invMass2;
                    }
                }

                room.processCombat(p1, p2, dx, dy);
                room.processCombat(p2, p1, -dx, -dy);
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
                const minDist = playerRadius + orbRadius;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.sqrt(distSq);
                const nx = dist > 0 ? dx / dist : 1;
                const ny = dist > 0 ? dy / dist : 0;
                const penetration = minDist - (dist || 0);

                // Физическая масса орба = пищевая масса (без множителя density)
                const invMassPlayer = player.mass > 0 ? 1 / player.mass : 0;
                const invMassOrb = orb.mass > 0 ? 1 / orb.mass : 0;
                const invMassSum = invMassPlayer + invMassOrb;

                if (invMassSum > 0) {
                    // Позиционная коррекция
                    const corrRaw = (Math.max(penetration - slop, 0) / invMassSum) * percent;
                    const corrMag = Math.min(corrRaw, maxCorrection);
                    const corrX = nx * corrMag;
                    const corrY = ny * corrMag;
                    player.x -= corrX * invMassPlayer;
                    player.y -= corrY * invMassPlayer;
                    orb.x += corrX * invMassOrb;
                    orb.y += corrY * invMassOrb;

                    // Импульсное отталкивание (закон сохранения импульса)
                    const rvx = orb.vx - player.vx;
                    const rvy = orb.vy - player.vy;
                    const velAlongNormal = rvx * nx + rvy * ny;
                    if (velAlongNormal <= 0) {
                        const jImpulse = (-(1 + restitution) * velAlongNormal) / invMassSum;
                        const impulseX = nx * jImpulse;
                        const impulseY = ny * jImpulse;
                        player.vx -= impulseX * invMassPlayer;
                        player.vy -= impulseY * invMassPlayer;
                        orb.vx += impulseX * invMassOrb;
                        orb.vy += impulseY * invMassOrb;
                    }
                }

                // Проверка поедания ртом
                const angleToOrb = Math.atan2(dy, dx);
                let angleDiff = angleToOrb - playerAngleRad;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                const isMouthHit = Math.abs(angleDiff) <= mouthHalf;

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

                const dx = chest.x - player.x;
                const dy = chest.y - player.y;
                const minDist = playerRadius + room.balance.chests.radius;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.sqrt(distSq);
                const nx = dist > 0 ? dx / dist : 1;
                const ny = dist > 0 ? dy / dist : 0;
                const penetration = minDist - (dist || 0);

                const invMassPlayer = player.mass > 0 ? 1 / player.mass : 0;
                const chestTypeId = chest.type === 0 ? "rare" : chest.type === 1 ? "epic" : "gold";
                const chestMass = Math.max(
                    room.balance.chests.types?.[chestTypeId]?.mass ?? room.balance.chests.mass,
                    50
                );
                const invMassChest = chestMass > 0 ? 1 / chestMass : 0;
                const invMassSum = invMassPlayer + invMassChest;

                if (invMassSum > 0) {
                    const corrRaw = (Math.max(penetration - slop, 0) / invMassSum) * percent;
                    const corrMag = Math.min(corrRaw, maxCorrection);
                    const corrX = nx * corrMag;
                    const corrY = ny * corrMag;
                    player.x -= corrX * invMassPlayer;
                    player.y -= corrY * invMassPlayer;
                    chest.x += corrX * invMassChest;
                    chest.y += corrY * invMassChest;

                    const rvx = chest.vx - player.vx;
                    const rvy = chest.vy - player.vy;
                    const velAlongNormal = rvx * nx + rvy * ny;
                    if (velAlongNormal <= 0) {
                        const jImpulse = (-(1 + restitution) * velAlongNormal) / invMassSum;
                        const impulseX = nx * jImpulse;
                        const impulseY = ny * jImpulse;
                        player.vx -= impulseX * invMassPlayer;
                        player.vy -= impulseY * invMassPlayer;
                        chest.vx += impulseX * invMassChest;
                        chest.vy += impulseY * invMassChest;
                    }
                }
            }
        }

        // Столкновения слайм-препятствие
        for (const player of players) {
            if (player.isDead) continue;
            const playerRadius = room.getPlayerRadius(player);
            for (const obstacle of obstacles) {
                const dx = player.x - obstacle.x;
                const dy = player.y - obstacle.y;
                const minDist = playerRadius + obstacle.radius;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.sqrt(distSq);
                const nx = dist > 0 ? dx / dist : 1;
                const ny = dist > 0 ? dy / dist : 0;
                const penetration = minDist - (dist || 0);
                const corrRaw = Math.max(penetration - slop, 0);
                const corrMag = Math.min(corrRaw, maxCorrection);
                const corrX = nx * corrMag;
                const corrY = ny * corrMag;
                player.x += corrX;
                player.y += corrY;

                const velAlongNormal = player.vx * nx + player.vy * ny;
                if (velAlongNormal < 0) {
                    const impulse = (1 + restitution) * velAlongNormal;
                    player.vx -= impulse * nx;
                    player.vy -= impulse * ny;
                }

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

        for (const player of players) {
            if (player.isDead) continue;
            room.applyWorldBounds(player, room.getPlayerRadius(player));
        }

        // Столкновения орб-орб
        room.orbOrbCollisions(restitution);
    }
}
