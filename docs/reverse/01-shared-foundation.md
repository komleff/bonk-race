# Reverse: Shared Foundation

**Версия:** v0.8.7 (425d333) | **Дата:** 2026-03-07

---

## 1. Обзор

Пакет `shared/` содержит общий для сервера и клиента код: TypeScript-типы для конфигурации баланса, игровые формулы (масса, радиус, скорость, урон), математические утилиты, систему спрайтов, генератор имён и набор битовых констант. Это единственный источник правды для интерфейсов конфигурации и физических вычислений: и сервер, и клиент импортируют одни и те же типы и функции через `shared/src/index.ts`. Центральная сущность -- `BalanceConfig`, огромный интерфейс (~40 секций), описывающий все параметры игры от физики до талантов. Конкретные числовые значения хранятся в `config/balance.json`, который парсится через `resolveBalanceConfig()` с валидацией и fallback-значениями из `DEFAULT_BALANCE_CONFIG`.

---

## 2. Исходные файлы

| Файл | Строк | Роль |
|------|------:|------|
| `shared/src/config.ts` | 3138 | Интерфейсы конфигурации (`BalanceConfig`, `SlimeConfig`, ...), `DEFAULT_BALANCE_CONFIG`, парсер `resolveBalanceConfig()` |
| `shared/src/formulas.ts` | 68 | Формулы расчёта урона, радиуса, скорости, инерции, масштабирования |
| `shared/src/types.ts` | 52 | Базовые типы: `Vector2`, `InputCommand`, `MatchPhaseId`, `PlayerResult`, `MatchSummary` |
| `shared/src/constants.ts` | 23 | Битовые флаги состояния (`FLAG_*`), коды типов зон и препятствий |
| `shared/src/sprites.ts` | 149 | Список спрайтов, хеш-выбор, кеш загрузки, классовые спрайты |
| `shared/src/mathUtils.ts` | 70 | `clamp`, `lerp`, `wrapAngle`, `normalizeAngle`, `degToRad`/`radToDeg`, `distance`/`distanceSq` |
| `shared/src/nameGenerator.ts` | 110 | Детерминированный генератор имён ботов (LCG + русские слова) |
| `shared/src/index.ts` | 82 | Бочка-реэкспорт всех публичных символов |
| `config/balance.json` | 737 | Конкретные значения баланса для production |

**Итого:** 4429 строк (код + JSON).

---

## 3. Архитектура

### 3.1 Диаграмма зависимостей

```
config/balance.json
       |
       v  (JSON.parse + resolveBalanceConfig)
  config.ts  <-- types.ts (MatchPhaseId, MATCH_PHASES)
     |
     v
  formulas.ts  (импортирует BalanceConfig, SlimeConfig, MassCurveConfig)

  constants.ts    (автономный, без зависимостей)
  sprites.ts      (автономный, без зависимостей)
  mathUtils.ts    (автономный, без зависимостей)
  nameGenerator.ts(автономный, без зависимостей)

  index.ts  -----> реэкспортирует всё из всех модулей выше
```

Ключевой поток данных:
1. Сервер загружает `config/balance.json` при старте.
2. `resolveBalanceConfig(raw)` парсит JSON -> `ResolvedBalanceConfig` (с добавленным `globalCooldownTicks`).
3. `formulas.ts` получает секции конфига и вычисляет производные значения в реальном времени.

### 3.2 Ключевые типы и интерфейсы

#### config.ts -- Основные интерфейсы

| Интерфейс | Поля (кол-во) | Назначение |
|-----------|:---:|-----------|
| `FormulaConfig` | 3 | `{base, scale, divisor}` -- универсальный конфиг формулы (урон, скорость, радиус) |
| `MatchPhaseConfig` | 3 | `{id, startSec, endSec}` -- временные рамки фазы матча |
| `MassCurveConfig` | 5 | `{type, exp?, k?, minValue?, maxValue?}` -- параметры кривой масштабирования |
| `BoostConfig` | 6 | Конфиг бустов: rage/haste/guard/greed + allowedByChestType |
| `MapSizeConfig` | 3 | `{small, medium, large}` -- количества/радиусы по размеру карты |
| `ObstacleConfig` | 10 | Настройки препятствий (столбы, шипы, проходы) |
| `SafeZoneConfig` | 7 | Безопасные зоны финала |
| `ZoneTypeWeights` | 5 | Веса типов зон: nectar/ice/slime/lava/turbo |
| `ZonesConfig` | 11 | Полный конфиг зон с подконфигами каждого типа |
| `SlimeConfig` | 7 подсекций | Полное описание слайм-конфига (геометрия, двигатели, лимиты, ассист, бой, масштабирование) |
| `WorldPhysicsConfig` | 7 | Физика мира: drag, restitution, форма, размеры |
| `ClientNetSmoothingConfig` | 6 | Параметры сглаживания сети на клиенте |
| `CameraConfig` | 6 | Зум камеры: пределы, скорость, привязка к массе |
| `BalanceConfig` | ~40 секций | **Мега-интерфейс** -- включает все перечисленные выше + slime, combat, death, orbs, formulas, classes, abilities (9 шт), chests, talents и др. |
| `TalentConfig` | 6 | `{name, maxLevel, values, effect, requirement?, category?}` |
| `ClassTalentConfig` | extends TalentConfig + `rarity` | Классовые таланты |
| `ResolvedBalanceConfig` | extends BalanceConfig | Добавляет `server.globalCooldownTicks` (вычислено) |

