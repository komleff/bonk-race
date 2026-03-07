import { FLAG_MAGNETIZING, getOrbRadius } from "@bonk-race/shared";

export function updateOrbs(room: any) {
    const dt = 1 / room.balance.server.tickRate;
    if (
        room.tick - room.lastOrbSpawnTick >= room.orbSpawnIntervalTicks &&
        room.state.orbs.size < room.balance.orbs.maxCount
    ) {
        const spawnMultiplier = room.getOrbSpawnMultiplier();
        let spawnCount = Math.floor(spawnMultiplier);
        if (room.rng.next() < spawnMultiplier - spawnCount) {
            spawnCount += 1;
        }
        spawnCount = Math.max(1, spawnCount);
        const remaining = room.balance.orbs.maxCount - room.state.orbs.size;
        spawnCount = Math.min(spawnCount, remaining);

        for (let i = 0; i < spawnCount; i += 1) {
            const spawn = room.randomOrbSpawnPoint();
            room.spawnOrb(spawn.x, spawn.y);
        }
        room.lastOrbSpawnTick = room.tick;
    }

    // Притяжение орбов (магнит умения + вакуум талант)
    const magnetPlayers: { player: any; radiusSq: number; speed: number; mouthX: number; mouthY: number }[] = [];
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;
        const magnetActive = (player.flags & FLAG_MAGNETIZING) !== 0;
        const abilityLevel = room.getAbilityLevelForAbility(player, "pull");
        const magnetConfig = room.getAbilityConfigById("pull", abilityLevel || 1);
        const magnetRadius = magnetActive ? magnetConfig.radiusM : 0;
        const magnetSpeed = magnetActive ? magnetConfig.pullSpeedMps : 0;
        const vacuumRadius = player.mod_vacuumRadius;
        const vacuumSpeed = player.mod_vacuumSpeed;
        // Талант "Магнит" (Collector): пассивное притяжение орбов
        const talentMagnetRadius = player.mod_magnetRadius;
        const talentMagnetSpeed = player.mod_magnetSpeed;
        const radius = Math.max(magnetRadius, vacuumRadius, talentMagnetRadius);
        const speed = Math.max(magnetSpeed, vacuumSpeed, talentMagnetSpeed);
        if (radius <= 0 || speed <= 0) continue;
        const mouth = room.getMouthPoint(player);
        magnetPlayers.push({ player, radiusSq: radius * radius, speed, mouthX: mouth.x, mouthY: mouth.y });
    }

    for (const orb of room.state.orbs.values()) {
        // Magnet/vacuum pull
        for (const entry of magnetPlayers) {
            const dx = entry.mouthX - orb.x;
            const dy = entry.mouthY - orb.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < entry.radiusSq && distSq > 1) {
                const dist = Math.sqrt(distSq);
                const nx = dx / dist;
                const ny = dy / dist;
                // Сила притяжения
                orb.vx += nx * entry.speed * dt * 2;
                orb.vy += ny * entry.speed * dt * 2;
            }
        }

        // Orbs keep the simplified damping model to avoid extra force calculations.
        const damping = Math.max(
            0,
            1 - room.balance.physics.environmentDrag - room.balance.physics.orbLinearDamping
        );
        orb.vx *= damping;
        orb.vy *= damping;
        room.applySpeedCap(orb, room.balance.physics.maxOrbSpeed);
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        const type = room.balance.orbs.types[orb.colorId] ?? room.balance.orbs.types[0];
        const radius = getOrbRadius(orb.mass, type.density);
        room.applyWorldBounds(orb, radius);
    }
}

/**
 * Визуальное обновление орбов во время фазы Results (без спауна).
 * Орбы только замедляются и останавливаются у границ.
 */
export function updateOrbsVisual(room: any): void {
    const dt = 1 / room.balance.server.tickRate;
    const damping = Math.max(0, 1 - room.balance.physics.environmentDrag - room.balance.physics.orbLinearDamping);
    for (const orb of room.state.orbs.values()) {
        orb.vx *= damping;
        orb.vy *= damping;
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;
        const type = room.balance.orbs.types[orb.colorId] ?? room.balance.orbs.types[0];
        const radius = getOrbRadius(orb.mass, type.density);
        room.applyWorldBounds(orb, radius);
    }
}
