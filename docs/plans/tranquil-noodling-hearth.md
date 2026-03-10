# План: Анизотропное трение (Lateral Grip) — TZ v1.4

**Дата:** 2026-03-10 (обновлён PM-ревью)
**Ветка:** `tz-lateral-grip`
**ТЗ:** `docs/tz/TZ-LateralGrip-v1_4.md`

---

## Контекст

Текущая физика использует изотропный drag (`linearDragK`) — одинаковое сопротивление во всех направлениях. Блоб скользит боком при повороте ("Жигули на льду"). Нужна анизотропная модель: поперечное трение >> продольного, что даёт сцепление с дорогой и контролируемый дрифт.

Дополнительно: ТЗ вводит `SurfaceConfig` (7 параметров на поверхность) для зон Ice/Mud/Boost/Sand и 3 новых BonkLab-пресета.

**Смена модели трения:** текущая физика — force-based (`F_drag = -m × linearDragK × v`), новая — decay-based (`v' = v × max(0, 1 - dragK × dt)`). Decay-модель стабильнее при больших `dragK × dt` и не требует `max(0, ...)` от знака силы, только от множителя. При `lateralGripMultiplier = 1.0` разница ~0.01% — допустимо.

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

**Все точки использования `linearDragK` (верифицированы):**

| Файл | Что менять |
|------|-----------|
| `shared/src/physics/integrator.ts:84-85` | `drag.linearDragK` → `drag.forwardDragK` |
| `shared/src/config.ts:181` | Интерфейс + дефолт |
| `shared/src/trackConfig.ts:97` | Интерфейс |
| `config/balance.json:279` | `linearDragK` → `forwardDragK` + добавить `lateralGripMultiplier` |
| `server/src/rooms/systems/movementSystems.ts:112` | Передача в `integratePhysics` |
| `client/src/lab/BonkLab.ts:746,908,1097` | `worldPhysics.linearDragK` |
| `client/src/lab/ui/LabToolbar.tsx:28,44,56,72` | Ключи в 4 пресетах (Ультралёгкий, Лёгкий и быстрый, Тяжёлый и инертный, Космос) |
| `client/src/lab/ui/LabPanel.tsx:380` | Ключ слайдера |
| `client/src/lab/main.ts:47` | Стартовый пресет |
| `client/src/raceMain.ts:249` | `config.physics.linearDragK` |

**Примечание:** пресеты "Slime Arena" (пустой, сброс к дефолтам) и "Минимальный FA" (только FA-параметры) не содержат `linearDragK` — их не трогаем на этом этапе.

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

**Важно (смена модели):** текущий код применяет drag как **силу** (`F = -m × dragK × v`, затем `v += F/m × dt`). Новый код применяет **decay** (`v *= max(0, 1 - dragK × dt)`). Математически при малых `dt` эквивалентно, но побитово результат отличается. Тест детерминизма пройдёт (сравнивает два запуска с одним seed, не эталонный хэш).

---

### Задача 3: FlightAssist — surface-множители

**Файл:** `shared/src/physics/flightAssist.ts`

Добавить параметр `surfaceAssist: ISurfaceAssistParams` в `computeFlightAssist`.

Применение (верифицированные строки):
- `thrustForward *= surfaceAssist.thrustMultiplier` (после talent bonuses, строка 147: `thrustForward *= 1 + modifiers.thrustForwardBonus`)
- `turnTorqueAdjusted *= surfaceAssist.turnTorqueMultiplier` (строка 150: `turnTorque * (1 + modifiers.turnBonus)`)
- `speedLimitForward *= surfaceAssist.speedLimitMultiplier` (строка ~160, перед `totalSpeedMultiplier`)

**Удаление `zoneSpeedMultiplier`:** убрать поле `zoneSpeedMultiplier` из `IExternalMultipliers` (строка 44 flightAssist.ts) и его использование на строке 169. Заменяется на `surfaceAssist.speedLimitMultiplier`. Также удалить `getZoneSpeedMultiplier` из `ArenaRoom.ts:1941-1951`.

