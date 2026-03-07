/**
 * TalentModifierCalculator - пересчёт модификаторов игрока на основе талантов
 *
 * Извлечено из ArenaRoom.ts для улучшения модульности.
 * Детерминизм: функция чистая, не использует random.
 */

import { Player } from "../../schema/GameState";
import { TalentConfig, ClassTalentConfig } from "@bonk-race/shared";

export interface TalentBalanceConfig {
    common: Record<string, TalentConfig>;
    rare: Record<string, TalentConfig>;
    epic: Record<string, TalentConfig>;
    classTalents: Record<string, Record<string, ClassTalentConfig>>;
}

/**
 * Получает конфиг таланта по ID.
 * Ищет в common, rare, epic, и classTalents.
 */
export function getTalentConfig(
    talentId: string,
    balance: TalentBalanceConfig,
    className: string
): TalentConfig | ClassTalentConfig | null {
    // Проверяем common
    if (balance.common[talentId]) return balance.common[talentId];
    // Проверяем rare
    if (balance.rare[talentId]) return balance.rare[talentId];
    // Проверяем epic
    if (balance.epic[talentId]) return balance.epic[talentId];
    // Проверяем классовые таланты
    const classTalents = balance.classTalents[className];
    if (classTalents && classTalents[talentId]) return classTalents[talentId];
    return null;
}

/**
 * Пересчитывает все модификаторы игрока на основе его талантов.
 * Вызывается после добавления/изменения талантов.
 */
export function recalculateTalentModifiers(
    player: Player,
    balance: TalentBalanceConfig,
    getClassName: (classId: number) => string
): void {
    // Сбрасываем модификаторы
    player.mod_speedLimitBonus = 0;
    player.mod_turnBonus = 0;
    player.mod_biteDamageBonus = 0;
    player.mod_damageBonus = 0;
    player.mod_damageTakenBonus = 0;
    player.mod_orbMassBonus = 0;
    player.mod_abilityCostReduction = 0;
    player.mod_cooldownReduction = 0;
    player.mod_allDamageReduction = 0;
    player.mod_thrustForwardBonus = 0;
    player.mod_thrustReverseBonus = 0;
    player.mod_thrustLateralBonus = 0;
    player.mod_killMassBonus = 0;
    player.mod_respawnMass = 100; // Default
    player.mod_dashDistanceBonus = 0;
    player.mod_vacuumRadius = 0;
    player.mod_vacuumSpeed = 0;
    player.mod_poisonDamagePctPerSec = 0;
    player.mod_poisonDurationSec = 0;
    player.mod_frostSlowPct = 0;
    player.mod_frostDurationSec = 0;
    player.mod_vampireSideGainPct = 0;
    player.mod_vampireTailGainPct = 0;
    player.mod_projectileRicochet = 0;
    player.mod_projectilePiercingDamagePct = 0;
    player.mod_projectilePiercingHits = 0;
    player.mod_lightningSpeedBonus = 0;
    player.mod_lightningStunSec = 0;
    player.mod_doubleAbilityWindowSec = 0;
    player.mod_doubleAbilitySecondCostMult = 1;
    player.mod_deathExplosionRadiusM = 0;
    player.mod_deathExplosionDamagePct = 0;
    player.mod_leviathanRadiusMul = 1;
    player.mod_leviathanMouthMul = 1;
    player.mod_invisibleDurationSec = 0;
    player.mod_deathNeedlesCount = 0;
    player.mod_deathNeedlesDamagePct = 0;
    player.mod_toxicPoolBonus = 1;
    player.biteResistPct = 0;

    // New class talent modifiers
    player.mod_thornsDamage = 0;
    player.mod_ambushDamage = 0;
    player.mod_parasiteMass = 0;
    player.mod_magnetRadius = 0;
    player.mod_magnetSpeed = 0;

    const className = getClassName(player.classId);

    // Применяем каждый талант
    for (const talent of player.talents) {
        const config = getTalentConfig(talent.id, balance, className);
        if (!config) continue;

        const level = talent.level;
        const values = config.values;

        // Получаем значение для текущего уровня
        let value: number | number[] = 0;
        if (Array.isArray(values)) {
            if (level <= values.length) {
                value = values[level - 1];
            }
        } else {
            value = values;
        }

        // Применяем эффект
        applyTalentEffect(player, config.effect, value);
    }

    // Применяем cap на biteResistPct (max 50%)
    player.biteResistPct = Math.min(player.biteResistPct, 0.5);
}

/**
 * Применяет эффект таланта к игроку.
 */
