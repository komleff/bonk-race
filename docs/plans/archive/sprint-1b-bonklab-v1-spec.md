# План: BonkRace — Fork + Targeted Strip от SlimeArena

**Тип:** Форк + точечная замена игровой механики
**Цель:** MVP гоночной игры BonkRace; вся инфраструктура SlimeArena сохраняется для будущих релизов
**Область:** Game server systems, GameState schema, Client game rendering; инфраструктура не трогается
**Ветка:** `race/init` от main форкнутого репо

---

## Контекст

BonkRace = SlimeArena с другой игровой механикой. Инфраструктура (auth, matchmaking, платформы, shop, admin, analytics, A/B тесты) полностью переиспользуется — не только для SlimeArena, но и для BonkRace в будущих релизах:

- Рекламная монетизация, магазин → `WalletService`, `ShopService`, `AdsService`
- Авторизация через Yandex standalone (нужна уже для MVP-тестирования), Telegram, VK → `meta/platform/*`
- Admin dashboard → операционный контроль
- A/B тесты, аналитика → после первого релиза

Поэтому стратегия: **удаляем только slime-специфическую игровую механику**, всё остальное остаётся нетронутым.

---

## Стратегия работы с форком и оригинальным репо

Форк — независимая копия. Улучшения auth и инфраструктуры в `komleff/slime-arena` не попадают в `komleff/bonk-race` автоматически. Для синхронизации:

```bash
# Однократная настройка (после clone форка)
git remote add upstream https://github.com/komleff/slime-arena

# Получить новые коммиты из оригинала
git fetch upstream

# Cherry-pick конкретного улучшения (например, фикс auth)
git cherry-pick <commit-hash>

# Или merge целой ветки из оригинала
git merge upstream/sprint-NN/auth-improvement
```

**Правило:** auth/инфра улучшения делать сначала в SlimeArena, затем cherry-pick в BonkRace. Игровые механики (race lap system, checkpoints) — только в BonkRace.

---

## Реальный scope изменений (только игровая механика)

| Слой | До (LOC) | Удаляется | Остаётся |
|------|----------|-----------|---------|
| Meta-server | 13 500 | **~50** (leaderboard адаптация) | 13 450 |
| Game server — slime systems | ~2 600 | ~2 100 (11 файлов) | ~500 (orbs/chests/boost — адаптируются) |
| Game server — адаптируемые файлы | ~3 000 | ~1 200 | ~1 800 |
| Client — slime UI/rendering | ~5 500 | ~1 800 (AbilityButtons, TalentModal, slime sprites, ui/data) | ~3 700 (auth UI, leaderboard, platform adapters — KEEP) |
| Shared — slime типы/формулы | ~1 800 | ~1 360 | ~440 |
| Admin dashboard | ~2 800 | 0 — не трогаем | 2 800 |
| **Итого** | **~29 200** | **~6 510** | ~22 690 |

---

## Скоуп изменений в shared/

`shared/src/` — пакет `@slime-arena/shared` → переименовать в `@bonk-race/shared`

| Файл | Решение | Детали |
|------|---------|--------|
| `mathUtils.ts` | KEEP | Чистая математика |
| `constants.ts` | ADAPT | Удалить FLAGS: `FLAG_ABILITY_SHIELD, FLAG_LAST_BREATH, FLAG_MAGNETIZING, FLAG_PUSHING, FLAG_STUNNED, FLAG_INVISIBLE, FLAG_LEVIATHAN`. Переименовать зоны: `ZONE_TYPE_SLIME→HIGH_FRICTION, ZONE_TYPE_ICE→LOW_FRICTION, ZONE_TYPE_TURBO→BOOST, ZONE_TYPE_LAVA→SLOW`; удалить `ZONE_TYPE_NECTAR`. Добавить `OBSTACLE_TYPE_DANGEROUS`. Оставить: `FLAG_RESPAWN_SHIELD, FLAG_IS_DEAD, FLAG_DASHING, FLAG_SLOWED, OBSTACLE_TYPE_PILLAR` |
| `config.ts` | ADAPT | Удалить: `BoostConfig`, все ability/talent config-интерфейсы. Оставить: `MatchPhaseConfig`, `ObstacleConfig`, `MapSizeConfig`, базовые физические поля |
| `types.ts` | ADAPT | Удалить: `ClassId, AbilityId, TalentId, ChestType`. **OrbType — не удалять**, переименовать значения: `OrbType.COIN` (подбираемая монетка), `OrbType.OBSTACLE_SAFE`, `OrbType.OBSTACLE_DANGEROUS`. Оставить + переименовать MATCH_PHASES: `lobby/countdown/racing/results` |
| `formulas.ts` | DELETE | Слайм-формулы mass/XP/level, нет аналога в гонках |
| `sprites.ts` | DELETE | Слайм sprite-конфиги |
| `nameGenerator.ts` | **KEEP** | Новые игроки начинают с забавными случайными именами — онбординг сохраняется |
| `index.ts` | ADAPT | Убрать re-export удалённых файлов |

---

## Скоуп изменений в game server — systems/

`server/src/rooms/systems/`

**УДАЛИТЬ (9 файлов, ~2 100 строк):**

| Файл | Строк |
|------|-------|
| `combatSystem.ts` | 420 |
| `effectSystems.ts` | 157 |
| `hungerSystem.ts` | 25 |
| `rebelSystem.ts` | 25 |
| `safeZoneSystem.ts` | 19 |
| `abilityActivationSystem.ts` | 599 |
| `abilitySystem.ts` | 231 |
| `talentCardSystem.ts` | 32 |
| `talent/TalentGenerator.ts` | 302 |
| `talent/TalentModifierCalculator.ts` | 273 |
| `talent/index.ts` | 19 |

**АДАПТИРОВАТЬ:**