При `DEFAULT_SURFACE_ASSIST_PARAMS` (все 1.0) — поведение идентично.

---

### Задача 4: SurfaceConfig и пресеты поверхностей

**Новый файл:** `shared/src/surfaceConfig.ts`

```typescript
import { ZONE_TYPE_ICE, ZONE_TYPE_MUD, ZONE_TYPE_TURBO } from "./constants";

export interface SurfaceConfig {
    forwardDragMultiplier: number;
    lateralGripMultiplier: number;
    angularDragMultiplier: number;
    thrustMultiplier: number;
    turnTorqueMultiplier: number;
    speedLimitMultiplier: number;
    zoneThrustN: number;
}

export const DEFAULT_SURFACE: SurfaceConfig = {
    forwardDragMultiplier: 1.0,
    lateralGripMultiplier: 1.0,
    angularDragMultiplier: 1.0,
    thrustMultiplier: 1.0,
    turnTorqueMultiplier: 1.0,
    speedLimitMultiplier: 1.0,
    zoneThrustN: 0,
};

export const SURFACE_PRESETS: Record<string, SurfaceConfig> = {
    normal: { ...DEFAULT_SURFACE },
    ice:    { forwardDragMultiplier: 0.3, lateralGripMultiplier: 0.15, angularDragMultiplier: 0.3, thrustMultiplier: 1.0, turnTorqueMultiplier: 0.5, speedLimitMultiplier: 1.0, zoneThrustN: 0 },
    mud:    { forwardDragMultiplier: 2.5, lateralGripMultiplier: 2.5, angularDragMultiplier: 2.0, thrustMultiplier: 0.5, turnTorqueMultiplier: 0.8, speedLimitMultiplier: 0.6, zoneThrustN: 0 },
    boost:  { forwardDragMultiplier: 0.5, lateralGripMultiplier: 0.7, angularDragMultiplier: 1.0, thrustMultiplier: 1.0, turnTorqueMultiplier: 1.0, speedLimitMultiplier: 1.5, zoneThrustN: 15000 },
    sand:   { forwardDragMultiplier: 1.5, lateralGripMultiplier: 1.8, angularDragMultiplier: 1.3, thrustMultiplier: 0.8, turnTorqueMultiplier: 1.0, speedLimitMultiplier: 0.8, zoneThrustN: 0 },
};

/** Маппинг ZONE_TYPE_* → ключ пресета поверхности */
export const ZONE_TYPE_TO_SURFACE: Record<number, string> = {
    [ZONE_TYPE_ICE]: "ice",
    [ZONE_TYPE_MUD]: "mud",
    [ZONE_TYPE_TURBO]: "boost",
};

/** Получить SurfaceConfig по типу зоны. Неизвестный тип → normal. */
export function getSurfaceForZoneType(zoneType: number): SurfaceConfig {
    const key = ZONE_TYPE_TO_SURFACE[zoneType];
    return key ? SURFACE_PRESETS[key] : SURFACE_PRESETS.normal;
}
```

Маппинг `ZONE_TYPE → SurfaceConfig` размещён здесь, а **не** в ArenaRoom — это уменьшает зависимость ArenaRoom от деталей конфигурации поверхностей.

Также добавить пресеты зон в `config/balance.json` → секция `surfaces`.

---

### Задача 5: Серверная интеграция — movementSystems.ts + ArenaRoom

**Файлы:**
- `server/src/rooms/systems/movementSystems.ts` — передать `ISurfaceParams` и `ISurfaceAssistParams`
- `server/src/rooms/ArenaRoom.ts` — обновить методы:
  - `getZoneFrictionMultiplier` (строки 1953-1963) → `getSurfaceParams(player): ISurfaceParams`
    - Использует `getSurfaceForZoneType()` из `surfaceConfig.ts`
    - Разделяет `SurfaceConfig` на `ISurfaceParams` (4 поля для integrator)
  - `getZoneSpeedMultiplier` (строки 1941-1951) → **УДАЛИТЬ**
    - Заменяется `getSurfaceAssistParams(player): ISurfaceAssistParams`
    - Разделяет `SurfaceConfig` на `ISurfaceAssistParams` (3 поля для flightAssist)

