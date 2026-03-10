# План: Анизотропное трение (Lateral Grip) — TZ v1.4

**Дата:** 2026-03-10
**Ветка:** `tz-lateral-grip`
**ТЗ:** `docs/tz/TZ-LateralGrip-v1_4.md`

---

## Контекст

Текущая физика использует изотропный drag (`linearDragK`) — одинаковое сопротивление во всех направлениях. Блоб скользит боком при повороте ("Жигули на льду"). Нужна анизотропная модель: поперечное трение >> продольного, что даёт сцепление с дорогой и контролируемый дрифт.

Дополнительно: ТЗ вводит `SurfaceConfig` (7 параметров на поверхность) для зон Ice/Mud/Boost/Sand и 3 новых BonkLab-пресета.

---

## Архитектура: три физических реализации

В проекте **три** независимых физики, все требуют обновления:

| Реализация | Файлы | Используется |
|------------|-------|-------------|
| **Shared pure functions** | `shared/src/physics/integrator.ts`, `flightAssist.ts` | Сервер (ArenaRoom PvP) + BonkLab |
| **Серверная обвязка** | `server/src/rooms/systems/movementSystems.ts` | Передаёт зоновые множители в shared |
| **Клиентская гонка** | `client/src/raceMain.ts` | Отдельная упрощённая физика, НЕ shared |

---

## Задачи

### Задача 0: Интерфейсы ISurfaceParams + ISurfaceAssistParams

**Файлы:** `shared/src/physics/integrator.ts`, `shared/src/physics/flightAssist.ts`

Новые интерфейсы (заменяют скалярный `zoneFrictionMultiplier`):

```typescript
// integrator.ts
export interface ISurfaceParams {
    forwardDragMultiplier: number;   // 1.0
    lateralGripMultiplier: number;   // 1.0
    angularDragMultiplier: number;   // 1.0
    zoneThrustN: number;             // 0
}
export const DEFAULT_SURFACE_PARAMS: ISurfaceParams = { ... };

// flightAssist.ts
export interface ISurfaceAssistParams {
    thrustMultiplier: number;        // 1.0
    turnTorqueMultiplier: number;    // 1.0
    speedLimitMultiplier: number;    // 1.0
}
export const DEFAULT_SURFACE_ASSIST_PARAMS: ISurfaceAssistParams = { ... };
```

---

### Задача 1: Замена `linearDragK` → `forwardDragK` + `lateralGripMultiplier`

**Файлы:**
- `shared/src/physics/integrator.ts` — `IWorldDragParams { forwardDragK, lateralGripMultiplier, angularDragK }`
- `shared/src/config.ts` — `WorldPhysicsConfig { forwardDragK, lateralGripMultiplier, ... }`
- `shared/src/trackConfig.ts` — `TrackPhysicsConfig { forwardDragK, lateralGripMultiplier, ... }`

**Все точки использования `linearDragK` (найдены grep-ом):**

| Файл | Что менять |
|------|-----------|
| `shared/src/physics/integrator.ts:84-85` | `drag.linearDragK` → `drag.forwardDragK` |
| `shared/src/config.ts:181` | Интерфейс + дефолт |
| `shared/src/trackConfig.ts:97` | Интерфейс |
| `config/balance.json:279` | `linearDragK` → `forwardDragK` + добавить `lateralGripMultiplier` |
| `server/src/rooms/systems/movementSystems.ts:112` | Передача в `integratePhysics` |
| `client/src/lab/BonkLab.ts:746,908,1097` | `worldPhysics.linearDragK` |
| `client/src/lab/ui/LabToolbar.tsx:28,44,56,72` | Ключи пресетов |
| `client/src/lab/ui/LabPanel.tsx:380` | Ключ слайдера |
| `client/src/lab/main.ts:47` | Стартовый пресет |
| `client/src/raceMain.ts:249` | `config.physics.linearDragK` |

---

### Задача 2: Анизотропное трение в `integratePhysics`

**Файл:** `shared/src/physics/integrator.ts`

Новая сигнатура: `surface: ISurfaceParams` вместо `zoneFrictionMultiplier: number`

Алгоритм (ТЗ §4.2):
1. Применить силы к скорости (assist + `zoneThrustN` по heading)
2. Разложить скорость: `vFwd = dot(vel, forward)`, `vLat = dot(vel, right)`
3. Анизотропный decay:
   - `decayFwd = max(0, 1 - forwardDragK * surface.forwardDragMultiplier * dt)`
   - `decayLat = max(0, 1 - forwardDragK * lateralGripMultiplier * surface.lateralGripMultiplier * dt)`
4. Собрать обратно: `vel = forward * vFwd' + right * vLat'`
5. Angular drag: `angularDragK * surface.angularDragMultiplier`

**Обратная совместимость (FR-3):** При `lateralGripMultiplier=1.0` и всех surface=1.0, модель decay отличается от текущей force-based на ~0.01% (произведение dt²). Тест детерминизма **сломается** — нужно пересчитать эталон.