#### SlimeConfig -- подробная структура

```typescript
SlimeConfig {
  id: string;
  name: string;
  geometry:    { baseMassKg, baseRadiusM, inertiaFactor }
  propulsion:  { thrustForwardN, thrustReverseN, thrustLateralN, turnTorqueNm }
  limits:      { speedLimitForwardMps, speedLimitReverseMps, speedLimitLateralMps, angularSpeedLimitRadps }
  assist:      { 18 параметров fly-by-wire управления }
  combat:      { biteDamagePctOfMass, biteVictimMassGainPct, orbBitePctOfMass }
  massScaling: { minMassFactor, 8 кривых MassCurveConfig для каждого параметра }
}
```

4 предопределённых конфига: `base`, `hunter`, `warrior`, `collector`.

#### types.ts

| Тип/Интерфейс | Назначение |
|----------------|-----------|
| `Vector2` | `{x, y}` -- 2D-вектор |
| `MatchPhaseId` | `"Growth" \| "Hunt" \| "Final" \| "Results"` |
| `MATCH_PHASES` | `["Growth", "Hunt", "Final", "Results"]` (const array) |
| `InputCommand` | `{seq, moveX, moveY, abilitySlot?, talentChoice?}` -- пакет ввода |
| `PlayerResult` | Результат матча: placement, finalMass, killCount, deathCount и т.д. |
| `MatchStats` | `{totalKills, totalBubblesCollected, matchDurationMs}` |
| `MatchSummary` | Полный отчёт матча для MetaServer |

### 3.3 Формулы

| Функция | Входы | Выход | Математика |
|---------|-------|-------|------------|
| `getSlimeDamage` | `mass`, `formulas` | `number` | `base + scale * ln(1 + mass / divisor)` |
| `getSlimeRadius` | `mass`, `formulas` | `number` | `base * sqrt(1 + scale * mass / divisor)` |
| `getOrbRadius` | `orbMass`, `density` | `number` | `10 * sqrt(orbMass / 100 / density)` (захардкожены baseMass=100, baseRadius=10) |
| `getSpeedMultiplier` | `mass`, `formulas` | `number` | `base / (1 + scale * ln(1 + mass / divisor))` |
| `getTurnRateDeg` | `mass`, `baseTurnRateDeg`, `turnDivisor` | `number` | `baseTurnRateDeg / (1 + ln(1 + mass / turnDivisor))` |
| `getSlimeRadiusFromConfig` | `mass`, `SlimeConfig` | `number` | `baseRadius * sqrt(safeMass / baseMass)` |
| `getSlimeInertia` | `mass`, `SlimeConfig` | `number` | `inertiaFactor * mass * radius^2` |
| `scaleSlimeValue` | `baseValue`, `mass`, `SlimeConfig`, `MassCurveConfig` | `number` | По типу кривой: `power` -> `base * (ratio)^exp`, `log` -> `base * (1 + k * ln(ratio))`. С clamp minValue/maxValue |

**Примечание:** В коде есть **две** разные формулы радиуса:
- `getSlimeRadius(mass, formulas)` -- через FormulaConfig (damage-стиль, с scale/divisor)
- `getSlimeRadiusFromConfig(mass, config)` -- через SlimeConfig.geometry (чистая sqrt пропорция)

Вторая используется в новой физической модели (`slimeConfigs`), первая -- legacy.

### 3.4 Константы и флаги

#### Битовые флаги (constants.ts)