| Файл | Строк | Изменения |
|------|-------|-----------|
| `movementSystems.ts` | 408 | Удалить `if (FLAG_DASHING)` блок (~18 строк) из physicsSystem; упростить `room.getSlimeConfig()` → `room.getVehicleConfig()` |
| `collisionSystem.ts` | 246 | Удалить 2 строки `room.processCombat(p1, p2...)`. Orb-коллизии **оставить** (orbs теперь движущиеся препятствия) |
| `arenaGenerator.ts` | 76 | Оставить зоны и препятствия как элементы трассы; заменить `spawnInitialOrbs()` на `spawnRaceOrbs()` (без mass-типов) |
| `deathSystem.ts` | 17 | Изменить триггер с `mass <= minSlimeMass` на race-событие (DNF / выпал за пределы) |
| `playerStateManager.ts` | 181 | Сохранить скелет `handlePlayerRespawn`; удалить: kill xp, orb drop, level/talent/ability grants |
| `orbSystem.ts` | 94 | **ADAPT** — убрать логику поедания (mass gain при столкновении); оставить движение, дэмпинг, отскок от стен. Orbs = движущиеся безопасные препятствия |
| `chestSystem.ts` | 63 | **ADAPT** — заменить «выдать карточку способности» на «применить буст-бонус». Типы бустов: SPEED, SHIELD, MAGNET, MANEUVERING, MASS. Механика открытия и таймер респауна не меняются |
| `boostSystem.ts` | 24 | **ADAPT** — переименовать типы: `haste→SPEED, guard→SHIELD, greed→MASS`; удалить `rage` (урон не нужен); добавить `MANEUVERING` (множитель угловой тяги). Механика `boostEndTick`/`boostCharges` не меняется |

**ОСТАВИТЬ без изменений:**

`helpers/arenaGeneration.ts`, `helpers/worldUtils.ts`, `helpers/mathUtils.ts`, `helpers/index.ts`

---

## Скоуп изменений в GameState schema

`server/src/rooms/schema/GameState.ts`

**GameState — удалить поля:**
`hotZones, slowZones, toxicPools, projectiles, mines, safeZones, rebelId`

**GameState — оставить:**
`phase, serverTick, matchId, shutdownAt, players, obstacles, zones, leaderboard, orbs, chests`

`timeRemaining` — **переосмыслить**: не обратный отсчёт гонки, а защитный таймер сессии (максимальное время матча независимо от прогресса игроков). Значение из `race-balance.json`. Когда достигает 0 → все ещё не финишировавшие получают статус DNF.

**GameState — добавить:**
```typescript
@type({ map: Checkpoint }) checkpoints: MapSchema<Checkpoint>
// coins как отдельная коллекция (в отличие от орбов-препятствий)
// ИЛИ переиспользовать orbs с типом OrbType.COIN — решить при реализации
```

**Obstacle schema — добавить поле:**
```typescript
@type("boolean") isDangerous: boolean = false;
// true → столкновение вызывает респаун (если нет буста SHIELD)
```

**Player schema — удалить поля:**
Все `mod_*`, `abilitySlot*`, `dashEndTick`, `talentChoices*`, `xp`, `kills`, `abilityCardChoices*`, `classId`

**Player schema — оставить (буст-механика переиспользуется для race бустов):**
`id, name, spriteId, x, y, vx, vy, angle, angVel, mass, flags, inputX, inputY, assistFx, assistFy, assistTorque, isDead, respawnAtTick, invulnerableUntilTick, slowPct, yawSignHistory, boostType, boostEndTick, boostCharges`

**Player schema — добавить:**
```typescript
@type("uint8")   lap: number = 0;
@type("uint8")   checkpoint: number = 0;
@type("float32") bestLapMs: number = 0;
@type("float32") lastLapMs: number = 0;
@type("uint8")   racePosition: number = 0;
@type("uint32")  coinsCollected: number = 0;   // монетки за текущую гонку
@type("uint32")  lastInputTick: number = 0;    // для inactivity detection
```

---

## Дизайн: игровые объекты BonkRace

### Зоны (zones)

4 типа поверхностей трассы, различающихся физическими параметрами:

| Константа | Физический эффект | Аналог SlimeArena |
|-----------|-----------------|-------------------|
| `ZONE_TYPE_HIGH_FRICTION` | Высокий угловой drag → лучшее сцепление, медленнее слайды | `ZONE_TYPE_SLIME` |
| `ZONE_TYPE_LOW_FRICTION` | Низкий угловой drag → машину сносит при поворотах | `ZONE_TYPE_ICE` |
| `ZONE_TYPE_BOOST` | Множитель скорости > 1 | `ZONE_TYPE_TURBO` |
| `ZONE_TYPE_SLOW` | Множитель скорости < 1 | `ZONE_TYPE_LAVA` |

Реализация: в `flightAssistSystem` добавить `room.getZoneFrictionMultiplier(player)` рядом с уже существующим `room.getZoneSpeedMultiplier(player)`. `effectSystems.ts` остаётся удалённым — zone logic живёт в `flightAssistSystem`.

### Статические препятствия (obstacles)

Существующая система Obstacle schema + `OBSTACLE_TYPE_PILLAR` — переиспользовать.

- `isDangerous: false` (default) — упругий отскок, без последствий
- `isDangerous: true` — упругий отскок + триггер respawn (если нет буста SHIELD)

### Динамические препятствия + монетки (orbs — переиспользовать)

Орбы остаются, но с двумя семантическими типами через `OrbType`:

| OrbType | Поведение столкновения | Размер/масса |
|---------|----------------------|--------------|
| `COIN` | Подбирается касанием (любой частью тела) → `player.coinsCollected++` → wallet credit | Маленький |
| `OBSTACLE_SAFE` | Упругий импульс, нет последствий | Средний/большой |
| `OBSTACLE_DANGEROUS` | Упругий импульс + respawn (если нет SHIELD) | Средний/большой |