**`IExternalMultipliers`:** удалить поле `zoneSpeedMultiplier`. Оставить `hasteSpeedMultiplier` и `lastBreathSpeedPenalty`. В `movementSystems.ts:60` убрать `zoneSpeedMultiplier` из объекта external, добавить передачу `surfaceAssist` как отдельного параметра в `computeFlightAssist`.

---

### Задача 6: Клиентская гонка — raceMain.ts

**Файл:** `client/src/raceMain.ts`

Это **ОТДЕЛЬНАЯ** физика. Изменения:

1. **`getSurfaceDragMultiplier()` (строка 148)** → `getSurfaceConfig(): SurfaceConfig`
   - Текущая: возвращает число (SLOW=3.0, ICE=0.05, BOOST=0.3)
   - Новая: возвращает `SurfaceConfig` из `SURFACE_PRESETS`
   - Маппинг: SLOW → `sand` (или custom), ICE → `ice`, BOOST → `boost`
2. **`physicsSystem()`** — заменить `const drag = baseDrag * surfaceMul` (строки 249-251) на анизотропный decay по алгоритму ТЗ §4.2
3. **`flightAssistSystem()`** — применить `thrustMultiplier`, `turnTorqueMultiplier` к тяге/моменту
4. **`applySurfaceBoost()` (строка 166)** — **УДАЛИТЬ**. Заменяется `zoneThrustN` + `speedLimitMultiplier`.
   - **Важно:** текущий `applySurfaceBoost` реализует hard clamp к `BOOST_SPEED_CAP = 200`. В новой модели cap обеспечивается `speedLimitMultiplier = 1.5` через FlightAssist overspeed damping. Убедиться, что overspeed damping работает корректно в raceMain (он может быть упрощён). Если нет — добавить soft cap аналогичный FA.

---

### Задача 7: BonkLab интеграция

**Файлы:** `client/src/lab/BonkLab.ts`, `client/src/lab/main.ts`

1. `linearDragK` → `forwardDragK` во всех местах (строки 746, 908, 1097)
2. Добавить `lateralGripMultiplier` в `buildFlatParams()` (строка 1097+)
3. Передавать `ISurfaceParams` в `integratePhysics` (зоны ice/mud → `getSurfaceForZoneType()`)
4. Передавать `ISurfaceAssistParams` в `computeFlightAssist`
5. Стартовый пресет в `main.ts:47`: `"worldPhysics.forwardDragK": 0.005, "worldPhysics.lateralGripMultiplier": 1.0`
6. Орб-физика (строка 908): заменить `linearDragK` → `forwardDragK`. Орбы не используют анизотропию — для них `forwardDragK` применяется изотропно, как раньше.

---

### Задача 8: BonkLab пресеты и UI

**Файлы:** `client/src/lab/ui/LabToolbar.tsx`, `client/src/lab/ui/LabPanel.tsx`

**LabToolbar.tsx — обновить существующие пресеты:**

| # | Текущий | Новый | `forwardDragK` | `lateralGripMultiplier` | Примечания |
|---|---------|-------|----------------|------------------------|------------|
| 0 | Ультралёгкий | Ультралёгкий | 0.001 | 5.0 | Был `linearDragK: 0.001`. Добавить grip, чтобы не скользил боком |
| 1 | Slime Arena | Slime Arena | _(пустой, дефолты)_ | _(пустой, дефолты)_ | Без изменений — характер сохраняется через дефолты из balance.json |
| 2 | Лёгкий и быстрый | **BonkRace v0.1** | 0.005 | 1.0 | Переименовать. Сохранить характер — grip=1.0 (изотропный, как было) |
| 3 | Тяжёлый и инертный | Тяжёлый и инертный | 0.04 | 3.0 | Был `linearDragK: 0.04`. Добавить умеренный grip |
| 4 | Минимальный FA | **Дрифт (без FA)** | 0.03 | 3.0 | Переосмыслить: FA отключён + низкий grip = управляемый дрифт. Добавить физ. параметры |
| 5 | Космос | Космос | 0 | 0 | `forwardDragK: 0` → grip неважен, но ставим 0 для консистентности |

