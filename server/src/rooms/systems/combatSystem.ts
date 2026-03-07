import { FLAG_ABILITY_SHIELD } from "@bonk-race/shared";

/**
 * CombatSystem — боевая система слаймов.
 * Ответственность: укусы, урон, эффекты, Last Breath.
 */

/**
 * Обработка боевого столкновения между двумя слаймами.
 * Вызывается из collisionSystem при контакте игроков.
 */
export function processCombat(
    room: any,
    attacker: any,
    defender: any,
    dx: number,
    dy: number
) {
    if (attacker.isDead || defender.isDead) return;
    if (attacker.stunEndTick > room.tick) return;
    if (room.tick < attacker.lastAttackTick + room.attackCooldownTicks) return;
    // GDD v3.3: GCD между умениями и укусами
    if (room.tick < attacker.gcdReadyTick) return;

    // Неуязвимость защитника - укус не проходит, но GCD применяется
    if (room.tick < defender.invulnerableUntilTick) {
        attacker.lastAttackTick = room.tick;
        attacker.gcdReadyTick = room.tick + room.balance.server.globalCooldownTicks;
        return;
    }

    const attackerZone = room.getContactZone(attacker, dx, dy);
    if (attackerZone !== "mouth") return;

    const defenderZone = room.getContactZone(defender, -dx, -dy);
    let zoneMultiplier = 1;
    if (defenderZone === "tail") {
        zoneMultiplier = room.balance.combat.tailDamageMultiplier;
    } else if (defenderZone === "mouth") {
        const attackerMass = attacker.mass;
        const defenderMass = defender.mass;
        if (!(attackerMass > defenderMass * 1.1)) {
            attacker.lastAttackTick = room.tick;
            attacker.gcdReadyTick = room.tick + room.balance.server.globalCooldownTicks;
            return;
        }
    }

    const classStats = room.getClassStats(attacker);
    const defenderClassStats = room.getClassStats(defender);
    const minSlimeMass = room.balance.physics.minSlimeMass;

    // PvP Bite Formula (из GDD):
    // - attackerGain = attacker.mass * pvpBiteAttackerGainPct (% от СВОЕЙ массы)
    // - scatterMass = defender.mass * pvpBiteScatterPct (% от массы ЖЕРТВЫ)
    // Все модификаторы (damageBonusMult, damageTakenMult, totalResist) применяются
    // СИММЕТРИЧНО к обоим слагаемым (fix slime-arena-mtw).
    // Инвариант: massLoss = attackerGain + scatterMass (масса не создаётся из воздуха)

    const attackerMassBefore = attacker.mass;
    const defenderMassBefore = defender.mass;

    // Модификатор урона атакующего (Острые зубы, Агрессор, Rage, класс)
    let damageBonusMult = room.getDamageBonusMultiplier(attacker, true);
    if (attacker.mod_ambushDamage > 0 && (defenderZone === "side" || defenderZone === "tail")) {
        damageBonusMult = Math.max(0, damageBonusMult + attacker.mod_ambushDamage);
    }

    // Модификатор получаемого урона защитника (Стойкий, Агрессор)
    const damageTakenMult = room.getDamageTakenMultiplier(defender);

    // Защита от укусов: класс + талант (cap 50%)
    const totalResist = Math.min(0.5, defenderClassStats.biteResistPct + defender.biteResistPct);

    // Общий множитель модификаторов (применяется симметрично к gain и scatter)
    const combinedMult = zoneMultiplier * classStats.damageMult * damageBonusMult * damageTakenMult * (1 - totalResist);

    // Раздельные базы: gain от массы АТАКУЮЩЕГО, scatter от массы ЖЕРТВЫ
    let attackerGain = attackerMassBefore * room.balance.combat.pvpBiteAttackerGainPct * combinedMult;
    let scatterMass = defenderMassBefore * room.balance.combat.pvpBiteScatterPct * combinedMult;
    let massLoss = attackerGain + scatterMass;

    attacker.lastAttackTick = room.tick;
    // GDD v3.3: GCD после укуса слайма
    attacker.gcdReadyTick = room.tick + room.balance.server.globalCooldownTicks;

    if ((defender.flags & FLAG_ABILITY_SHIELD) !== 0) {
        applyShieldReflection(room, defender, attacker, massLoss);
        room.clearInvisibility(attacker);
        return;
    }

    if (room.tryConsumeGuard(defender)) {
        room.clearInvisibility(attacker);
        return;
    }

    // Vampire talents: перенаправляют часть scatter в attackerGain.
    // GDD: "Вампир: бок 10% -> 20%, хвост 15% -> 25%"
    // vampirePct — целевой % массы жертвы, который атакующий получает.
    // Бонус = (vampirePct - baseGainPct) * defenderMassBefore * combinedMult,
    // берётся за счёт scatter (масса не создаётся).
    {
        let vampirePct = 0;
        if (attacker.mod_vampireSideGainPct > 0 && defenderZone === "side") {
            vampirePct = attacker.mod_vampireSideGainPct;
        } else if (attacker.mod_vampireTailGainPct > 0 && defenderZone === "tail") {
            vampirePct = attacker.mod_vampireTailGainPct;
        }
        if (vampirePct > 0) {
            const baseGainPct = room.balance.combat.pvpBiteAttackerGainPct;
            const bonusPct = vampirePct - baseGainPct;
            if (bonusPct > 0 && scatterMass > 0) {
                // Бонус Вампира считается от массы жертвы (как scatter)
                const transferred = Math.min(scatterMass, defenderMassBefore * bonusPct * combinedMult);
                attackerGain += transferred;
                scatterMass -= transferred;
            }
        }
    }

    // Пересчитываем massLoss после vampire talents
    massLoss = attackerGain + scatterMass;

    // Проверка Last Breath: если масса упадёт ниже минимума
    const newDefenderMass = defender.mass - massLoss;
    const triggersLastBreath =
        newDefenderMass <= minSlimeMass &&
        !defender.isLastBreath &&
        room.lastBreathTicks > 0 &&
        !defender.isDead;

    // При Last Breath ограничиваем потерю и масштабируем награды пропорционально
    if (triggersLastBreath) {
        const maxLoss = Math.max(0, defender.mass - minSlimeMass);
        if (massLoss > 0) {
            const scale = maxLoss / massLoss;
            attackerGain *= scale;
            scatterMass *= scale;
            massLoss = maxLoss;
        }
    }

    // Применяем потерю массы жертвы
    room.applyMassDelta(defender, -massLoss);
    const defenderMassAfter = defender.mass;
    const actualLoss = defenderMassBefore - defenderMassAfter;

    // ИНВАРИАНТ: масштабируем награды по фактической потере (после clamp в applyMassDelta)
    // Это гарантирует, что масса не создаётся из воздуха
    if (massLoss > 0 && actualLoss < massLoss) {
        const scale = actualLoss / massLoss;
        attackerGain *= scale;
        scatterMass *= scale;
    }

    // Применяем прибыль атакующему
    room.applyMassDelta(attacker, attackerGain);
    defender.lastDamagedById = attacker.id;
    defender.lastDamagedAtTick = room.tick;

    // Талант "Шипы" (Warrior): отражение урона атакующему
    if (defender.mod_thornsDamage > 0 && actualLoss > 0) {
        const reflectedDamage = actualLoss * defender.mod_thornsDamage;
        if (reflectedDamage > 0 && !room.tryConsumeGuard(attacker)) {
            room.applyMassDelta(attacker, -reflectedDamage);
            // Scatter orbs цвета атакующего от отражённого урона
            const scatterReflected = reflectedDamage * room.balance.combat.pvpBiteScatterPct;
            spawnPvPBiteOrbs(room, attacker.x, attacker.y, scatterReflected, room.getDamageOrbColorId(attacker));
        }
    }

    // Талант "Паразит" (Collector): кража массы при нанесении урона
    if (attacker.mod_parasiteMass > 0 && actualLoss > 0) {
        const stolenMass = actualLoss * attacker.mod_parasiteMass;
        room.applyMassDelta(attacker, stolenMass);
    }

    // Scatter orbs: разлёт пузырей цвета жертвы
    if (scatterMass > 0) {
        spawnPvPBiteOrbs(room, defender.x, defender.y, scatterMass, room.getDamageOrbColorId(defender));
    }

    if (attacker.mod_poisonDamagePctPerSec > 0 && attacker.mod_poisonDurationSec > 0) {
        defender.poisonDamagePctPerSec = Math.max(
            defender.poisonDamagePctPerSec,
            attacker.mod_poisonDamagePctPerSec
        );
        defender.poisonEndTick = Math.max(
            defender.poisonEndTick,
            room.tick + room.secondsToTicks(attacker.mod_poisonDurationSec)
        );
    }

    if (attacker.mod_frostSlowPct > 0 && attacker.mod_frostDurationSec > 0) {
        defender.frostSlowPct = Math.max(defender.frostSlowPct, attacker.mod_frostSlowPct);
        defender.frostEndTick = Math.max(
            defender.frostEndTick,
            room.tick + room.secondsToTicks(attacker.mod_frostDurationSec)
        );
    }

    if (attacker.mod_lightningStunSec > 0) {
        defender.stunEndTick = Math.max(
            defender.stunEndTick,
            room.tick + room.secondsToTicks(attacker.mod_lightningStunSec)
        );
    }

    room.clearInvisibility(attacker);

    // Активируем Last Breath после применения массы
    if (triggersLastBreath) {
        defender.isLastBreath = true;
        defender.lastBreathEndTick = room.tick + room.lastBreathTicks;
        defender.invulnerableUntilTick = defender.lastBreathEndTick;
        return;
    }

    defender.invulnerableUntilTick = room.tick + room.invulnerableTicks;
}