Монетки — переиспользованная логика поедания орбов: условие — любой overlap (не только ротовая зона слайма). Магнит-буст притягивает монетки через уже существующий магнит-механизм в `orbSystem.ts`.

Изменения в `orbSystem.ts`:
- Удалить: ограничение «только через mouth angle» при поедании (или упростить до любого overlap для COIN)
- Оставить: движение, дэмпинг, `applyWorldBoundsCollision`, player-orb impulse для OBSTACLE типов
- Оставить: логику магнита (притягивает OrbType.COIN)
- Адаптировать: вместо `addMass(orb.mass)` при поедании → `player.coinsCollected += orb.coinValue`

### Буст-пикапы (chests — переиспользовать)

Chest открывается при приближении игрока. Вместо карточки способности — один из 5 типов буста:

| Буст | Эффект | Источник в SlimeArena |
|------|--------|----------------------|
| `SPEED` | +N% скорости на T секунд | `haste` |
| `SHIELD` | Защита от respawn при столкновении с опасным препятствием | `guard` (иное применение) |
| `MAGNET` | Притягивает монетки (`OrbType.COIN`) | `magnet` (притягивал орбы) |
| `MANEUVERING` | +N% угловой тяги на T секунд | **Новый** |
| `MASS` | Временное увеличение массы/инерции | `greed` |

> Детальный список бустов, параметры и баланс — вынести в отдельный документ/конфиг после MVP.

### Защита сессии от злоупотреблений

Два механизма в `ArenaRoom`:

1. **Max session timeout** (`timeRemaining`): сервер прерывает матч по истечении `race-balance.maxSessionSec`. Все незавершившие → DNF.
2. **Inactivity detection**: если `currentTick - player.lastInputTick > inactivityThresholdTicks` → авто-DNF для конкретного игрока (не весь матч). Порог из `race-balance.json`.



---

## Скоуп изменений в ArenaRoom.ts (2789 строк)

`server/src/rooms/ArenaRoom.ts`

| Секция (строки) | Решение | Что делать |
|-----------------|---------|-----------|
| 1–120 Imports | ADAPT | Удалить импорты 13 удалённых систем + slime types из shared |
| 182–342 onCreate() | ADAPT | Удалить handlers: `selectClass, talentChoice, cardChoice`; переименовать room в `"bonkrace"` |
| 344–372 onAuth() | KEEP | JoinToken валидация не меняется |
| 373–470 onJoin() | ADAPT | Удалить classId assign, ability reset, talent reset. Добавить: `lap=0, checkpoint=0` |
| 499–549 onTick() | ADAPT | Новый tick: `applyInputs → flightAssistSystem → physicsSystem → collisionSystem → orbSystem → chestSystem → boostSystem → lapSystem → deathSystem → updatePlayerFlags` |
| 593–942 Boost/ability wrappers | ADAPT | Удалить ability callbacks; оставить: `isBoostActive, clearBoost, getHasteSpeedMultiplier`; распознать новые типы SPEED/SHIELD/MANEUVERING/MAGNET/MASS |
| 943–1382 Combat methods | DELETE | ~440 строк |
| 1383–1560 Orb/chest/hotzone methods | ADAPT | Оставить `updateOrbs(), updateChests()`; удалить hotzone методы; адаптировать chest onOpen → применить буст |
| 1560–1698 matchPhase/endMatch | ADAPT | Переименовать фазы (lobby/countdown/racing/results); `submitMatchResults` остаётся — отправляет результаты гонки в meta-server |
| 1798–1990 Arena generation | ADAPT | Убрать `spawnHotZones()`; `generateArena()` — добавить генерацию checkpoints |
| 1990–2080 Orb/chest spawn | ADAPT | Оставить `spawnOrb, spawnChest`; упростить типы орбов (убрать mass/rarity типы), адаптировать chest contents → boost types |
| 2081–2567 Mass/level/talent pipeline | DELETE | ~487 строк |
| 2568–2660 Pure utils | KEEP | `clamp`, `secondsToTicks`, etc. |
| 2661–2789 Telemetry | KEEP | `getRoomStats()`, `setShutdownAt()` |

**Итог ArenaRoom:** 2789 → ~1 050 строк

---

## Скоуп изменений в Client

`client/src/`

**УДАЛИТЬ (только slime-специфика без аналога в гонках):**

```
client/src/ui/components/AbilityButtons.tsx    (360)
client/src/ui/components/TalentModal.tsx        (206)
client/src/ui/data/abilities.ts                 (84)
client/src/ui/data/classes.ts                   (~60)
client/src/ui/data/rarity.ts                    (~20)
shared/src/formulas.ts                          (~400)
shared/src/sprites.ts                           (~600)
```

**ОСТАВИТЬ без изменений:**

```
client/src/platform/     (1870 строк, все 16 файлов) — KEEP
client/src/oauth/        (913 строк) — KEEP
client/src/api/metaServerClient.ts (388) — KEEP
client/src/services/authService.ts (745) — KEEP
client/src/services/matchmakingService.ts — KEEP
client/src/services/adsService.ts — KEEP
client/src/ui/components/AccountConflictModal.tsx (422) — KEEP (auth нужен)
client/src/ui/components/NicknameConfirmModal.tsx (365) — KEEP (auth нужен)
client/src/ui/components/RegistrationPromptModal.tsx (396) — KEEP (auth нужен)
client/src/ui/components/OAuthProviderSelector.tsx (310) — KEEP (auth нужен)
```

**АДАПТИРОВАТЬ:**