**LabToolbar.tsx — добавить 3 новых пресета:**

| Пресет | forwardDragK | lateralGripMultiplier | angularDragK | restitution | Ощущение |
|--------|-------------|----------------------|-------------|-------------|----------|
| Картинг | 0.08 | 15.0 | 0.15 | 0.7 | «Рельсы», прилипает к траектории |
| Ралли | 0.06 | 7.0 | 0.10 | 0.8 | Контролируемый дрифт на поворотах |
| Бампер-кар | 0.07 | 10.0 | 0.08 | 0.95 | Упругие столкновения, хорошее сцепление |

**Итого: 9 пресетов** (6 обновлённых + 3 новых).

**Пресет «Дрифт (без FA)» — детальное описание:**

```typescript
{
    label: "Дрифт (без FA)",
    values: {
        "mass": 80,
        "propulsion.thrustForwardN": 60000,
        "propulsion.thrustReverseN": 20000,
        "propulsion.thrustLateralN": 5000,     // минимальная боковая тяга
        "propulsion.turnTorqueNm": 50000,
        "limits.speedLimitForwardMps": 350,
        "worldPhysics.forwardDragK": 0.03,
        "worldPhysics.lateralGripMultiplier": 3.0,
        "assist.counterAccelEnabled": false,
        "assist.autoBrakeMaxThrustFraction": 0.1,
        "assist.overspeedDampingRate": 0,
        "assist.yawDampingBoostFactor": 1,
        "assist.angularBrakeBoostFactor": 1,
    },
}
```

Характер: FA почти отключён, боковая тяга минимальна. Блоб дрейфует на поворотах, но `lateralGripMultiplier = 3.0` даёт достаточно сцепления, чтобы не превращаться в «Космос». Игрок чувствует разницу между прямой и поворотом.

**LabPanel.tsx:**
- Заменить слайдер `linearDragK` на два: `forwardDragK` + `lateralGripMultiplier`
- `lateralGripMultiplier`: min=0, max=50, tooltip: "Множитель бокового сцепления. Больше = меньше заноса."

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

**Примечание:** дефолт `lateralGripMultiplier: 1.0` в balance.json означает, что пресет "Slime Arena" (пустой, сброс к дефолтам) сохранит текущий изотропный характер — блоб ведёт себя как раньше (grip=1 = одинаковое трение во всех направлениях).

---

### Задача 10: Тесты

**Файлы:** `server/tests/determinism.test.js`, **новый** `server/tests/anisotropic-friction.test.js`

1. **Тест детерминизма** (`determinism.test.js`): пересчёт эталона НЕ нужен — тест сравнивает два параллельных запуска с одним seed (строки 131-137), а не snapshot с pre-computed hash. Если новая физика детерминирована — тест пройдёт автоматически. Нужно только обновить сборку (`integratePhysics` новая сигнатура).

2. **Новые тесты** (`anisotropic-friction.test.js`):
   - `lateralGripMultiplier=1.0` → одинаковое затухание forward/lateral
   - `lateralGripMultiplier=10.0` + поворот 90° → боковая скорость гасится за 2-3 тика
   - `max(0,...)` при extreme values → нет инверсии
   - `zoneThrustN=15000, 10 тиков` → монотонный рост скорости
   - `thrustMultiplier=0.5` → силы FA вдвое меньше
   - Все surface-множители = 1.0 → поведение ~идентично текущему (допуск ~0.01%)

