import {
    FLAG_DASHING,
    FLAG_ABILITY_SHIELD,
    FLAG_MAGNETIZING,
} from "@bonk-race/shared";
import { SlowZone, Projectile, Mine } from "../schema/GameState";

/**
 * AbilityActivationSystem — активация умений слаймов.
 * Ответственность: активация, кулдауны, создание снарядов/мин/зон.
 */

/**
 * Активация умения по слоту.
 */
export function activateAbility(room: any, player: any, slot: number) {
    // GDD v3.3 1.3: Слоты 0-2, проверяем наличие умения в слоте
    if (slot < 0 || slot > 2) return;

    // Получаем ID умения из слота
    const slotAbilities = [player.abilitySlot0, player.abilitySlot1, player.abilitySlot2];
    const abilityId = slotAbilities[slot];

    // Слот пустой - не активируем
    if (!abilityId) return;

    const canDoubleActivate = isDoubleAbilityAvailable(room, player, slot);
    const cooldownEndTick = getAbilityCooldownEndTick(player, slot);
    if (!canDoubleActivate && room.tick < cooldownEndTick) return;

    const abilityLevel = getAbilityLevelForSlot(player, slot) || 1;
    const tickRate = room.balance.server.tickRate;
    let activated = false;
    let cooldownSec = 0;
    const costMultiplier = canDoubleActivate
        ? Math.max(player.mod_doubleAbilitySecondCostMult || 0, 0)
        : 1;

    // Активация по ID умения
    switch (abilityId) {
        case "dash":
            {
                const config = room.getAbilityConfigById("dash", abilityLevel);
                activated = activateDash(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "shield":
            {
                const config = room.getAbilityConfigById("shield", abilityLevel);
                activated = activateShield(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "slow":
            {
                const config = room.getAbilityConfigById("slow", abilityLevel);
                activated = activateSlow(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "projectile":
            {
                const config = room.getAbilityConfigById("projectile", abilityLevel);
                activated = activateProjectile(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "pull":
            {
                const config = room.getAbilityConfigById("pull", abilityLevel);
                activated = activateMagnet(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "spit":
            {
                const config = room.getAbilityConfigById("spit", abilityLevel);
                activated = activateSpit(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "bomb":
            {
                const config = room.getAbilityConfigById("bomb", abilityLevel);
                activated = activateBomb(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "push":
            {
                const config = room.getAbilityConfigById("push", abilityLevel);
                activated = activatePush(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        case "mine":
            {
                const config = room.getAbilityConfigById("mine", abilityLevel);
                activated = activateMine(room, player, config, tickRate, costMultiplier);
                cooldownSec = getAbilityCooldownSec(room, player, config.cooldownSec);
            }
            break;
        default:
            return;  // Неизвестное умение
    }

    if (!activated) return;

    room.logTelemetry("ability_used", { abilityId, slot, level: abilityLevel });

    if (abilityId !== "dash") {
        room.clearInvisibility(player);
    }

    const cooldownTicks = room.secondsToTicks(cooldownSec);
    setAbilityCooldown(room, player, slot, room.tick, room.tick + cooldownTicks);
    player.gcdReadyTick = room.tick + room.balance.server.globalCooldownTicks;
    player.queuedAbilitySlot = null;

    if (canDoubleActivate) {
        completeDoubleAbility(player);
    } else {
        startDoubleAbilityWindow(room, player, slot);
    }
}

// --- Cooldown helpers ---

function getAbilityCooldownEndTick(player: any, slot: number): number {
    switch (slot) {
        case 0:
            return player.abilityCooldownEndTick0;
        case 1:
            return player.abilityCooldownEndTick1;
        case 2:
            return player.abilityCooldownEndTick2;
        default:
            return 0;
    }
}

function setAbilityCooldown(room: any, player: any, slot: number, startTick: number, endTick: number) {
    const start = Math.max(0, Math.floor(startTick));
    const end = Math.max(start, Math.floor(endTick));
    switch (slot) {
        case 0:
            player.abilityCooldownStartTick0 = start;
            player.abilityCooldownEndTick0 = end;
            break;
        case 1:
            player.abilityCooldownStartTick1 = start;
            player.abilityCooldownEndTick1 = end;
            break;
        case 2:
            player.abilityCooldownStartTick2 = start;
            player.abilityCooldownEndTick2 = end;
            break;
        default:
            return;
    }
    updateLegacyAbilityCooldownTick(player);
}

export function resetAbilityCooldowns(player: any, tick: number) {
    const safeTick = Math.max(0, Math.floor(tick));
    player.abilityCooldownStartTick0 = safeTick;
    player.abilityCooldownEndTick0 = safeTick;
    player.abilityCooldownStartTick1 = safeTick;
    player.abilityCooldownEndTick1 = safeTick;
    player.abilityCooldownStartTick2 = safeTick;
    player.abilityCooldownEndTick2 = safeTick;
    updateLegacyAbilityCooldownTick(player);
}

function updateLegacyAbilityCooldownTick(player: any) {
    player.abilityCooldownTick = player.abilityCooldownEndTick0;
}

export function getAbilityLevelForSlot(player: any, slot: number): number {
    if (slot === 0) return Math.max(0, Math.floor(player.abilityLevel0));
    if (slot === 1) return Math.max(0, Math.floor(player.abilityLevel1));
    if (slot === 2) return Math.max(0, Math.floor(player.abilityLevel2));
    return 0;
}

export function setAbilityLevelForSlot(player: any, slot: number, level: number) {
    const value = Math.max(1, Math.min(3, Math.floor(level)));
    if (slot === 0) {
        player.abilityLevel0 = value;
        return;
    }
    if (slot === 1) {
        player.abilityLevel1 = value;
        return;
    }
    if (slot === 2) {
        player.abilityLevel2 = value;
        return;
    }
    console.warn(`[setAbilityLevelForSlot] invalid slot ${slot}`);
}

function getAbilityCostPct(room: any, player: any, basePct: number, extraMultiplier = 1): number {
    const reduction = clamp(player.mod_abilityCostReduction, 0, 0.9);
    const multiplier = Math.max(0, extraMultiplier);
    const reducedPct = basePct * (1 - reduction) * multiplier;
    return Math.max(reducedPct, 0.01);
}

function getAbilityCooldownSec(room: any, player: any, baseCooldownSec: number): number {
    const reduction = clamp(player.mod_cooldownReduction, 0, 0.9);
    return Math.max(0.1, baseCooldownSec * (1 - reduction));
}

// --- Double ability ---

function isDoubleAbilityAvailable(room: any, player: any, slot: number): boolean {
    return (
        player.mod_doubleAbilityWindowSec > 0 &&
        player.doubleAbilityWindowEndTick > room.tick &&
        player.doubleAbilitySlot === slot &&
        !player.doubleAbilitySecondUsed
    );
}

function startDoubleAbilityWindow(room: any, player: any, slot: number) {
    if (player.mod_doubleAbilityWindowSec <= 0) return;
    player.doubleAbilityWindowEndTick = room.tick + room.secondsToTicks(player.mod_doubleAbilityWindowSec);
    player.doubleAbilitySlot = slot;
    player.doubleAbilitySecondUsed = false;
}

function completeDoubleAbility(player: any) {
    player.doubleAbilityWindowEndTick = 0;
    player.doubleAbilitySlot = null;
    player.doubleAbilitySecondUsed = true;
}

// --- Utility ---

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

// --- Ability activations ---

function activateDash(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Расчёт направления рывка (по текущему углу слайма)
    const angle = player.angle;
    const distance = config.distanceM * (1 + player.mod_dashDistanceBonus);
    const rawTargetX = player.x + Math.cos(angle) * distance;
    const rawTargetY = player.y + Math.sin(angle) * distance;

    // Ограничение к границам мира
    const clamped = room.clampPointToWorld(rawTargetX, rawTargetY);
    player.dashTargetX = clamped.x;
    player.dashTargetY = clamped.y;
    player.dashEndTick = room.tick + Math.round(config.durationSec * tickRate);

    // Устанавливаем флаг
    player.flags |= FLAG_DASHING;

    if (player.mod_invisibleDurationSec > 0) {
        player.invisibleEndTick = room.tick + room.secondsToTicks(player.mod_invisibleDurationSec);
    }
    return true;
}

function activateShield(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Устанавливаем длительность щита
    player.shieldEndTick = room.tick + Math.round(config.durationSec * tickRate);

    // Устанавливаем флаг
    player.flags |= FLAG_ABILITY_SHIELD;
    return true;
}

function activateMagnet(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Устанавливаем длительность притяжения
    player.magnetEndTick = room.tick + Math.round(config.durationSec * tickRate);

    // Устанавливаем флаг
    player.flags |= FLAG_MAGNETIZING;
    return true;
}

function activateSlow(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Создаём зону замедления
    const zone = new SlowZone();
    zone.id = `slow_${++room.slowZoneIdCounter}`;
    zone.ownerId = player.id;
    zone.x = player.x;
    zone.y = player.y;
    zone.radius = config.radiusM;
    zone.slowPct = config.slowPct;
    zone.endTick = room.tick + Math.round(config.durationSec * tickRate);

    room.state.slowZones.set(zone.id, zone);
    return true;
}

function activateProjectile(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Создаём снаряд
    const proj = new Projectile();
    proj.id = `proj_${++room.projectileIdCounter}`;
    proj.ownerId = player.id;
    proj.x = player.x;
    proj.y = player.y;
    proj.startX = player.x;
    proj.startY = player.y;
    proj.vx = Math.cos(player.angle) * config.speedMps;
    proj.vy = Math.sin(player.angle) * config.speedMps;
    proj.radius = config.radiusM;
    proj.damagePct = config.damagePct;
    proj.spawnTick = room.tick;
    proj.maxRangeM = config.rangeM;
    if (player.mod_projectileRicochet > 0) {
        proj.remainingRicochets = Math.round(player.mod_projectileRicochet);
    }
    const basePierceHits = Math.max(0, Math.round(config.piercingHits ?? 0));
    const basePierceDamagePct = Math.max(0, Number(config.piercingDamagePct ?? 0));
    const talentPierceHits = Math.max(0, Math.round(player.mod_projectilePiercingHits || 0));
    const talentPierceDamagePct = Math.max(0, Number(player.mod_projectilePiercingDamagePct || 0));
    // Пробивание берётся как максимум между умением и талантом, без суммирования.
    const totalPierceHits = Math.max(basePierceHits, talentPierceHits);
    const totalPierceDamagePct = Math.max(basePierceDamagePct, talentPierceDamagePct);
    if (totalPierceHits > 1) {
        proj.remainingPierces = totalPierceHits;
        proj.piercingDamagePct = totalPierceDamagePct;
    }

    room.state.projectiles.set(proj.id, proj);
    return true;
}

function activateSpit(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Создаём веер снарядов
    const count = config.projectileCount;
    const spreadRad = (config.spreadAngleDeg * Math.PI) / 180;
    const startAngle = player.angle - spreadRad / 2;
    const angleStep = count > 1 ? spreadRad / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
        const angle = startAngle + angleStep * i;
        const proj = new Projectile();
        proj.id = `proj_${++room.projectileIdCounter}`;
        proj.ownerId = player.id;
        proj.x = player.x;
        proj.y = player.y;
        proj.startX = player.x;
        proj.startY = player.y;
        proj.vx = Math.cos(angle) * config.speedMps;
        proj.vy = Math.sin(angle) * config.speedMps;
        proj.radius = config.radiusM;
        proj.damagePct = config.damagePct;
        proj.spawnTick = room.tick;
        proj.maxRangeM = config.rangeM;
        proj.projectileType = 0;

        room.state.projectiles.set(proj.id, proj);
    }
    return true;
}

function activateBomb(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Создаём бомбу (медленный снаряд с AoE)
    const proj = new Projectile();
    proj.id = `proj_${++room.projectileIdCounter}`;
    proj.ownerId = player.id;
    proj.x = player.x;
    proj.y = player.y;
    proj.startX = player.x;
    proj.startY = player.y;
    proj.vx = Math.cos(player.angle) * config.speedMps;
    proj.vy = Math.sin(player.angle) * config.speedMps;
    proj.radius = config.radiusM;
    proj.damagePct = config.damagePct;
    proj.spawnTick = room.tick;
    proj.maxRangeM = config.rangeM;
    proj.projectileType = 1;  // Bomb type
    proj.explosionRadiusM = config.explosionRadiusM;

    room.state.projectiles.set(proj.id, proj);
    return true;
}

export function applyPushWave(
    room: any,
    sourceX: number,
    sourceY: number,
    radiusM: number,
    impulseNs: number,
    minSpeedMps: number,
    maxSpeedMps: number,
    excludeId?: string
) {
    if (radiusM <= 0 || impulseNs <= 0) return;
    const radiusSq = radiusM * radiusM;

    for (const other of room.state.players.values()) {
        if (excludeId && other.id === excludeId) continue;
        if (other.isDead) continue;
        const dx = other.x - sourceX;
        const dy = other.y - sourceY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq || distSq < 0.01) continue;
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const otherMass = Math.max(other.mass, room.balance.physics.minSlimeMass);
        const speed = clamp(impulseNs / otherMass, minSpeedMps, maxSpeedMps);
        other.vx += nx * speed;
        other.vy += ny * speed;
    }

    for (const orb of room.state.orbs.values()) {
        const dx = orb.x - sourceX;
        const dy = orb.y - sourceY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq || distSq < 0.01) continue;
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const orbMass = Math.max(orb.mass, 1);
        const speed = clamp(impulseNs / orbMass, 50, 200);
        orb.vx += nx * speed;
        orb.vy += ny * speed;
    }

    for (const chest of room.state.chests.values()) {
        const dx = chest.x - sourceX;
        const dy = chest.y - sourceY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq || distSq < 0.01) continue;
        const dist = Math.sqrt(distSq);
        const nx = dx / dist;
        const ny = dy / dist;
        const chestTypeId = chest.type === 0 ? "rare" : chest.type === 1 ? "epic" : "gold";
        const chestMass = Math.max(room.balance.chests.types?.[chestTypeId]?.mass ?? 250, 100);
        const speed = clamp(impulseNs / chestMass, 20, 80);
        chest.vx += nx * speed;
        chest.vy += ny * speed;
    }
}

function activatePush(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    player.pushEndTick = room.tick + Math.max(1, Math.round(0.25 * tickRate));
    applyPushWave(
        room,
        player.x,
        player.y,
        config.radiusM,
        config.impulseNs,
        config.minSpeedMps,
        config.maxSpeedMps,
        player.id
    );
    return true;
}

function activateMine(
    room: any,
    player: any,
    config: any,
    tickRate: number,
    costMultiplier = 1
): boolean {
    const massCost = player.mass * getAbilityCostPct(room, player, config.massCostPct, costMultiplier);
    if (player.mass - massCost < room.balance.physics.minSlimeMass) return false;

    // Проверяем лимит мин
    let mineCount = 0;
    for (const mine of room.state.mines.values()) {
        if (mine.ownerId === player.id) mineCount++;
    }

    // Удаляем старую мину если достигнут лимит
    if (mineCount >= config.maxMines) {
        for (const [id, mine] of room.state.mines.entries()) {
            if (mine.ownerId === player.id) {
                room.state.mines.delete(id);
                break;
            }
        }
    }

    // Списываем массу
    room.applyMassDelta(player, -massCost);

    // Создаём мину
    const mine = new Mine();
    mine.id = `mine_${++room.mineIdCounter}`;
    mine.ownerId = player.id;
    mine.x = player.x;
    mine.y = player.y;
    mine.radius = config.radiusM;
    mine.damagePct = config.damagePct;
    mine.endTick = room.tick + Math.round(config.durationSec * tickRate);

    room.state.mines.set(mine.id, mine);
    return true;
}