| Константа | Значение | Описание |
|-----------|:---:|---------|
| `FLAG_RESPAWN_SHIELD` | `1 << 0` (1) | Щит респавна |
| `FLAG_ABILITY_SHIELD` | `1 << 1` (2) | Активный щит (умение) |
| `FLAG_LAST_BREATH` | `1 << 2` (4) | Последний вздох перед смертью |
| `FLAG_IS_REBEL` | `1 << 3` (8) | Слайм-мятежник (лидер массы) |
| `FLAG_IS_DEAD` | `1 << 4` (16) | Мёртв |
| `FLAG_DASHING` | `1 << 5` (32) | Совершает рывок |
| `FLAG_MAGNETIZING` | `1 << 6` (64) | Активное притяжение |
| `FLAG_SLOWED` | `1 << 7` (128) | Замедлён |
| `FLAG_PUSHING` | `1 << 8` (256) | Толкает (push ability) |
| `FLAG_STUNNED` | `1 << 9` (512) | Оглушён |
| `FLAG_INVISIBLE` | `1 << 10` (1024) | Невидим |
| `FLAG_LEVIATHAN` | `1 << 11` (2048) | Левиафан (увеличенный размер) |

#### Типы зон

| Константа | Значение | Описание |
|-----------|:---:|---------|
| `ZONE_TYPE_NECTAR` | 1 | Зона нектара (+масса) |
| `ZONE_TYPE_ICE` | 2 | Ледяная зона (скольжение) |
| `ZONE_TYPE_SLIME` | 3 | Слизистая зона (замедление + трение) |
| `ZONE_TYPE_LAVA` | 4 | Зона лавы (урон + scatter) |
| `ZONE_TYPE_TURBO` | 5 | Зона турбо (ускорение) |

#### Типы препятствий

| Константа | Значение | Описание |
|-----------|:---:|---------|
| `OBSTACLE_TYPE_PILLAR` | 1 | Столб |
| `OBSTACLE_TYPE_SPIKES` | 2 | Шипы (наносят урон) |

#### Прочие константы

| Константа | Значение |
|-----------|---------|
| `GUEST_DEFAULT_NICKNAME` | `'Гость'` |

---

## 4. Маппинг balance.json -> TypeScript

