# План подготовки рефакторинга ArenaRoom.ts

## Цель
Подготовить проектирование разбиения `ArenaRoom.ts` на отдельные системы без изменений логики.

## Границы
- **Входит:** описание модулей, порядок вызовов, точки данных, план миграции.
- **Не входит:** реализация и перенос кода.

## Карта будущих систем
1. **PhysicsSystem**
   - Ответственность: физика движения, коллизии со стенами, инерция.
   - Точки данных: `players`, `orbs`, `chests`, `mines`, `projectiles`.
2. **CollisionSystem**
   - Ответственность: столкновения сущностей между собой.
   - Точки данных: `players`, `orbs`, `chests`, `mines`.
3. **CombatSystem**
   - Ответственность: укусы, урон, эффекты, Last Breath.
   - Точки данных: `players`, `combat`, `status` поля.
4. **PickupSystem**
   - Ответственность: поедание орбов, награды.
   - Точки данных: `orbs`, `players`.
5. **AbilitySystem**
   - Ответственность: активации умений, кулдауны, эффекты.
   - Точки данных: `players`, `abilities`, `projectiles`, `mines`.
6. **TalentSystem**
   - Ответственность: карточки талантов, эффекты, очередь.
   - Точки данных: `players`, `talents`, `pendingTalentCard`.
7. **ChestSystem**
   - Ответственность: спавн/открытие сундуков и награды.
   - Точки данных: `chests`, `players`.
8. **PhaseSystem**
   - Ответственность: фазы матча, таймеры, Results.
   - Точки данных: `state.phase`, `timeRemaining`.

## Порядок вызовов (черновик)
1. Input -> AbilitySystem
2. PhysicsSystem
3. CollisionSystem
4. CombatSystem
5. PickupSystem
6. ChestSystem
7. TalentSystem
8. PhaseSystem

## Риски
- Разный порядок вызовов систем меняет баланс.
- Скрытые зависимости через общие поля `Player`.
- Детерминизм при переносе логики.

## Карта функций (черновик)
### PhaseSystem
- `handlePhaseChange()`
- `phaseSystem()`
- `resetMatch()`
- `restartMatch()`

### AbilitySystem
- `activateAbility()`
- `activateDash()`
- `activateShield()`
- `activateSlow()`
- `activateMagnet()`
- `activatePull()`
- `activateProjectile()`
- `activateSpit()`
- `activateBomb()`
- `activatePush()`
- `activateMine()`
- `projectileSystem()`
- `mineSystem()`

### PhysicsSystem
- `physicsSystem()`
- `applyWorldBounds()`
- `applySpeedCap()`
- `getSlimeInertiaForPlayer()`

### CollisionSystem
- `collisionSystem()`
- `orbOrbCollisions()`
- `slimeSlimeCollisions()`
- `slimeChestCollisions()`

### CombatSystem
- `processCombat()`
- `applyProjectileDamage()`
- `applySelfDamage()`
- `statusEffectSystem()`
- `spawnPvPBiteOrbs()`

### PickupSystem
- `tryEatOrb()`
- `updateOrbs()`

### TalentSystem
- `talentCardSystem()`
- `applyTalentCardChoice()`
- `addTalentToPlayer()`
- `generateTalentCard()`
- `tryGenerateNextTalentCard()`
- `awardTalentToPlayer()`
- `recalculateTalentModifiers()`

### ChestSystem
- `spawnChest()`
- `chestSystem()`
- `openChest()`

## Общие утилиты (helpers)
- `randomPointInMap()`
- `clampPointToWorld()`
- `secondsToTicks()`
- `msToTicks()`
- `getTalentConfig()`
- `getTalentRarity()`
- `getClassName()`