/**
 * Отражение урона щитом.
 */
export function applyShieldReflection(
    room: any,
    defender: any,
    attacker: any,
    incomingLoss: number
) {
    if (incomingLoss <= 0) return;
    if (attacker.isDead || attacker.isLastBreath) return;
    if (room.tick < attacker.invulnerableUntilTick) return;

    const shieldLevel = room.getAbilityLevelForAbility(defender, "shield") || 1;
    const shieldConfig = room.getAbilityConfigById("shield", shieldLevel);
    const reflectPct = Math.max(0, Number(shieldConfig.reflectDamagePct ?? 0));
    if (reflectPct <= 0) return;

    const reflectedDamage = incomingLoss * reflectPct;
    if (reflectedDamage <= 0) return;

    if (room.tryConsumeGuard(attacker)) return;

    room.applyMassDelta(attacker, -reflectedDamage);
    attacker.lastDamagedById = defender.id;
    attacker.lastDamagedAtTick = room.tick;
    spawnPvPBiteOrbs(room, attacker.x, attacker.y, reflectedDamage * 0.5, room.getDamageOrbColorId(attacker));
}

/**
 * Создаёт орбы, разлетающиеся от точки укуса PvP.
 * Эти орбы игнорируют maxCount - боевая механика важнее лимита.
 * @param colorId - colorId орбов (classId + 10 или золотой для Короля)
 */