| # | Секция JSON | Интерфейс/тип в TS | Поля |
|---|------------|---------------------|------|
| 1 | `world` | `BalanceConfig.world` | `mapSize`, `mapSizes[]` |
| 2 | `server` | `BalanceConfig.server` | `maxPlayers`, `tickRate`, `simulationIntervalMs`, `globalCooldownMs`, `abilityQueueSize` |
| 3 | `match` | `BalanceConfig.match` | `durationSec`, `resultsDurationSec`, `restartDelaySec`, `phases[]` |
| 4 | `match.phases[i]` | `MatchPhaseConfig` | `id`, `startSec`, `endSec` |
| 5 | `physics` | `BalanceConfig.physics` | `environmentDrag`, `collisionRestitution`, `collisionImpulseCap`, `slimeLinearDamping`, `orbLinearDamping`, `speedDampingRate`, `minSlimeMass`, `maxSlimeSpeed`, `maxOrbSpeed` |
| 6 | `controls` | `BalanceConfig.controls` | `joystickMode`, `joystickRadius`, `joystickDeadzone`, `joystickSensitivity`, `joystickFollowSpeed`, `inputTimeoutMs`, `mouseDeadzone`, `mouseMaxDist` |
| 7 | `slimeConfigs.base` | `SlimeConfig` | id, name, geometry{3}, propulsion{4}, limits{4}, assist{18}, combat{2-3}, massScaling{9} |
| 8 | `slimeConfigs.hunter` | `SlimeConfig` | (структура идентична base) |
| 9 | `slimeConfigs.warrior` | `SlimeConfig` | (структура идентична base) |
| 10 | `slimeConfigs.collector` | `SlimeConfig` | (структура идентична base) |
| 11 | `worldPhysics` | `WorldPhysicsConfig` | `forwardDragK`, `lateralGripMultiplier`, `angularDragK`, `restitution`, `maxPositionCorrectionM`, `worldShape`, `widthM`, `heightM` |
| 12 | `clientNetSmoothing` | `ClientNetSmoothingConfig` | `lookAheadMs`, `velocityWeight`, `catchUpSpeed`, `maxCatchUpSpeed`, `teleportThreshold`, `angleCatchUpSpeed` |
| 13 | `camera` | `CameraConfig` | `zoomMin`, `zoomMax`, `zoomSpeed`, `zoomDamageHoldSec`, `zoomMassMin`, `zoomMassMax` |
| 14 | `visual` | `BalanceConfig.visual?` (optional) | `mouthSector`, `inputArrow`, `keyboardMixWeight` |
| 15 | `slime` | `BalanceConfig.slime` | `initialMass`, `initialLevel`, `initialClassId`, `levelThresholds[]`, `slotUnlockLevels[]`, `talentGrantLevels[]`, `cardChoiceTimeoutSec`, `abilityPool[]` |
| 16 | `combat` | `BalanceConfig.combat` | `mouthArcDeg`, `tailArcDeg`, `tailDamageMultiplier`, `attackCooldownSec`, `damageInvulnSec`, `biteCooldownSec`, `respawnShieldSec`, `lastBreathDurationSec`, `lastBreathSpeedPenalty`, `pvpBiteAttackerGainPct`, `pvpBiteScatterPct`, `pvpBiteScatterOrbCount`, `pvpBiteScatterSpeed`, `scatterOrbMinMass` |
| 17 | `death` | `BalanceConfig.death` | `respawnDelaySec`, `massLostPercent`, `massToOrbsPercent`, `orbsCount`, `minRespawnMass` |
| 18 | `orbs` | `BalanceConfig.orbs` | `initialCount`, `maxCount`, `respawnIntervalSec`, `minMass`, `minRadius`, `pushForce`, `orbBiteMinMass`, `orbBiteMaxMass`, `types[]` |
| 19 | `orbs.types[i]` | `{id, weight, density, massRange}` | Типы пузырей с весом, плотностью, диапазоном массы |
| 20 | `formulas` | `BalanceConfig.formulas` | `damage: FormulaConfig`, `speed: FormulaConfig`, `radius: FormulaConfig` |
| 21 | `classes.hunter` | `BalanceConfig.classes.hunter` | `speedMult`, `biteResistPct`, `swallowLimit`, `biteFraction` |
| 22 | `classes.warrior` | `BalanceConfig.classes.warrior` | + `damageVsSlimeMult` |
| 23 | `classes.collector` | `BalanceConfig.classes.collector` | `radiusMult`, `eatingPowerMult`, `swallowLimit`, `biteFraction` |
| 24 | `abilities.dash` | Вложенный тип | `massCostPct`, `cooldownSec`, `distanceM`, `durationSec`, `collisionDamageMult`, `levels[]` |
| 25 | `abilities.shield` | Вложенный тип | `massCostPct`, `cooldownSec`, `durationSec`, `reflectDamagePct`, `burstRadiusM`, `levels[]` |
| 26 | `abilities.magnet` | Вложенный тип | `massCostPct`, `cooldownSec`, `durationSec`, `radiusM`, `pullSpeedMps`, `levels[]` |
| 27 | `abilities.slow` | Вложенный тип | `massCostPct`, `cooldownSec`, `durationSec`, `radiusM`, `slowPct`, `levels[]` |
| 28 | `abilities.projectile` | Вложенный тип | `massCostPct`, `cooldownSec`, `speedMps`, `rangeM`, `damagePct`, `radiusM`, `piercingHits`, `piercingDamagePct`, `levels[]` |
| 29 | `abilities.spit` | Вложенный тип | + `projectileCount`, `spreadAngleDeg`, `levels[]` |
| 30 | `abilities.bomb` | Вложенный тип | + `explosionRadiusM`, `levels[]` |
| 31 | `abilities.push` | Вложенный тип | `impulseNs`, `minSpeedMps`, `maxSpeedMps`, `levels[]` |
| 32 | `abilities.mine` | Вложенный тип | `damagePct`, `durationSec`, `maxMines`, `levels[]` |
| 33 | `chests` | `BalanceConfig.chests` | `maxCount`, `spawnIntervalSec`, `mass`, `radius`, `rewards`, `types?`, `phaseWeights?` |
| 34 | `chests.rewards` | Вложенный тип | `scatterTotalMassPct[]`, `scatterBubbleCount[]`, `scatterInnerFrac[]`, speed arrays, `talentRarityWeights` |
| 35 | `boosts` | `BoostConfig` | `maxStackTimeSec`, `rage`, `haste`, `guard`, `greed`, `allowedByChestType` |
| 36 | `obstacles` | `ObstacleConfig` | `countByMapSize`, `passageCountByMapSize`, dimensions, `spikeChance`, `spacing`, `placementRetries` |
| 37 | `safeZones` | `SafeZoneConfig` | `finalStartSec`, `warningSec`, `damagePctPerSec`, `minDistance`, `countByMapSize`, `radiusByMapSize` |
| 38 | `zones` | `ZonesConfig` | `countByMapSize`, `radiusByMapSize`, `typeWeights`, подконфиги каждого типа |
| 39 | `hotZones` | `BalanceConfig.hotZones` | `chaosCount`, `finalCount`, `radius`, `spawnMultiplierChaos`, `spawnMultiplierFinal` |
| 40 | `toxicPools` | `BalanceConfig.toxicPools` | `radiusM`, `durationSec`, `damagePctPerSec`, `slowPct` |
| 41 | `hunger` | `BalanceConfig.hunger` | `baseDrainPerSec`, `scalingPerMass`, `maxDrainPerSec`, `minMass` |
| 42 | `rebel` | `BalanceConfig.rebel` | `updateIntervalSec`, `massThresholdMultiplier` |
| 43 | `talents` | `BalanceConfig.talents` | `cardChoiceTimeoutSec`, `cardQueueMax`, `abilityUpgradeChance`, `talentPool`, `talentRarityByLevel`, `autoPickPriorities`, `common{}`, `rare{}`, `epic{}`, `classTalents{}` |
| 44 | `rewards` | `BalanceConfig.rewards?` (optional) | `xp`, `coins`, `rating` -- каждый с `base`, `placement`, `perKill` |