| Файл | Строк | Изменения |
|------|-------|-----------|
| `input/InputManager.ts` | 528 | Удалить 4 callbacks: `onTalentChoice, onAbilityCardChoice, getPlayerPendingCards, isClassSelectMode` |
| `rendering/draw.ts` | 226 | Удалить `getOrbColor, drawCrown`; добавить `drawVehicle(), drawCheckpoint(), drawCoin()` |
| `ui/components/MainMenu.tsx` | 571 | Убрать class selection (~200 строк); оставить name input, Play кнопку, платформенный вход |
| `ui/components/GameHUD.tsx` | 499 | Заменить mass/kills/level на lap/position/timer/coins (~-200 строк) |
| `ui/components/ResultsScreen.tsx` | 572 | Заменить mass-рейтинг на finish order + lap time + coins earned |
| `ui/components/LeaderboardScreen.tsx` | 862 | **ADAPT** — заменить mass-рейтинг на время круга по трассе; добавить фильтры: сегодня / неделя / сезон БП |
| `ui/signals/gameState.ts` | 667 | Удалить ability/talent/class сигналы; **оставить boost сигналы** (boostType, boostActive); оставить auth/profile/matchmaking сигналы |
| `services/leaderboardService.ts` | — | ADAPT — запросы по времени круга вместо mass; поддержка `?period=today\|week\|season` |
| `main.ts` | 3985 | Удалить slime-рендеринг (ability effects, crown, mouth animations); оставить: canvas, Colyseus connect, orb/coin рендер, chest рендер, vehicle рендер |



---

## ⚠️ Ключевые выводы из GDD v3.0

### Архитектурный сдвиг: клиентская физика

GDD §10.1: *«Для одиночного тайм-триала серверная симуляция в реальном времени избыточна. Клиент рассчитывает физику локально.»*

**Это кардинально меняет роль Colyseus ArenaRoom:**

| Компонент | SlimeArena | BonkRace MVP |
|-----------|-----------|-------------|
| Физика | Server (ArenaRoom, 30 tick/s) | **Client** (fixedDeltaTime в браузере) |
| Сетевой транспорт | WebSocket (Colyseus real-time) | **HTTPS REST** (submit result after finish) |
| State sync | Colyseus MapSchema → дельты | Нет (клиент standalone) |
| Colyseus ArenaRoom | Критичен | **Не нужен для MVP** |
| Shared physics module | Runs on server | **Runs on client** (тот же TypeScript код) |

**Следствие для форка:** `server/src/rooms/ArenaRoom.ts` и все systems/ — **не нужны для BonkRace MVP**. Их можно сохранить в репо нетронутыми (для будущего live-режима), не тратя время на адаптацию.

**Что важнее всего для MVP:** shared physics module (movementSystems, collisionSystem, helpers) должен компилироваться и запускаться на клиенте — это уже TS, уже модульный, готов к client-side запуску.

### Wall-thrust (§3.4) — новая механика

При скольжении боком о безопасную стену блоб получает микроускорение вдоль стены. Фирменная механика «bonk».

```
boostForce = wallThrustCoeff × normalForce × tangentDirection
```

Реализация: добавить в `collisionSystem.ts` в секцию `applyWorldBoundsCollision` — когда нормальная скорость > порога, добавить тангенциальную силу. Параметр `wallThrustCoeff` в конфиге трассы.

### Система призраков (§5) — новая инфраструктура

Ghost = записанный replay: `{ tick, posX, posY, angle }[]` с частотой tickRate.

Клиент записывает inputs во время заезда → отправляет на сервер → сервер хранит → другим игрокам приходит как ghost.

Новые компоненты:
- **Клиент:** `GhostRecorder` (запись posX/posY/angle каждый тик), `GhostPlayer` (воспроизведение ghost без коллизий)
- **Сервер:** хранение replay в Postgres (BYTEA или JSON), API retrieval

### Трасса дня (§4.1) — seed-based генерация

Seed = hash(дата). Генерация трассы из пула вручную созданных сегментов по seed. Трасса сервируется клиенту через API.

`rng.ts` из SlimeArena — **точное переиспользование**, та же концепция детерминированной генерации по seed.

### Поверхности (§4.2) — 3 типа, не 4

GDD определяет 3 типа (не 4, как в текущем плане):

| GDD тип | linearDragK | Аналог плана | Аналог SlimeArena |
|---------|-------------|-------------|------------------|
| Замедляющая (слайм/грязь) | × 3 | SLOW / HIGH_FRICTION | ZONE_TYPE_SLIME |
| Ускоряющая (гладкая) | × 0.3 + буст | BOOST | ZONE_TYPE_TURBO |
| Ледяная | × 0.05, без буста | LOW_FRICTION | ZONE_TYPE_ICE |

Четвёртый тип HIGH_FRICTION из текущего плана = SLOW из GDD. Можно объединить в 3 константы. Решть при реализации.

### Пикапы (§4.2) — только 2 типа в MVP

GDD явно называет только **Nitro** (мгновенный рывок) и **Teleport** (shortcut). Chest-система из SlimeArena (SPEED/SHIELD/MAGNET/MANEUVERING/MASS) → «Список бустов вынести в отдельный документ после MVP».

### Дополнительно переиспользуется из SlimeArena

Вещи, которые GDD подтверждает как прямое переиспользование, но не были в плане:

| Компонент SlimeArena | Использование в BonkRace | Статус в плане |
|---------------------|--------------------------|-----------------|
| `rng.ts` | Seed-based track generation (hash(date) → Rng(seed)) | Был KEEP, теперь ещё важнее |
| `VisualEffects.ts` | Trail-эффекты для косметики (искры, пламя, радуга) | Был KEEP |
| `WalletService` | Монетки (soft-валюта) | Был KEEP |
| `AdsService` | Rewarded video (×2 монет после финиша, кулдаун 1 час) | Был KEEP |
| `ShopService` | Gacha-автомат (100 монет/спин) + pity-система | Был KEEP |
| `configService.ts` (client) | Per-track config loading из мета-сервера | Был KEEP |
| `spriteId` поле в Player | Косметика: скин, шапка, след, свечение | Осталось в schema ✓ |
| Platform adapters (Telegram/CrazyGames/Yandex) | Все 3 платформы P0–P1 в GDD | Были KEEP ✓ |
| `SmoothingSystem` (client) | Ghost interpolation между тиками | Был KEEP ✓ |
| `GameLoopManager` (client) | Fixed-timestep accumulator loop (§10.5) | Был KEEP ✓ |