---

## Порядок выполнения

```
0 (интерфейсы) → 1 (linearDragK→forwardDragK) → 4 (SurfaceConfig + маппинг) → 9 (balance.json)
    → 2 (анизотропное трение) → 3 (FlightAssist surface + удаление zoneSpeedMultiplier)
    → 5 (сервер: ArenaRoom + movementSystems) → 7 (BonkLab) → 8 (пресеты UI)
    → 6 (raceMain.ts) → 10 (тесты)
```

---

## Риски

| Риск | Митигация |
|------|-----------|
| Смена модели force→decay: побитовое расхождение | Допустимо. Тест детерминизма сравнивает два запуска, не эталон — пройдёт |
| raceMain.ts — отдельная физика | Задача 6 выделена. Воспроизвести ту же decay-модель |
| wall-thrust ослабнет из-за поперечного трения | Компенсировать `wallThrustCoeff`. Тестировать в BonkLab |
| Удаление `applySurfaceBoost` без soft cap | Проверить, что overspeed damping в raceMain обеспечивает cap. Иначе добавить |
| Orb-физика в BonkLab использует `linearDragK` | Заменить на `forwardDragK`. Для орбов анизотропия не применяется |
| `zoneSpeedMultiplier` мёртвый код после удаления | Удалить полностью из `IExternalMultipliers`, `ArenaRoom`, `movementSystems` |

---

## Верификация

1. `npm run build` — проект собирается
2. `npm run test` — детерминизм + orb-bite + arena-generation зелёные
3. BonkLab: все 9 пресетов переключаются, слайдеры `forwardDragK` / `lateralGripMultiplier` работают
4. BonkLab: пресет "Slime Arena" — поведение как раньше (изотропный drag)
5. BonkLab: пресет "BonkRace v0.1" — поведение как раньше (grip=1.0)
6. BonkLab: пресет "Космос" — нулевое трение, свободный полёт
7. BonkLab: пресет "Дрифт (без FA)" — управляемый дрифт, FA отключён
8. BonkLab: пресет "Картинг" — блоб "прилипает" к траектории
9. BonkLab: пресет "Ралли" — контролируемый дрифт на поворотах
10. BonkLab: зоны Ice/Mud корректно влияют на физику
11. Клиентская гонка (`npm run dev:client`): поверхности Slow/Ice/Boost работают по новой модели
12. Серверная арена: зоны Ice/Mud/Turbo работают с анизотропным трением

---

## Критические файлы

| Файл | Роль |
|------|------|
| `shared/src/physics/integrator.ts` | Ядро: анизотропный decay |
| `shared/src/physics/flightAssist.ts` | Surface-множители для thrust/torque/speedLimit + удаление zoneSpeedMultiplier |
| `shared/src/surfaceConfig.ts` | **НОВЫЙ**: SurfaceConfig + SURFACE_PRESETS + маппинг ZONE_TYPE→surface |
| `shared/src/config.ts` | WorldPhysicsConfig: linearDragK → forwardDragK |
| `shared/src/trackConfig.ts` | TrackPhysicsConfig: linearDragK → forwardDragK |
| `config/balance.json` | Параметры: forwardDragK, lateralGripMultiplier |
| `server/src/rooms/systems/movementSystems.ts` | Серверная обвязка |
| `server/src/rooms/ArenaRoom.ts` | getSurfaceParams, getSurfaceAssistParams, удаление getZoneSpeedMultiplier |
| `client/src/raceMain.ts` | Клиентская гонка — отдельная физика |
| `client/src/lab/BonkLab.ts` | BonkLab физика |
| `client/src/lab/ui/LabToolbar.tsx` | 9 пресетов |
| `client/src/lab/ui/LabPanel.tsx` | Слайдеры |
| `server/tests/anisotropic-friction.test.js` | **НОВЫЙ**: тесты анизотропного трения |