export function spawnPvPBiteOrbs(
    room: any,
    x: number,
    y: number,
    totalMass: number,
    colorId?: number
): void {
    const count = room.balance.combat.pvpBiteScatterOrbCount;
    const minOrbMass = room.balance.combat.scatterOrbMinMass ?? 5;
    if (count <= 0 || totalMass <= 0) return;
    if (totalMass < minOrbMass) return;

    // Если общая масса слишком мала - не создаём мелкие орбы
    const perOrbMass = totalMass / count;
    if (perOrbMass < minOrbMass) {
        // Объединяем в меньшее количество орбов с минимальной массой
        const actualCount = Math.floor(totalMass / minOrbMass);
        if (actualCount <= 0) return; // Масса слишком мала даже для 1 орба

        const actualPerOrb = totalMass / actualCount;
        const angleStep = (Math.PI * 2) / actualCount;
        const speed = room.balance.combat.pvpBiteScatterSpeed;

        for (let i = 0; i < actualCount; i++) {
            const angle = i * angleStep + room.rng.range(-0.3, 0.3);
            const orb = room.forceSpawnOrb(x, y, actualPerOrb, colorId);
            orb.vx = Math.cos(angle) * speed;
            orb.vy = Math.sin(angle) * speed;
        }
        return;
    }

    const angleStep = (Math.PI * 2) / count;
    const speed = room.balance.combat.pvpBiteScatterSpeed;

    for (let i = 0; i < count; i++) {
        const angle = i * angleStep + room.rng.range(-0.3, 0.3);
        // Force spawn: scatter orbs игнорируют maxCount
        const orb = room.forceSpawnOrb(x, y, perOrbMass, colorId);
        orb.vx = Math.cos(angle) * speed;
        orb.vy = Math.sin(angle) * speed;
    }
}

