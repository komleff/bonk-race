import { FLAG_ABILITY_SHIELD, FLAG_SLOWED, ZONE_TYPE_LAVA, ZONE_TYPE_NECTAR } from "@bonk-race/shared";

export function slowZoneSystem(room: any) {
    // Удаляем истекшие зоны
    const expiredZones: string[] = [];
    for (const zone of room.state.slowZones.values()) {
        if (room.tick >= zone.endTick) {
            expiredZones.push(zone.id);
        }
    }
    for (const id of expiredZones) {
        room.state.slowZones.delete(id);
    }

    // Применяем суммарное замедление к игрокам
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;

        let totalSlowPct = 0;

        for (const zone of room.state.slowZones.values()) {
            // Не замедляем владельца зоны
            if (zone.ownerId === player.id) continue;

            const dx = player.x - zone.x;
            const dy = player.y - zone.y;
            const distSq = dx * dx + dy * dy;
            const radiusSq = zone.radius * zone.radius;

            if (distSq < radiusSq) {
                totalSlowPct += zone.slowPct;
            }
        }

        for (const pool of room.state.toxicPools.values()) {
            const dx = player.x - pool.x;
            const dy = player.y - pool.y;
            const distSq = dx * dx + dy * dy;
            const radiusSq = pool.radius * pool.radius;
            if (distSq < radiusSq) {
                totalSlowPct += pool.slowPct;
            }
        }

        if (room.tick < player.frostEndTick) {
            totalSlowPct += player.frostSlowPct;
        } else if (player.frostEndTick > 0) {
            player.frostEndTick = 0;
            player.frostSlowPct = 0;
        }

        totalSlowPct = Math.min(totalSlowPct, 0.8);
        player.slowPct = totalSlowPct;

        // Устанавливаем/снимаем флаг замедления
        if (totalSlowPct > 0) {
            player.flags |= FLAG_SLOWED;
        } else {
            player.flags &= ~FLAG_SLOWED;
        }
    }
}

export function toxicPoolSystem(room: any) {
    // Удаляем истекшие лужи
    const expiredPools: string[] = [];
    for (const pool of room.state.toxicPools.values()) {
        if (room.tick >= pool.endTick) {
            expiredPools.push(pool.id);
        }
    }
    for (const id of expiredPools) {
        room.state.toxicPools.delete(id);
    }

    const dt = 1 / room.balance.server.tickRate;
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;
        if (player.isLastBreath) continue;
        if (room.tick < player.invulnerableUntilTick) continue;
        if ((player.flags & FLAG_ABILITY_SHIELD) !== 0) continue;
        let totalDamagePctPerSec = 0;
        for (const pool of room.state.toxicPools.values()) {
            const dx = player.x - pool.x;
            const dy = player.y - pool.y;
            const distSq = dx * dx + dy * dy;
            const radiusSq = pool.radius * pool.radius;
            if (distSq < radiusSq) {
                totalDamagePctPerSec += pool.damagePctPerSec;
            }
        }
        if (totalDamagePctPerSec <= 0) continue;
        const damageTakenMult = room.getDamageTakenMultiplier(player);
        const massLoss = player.mass * totalDamagePctPerSec * dt * damageTakenMult;
        if (massLoss > 0 && !room.tryConsumeGuard(player)) {
            room.applyMassDelta(player, -massLoss);
        }
    }
}

export function statusEffectSystem(room: any) {
    const dt = 1 / room.balance.server.tickRate;
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;
        if (room.tick < player.invulnerableUntilTick) continue;
        if ((player.flags & FLAG_ABILITY_SHIELD) !== 0) continue;
        if (player.poisonEndTick > room.tick && player.poisonDamagePctPerSec > 0) {
            const damageTakenMult = room.getDamageTakenMultiplier(player);
            const massLoss = player.mass * player.poisonDamagePctPerSec * dt * damageTakenMult;
            if (massLoss > 0 && !room.tryConsumeGuard(player)) {
                room.applyMassDelta(player, -massLoss);
            }
        } else if (player.poisonEndTick > 0) {
            player.poisonEndTick = 0;
            player.poisonDamagePctPerSec = 0;
            player.poisonTickAccumulator = 0;
        }
    }
}

export function zoneEffectSystem(room: any) {
    if (room.state.zones.size === 0) return;
    const dt = 1 / room.balance.server.tickRate;
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;
        const zone = room.getZoneForPlayer(player);
        if (!zone) continue;

        // Лёд и турбо влияют на движение через множители в movementSystems.ts.
        if (zone.type === ZONE_TYPE_NECTAR) {
            if (player.isLastBreath) continue;
            const gainPct = Math.max(0, room.balance.zones.nectar.massGainPctPerSec);
            if (gainPct <= 0) continue;
            const gain = player.mass * gainPct * dt;
            if (gain > 0) {
                room.applyMassDelta(player, gain);
            }
            continue;
        }

        if (zone.type === ZONE_TYPE_LAVA) {
            if (player.isLastBreath) continue;
            if (room.tick < player.invulnerableUntilTick) continue;
            if ((player.flags & FLAG_ABILITY_SHIELD) !== 0) continue;
            const damagePct = Math.max(0, room.balance.zones.lava.damagePctPerSec);
            if (damagePct <= 0) continue;
            const damageTakenMult = room.getDamageTakenMultiplier(player);
            const massLoss = player.mass * damagePct * dt * damageTakenMult;
            if (massLoss > 0 && !room.tryConsumeGuard(player)) {
                room.applyMassDelta(player, -massLoss);
                const scatterPct = Math.max(0, room.balance.zones.lava.scatterPct);
                const scatterMass = massLoss * scatterPct;
                room.spawnLavaOrbs(player, scatterMass);
            }
        }
    }
}