**Особенности маппинга:**

- `slimeConfigs.*.limits.angularSpeedLimitDegps` в JSON автоматически конвертируется в `angularSpeedLimitRadps` в `resolveBalanceConfig()` (умножением на `PI/180`).
- `slimeConfigs.*.assist.yawFullDeflectionAngleDeg` аналогично конвертируется в `yawFullDeflectionAngleRad`.
- `slimeConfigs.*.combat.biteVictimMassGainPct` отсутствует в `balance.json` (2 поля вместо 3 в TS), используется fallback из `DEFAULT_BALANCE_CONFIG` (0.25).
- `rewards` и `visual` -- опциональные секции, могут отсутствовать.
- `chests.types` и `chests.phaseWeights` есть в JSON, но optional в TS.

---

## 5. Спрайт-система

### 5.1 SPRITE_NAMES

21 спрайт в массиве `SPRITE_NAMES` (файлы `.webp`):

```
slime-angrybird, slime-astronaut, slime-base, slime-cccp, slime-crazy,
slime-crystal, slime-cyberneon, slime-frost, slime-greeendragon, slime-mecha,
slime-pinklove, slime-pirate, slime-pumpkin, slime-reddragon, slime-redfire,
slime-samurai, slime-shark, slime-tomato, slime-toxic, slime-wizard, slime-zombi
```

**Замечание:** `slime-greeendragon` -- опечатка (три `e`), но менять нельзя (файл на диске тоже назван так).

### 5.2 pickSpriteByName -- алгоритм выбора

```typescript
function hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) >>> 0;  // unsigned 32-bit
    }
    return h;
}

function pickSpriteByName(playerName: string): string {
    const name = playerName || 'Unknown';
    const hash = hashString(name);
    return SPRITE_NAMES[hash % SPRITE_NAMES.length];  // 21 спрайтов
}
```

Детерминированный: одно имя -> один спрайт. Используется для ботов, анонимов и как fallback.

### 5.3 Классовые спрайты (SLIME_SPRITES)

Маппинг `classId -> SlimeSprite` для анимаций:

| classId | Класс | Состояния |
|:---:|---------|-----------|
| 0 | Hunter | idle, moving, hunting, damaged |
| 1 | Warrior | idle, moving, attacking, damaged |
| 2 | Collector | idle, moving, absorbing, damaged |

Пути: `/sprites/slimes/{class}/{class}-{state}.png`

### 5.4 Утилиты спрайтов

- `isValidSprite(spriteId)` -- проверка валидности (линейный поиск `includes`).
- `loadSprite(url)` -- загрузка в кеш `SPRITE_CACHE` (Map<string, HTMLImageElement>).
- `loadClassSprites(classId)` -- предзагрузка всех спрайтов класса.
- `getPlayerSprite(classId, state)` -- выбор спрайта по состоянию с fallback на `idle`.
- `SPRITE_SIZE = 256` -- размер в пикселях.

**Внимание:** `SPRITE_CACHE`, `loadSprite`, `loadClassSprites`, `getPlayerSprite` используют `HTMLImageElement` и `new Image()`, что работает только в браузере. Эти функции определены в `shared/`, но реально вызываются только клиентом. На сервере их вызов вызовет ошибку (нет DOM API).

---

## 6. Захардкоженные значения

