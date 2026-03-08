/**
 * TalentGenerator - генерация карточек талантов
 *
 * Извлечено из ArenaRoom.ts для улучшения модульности.
 * Детерминизм: использует переданный Rng для всех random операций.
 */

import { Player, TalentCard } from "../../schema/GameState";
import { TalentConfig, ClassTalentConfig, Rng } from "@bonk-race/shared";
import { TalentBalanceConfig } from "./TalentModifierCalculator";

export interface TalentGeneratorConfig {
    cardChoiceTimeoutSec: number;
    talentRarityByLevel: Record<string, { common: number; rare: number; epic: number }>;
    talentPool: {
        common: string[];
        rare: string[];
        epic: string[];
    };
    abilityUpgradeChance?: number;
}

export interface TalentGeneratorDeps {
    rng: Rng;
    currentTick: number;
    secondsToTicks: (seconds: number) => number;
    getClassName: (classId: number) => string;
    getAbilityLevelForSlot: (player: Player, slot: number) => number;
    clamp: (value: number, min: number, max: number) => number;
}

type TalentItem = {
    id: string;
    rarity: number;
    category?: string;
    kind: "talent";
};

type UpgradeItem = {
    id: string;
    rarity: number;
    kind: "upgrade";
    abilityId: string;
    level: number;
};

type CardItem = TalentItem | UpgradeItem;

/**
 * Генерирует карточку талантов для игрока.
 * Возвращает true если карточка была создана.
 */