---

### Задача 3: FlightAssist — surface-множители

**Файл:** `shared/src/physics/flightAssist.ts`

Добавить параметр `surfaceAssist: ISurfaceAssistParams` в `computeFlightAssist`.

Применение:
- `thrustForward *= surfaceAssist.thrustMultiplier` (после talent bonuses, строки ~147)
- `turnTorqueAdjusted *= surfaceAssist.turnTorqueMultiplier` (строка ~150)
- `speedLimitForward *= surfaceAssist.speedLimitMultiplier` (строки ~160)

При `DEFAULT_SURFACE_ASSIST_PARAMS` (все 1.0) — поведение идентично.

---

### Задача 4: SurfaceConfig и пресеты поверхностей

**Новый файл:** `shared/src/surfaceConfig.ts`

```typescript
export interface SurfaceConfig {
    forwardDragMultiplier: number;
    lateralGripMultiplier: number;
    angularDragMultiplier: number;
    thrustMultiplier: number;
    turnTorqueMultiplier: number;
    speedLimitMultiplier: number;
    zoneThrustN: number;
}

export const SURFACE_PRESETS: Record<string, SurfaceConfig> = {
    normal: { ... all 1.0, zoneThrustN: 0 },
    ice:    { forwardDragMultiplier: 0.3, lateralGripMultiplier: 0.15, angularDragMultiplier: 0.3, thrustMultiplier: 1.0, turnTorqueMultiplier: 0.5, speedLimitMultiplier: 1.0, zoneThrustN: 0 },
    mud:    { 2.5, 2.5, 2.0, 0.5, 0.8, 0.6, 0 },
    boost:  { 0.5, 0.7, 1.0, 1.0, 1.0, 1.5, 15000 },
    sand:   { 1.5, 1.8, 1.3, 0.8, 1.0, 0.8, 0 },
};
```

Также добавить пресеты зон в `config/balance.json` → секция `surfaces`.

---

### Задача 5: Серверная интеграция — movementSystems.ts + ArenaRoom

**Файлы:**
- `server/src/rooms/systems/movementSystems.ts` — передать `ISurfaceParams` и `ISurfaceAssistParams`
- `server/src/rooms/ArenaRoom.ts` — новые методы:
  - `getSurfaceParams(player): ISurfaceParams` (заменяет `getZoneFrictionMultiplier`)
  - `getSurfaceAssistParams(player): ISurfaceAssistParams` (заменяет `getZoneSpeedMultiplier`)
  - `getZoneSurfaceConfig(zoneType): SurfaceConfig` — маппинг ZONE_TYPE_* → SurfaceConfig

**Дублирование `zoneSpeedMultiplier`:** Текущий `getZoneSpeedMultiplier` используется в `IExternalMultipliers`. С новой системой `speedLimitMultiplier` из SurfaceConfig заменяет эту логику. Установить `zoneSpeedMultiplier = 1.0` для всех зон, а скорость модулировать через `surfaceAssist.speedLimitMultiplier`.

---

### Задача 6: Клиентская гонка — raceMain.ts

**Файл:** `client/src/raceMain.ts`

Это **ОТДЕЛЬНАЯ** физика. Изменения:

1. **`getSurfaceDragMultiplier()`** → `getSurfaceConfig()` — возвращает `SurfaceConfig` вместо числа
2. **`flightAssistSystem()`** — применить `thrustMultiplier`, `turnTorqueMultiplier` к тяге/моменту
3. **`physicsSystem()`** — анизотропный decay по алгоритму ТЗ, `zoneThrustN`, `angularDragMultiplier`
4. **`applySurfaceBoost()`** — **УДАЛИТЬ**. Заменяется `zoneThrustN` + `speedLimitMultiplier`

---

### Задача 7: BonkLab интеграция

**Файлы:** `client/src/lab/BonkLab.ts`, `client/src/lab/main.ts`

1. `linearDragK` → `forwardDragK` во всех местах
2. Добавить `lateralGripMultiplier` в `buildFlatParams()`
3. Передавать `ISurfaceParams` в `integratePhysics` (зоны ice/mud → `SURFACE_PRESETS`)
4. Передавать `ISurfaceAssistParams` в `computeFlightAssist`
5. Стартовый пресет: `"worldPhysics.forwardDragK": 0.005, "worldPhysics.lateralGripMultiplier": 1.0`

---

### Задача 8: BonkLab пресеты и UI

**Файлы:** `client/src/lab/ui/LabToolbar.tsx`, `client/src/lab/ui/LabPanel.tsx`

**LabToolbar.tsx:**
- Во всех 6 пресетах: `linearDragK` → `forwardDragK`, добавить `lateralGripMultiplier: 1.0`
- Переименовать "Лёгкий и быстрый" → "BonkRace 0.1"
- Добавить 3 новых пресета:

| Пресет | forwardDragK | lateralGripMultiplier | angularDragK | restitution |
|--------|-------------|----------------------|-------------|-------------|
| Картинг | 0.08 | 15.0 | 0.15 | 0.7 |
| Ралли | 0.06 | 7.0 | 0.10 | 0.8 |
| Бампер-кар | 0.07 | 10.0 | 0.08 | 0.95 |

**LabPanel.tsx:**
- Заменить слайдер `linearDragK` на два: `forwardDragK` + `lateralGripMultiplier`

---

### Задача 9: balance.json + resolveBalanceConfig

**Файлы:** `config/balance.json`, `shared/src/config.ts`

```json
"worldPhysics": {
    "forwardDragK": 0.1,
    "lateralGripMultiplier": 1.0,
    "angularDragK": 1.3,
    ...
}
```

В `resolveBalanceConfig`: `linearDragK` → `forwardDragK`, добавить `lateralGripMultiplier` с дефолтом 1.0.

---

### Задача 10: Тесты

**Файлы:** `server/tests/determinism.test.js`, **новый** `server/tests/anisotropic-friction.test.js`

1. Пересчитать эталон детерминизма (180 тиков с новой моделью)
2. Новые тесты:
   - `lateralGripMultiplier=1.0` → одинаковое затухание forward/lateral
   - `lateralGripMultiplier=10.0` + поворот 90° → боковая скорость гасится за 2-3 тика
   - `max(0,...)` при extreme values → нет инверсии
   - `zoneThrustN=15000, 10 тиков` → монотонный рост скорости
   - `thrustMultiplier=0.5` → силы FA вдвое меньше
   - Все surface-множители = 1.0 → поведение ~идентично текущему

---

## Порядок выполнения

```
0 (интерфейсы) → 1 (linearDragK→forwardDragK) → 4 (SurfaceConfig) → 9 (balance.json)
    → 2 (анизотропное трение) → 3 (FlightAssist surface) → 5 (сервер)
    → 7 (BonkLab) → 8 (пресеты UI) → 6 (raceMain.ts) → 10 (тесты)
```

---

## Риски

| Риск | Митигация |
|------|-----------|
| Тест детерминизма сломается (100%) | Пересчитать эталон. Разница < 0.01% при grip=1.0 |
| raceMain.ts — отдельная физика | Задача 6 выделена. Воспроизвести ту же decay-модель |
| wall-thrust ослабнет из-за поперечного трения | Компенсировать `wallThrustCoeff`. Тестировать в BonkLab |
| Дублирование `zoneSpeedMultiplier` / `speedLimitMultiplier` | Убрать `getZoneSpeedMultiplier`, перенести в `getSurfaceAssistParams` |
| Orb-физика в BonkLab использует `linearDragK` | Заменить на `forwardDragK`. Для орбов анизотропия не применяется |

---

## Верификация

1. `npm run build` — проект собирается
2. `npm run test` — детерминизм + orb-bite + arena-generation зелёные
3. BonkLab: все 9 пресетов переключаются, слайдеры `forwardDragK` / `lateralGripMultiplier` работают
4. BonkLab: пресет "Картинг" — блоб "прилипает" к траектории
5. BonkLab: пресет "Ралли" — контролируемый дрифт на поворотах
6. BonkLab: зоны Ice/Mud корректно влияют на физику
7. Клиентская гонка (`npm run dev:client`): поверхности Slow/Ice/Boost работают по новой модели
8. Серверная арена: зоны Ice/Mud/Turbo работают с анизотропным трением

---

## Критические файлы

| Файл | Роль |
|------|------|
| `shared/src/physics/integrator.ts` | Ядро: анизотропный decay |
| `shared/src/physics/flightAssist.ts` | Surface-множители для thrust/torque/speedLimit |
| `shared/src/surfaceConfig.ts` | **НОВЫЙ**: SurfaceConfig + SURFACE_PRESETS |
| `shared/src/config.ts` | WorldPhysicsConfig: linearDragK → forwardDragK |
| `shared/src/trackConfig.ts` | TrackPhysicsConfig: linearDragK → forwardDragK |
| `config/balance.json` | Параметры: forwardDragK, lateralGripMultiplier |
| `server/src/rooms/systems/movementSystems.ts` | Серверная обвязка |
| `server/src/rooms/ArenaRoom.ts` | getSurfaceParams, getSurfaceAssistParams |
| `client/src/raceMain.ts` | Клиентская гонка — отдельная физика |
| `client/src/lab/BonkLab.ts` | BonkLab физика |
| `client/src/lab/ui/LabToolbar.tsx` | 9 пресетов |
| `client/src/lab/ui/LabPanel.tsx` | Слайдеры |
| `server/tests/anisotropic-friction.test.js` | **НОВЫЙ**: тесты анизотропного трения |