| # | Файл | Строка(и) | Значение | Контекст |
|---|------|-----------|----------|----------|
| 1 | `formulas.ts:18-19` | `slimeBaseMass = 100`, `slimeBaseRadius = 10` | Фиксированные базовые значения в `getOrbRadius()` | Не читаются из конфига, хотя `SlimeConfig.geometry` содержит те же значения |
| 2 | `sprites.ts:48` | `'Unknown'` | Fallback имя в `pickSpriteByName` если пустая строка | Не вынесено в constants |
| 3 | `sprites.ts:94` | `SPRITE_SIZE = 256` | Размер спрайта в пикселях | Не в balance.json |
| 4 | `nameGenerator.ts:42-46` | `a=1103515245, c=12345` | Константы LCG-генератора | Стандартные для `glibc`, не выносятся |
| 5 | `config.ts:641` | `mapSize: 1000` | DEFAULT mapSize | Дублируется в balance.json |
| 6 | `config.ts:645-647` | `tickRate: 30`, `simulationIntervalMs: 1000/30` | DEFAULT tick rate | Рассчитывается в коде как деление |
| 7 | `config.ts:701` | `angularSpeedLimitRadps: (80 * Math.PI) / 180` | 80 градусов -> радианы в DEFAULT | Захардкожено вычисление |
| 8 | `formulas.ts:34` | `safeMass = Math.max(mass, baseMass * config.massScaling.minMassFactor)` | Неявный clamp минимальной массы | Не документирован |
| 9 | `nameGenerator.ts:6-34` | 40 прилагательных, 40 существительных | Русскоязычные слова для имён | 1600 комбинаций |
| 10 | `config.ts:709` | `yawFullDeflectionAngleRad: Math.PI / 2` | 90 градусов | DEFAULT в радианах |

---

## 7. Расхождения с документацией

| # | Документ | Раздел | Описание расхождения | Приоритет |
|---|----------|--------|---------------------|:---------:|
| 1 | GDD-Core.md | 1.2, 1.3 | **Длительность матча:** GDD указывает 180 сек, фазы 0-60/60-120/120-180. В `balance.json` длительность = **90 сек**, фазы **0-30/30-60/60-90**. `DEFAULT_BALANCE_CONFIG` в config.ts совпадает с GDD (180 сек). Реальная игра использует balance.json = 90 сек. | **P0** |
| 2 | GDD-Glossary.md | Техн. параметры | **biteMassPercent:** Глоссарий указывает `0.10` (10%), в `balance.json` поле `slimeConfigs.*.combat.biteDamagePctOfMass` = **0.02** (2%). DEFAULT в config.ts = 0.15 (15%). Три разных значения. | **P0** |
| 3 | GDD-Core.md | 9.2 | **thrustForwardN:** GDD указывает 9000 Н. В `balance.json` = **27000 Н** (в 3 раза больше). DEFAULT в config.ts = 9000 Н (совпадает с GDD). | **P1** |
| 4 | GDD-Core.md | 9.2 | **turnTorqueNm:** GDD указывает 175 Нм. DEFAULT в config.ts = **24000 Нм**. В `balance.json` = 24000 Нм. Расхождение в ~137 раз. | **P1** |
| 5 | GDD-Glossary.md | Техн. параметры | **restitution:** Глоссарий указывает 0.3. В `balance.json` `worldPhysics.restitution` = **0.9**. DEFAULT в config.ts = 0.9. | **P1** |
| 6 | GDD-Core.md | 9.2 | **angularSpeedLimitDegps:** GDD указывает 80. В `balance.json` = **180**. DEFAULT в config.ts = 80 (совпадает с GDD). | **P1** |
| 7 | GDD-Core.md | 9.1 | **matchDurationSec:** Глоссарий указывает 180 сек. В `balance.json` = **90 сек**. Фактически матчи идут 90 секунд, а не 3 минуты. | **P0** |
| 8 | GDD-Core.md | 3.2 | **Укус бок/хвост:** GDD описывает 20%/30% массы жертвы. В коде `pvpBiteAttackerGainPct = 0.10`, `pvpBiteScatterPct = 0.10`, что в сумме = 20% за бок. Но `tailDamageMultiplier = 1.5`, значит хвост = 30%. Совпадает с GDD, но механика реализована через множитель, а не фиксированные проценты. | **P2** |
| 9 | GDD-Core.md | 4.1 | **Плотность пузырей:** GDD указывает green=0.2, blue=0.3, red=0.4, gold=0.5. В `balance.json` значения совпадают. Однако в `DEFAULT_BALANCE_CONFIG` в config.ts: green=**0.8**, blue=**1.0**, red=**1.0**, gold=**1.5** -- сильно отличаются. | **P1** |
| 10 | GDD-Core.md | 4.2 | **Формула радиуса пузыря:** GDD описывает `radius = sqrt(mass / PI / density)`. В коде `getOrbRadius` = `10 * sqrt(orbMass / 100 / density)` -- другая формула, без PI. | **P1** |
| 11 | GDD-Core.md | 4.5 | **Массы пузырей:** GDD указывает green=[10,50], blue=[30,150], red=[80,400], gold=[200,1000]. `balance.json` совпадает. DEFAULT в config.ts: green=[5,15], blue=[20,40], red=[20,40], gold=[50,100] -- другие значения. | **P1** |
| 12 | GDD-Core.md | 4.4 | **Фазы появления пузырей:** GDD описывает детальные веса по фазам (Рост: 70/30, Охота: 30/45/25, Финал: 10/30/40/20). В `balance.json` и config.ts нет per-phase orb spawn weights -- есть единый массив `orbs.types[].weight`. Механика фазовых весов не реализована в shared/. | **P1** |
| 13 | GDD-Core.md | 4.4 | **initialCount орбов:** GDD подразумевает 30 макс в фазе Рост. В `balance.json` `orbs.initialCount` = **10**, `maxCount` = **15**. DEFAULT = 100/150. | **P2** |
| 14 | GDD-Glossary.md | Техн. параметры | **matchDurationSec:** Глоссарий = 180, code DEFAULT = 180, balance.json = **90**. Глоссарий не обновлён. | **P0** |
| 15 | GDD-Core.md | 3.2 | **Укус пузыря:** GDD описывает `biteMassPercent * масса игрока`. В коде есть `orbBitePctOfMass` в `slimeConfigs.*.combat` = 0.10 (balance.json) vs 0.05 (DEFAULT). Плюс отдельный `orbBiteMinMass`/`orbBiteMaxMass` в секции orbs. Два механизма, не описанных в GDD. | **P2** |
| 16 | Architecture Part4 | App. A | Конфиги должны храниться в `configs/<configVersion>/` с версионированием. Фактически баланс хранится в `config/balance.json` без версионирования. | **P2** |
| 17 | GDD-Core.md | 2.1 | **Воин:** GDD указывает -10% к скорости. В `balance.json` `classes.warrior.speedMult = 0.9` (подтверждает). Но `slimeConfigs.warrior` полностью идентичен `slimeConfigs.base` -- бонусы классов не применяются через slimeConfigs, а через отдельную секцию `classes`. Две системы модификаторов параллельно. | **P2** |
| 18 | GDD-Glossary.md | FlightAssist | Глоссарий коротко упоминает FlightAssist. В коде `SlimeConfig.assist` содержит **18 параметров**, включая `counterAccel*` -- нигде не описанных в GDD. | **P2** |