/**
 * Урон от снаряда (projectile).
 */
export function applyProjectileDamage(
    room: any,
    attacker: any,
    defender: any,
    damagePct: number
) {
    const minSlimeMass = room.balance.physics.minSlimeMass;

    // Защита от укусов применяется и к снарядам
    const defenderClassStats = room.getClassStats(defender);
    const totalResist = Math.min(0.5, defenderClassStats.biteResistPct + defender.biteResistPct);

    const damageBonusMult = room.getDamageBonusMultiplier(attacker, false);
    const damageTakenMult = room.getDamageTakenMultiplier(defender);
    let massLoss = defender.mass * damagePct * damageBonusMult * damageTakenMult * (1 - totalResist);

    // Last Breath check
    const newDefenderMass = defender.mass - massLoss;
    const triggersLastBreath =
        newDefenderMass <= minSlimeMass &&
        !defender.isLastBreath &&
        room.lastBreathTicks > 0 &&
        !defender.isDead;

    if (triggersLastBreath) {
        massLoss = Math.max(0, defender.mass - minSlimeMass);
    }

    if ((defender.flags & FLAG_ABILITY_SHIELD) !== 0) {
        applyShieldReflection(room, defender, attacker, massLoss);
        return;
    }

    if (room.tryConsumeGuard(defender)) {
        return;
    }

    // Снаряд не даёт массу атакующему (только урон)
    room.applyMassDelta(defender, -massLoss);
    defender.lastDamagedById = attacker.id;
    defender.lastDamagedAtTick = room.tick;

    // Scatter orbs цвета жертвы от урона снаряда
    if (massLoss > 0) {
        spawnPvPBiteOrbs(room, defender.x, defender.y, massLoss * 0.5, room.getDamageOrbColorId(defender));
    }

    if (triggersLastBreath) {
        defender.isLastBreath = true;
        defender.lastBreathEndTick = room.tick + room.lastBreathTicks;
        defender.invulnerableUntilTick = defender.lastBreathEndTick;
        return;
    }

    defender.invulnerableUntilTick = room.tick + room.invulnerableTicks;
}

/**
 * Самоурон (от своей мины) - без передачи массы, но с Last Breath
 */
export function applySelfDamage(room: any, player: any, damagePct: number) {
    const minSlimeMass = room.balance.physics.minSlimeMass;

    let massLoss = player.mass * damagePct;

    // Last Breath check
    const newMass = player.mass - massLoss;
    const triggersLastBreath =
        newMass <= minSlimeMass &&
        !player.isLastBreath &&
        room.lastBreathTicks > 0 &&
        !player.isDead;

    if (triggersLastBreath) {
        massLoss = Math.max(0, player.mass - minSlimeMass);
    }

    room.applyMassDelta(player, -massLoss);

    // Scatter orbs от самоурона
    if (massLoss > 0) {
        spawnPvPBiteOrbs(room, player.x, player.y, massLoss * 0.5, room.getDamageOrbColorId(player));
    }

    if (triggersLastBreath) {
        player.isLastBreath = true;
        player.lastBreathEndTick = room.tick + room.lastBreathTicks;
        player.invulnerableUntilTick = player.lastBreathEndTick;
        return;
    }

    player.invulnerableUntilTick = room.tick + room.invulnerableTicks;
}

/**
 * Взрыв бомбы - AoE урон всем в радиусе
 */
export function explodeBomb(room: any, proj: any) {
    const owner = room.state.players.get(proj.ownerId);
    if (!owner || owner.isDead) return;

    const radiusSq = proj.explosionRadiusM * proj.explosionRadiusM;

    for (const player of room.state.players.values()) {
        if (player.isDead || player.id === proj.ownerId) continue;
        if (player.isLastBreath) continue;
        if (room.tick < player.invulnerableUntilTick) continue;

        const dx = player.x - proj.x;
        const dy = player.y - proj.y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= radiusSq) {
            applyProjectileDamage(room, owner, player, proj.damagePct);
        }
    }
}