### Новые компоненты, которых нет в SlimeArena

| Компонент | Где | Зачем |
|-----------|-----|-------|
| `GhostRecorder` | client | Запись `{ tick, posX, posY, angle }[]` каждый тик |
| `GhostPlayer` | client | Воспроизведение ghost (без коллизий, полупрозрачный) |
| Wall-thrust logic | `collisionSystem.ts` | +tangentForce при скольжении о стену |
| `POST /api/submit-run` | meta-server | Приём результата + replay + валидация |
| `GET /api/track-of-day` | meta-server | Отдать TrackConfig (seed, obstacles, surfaces) |
| `GET /api/ghosts` | meta-server | Отдать PB ghost + соперник ghost |
| TrackConfig schema | shared | Физические параметры трассы (thrustForwardN, linearDragK, etc.) |
| MedalService | meta-server | Расчёт порогов Bronze/Silver/Gold из распределения финишей |
| StreakService | meta-server | Ежедневный стрик с заморозкой |
| CrazyGames Leaderboard API | client/platform | Внешний лидерборд (ASC, недельный сброс) через CrazyGames SDK |
| `db/migrations/012_ghost_replays.sql` | DB | Таблица `ghost_replays (userId, trackId, finishMs, replayData BYTEA)` |
| `db/migrations/013_medals_streaks.sql` | DB | Таблицы `medals`, `daily_streaks`, `streak_freezes` |

### rng.ts → перенести в shared/ (критично!)

`server/src/utils/rng.ts` (22 строки) — детерминированный LCG RNG. В SlimeArena живёт на сервере. В BonkRace MVP физика на клиенте → клиенту нужен тот же RNG для seed-based генерации трасс (GDD §4.1) и детерминизма (GDD §3.5). **Перенести в `shared/src/rng.ts`**, сервер импортирует оттуда же.

### Динамические препятствия — orbSystem покрывает не всё

GDD §4.2 описывает 3 типа динамических препятствий:
- **Катящиеся объекты (шары)** — ✅ покрывается orbSystem (движущиеся орбы)
- **Вращающиеся турели** — ❌ фиксированная позиция + вращение. Нужен новый тип объекта
- **Выдвигающиеся блоки** — ❌ ритмичное появление/исчезновение. Нужен новый тип

Для MVP достаточно катящихся шаров (orbSystem). Турели и блоки — post-MVP (когда появится редактор трасс или ручной левел-дизайн).

---

## Полный инвентарь переиспользуемой инфраструктуры

План ранее говорил «всё остальное остаётся нетронутым». Ниже — конкретный список того, что переносится в форк **без изменений** (кроме ребрендинга `slime-arena` → `bonk-race`).

### Meta-server: сервисы (14 файлов, ~4 500 строк) — KEEP

| Сервис | Строк | Использование в BonkRace |
|--------|-------|-------------------------|
| `AuthService.ts` | 568 | Мультиплатформенная авторизация + сессии |
| `WalletService.ts` | 269 | Монетки (soft-валюта), идемпотентные транзакции (GDD §7.2) |
| `ShopService.ts` | 223 | Гача-автомат + pity (GDD §7.3) |
| `AdsService.ts` | 166 | Rewarded video + Redis grants (GDD §7.5) |
| `AnalyticsService.ts` | 372 | Буферизированная аналитика событий |
| `ABTestService.ts` | 390 | A/B тесты с детерминированным назначением |
| `ConfigService.ts` | 357 | Версионированные RuntimeConfig |
| `PlayerService.ts` | 165 | Профили, никнеймы, скины |
| `MatchmakingService.ts` | 358 | Redis FIFO очередь (post-MVP PvP) |
| `JoinTokenService.ts` | 150 | JWT join-токены для матчей |
| `GeoIPService.ts` | 347 | Региональная фильтрация OAuth |
| `auditService.ts` | 142 | Аудит-лог админ-действий |
| `systemMetrics.ts` | 427 | CPU/RAM мониторинг (Docker-aware) |
| `RatingService.ts` | 276 | **ADAPT:** mass → bestFinishMs |

### Meta-server: роуты (14 файлов) — KEEP

`auth.ts`, `profile.ts`, `matchmaking.ts`, `matchResults.ts`, `wallet.ts`, `shop.ts`, `ads.ts`, `payment.ts`, `config.ts`, `configAdmin.ts`, `analytics.ts`, `abtest.ts`, `admin.ts`, `leaderboard.ts` (ADAPT)

### Meta-server: middleware (3 файла, ~762 строки) — KEEP

`middleware/auth.ts` (requireAuth/requireAdmin/requireServerToken), `middleware/adminAuth.ts` (Admin JWT + TOTP 2FA), `middleware/rateLimiter.ts` (rate limiting IP + user)

### Meta-server: платформа (11 файлов, ~971 строка) — KEEP

6 AuthProvider'ов (Dev, Telegram, Yandex, Poki, CrazyGames, GameDistribution) + AuthProviderFactory + OAuthProviderFactory + Google/Yandex OAuth провайдеры + интерфейс IAuthProvider

### Meta-server: платежи (4 файла, ~538 строк) — KEEP

`IPaymentProvider.ts`, `PaymentProviderFactory.ts`, `TelegramStarsProvider.ts` (GDD §7.7), `YandexPayProvider.ts`