---

## 8. Технический долг

1. **Дублирование SlimeConfig для всех классов.** Все 4 конфига (`base`, `hunter`, `warrior`, `collector`) в DEFAULT_BALANCE_CONFIG и balance.json полностью идентичны. Можно использовать наследование/spread от `base` и переопределять только отличающиеся поля.

2. **Два механизма конфигурации параллельно.** Старая система (`formulas.damage/speed/radius`) и новая (`slimeConfigs.*.massScaling` + `scaleSlimeValue`). Формулы из `formulas.ts` -- `getSlimeDamage`, `getSlimeRadius`, `getSpeedMultiplier` -- используют `BalanceConfig.formulas`, а `getSlimeRadiusFromConfig`, `getSlimeInertia`, `scaleSlimeValue` -- используют `SlimeConfig`. Нужно определить, какая система актуальна, и убрать дублирование.

3. **`getOrbRadius` захардкожен.** Использует `slimeBaseMass=100` и `slimeBaseRadius=10` вместо чтения из `SlimeConfig.geometry`. При изменении базовых параметров слайма формула орба не обновится.

4. **DOM-зависимый код в shared/.** `SPRITE_CACHE`, `loadSprite`, `loadClassSprites` используют `HTMLImageElement` и `new Image()`. Должны быть в `client/`, а не в `shared/`.

5. **Отсутствие валидации по диапазонам.** `resolveBalanceConfig` проверяет типы, но почти не проверяет допустимые диапазоны. Только `mouseDeadzone` (>=0), `mouseMaxDist` (>=1), и `velocityWeight` (0-1) имеют clamp. Остальные поля могут получить некорректные значения (отрицательные массы, нулевой tickRate и т.д.).

6. **`formulas.speed` в balance.json без `scale`.** В balance.json: `"speed": { "base": 1.0, "divisor": 500 }` -- отсутствует `scale`. В `resolveBalanceConfig` fallback берёт `scale: 1.0` из DEFAULT. Это работает, но JSON не полон.

7. **Линейный поиск в `isValidSprite`.** `SPRITE_NAMES.includes(spriteId)` -- O(n) при каждой проверке. При 21 элементе не критично, но лучше `Set`.

8. **`generateRandomName()` в shared/.** Помечена как "ТОЛЬКО ДЛЯ КЛИЕНТА", но доступна для импорта на сервере. Нарушает детерминизм если вызвать с сервера. Должна быть в `client/`.

9. **Огромный файл config.ts (3138 строк).** 60% занимает `resolveBalanceConfig()` -- ручной парсинг каждого поля. Можно генерировать автоматически из JSON Schema или использовать библиотеку (zod, ajv).

10. **Отсутствие `formulas.radius.scale` в balance.json.** В JSON: `"radius": { "base": 10, "divisor": 50 }` без `scale`. DEFAULT: `scale: 1.0`. Молчаливый fallback.