export function generateTalentCard(
    player: Player,
    talentConfig: TalentGeneratorConfig,
    balance: TalentBalanceConfig,
    deps: TalentGeneratorDeps
): boolean {
    const timeoutTicks = deps.secondsToTicks(talentConfig.cardChoiceTimeoutSec);
    const className = deps.getClassName(player.classId);
    const hasAllSlots = !!(player.abilitySlot0 && player.abilitySlot1 && player.abilitySlot2);

    // Получаем веса редкостей по уровню игрока (GDD 7.2.1)
    const levelKey = player.level >= 7 ? "7" : String(player.level);
    const rarityWeights = talentConfig.talentRarityByLevel[levelKey] || talentConfig.talentRarityByLevel["2"];

    // Собираем доступные таланты по редкостям
    const availableByRarity: {
        common: TalentItem[];
        rare: TalentItem[];
        epic: TalentItem[];
    } = {
        common: [],
        rare: [],
        epic: [],
    };

    // Собираем классовые таланты (GDD 7.3.4)
    const classTalentsAvailable: TalentItem[] = [];

    const checkTalentAvailable = (id: string, config: TalentConfig | ClassTalentConfig): boolean => {
        // Проверяем требование
        if (config.requirement) {
            const hasRequirement =
                player.abilitySlot0 === config.requirement ||
                player.abilitySlot1 === config.requirement ||
                player.abilitySlot2 === config.requirement;
            if (!hasRequirement) return false;
        }

        // Проверяем не на макс. уровне ли уже
        let currentLevel = 0;
        for (const t of player.talents) {
            if (t.id === id) {
                currentLevel = t.level;
                break;
            }
        }

        return currentLevel < config.maxLevel;
    };

    // Добавляем общие таланты
    for (const id of talentConfig.talentPool.common) {
        const config = balance.common[id];
        if (config && checkTalentAvailable(id, config)) {
            availableByRarity.common.push({ id, rarity: 0, category: config.category, kind: "talent" });
        }
    }

    for (const id of talentConfig.talentPool.rare) {
        const config = balance.rare[id];
        if (config && checkTalentAvailable(id, config)) {
            availableByRarity.rare.push({ id, rarity: 1, category: config.category, kind: "talent" });
        }
    }

    for (const id of talentConfig.talentPool.epic) {
        const config = balance.epic[id];
        if (config && checkTalentAvailable(id, config)) {
            availableByRarity.epic.push({ id, rarity: 2, category: config.category, kind: "talent" });
        }
    }

    // Добавляем классовые таланты
    const classTalentConfigs = balance.classTalents[className];
    if (classTalentConfigs) {
        for (const [id, config] of Object.entries(classTalentConfigs) as [string, ClassTalentConfig][]) {
            const rarity = config.rarity === "epic" ? 2 : 1;
            if (checkTalentAvailable(id, config)) {
                classTalentsAvailable.push({ id, rarity, category: config.category, kind: "talent" });
                // Также добавляем в общий пул по редкости
                if (rarity === 1) {
                    availableByRarity.rare.push({ id, rarity, category: config.category, kind: "talent" });
                } else {
                    availableByRarity.epic.push({ id, rarity, category: config.category, kind: "talent" });
                }
            }
        }
    }

    // Собираем улучшения способностей
    const abilityUpgrades: UpgradeItem[] = [];
    if (hasAllSlots) {
        const slots = [
            { abilityId: player.abilitySlot0, level: deps.getAbilityLevelForSlot(player, 0) },
            { abilityId: player.abilitySlot1, level: deps.getAbilityLevelForSlot(player, 1) },
            { abilityId: player.abilitySlot2, level: deps.getAbilityLevelForSlot(player, 2) },
        ];
        for (const slot of slots) {
            if (!slot.abilityId || slot.level <= 0) continue;
            if (slot.level >= 3) continue;
            const nextLevel = slot.level + 1;
            abilityUpgrades.push({
                id: buildAbilityUpgradeId(slot.abilityId, nextLevel),
                rarity: 0,
                kind: "upgrade",
                abilityId: slot.abilityId,
                level: nextLevel,
            });
        }
    }

    const allAvailable = [...availableByRarity.common, ...availableByRarity.rare, ...availableByRarity.epic];
    if (allAvailable.length === 0 && abilityUpgrades.length === 0) return false;

    // Выбираем 3 карточки: минимум 1 талант, остальные 2 - талант или улучшение
    const selected: CardItem[] = [];
    const usedEffects = new Set<string>();
    const hasTalents = allAvailable.length > 0;

    const pickTalent = (): boolean => {
        if (allAvailable.length === 0) return false;
        const roll = deps.rng.next() * 100;
        let targetRarity: number;
        if (roll < rarityWeights.common) {
            targetRarity = 0;
        } else if (roll < rarityWeights.common + rarityWeights.rare) {
            targetRarity = 1;
        } else {
            targetRarity = 2;
        }

        let pool: TalentItem[];
        if (targetRarity === 2 && availableByRarity.epic.length > 0) {
            pool = availableByRarity.epic;
        } else if (targetRarity >= 1 && availableByRarity.rare.length > 0) {
            pool = availableByRarity.rare;
        } else if (availableByRarity.common.length > 0) {
            pool = availableByRarity.common;
        } else {
            pool = allAvailable;
        }

        const candidates = pool.filter((t) => {
            if (selected.some((s) => s.id === t.id)) return false;
            if (t.category && usedEffects.has(t.category)) {
                const sameCategory = selected.filter((s) => "category" in s && s.category === t.category).length;
                if (sameCategory >= 2) return false;
            }
            return true;
        });

        let chosen: TalentItem | null = null;
        if (candidates.length === 0) {
            const remaining = allAvailable.filter((t) => !selected.some((s) => s.id === t.id));
            if (remaining.length === 0) return false;
            const idx = Math.floor(deps.rng.next() * remaining.length);
            chosen = remaining[idx];
        } else {
            const idx = Math.floor(deps.rng.next() * candidates.length);
            chosen = candidates[idx];
        }

        if (!chosen) return false;
        selected.push(chosen);
        if (chosen.category) usedEffects.add(chosen.category);
        return true;
    };

    const pickUpgrade = (): boolean => {
        if (abilityUpgrades.length === 0) return false;
        const idx = Math.floor(deps.rng.next() * abilityUpgrades.length);
        const chosen = abilityUpgrades.splice(idx, 1)[0];
        if (!chosen || selected.some((s) => s.id === chosen.id)) return false;
        selected.push(chosen);
        return true;
    };

    // Первый слот: приоритет классовому таланту
    if (hasTalents) {
        if (classTalentsAvailable.length > 0) {
            const idx = Math.floor(deps.rng.next() * classTalentsAvailable.length);
            const classTalent = classTalentsAvailable[idx];
            selected.push(classTalent);
            if (classTalent.category) usedEffects.add(classTalent.category);
        } else {
            pickTalent();
        }
    }

    const upgradeChance = deps.clamp(talentConfig.abilityUpgradeChance ?? 0.5, 0, 1);

    // Заполняем остальные слоты
    while (selected.length < 3) {
        const canPickUpgrade = abilityUpgrades.length > 0;
        const canPickTalent = allAvailable.length > 0;
        if (!canPickUpgrade && !canPickTalent) break;

        const needsTalent = hasTalents && !selected.some((s) => s.kind === "talent");
        let pickUpgradeFirst = false;
        if (needsTalent) {
            pickUpgradeFirst = false;
        } else if (canPickUpgrade && canPickTalent) {
            pickUpgradeFirst = deps.rng.next() < upgradeChance;
        } else {
            pickUpgradeFirst = canPickUpgrade;
        }

        if (pickUpgradeFirst) {
            if (!pickUpgrade() && !pickTalent()) break;
        } else {
            if (!pickTalent() && !pickUpgrade()) break;
        }
    }

    if (selected.length === 0) return false;

    // Создаём карточку
    const card = new TalentCard();
    card.option0 = selected[0]?.id || "";
    card.option1 = selected[1]?.id || "";
    card.option2 = selected[2]?.id || "";
    card.rarity0 = selected[0]?.rarity ?? 0;
    card.rarity1 = selected[1]?.rarity ?? 0;
    card.rarity2 = selected[2]?.rarity ?? 0;
    card.expiresAtTick = deps.currentTick + timeoutTicks;

    player.pendingTalentCard = card;
    return true;
}

/**
 * Строит ID улучшения способности.
 */
export function buildAbilityUpgradeId(abilityId: string, level: number): string {
    return `ability:${abilityId}:${level}`;
}

/**
 * Парсит ID улучшения способности.
 */
export function parseAbilityUpgradeId(value: string): { abilityId: string; level: number } | null {
    if (!value || !value.startsWith("ability:")) return null;
    const parts = value.split(":");
    if (parts.length < 3) return null;
    const abilityId = parts[1] || "";
    const level = Number(parts[2]);
    if (!abilityId || !Number.isInteger(level)) return null;
    return { abilityId, level };
}