### Meta-server: утилиты — KEEP

`jwtUtils.ts` (438 строк, 5 типов JWT), `nicknameValidator.ts` (183 строки), `server.ts` (211 строк, Express bootstrap), `db/pool.ts` (82 строки, PG + Redis), `db/migrate.ts` (55 строк, migration runner)

### Существующие DB миграции (001–010) — KEEP без изменений

| Миграция | Таблицы | Значение для BonkRace |
|----------|---------|----------------------|
| 001 | users, sessions, profiles, wallets, transactions, **battlepass_progress**, **social_invites**, achievements | Ядро. `social_invites` = рефералы (GDD §9.3)! `battlepass_progress` = Battle Pass (GDD §7.4)! |
| 002 | ab_tests, analytics_events, purchase_receipts | A/B тесты, аналитика |
| 007 | leaderboard_total_mass, leaderboard_best_mass, oauth_links | ADAPT: mass → time таблицы |
| 008 | users.is_anonymous, match_results.claim | Guest → auth upgrade flow |
| 009 | admin_users (TOTP), admin_sessions, audit_log | Admin dashboard |

> **Находка:** `social_invites` и `battlepass_progress` уже существуют в миграции 001 — готовая DB-инфраструктура для рефералов и Battle Pass из GDD.

### Client: инфраструктура (не была в плане) — KEEP

| Файл | Строк | Описание | GDD ref |
|------|-------|---------|---------|
| `input/joystick.ts` | 245 | Виртуальный джойстик (touch/pen), 0% slime-кода | §3.1 |
| `input/InputManager.ts` | 528 | Keyboard/pointer/mouse routing + focus/blur | §3.1 |
| `ui/screens/ScreenManager.tsx` | 392 | Навигация экранов + модальная система + HW back button | Все экраны |
| `ui/UIBridge.tsx` | 437 | Canvas ↔ Preact мост (init/render/destroy/setPhase) | Архитектура |
| `ui/utils/injectStyles.ts` | 42 | CSS injection, HMR-safe | — |
| `ui/components/BootScreen.tsx` | 210 | Загрузочный экран с progress/error/retry | — |
| `ui/components/ConnectingScreen.tsx` | 57 | Спиннер подключения | — |
| `rendering/draw.ts` | 227 | worldToScreen, screenToWorld, lerp, clamp, drawCircle | Рендеринг |
| `effects/VisualEffects.ts` | 205 | Floating text, flash effects | Косметика |
| `game/GameLoopManager.ts` | 144 | Fixed-timestep accumulator loop | §10.5 |
| `game/SmoothingSystem.ts` | 338 | Интерполяция между тиками | §5: ghosts |
| `services/defaultRuntimeConfig.ts` | 52 | Fallback конфиг при недоступности сервера | — |
| `services/leaderboardService.ts` | 198 | Leaderboard API + кэш | §5.6 |
| `services/matchResultsService.ts` | 197 | Результаты + guest upgrade claimToken flow | §2 |
| `styles/inline-boot.css` | 75 | Мгновенный boot-экран до загрузки JS | — |

### Docker / CI / Scripts — KEEP (переименовать `slime-arena` → `bonk-race`)

| Компонент | Кол-во | Что |
|-----------|--------|-----|
| `docker/*.yml` | 4 | Dev, DB-only, app+db, monolith compose |
| `docker/*.Dockerfile` | 3 | Multi-stage builds (app, db, monolith) |
| `docker/entrypoint-*.sh` | 2 | DB init + migrations |
| `docker/supervisord*.conf` | 2 | Process management |
| `.github/workflows/` | 4 | CI build, container publish (GHCR), branch protection |
| `scripts/` | 10 | Version sync, backup/restore, start/stop |
| `admin-dashboard/` | ~12 | Admin UI: login + TOTP, dashboard, rooms, audit |
| `version.json` | 1 | Единый источник версии |

---

## GDD-фичи: статус в SlimeArena