---

## 9. Заметки для форка BonkRace

> **BonkRace** -- гоночная игра. Массовая переработка: арена -> трасса, масса -> скорость/ускорение, пузыри -> бустеры.

### Что переиспользовать (без изменений или с минимальными)

| Компонент | Обоснование |
|-----------|-------------|
| `mathUtils.ts` целиком | `clamp`, `lerp`, `wrapAngle`, `distance` -- универсальные |
| `types.ts: Vector2, InputCommand` | Применимы к гоночному управлению |
| `types.ts: MatchPhaseId, MATCH_PHASES` | Гонка тоже имеет фазы: Countdown, Race, Finish |
| `config.ts: FormulaConfig, MassCurveConfig` | Кривые масштабирования применимы к скорости |
| `config.ts: resolveBalanceConfig() -- паттерн` | Механизм парсинга JSON с fallback -- переиспользовать подход |
| `constants.ts: FLAG_* система` | Битовые флаги -- переименовать (FLAG_BOOSTING, FLAG_DRIFTING и т.д.) |
| `nameGenerator.ts` | Генератор имён ботов -- заменить словарь на гоночную тематику |
| `ClientNetSmoothingConfig` | Сетевое сглаживание актуально для любого мультиплеера |

### Что удалить

| Компонент | Причина |
|-----------|---------|
| `BoostConfig` (rage/haste/guard/greed) | Заменить на гоночные бустеры (nitro, shield, turbo) |
| `SlimeConfig` целиком | Заменить на `VehicleConfig` (другая физика: колёса, руль, дрифт) |
| `combat` секция | В гонке нет укусов. Столкновения -> другая механика (бамп, спин) |
| `death` секция | Нет смерти. Есть разворот/респавн на трассе |
| `orbs` секция | Нет пузырей. Есть пикапы на трассе |
| `talents` секция | В гонке нет талантов (или совсем другая система прогресса) |
| `chests` секция | Нет сундуков |
| `sprites.ts: SLIME_SPRITES, class-related` | Заменить на машины/кузова |
| `hunger` секция | Неприменимо |
| `rebel` секция | Неприменимо |
| `safeZones` секция | Неприменимо |
| `ZONE_TYPE_NECTAR/LAVA` | Заменить на гоночные зоны (грязь, лёд, турбо-полоса) |

### Что заменить (требует переработки)

| Слайм-концепт | BonkRace-аналог | Замена |
|---------------|-----------------|--------|
| `mass` (здоровье + размер) | `speed` (скорость + ускорение) | Основная единица: не масса, а скоростной потенциал |
| `arena` (квадрат/круг) | `track` (замкнутая трасса) | Вместо `worldPhysics.worldShape` -- `trackConfig` с чекпоинтами |
| `getSlimeRadius()` | `getVehicleHitbox()` | Хитбокс машины фиксирован, не зависит от "массы" |
| `getSpeedMultiplier()` | `getMaxSpeed(upgrades)` | Зависит от апгрейдов, а не от массы |
| `classes` (hunter/warrior/collector) | `vehicles` (lightweight/heavy/balanced) | Другие характеристики: ускорение, макс. скорость, grip |
| `obstacles` (pillar/spikes) | `trackObjects` (barrier, ramp, shortcut) | Объекты трассы |
| `zones` (nectar/ice/slime/lava/turbo) | `trackZones` (mud/ice/turbo/oil) | Зоны на трассе (ice и turbo переиспользуемы) |
| `abilities` (dash/shield/magnet/...) | `items` (nitro/shield/rocket/banana) | Предметы как в Mario Kart |
| `MatchPhaseConfig` (Growth/Hunt/Final) | `RacePhaseConfig` (Countdown/Race/Finish) | Другие фазы |
| `formulas.damage` | Удалить | Нет урона в классическом смысле |
| `formulas.speed` | `formulas.acceleration` | Кривая ускорения |
| `PlayerResult.finalMass` | `PlayerResult.finishTimeMs` | Результат = время, а не масса |
| `PlayerResult.killCount` | `PlayerResult.bumpsDealt` | Толчки/сбития |

### Рекомендуемый порядок форка

1. Скопировать `shared/` -> `shared-bonkrace/`
2. Удалить все slime/combat/orb секции
3. Создать `VehicleConfig` вместо `SlimeConfig`
4. Создать `TrackConfig` вместо world/arena
5. Заменить `BalanceConfig` на `RaceBalanceConfig`
6. Адаптировать формулы: масштабирование скорости по апгрейдам
7. Обновить `nameGenerator` -- гоночная тематика
8. Обновить `sprites.ts` -- машины вместо слаймов