function applyTalentEffect(
    player: Player,
    effect: string,
    value: number | number[]
): void {
    switch (effect) {
        case "speedLimitBonus":
            player.mod_speedLimitBonus += typeof value === "number" ? value : 0;
            break;
        case "turnBonus":
            player.mod_turnBonus += typeof value === "number" ? value : 0;
            break;
        case "biteDamageBonus":
            player.mod_biteDamageBonus += typeof value === "number" ? value : 0;
            break;
        case "orbMassBonus":
            player.mod_orbMassBonus += typeof value === "number" ? value : 0;
            break;
        case "biteResistBonus":
            player.biteResistPct += typeof value === "number" ? value : 0;
            break;
        case "abilityCostReduction":
            player.mod_abilityCostReduction += typeof value === "number" ? value : 0;
            break;
        case "cooldownReduction":
            player.mod_cooldownReduction += typeof value === "number" ? value : 0;
            break;
        case "allDamageReduction":
            player.mod_allDamageReduction += typeof value === "number" ? value : 0;
            break;
        case "thrustForwardBonus":
            player.mod_thrustForwardBonus += typeof value === "number" ? value : 0;
            break;
        case "thrustReverseBonus":
            player.mod_thrustReverseBonus += typeof value === "number" ? value : 0;
            break;
        case "thrustLateralBonus":
            player.mod_thrustLateralBonus += typeof value === "number" ? value : 0;
            break;
        case "killMassBonus":
            player.mod_killMassBonus += typeof value === "number" ? value : 0;
            break;
        case "respawnMass":
            player.mod_respawnMass = typeof value === "number" ? value : 100;
            break;
        case "aggressorDual":
            player.mod_damageBonus += typeof value === "number" ? value : 0;
            player.mod_damageTakenBonus += typeof value === "number" ? value : 0;
            break;
        case "allThrustBonus": {
            const motorBonus = typeof value === "number" ? value : 0;
            player.mod_thrustForwardBonus += motorBonus;
            player.mod_thrustReverseBonus += motorBonus;
            player.mod_thrustLateralBonus += motorBonus;
            break;
        }
        case "poisonOnBite":
            if (Array.isArray(value)) {
                player.mod_poisonDamagePctPerSec = Number(value[0] ?? 0);
                player.mod_poisonDurationSec = Number(value[1] ?? 0);
            }
            break;
        case "frostOnBite":
            if (Array.isArray(value)) {
                player.mod_frostSlowPct = Number(value[0] ?? 0);
                player.mod_frostDurationSec = Number(value[1] ?? 0);
            }
            break;
        case "vampireBite":
            if (Array.isArray(value)) {
                player.mod_vampireSideGainPct = Number(value[0] ?? 0);
                player.mod_vampireTailGainPct = Number(value[1] ?? 0);
            }
            break;
        case "vacuumOrbs":
            if (Array.isArray(value)) {
                player.mod_vacuumRadius = Number(value[0] ?? 0);
                player.mod_vacuumSpeed = Number(value[1] ?? 0);
            }
            break;
        case "projectileRicochet":
            player.mod_projectileRicochet = typeof value === "number" ? value : 0;
            break;
        case "projectilePiercing":
            if (Array.isArray(value)) {
                const extraHits = Math.max(0, Number(value[0] ?? 0));
                player.mod_projectilePiercingHits = 1 + extraHits;
                player.mod_projectilePiercingDamagePct = Number(value[1] ?? 0);
            }
            break;
        case "dashDistanceBonus":
            player.mod_dashDistanceBonus += typeof value === "number" ? value : 0;
            break;
        case "deathNeedles":
            if (Array.isArray(value)) {
                player.mod_deathNeedlesCount = Math.max(0, Math.round(Number(value[0] ?? 0)));
                player.mod_deathNeedlesDamagePct = Number(value[1] ?? 0);
            }
            break;
        case "toxicPoolBonus":
            player.mod_toxicPoolBonus = typeof value === "number" ? value : 1;
            break;
        case "lightningSpeed":
            if (Array.isArray(value)) {
                player.mod_lightningSpeedBonus = Number(value[0] ?? 0);
                player.mod_lightningStunSec = Number(value[1] ?? 0);
            }
            break;
        case "doubleAbility":
            if (Array.isArray(value)) {
                player.mod_doubleAbilityWindowSec = Number(value[0] ?? 0);
                player.mod_doubleAbilitySecondCostMult = Number(value[1] ?? 1);
            }
            break;
        case "deathExplosion":
            if (Array.isArray(value)) {
                player.mod_deathExplosionRadiusM = Number(value[0] ?? 0);
                player.mod_deathExplosionDamagePct = Number(value[1] ?? 0);
            }
            break;
        case "leviathanSize":
            if (Array.isArray(value)) {
                player.mod_leviathanRadiusMul = Number(value[0] ?? 1);
                player.mod_leviathanMouthMul = Number(value[1] ?? 1);
            }
            break;
        case "invisibleAfterDash":
            player.mod_invisibleDurationSec = typeof value === "number" ? value : 0;
            break;
        // Class talent effects
        case "thornsDamage":
            player.mod_thornsDamage = typeof value === "number" ? value : 0;
            break;
        case "ambushDamage":
            player.mod_ambushDamage = typeof value === "number" ? value : 0;
            break;
        case "parasiteMass":
            player.mod_parasiteMass = typeof value === "number" ? value : 0;
            break;
        case "magnetOrbs":
            if (Array.isArray(value)) {
                player.mod_magnetRadius = Number(value[0] ?? 0);
                player.mod_magnetSpeed = Number(value[1] ?? 0);
            }
            break;
    }
}