| GDD фича | Раздел | Есть в SlimeArena? | Действие |
|----------|--------|-------------------|----------|
| Drag-to-steer + джойстик | §3.1 | ✅ `InputManager` + `joystick.ts` | KEEP |
| FlightAssist | §3.2 | ✅ `flightAssistSystem` | KEEP (на клиенте) |
| Semi-Implicit Euler | §3.2 | ✅ `physicsSystem` | KEEP (на клиенте) |
| Fixed timestep loop | §10.5 | ✅ `GameLoopManager.ts` | KEEP |
| Seed-based генерация | §4.1 | ✅ `rng.ts` | **Перенести в shared/** |
| Поверхности (3 типа) | §4.2 | ✅ zones в constants.ts | ADAPT: переименовать |
| Монетки (soft-валюта) | §7.2 | ✅ `WalletService` | KEEP |
| Гача + pity | §7.3 | ✅ `ShopService` | KEEP |
| Rewarded ads | §7.5 | ✅ `AdsService` | KEEP |
| Battle Pass | §7.4 | ✅ Таблица `battlepass_progress` | KEEP |
| Telegram Stars | §7.7 | ✅ `TelegramStarsProvider` | KEEP |
| Рефералы | §9.3 | ✅ Таблица `social_invites` | KEEP |
| Лидерборд | §5.6 | ⚠️ Есть mass-based | ADAPT: mass → time ASC |
| Pickup-бустеры | §4.2 | ⚠️ chestSystem есть | ADAPT: Nitro/Teleport вместо 5 типов |
| Монетки на трассе | §7.2 | ⚠️ orbSystem есть | ADAPT: OrbType.COIN |
| Engine Scaling per track | §3.3 | ⚠️ Есть per-class | ADAPT: per-track TrackConfig |
| Катящиеся препятствия | §4.2 | ⚠️ orbSystem (движущиеся шары) | ADAPT |
| Wall-thrust | §3.4 | ❌ | НОВОЕ в collisionSystem |
| Ghost система | §5 | ❌ | НОВОЕ: GhostRecorder + GhostPlayer |
| Трасса дня API | §4.1 | ❌ | НОВОЕ: TrackService + REST |
| Медали | §6 | ❌ | НОВОЕ: MedalService |
| Стрики | §8 | ❌ | НОВОЕ: StreakService |
| Вращающиеся турели | §4.2 | ❌ | Post-MVP |
| Выдвигающиеся блоки | §4.2 | ❌ | Post-MVP |
| Replay валидация L2-L3 | §10.3 | ❌ | Post-MVP |
| Wordle-шеринг | §9.2 | ❌ | Post-MVP Sprint 2 |
| Ghost-учитель | §4.3, §5.3 | ❌ | Предзаписанные данные |
| Dust-система (дубликаты) | §7.3 | ❌ | НОВОЕ в ShopService |
| Тирированные ghost-вызовы | §5.4 | ❌ | Post-launch |

---

## Новые файлы для BonkRace MVP

### Shared (physics client-side)

| Файл | Строк | Описание |
|------|-------|---------|
| `shared/src/trackConfig.ts` | ~60 | `TrackConfig` интерфейс: `thrustForwardN, thrustLateralN, turnTorqueNm, linearDragK, wallThrustCoeff`, obstacles[], surfaces[], checkpoints[], seed, medalTimesMs |

### Client

| Файл | Строк | Описание |
|------|-------|---------|
| `client/src/game/GhostRecorder.ts` | ~60 | Записывает `{ tick, posX, posY, angle }[]` каждый тик. `start()`, `stop()`, `getReplay()` |
| `client/src/game/GhostPlayer.ts` | ~100 | Воспроизводит ghost-replay: интерполяция позиции между тиками. Полупрозрачный блоб с именем |
| `client/src/rendering/track.ts` | ~120 | `drawSurfaces(ctx, surfaces)`, `drawFinishLine(ctx)`, `drawCheckpoint(ctx, cp)` |
| `client/src/rendering/blob.ts` | ~80 | `drawBlob(ctx, player, camera)` — top-down блоб с лицом на боку (лицо в направлении движения) |

### Meta-server — новые REST endpoints

| Файл | Строк | Описание |
|------|-------|---------|
| `server/src/meta/routes/tracks.ts` | ~80 | `GET /api/track-of-day → TrackConfig`, `GET /api/tracks/:id` |
| `server/src/meta/routes/ghosts.ts` | ~80 | `GET /api/ghosts?trackId=X → Ghost[]` (PB + соперник на 1–3 позиции выше) |
| `server/src/meta/routes/runs.ts` | ~120 | `POST /api/submit-run → {time, replay, hash}` + базовая L1 валидация |
| `server/src/meta/services/TrackService.ts` | ~100 | TrackConfig в Redis (кэш 24ч); seed = `rng.ts hash(date)` |
| `server/src/meta/services/GhostService.ts` | ~120 | CRUD ghost replays; подбор соперника по лидерборду |
| `server/src/meta/services/MedalService.ts` | ~80 | Пороги Bronze/Silver/Gold динамически по первым N финишам; до N — из `TrackConfig.medalTimesMs` |
| `server/src/meta/services/StreakService.ts` | ~100 | Ежедневный стрик: инкремент по UTC-дате финиша, 1 заморозка бесплатно + за 50 монет |
| `db/migrations/011_race_leaderboard.sql` | ~30 | `race_leaderboard (userId, trackId, bestFinishMs, updatedAt)` |
| `db/migrations/012_ghost_replays.sql` | ~25 | `ghost_replays (userId, trackId, finishMs, replayData BYTEA, createdAt)` |
| `db/migrations/013_medals_streaks.sql` | ~40 | `medals`, `daily_streaks (currentStreak, lastFinishDate, freezesRemaining)` |

> **Примечание:** `server/src/rooms/` (ArenaRoom + systems) сохраняются **нетронутыми** для будущего live-режима; в MVP не используются.

---

## Изменения в Meta-server (адаптация существующего)

| Компонент | Изменение |
|-----------|----------|
| `meta/routes/leaderboard.ts` | Добавить `?period=today\|week\|season&trackId=...`; сортировка по `bestFinishMs` ASC |
| `meta/services/RatingService.ts` | Адаптировать: вместо mass → записывать `bestFinishMs` per track |
| `meta/routes/matchmaking.ts` | Переиспользовать для тренировочного PvP (post-MVP) |

Все остальные сервисы (auth, payments, shop, ads, admin, analytics, A/B) — **не изменяются**.



---

## Критические зависимости

| Риск | Митигация |
|------|-----------|
| `flightAssistSystem` вызывает `room.getSlimeConfig(player)` | Заменить на `room.getVehicleConfig()` с фиксированными параметрами из `race-balance.json` |
| `flightAssistSystem` не знает о HIGH/LOW_FRICTION зонах | Добавить `room.getZoneFrictionMultiplier(player)` рядом с существующим `getZoneSpeedMultiplier`; effectSystems.ts — DELETE (зоны через прямой вызов в flightAssist) |
| `physicsSystem` вызывает `room.getAbilityLevelForAbility()` | Удалить `if (FLAG_DASHING)` блок (~18 строк) из `physicsSystem` |
| `combatSystem` вызывается из `collisionSystem` (2 строки) | Удалить 2 строки в `collisionSystem.ts:64-65`; player-orb/coin collision остаётся |
| `chestSystem` вызывает `room.giveAbilityCard()` | Заменить вызов на `room.applyRaceBoost(player, boostType)` |
| `boostSystem` ссылается на удалённый тип `RAGE` | Удалить тип и его ветку в `boostSystem.ts` |
| Coin collection: mouth-angle check неприменимо | В `orbSystem.ts` заменить mouth-check на simple overlap для `OrbType.COIN` |
| `npm run test` содержит `orb-bite` тест | Удалить тест в Фазе 3 |
| Colyseus schema backward compat | На форке нет старых клиентов → OK |
| Импорты удалённых файлов из shared | Strip shared последним, после server+client |

---

## Порядок выполнения (7 фаз)

### Фаза 0: Fork на GitHub
1. GitHub → `komleff/slime-arena` → Fork → `komleff/bonk-race`
2. `git clone https://github.com/komleff/bonk-race`
3. `git remote add upstream https://github.com/komleff/slime-arena`
4. `git checkout -b race/init`
5. Создать Beads epic + 7 phase-задач (см. ниже)

### Фаза 1: Ребрендинг
- `package.json` и `*/package.json`: `@slime-arena/` → `@bonk-race/`
- `README.md`: переписать
- **Верификация:** `npm install` проходит без ошибок

### Фаза 2: Shared package — физика на клиенте
```bash
rm shared/src/{formulas,sprites}.ts
# Отредактировать: constants.ts (зоны + флаги), config.ts, types.ts, index.ts
# Добавить: shared/src/trackConfig.ts
# Обновить импорты
```
Цель: shared physics (movementSystems, collisionSystem, helpers) компилируется и запускается без Colyseus в браузере.

**Верификация:** `npm run build:shared` — 0 ошибок

### Фаза 3: Client — physics loop + рендеринг
- Удалить: `AbilityButtons.tsx, TalentModal.tsx`, `ui/data/{abilities,classes,rarity}.ts`
- Создать: `game/GhostRecorder.ts`, `game/GhostPlayer.ts`, `rendering/track.ts`, `rendering/blob.ts`
- Адаптировать: `main.ts` — заменить Colyseus-receive-state на локальный physics loop с `GameLoopManager`; `InputManager.ts`, `GameHUD.tsx`, `ResultsScreen.tsx`, `MainMenu.tsx`
- Адаптировать: `collisionSystem.ts` — добавить wall-thrust логику

**Верификация:** `npm run dev:client` — блоб управляется, физика работает локально, ghost отображается

### Фаза 4: Meta-server — новые REST endpoints
- Создать: `routes/tracks.ts`, `routes/ghosts.ts`, `routes/runs.ts`
- Создать: `services/TrackService.ts`, `services/GhostService.ts`, `services/MedalService.ts`, `services/StreakService.ts`
- Адаптировать: `routes/leaderboard.ts`, `services/RatingService.ts`
- Запустить миграции 011–013

**Верификация:** `GET /api/track-of-day` → возвращает TrackConfig; `POST /api/submit-run` → сохраняет результат

### Фаза 5: Shared package (полная)
- Добавить: первую трассу вручную в БД / seed
- Верифицировать: клиент загружает trackConfig → генерирует трассу по seed → отображает checkpoint

### Фаза 6: Integration smoke test
1. `npm run dev:server` + `npm run dev:client`
2. Игрок стартует → физика локальная → пересекает финиш → POST /api/submit-run → лидерборд обновляется
3. При следующем заходе — ghost previous run отображается
4. `docker-compose up` — все контейнеры healthy

---

### Post-MVP: Game server strip (Colyseus live-режим)

Этот блок **не выполняется для MVP**. ArenaRoom сохраняется нетронутым. Выполнить перед реализацией live-гонок:

```bash
# Тогда удалить (9 файлов):
rm server/src/rooms/systems/{combatSystem,effectSystems,hungerSystem,rebelSystem,safeZoneSystem,abilityActivationSystem,abilitySystem,talentCardSystem}.ts
rm -rf server/src/rooms/systems/talent/
# Адаптировать: movementSystems, collisionSystem, arenaGenerator, deathSystem,
#               playerStateManager, orbSystem, chestSystem, boostSystem, ArenaRoom, GameState
```



---

## Beads-задачи для форка

```bash
# Epic
bd create --title="BonkRace: Fork + MVP" --type=epic

# Phase tasks
bd create --title="[BonkRace] Ф0: Fork репо + upstream remote + Beads epic" --type=task --priority=0
bd create --title="[BonkRace] Ф1: Ребрендинг package.json" --type=task --priority=0
bd create --title="[BonkRace] Ф2: Shared package — physics client-side" --type=task --priority=0
bd create --title="[BonkRace] Ф3: Client — physics loop + blob rendering + ghost" --type=task --priority=0
bd create --title="[BonkRace] Ф4: Meta-server — tracks/ghosts/runs REST API" --type=task --priority=1
bd create --title="[BonkRace] Ф5: Первая ручная трасса + TrackConfig" --type=task --priority=1
bd create --title="[BonkRace] Ф6: Integration smoke test" --type=task --priority=2
```

```

---

## Верификация end-to-end (MVP)

1. `npm run build` — 0 ошибок TypeScript
2. `npm run dev:server` (meta-server `:3000`) — стартует
3. `npm run dev:client` — `:5173`, блоб управляется, физика работает в браузере
4. Пройти трассу: финишировать → `POST /api/submit-run` → время сохраняется
5. При следующем заходе: ghost предыдущей попытки отображается полупрозрачно
6. `GET /api/leaderboard?trackId=X&period=today` → список с временами
7. Авторизация через DevAuthProvider (или Yandex) работает
8. `docker-compose up` — все контейнеры healthy

---

*Подготовлен: 2026-03-07 | Обновлён: полный инвентарь инфраструктуры + GDD v3.0 cross-reference*
*Стратегия: client-side physics; auth/платформы/инфра — KEEP; ArenaRoom — нетронут до live-режима*
*Инфраструктура: ~50 файлов / ~7 000+ строк переиспользуются без изменений*

