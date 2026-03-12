# План v2: Анизотропное трение (Lateral Grip) — после ревью

**Дата:** 2026-03-10
**Ветка:** `tz-lateral-grip`
**ТЗ:** `docs/tz/TZ-LateralGrip-v1_4.md`
**Базовый план:** `docs/plans/tranquil-noodling-hearth.md`
**Эпик:** bonk-race-b18

---

## Контекст

Три ревью-агента (Security, Architecture, Code Quality) единогласно запросили правки. Выявлены 3 блокера (P0), 8 замечаний P1, 6 замечаний P2. Все решения утверждены оператором.

**Ключевые решения оператора:**
- Фокус на BonkLab-прототипе. Серверная (ArenaRoom, movementSystems) и клиентская гонка (raceMain.ts) — отложены.
- Использовать `exp(-k*dt)` вместо `max(0, 1-k*dt)` — стабильнее, negligible CPU cost.
- Добавить пресет "Рельсы" (или F1) с максимальным сцеплением.
- Пересчитать grip-значения пресетов для ожидаемого поведения.
- Пресеты получают индивидуальный grip — сознательное отступление от ТЗ §10.1.
- "Тяжёлый и инертный" → "Грузовик" с новым характером.
- "Минимальный FA" → "Дрифт (без FA)" — ручное управление заносом (отключён FA, низкий grip, контр-руление).
- Добавить зону Sand (ZONE_TYPE_SAND = 6) — промежуточная зона с вязким характером.
- Runtime-валидация SurfaceConfig — отдельная задача LG-11.
- Обновить всю документацию (GDD, reverse docs).
- Параметры столкновений (restitution) — вынести в конфиг для персонажей и орбов отдельно (tech debt, не в этом ТЗ).

---

## Изменения decay-модели: exp(-k*dt)

Вместо `v' = v * max(0, 1 - k*dt)` используем `v' = v * exp(-k*dt)`.

**Преимущества:**
- Стабильна при любом dt (нет зануления при lag spikes)
- Нет "мёртвой зоны" при высоких k (max(0,...) обнуляет при k*dt > 1)
- Frame-rate independent (результат не зависит от tick rate)
- Производительность: `Math.exp()` — 1 инструкция FPU, ~2-3 нс

**Формулы:**
```
lateralDragK = forwardDragK * lateralGripMultiplier * surface.lateralGripMultiplier
decayFwd = exp(-forwardDragK * surface.forwardDragMultiplier * dt)
decayLat = exp(-lateralDragK * dt)
```

---

## Пересчёт пресетов

BonkLab работает на 60 Гц (FIXED_DT = 1/60). Формула: `exp(-forwardDragK * grip * t) = target_fraction`.

| Пресет | forwardDragK | grip | k=dragK*grip | Боковая скорость через 0.5с | Ощущение |
|--------|-------------|------|---|---|---|
| Ультралёгкий | 0.001 | 20.0 | 0.02 | 99% | Невесомый, почти нет бокового трения |
| Slime Arena | 0.1 (дефолт) | 1.0 (дефолт) | 0.1 | 95% | Изотропный, как раньше |
| BonkRace v0.1 | 0.005 | 1.0 | 0.005 | 99.7% | Изотропный, как раньше |
| Грузовик | 0.04 | 12.0 | 0.48 | 79% | Тяжёлый, инертный, медленно разворачивается |
| Дрифт (без FA) | 0.03 | 6.0 | 0.18 | 91% | FA выключен, контр-руление, управляемые заносы |
| Космос | 0 | 0 | 0 | 100% | Нулевое трение, как раньше |
| Ралли | 0.06 | 30.0 | 1.8 | 41% | Заметный дрифт на поворотах, FA помогает |
| Бампер-кар | 0.07 | 54.0 | 3.78 | 15% | Хорошее сцепление, упругие столкновения |
| Картинг | 0.08 | 40.0 | 3.2 | 20% | Плотное сцепление, лёгкий дрифт на скорости |
| Рельсы | 0.12 | 80.0 | 9.6 | 0.8% | Боковая скорость гасится за 0.3с |

---

## Задачи (обновлённые)

### Фаза 1: Shared-интерфейсы и конфиги (задачи 0, 1, 4, 9, 11)

**LG-0 (bonk-race-9lu): Интерфейсы** — без изменений от базового плана.

**LG-1 (bonk-race-9aw): Rename linearDragK → forwardDragK** — дополнить:
- `server/src/meta/data/trackPresets.ts:154` — `linearDragK: 0.15`
- `shared/src/config.ts:921` — дефолт в `DEFAULT_BALANCE_CONFIG`
- `shared/src/config.ts:1932-1935` — `resolveBalanceConfig` парсинг

**LG-4 (bonk-race-qxk): SurfaceConfig** — дополнить:
- Добавить утилиты `toSurfaceParams(config)` и `toSurfaceAssistParams(config)` в `surfaceConfig.ts`
- Тип `SurfaceConfig = ISurfaceParams & ISurfaceAssistParams` — формализовать связь
- Добавить `ZONE_TYPE_SAND = 6` в `shared/src/constants.ts` (после ZONE_TYPE_TURBO=5)
- Добавить `SURFACE_PRESETS.sand` — вязкий характер:

  ```typescript
  sand: {
    forwardDragMultiplier: 2.5,   // сильное продольное торможение
    lateralGripMultiplier: 3.0,   // умеренное боковое сцепление (песок держит, но вязко)
    angularDragMultiplier: 2.0,   // затрудняет повороты
    thrustMultiplier: 0.6,        // двигатель работает хуже
    turnTorqueMultiplier: 0.7,    // руление затруднено
    speedLimitMultiplier: 0.6,    // лимит скорости снижен
    zoneThrustN: 0,               // нет доп. тяги
  }
  ```

- Добавить `ZONE_TYPE_SAND` в `ZONE_TYPE_TO_SURFACE` маппинг

**LG-9 (bonk-race-b18.4): balance.json** — без изменений.

**LG-11 (НОВАЯ): Runtime-валидация SurfaceConfig**
- Файлы: `shared/src/surfaceConfig.ts`, `shared/src/config.ts`
- Добавить `clampSurfaceConfig(config): SurfaceConfig` с hard bounds из ТЗ §5.1:
  - `forwardDragMultiplier: [0.01, 10.0]`
  - `lateralGripMultiplier: [0.01, 10.0]`
  - `angularDragMultiplier: [0.01, 10.0]`
  - `thrustMultiplier: [0.0, 5.0]`
  - `turnTorqueMultiplier: [0.0, 5.0]`
  - `speedLimitMultiplier: [0.1, 3.0]`
  - `zoneThrustN: [0, 100000]`
- Вызывать при загрузке конфига в `resolveBalanceConfig`
- Логировать warning при clamp

### Фаза 2: Ядро физики (задачи 2, 3)

**LG-2 (bonk-race-76d): Анизотропное трение** — изменение модели:
- Использовать `exp(-k*dt)` вместо `max(0, 1-k*dt)`
- Файл: `shared/src/physics/integrator.ts`
- Алгоритм:
  1. Применить силы к скорости (assist + `zoneThrustN` по heading)
  2. Разложить: `vFwd = dot(vel, forward)`, `vLat = dot(vel, right)`
  3. Decay: `vFwd *= exp(-forwardDragK * surface.forwardDragMultiplier * dt)`
  4. Decay: `vLat *= exp(-forwardDragK * lateralGripMultiplier * surface.lateralGripMultiplier * dt)`
  5. Собрать: `vel = forward * vFwd + right * vLat`
  6. Angular: `angVel *= exp(-angularDragK * surface.angularDragMultiplier * dt)`

**LG-3 (bonk-race-3bh): FlightAssist surface-множители** — без изменений от базового плана.
- Удалить `zoneSpeedMultiplier` из `IExternalMultipliers`
- Добавить `surfaceAssist: ISurfaceAssistParams` в `computeFlightAssist`

### Фаза 3: BonkLab (задачи 7, 8) — ПРИОРИТЕТ

**LG-7 (bonk-race-b18.2): BonkLab интеграция** — дополнить:
- Мигрировать legacy зоны:
  - `zones.ice.frictionMultiplier` (строка 1103) → `ISurfaceParams` через `SURFACE_PRESETS.ice`
  - `zones.mud.frictionMultiplier` (строка 1104) → `SURFACE_PRESETS.mud`
  - `zones.mud.speedMultiplier` (строка 1105) → `ISurfaceAssistParams.speedLimitMultiplier`
  - `zones.turbo.accelBoost` (строка 1106) → `ISurfaceParams.zoneThrustN`
- Обновить zone detection loop (строки 861-870) — вместо `this.currentZone = zone.type` сохранять `SurfaceConfig`
- Заменить `zoneFrictionMultiplier` (строки 751-762) на передачу `ISurfaceParams`
- Заменить `slowPct` механизм (строка 656) на `ISurfaceAssistParams.speedLimitMultiplier`
- Обновить Turbo-буст (строки 691-709) → `zoneThrustN` через ISurfaceParams
- `zoneSpeedMultiplier: 1` (строка 672) → удалить поле из `IExternalMultipliers`
- Добавить обработку `ZONE_TYPE_SAND` в zone detection loop — маппинг через `ZONE_TYPE_TO_SURFACE`
- Орб-физика (строка 908): `forwardDragK` изотропно, использовать `exp(-dragK*dt)` для декея

**LG-8 (bonk-race-b18.3): BonkLab пресеты и UI** — обновить пресеты:

10 пресетов (6 обновлённых + 4 новых):

```typescript
// Ультралёгкий
{ mass: 20, thrustForwardN: 80000, ..., forwardDragK: 0.001, lateralGripMultiplier: 20.0 }

// Slime Arena — пустой, дефолты из balance.json (grip=1.0)
{}

// BonkRace v0.1 (бывш. "Лёгкий и быстрый")
{ mass: 40, ..., forwardDragK: 0.005, lateralGripMultiplier: 1.0 }

// Грузовик (бывш. "Тяжёлый и инертный")
{ mass: 350, thrustForwardN: 15000, thrustReverseN: 5000, thrustLateralN: 6000,
  turnTorqueNm: 12000, speedLimitForwardMps: 150,
  forwardDragK: 0.04, lateralGripMultiplier: 12.0, angularDragK: 0.12 }

// Дрифт (без FA) (бывш. "Минимальный FA")
{ mass: 80, thrustForwardN: 60000, thrustLateralN: 5000, turnTorqueNm: 50000,
  forwardDragK: 0.03, lateralGripMultiplier: 6.0,
  counterAccelEnabled: false, autoBrakeMaxThrustFraction: 0.1,
  overspeedDampingRate: 0, yawDampingBoostFactor: 1, angularBrakeBoostFactor: 1 }

// Космос
{ forwardDragK: 0, lateralGripMultiplier: 0, angularDragK: 0, restitution: 1.0 }

// Ралли (НОВЫЙ)
{ mass: 120, thrustForwardN: 55000, thrustLateralN: 15000, turnTorqueNm: 45000,
  speedLimitForwardMps: 350, forwardDragK: 0.06, lateralGripMultiplier: 30.0,
  angularDragK: 0.10, restitution: 0.8 }

// Бампер-кар (НОВЫЙ)
{ mass: 100, thrustForwardN: 45000, thrustLateralN: 20000, turnTorqueNm: 35000,
  speedLimitForwardMps: 300, forwardDragK: 0.07, lateralGripMultiplier: 54.0,
  angularDragK: 0.08, restitution: 0.95 }

// Картинг (НОВЫЙ)
{ mass: 80, thrustForwardN: 50000, thrustLateralN: 12000, turnTorqueNm: 50000,
  speedLimitForwardMps: 400, forwardDragK: 0.08, lateralGripMultiplier: 40.0,
  angularDragK: 0.15, restitution: 0.7 }

// Рельсы (НОВЫЙ)
{ mass: 60, thrustForwardN: 65000, thrustLateralN: 8000, turnTorqueNm: 60000,
  speedLimitForwardMps: 450, forwardDragK: 0.12, lateralGripMultiplier: 80.0,
  angularDragK: 0.20, restitution: 0.6 }
```

LabPanel.tsx:
- Заменить слайдер `linearDragK` → `forwardDragK` + `lateralGripMultiplier`
- `lateralGripMultiplier`: min=0, max=100, tooltip: "Множитель бокового сцепления"

### Фаза 4: Тесты (задача 10)

**LG-10 (bonk-race-b18.5): Тесты** — расширить:
- Обновить `server/tests/tracks-smoke.test.js:139` — `linearDragK` → `forwardDragK`
- Новые тесты (`anisotropic-friction.test.js`):
  1. `lateralGripMultiplier=1.0` → одинаковое затухание forward/lateral
  2. `lateralGripMultiplier=40` → боковая скорость < 5% за 30 тиков (0.5с при 60Гц)
  3. `exp(-k*dt)` при extreme k → скорость стремится к 0, но не обнуляется и не инвертируется
  4. `zoneThrustN=15000, 10 тиков` → монотонный рост скорости
  5. `thrustMultiplier=0.5` → силы FA вдвое меньше
  6. Все surface-множители=1.0, grip=1.0 → поведение ~идентично текущему (допуск 0.1%)
  7. `angularDragMultiplier=0.3` (ice) → angular decay замедлен
  8. `speedLimitMultiplier=1.5` (boost) → лимит скорости увеличен
  9. `turnTorqueMultiplier=0.5` (ice) → момент поворота вдвое меньше
  10. `forwardDragK=0, grip=любой` → нет движения от трения (скорость сохраняется)
  11. `zoneThrustN + speedLimitMultiplier` → скорость ограничивается лимитом при длительном нахождении

### Фаза 5: Документация (задача 12 — НОВАЯ)

**LG-12 (НОВАЯ): Обновление документации**
- `docs/gdd/` — обновить раздел "Управление и физика" (анизотропное трение, SurfaceConfig, зоны)
- `docs/reverse/04-physics-movement.md` — заменить все упоминания `linearDragK`, описать новую decay-модель
- `docs/tz/TZ-LateralGrip-v1_4.md` — обновить §10.1 (пресеты с grip!=1.0), уточнить decay-формулу на exp
- `shared/src/trackConfig.ts:12-14` — обновить комментарии SURFACE_SLOW/BOOST/ICE
- `TECH_DEBT.md` — добавить пункт: миграция raceMain.ts на shared-физику
- `.memory_bank/activeContext.md` — обновить текущее состояние

### ОТЛОЖЕННЫЕ задачи (после BonkLab-прототипа)

**LG-5 (bonk-race-6nu): Серверная интеграция** — отложена.
- ArenaRoom: getSurfaceParams, getSurfaceAssistParams
- movementSystems: передача ISurfaceParams/ISurfaceAssistParams
- Удаление getZoneSpeedMultiplier, getZoneFrictionMultiplier

**LG-6 (bonk-race-b18.1): raceMain.ts** — отложена.
- Анизотропный decay в physicsSystem
- Добавить overspeed damping (обязательно!)
- Заменить angular drag хардкод `drag * 2` на `angularDragK * angularDragMultiplier`
- Удалить `applySurfaceBoost`

---

## Порядок выполнения

```
Фаза 1: 0 → 1 → 4 → 9 → 11
Фаза 2: 2 → 3
Фаза 3: 7 → 8
Фаза 4: 10
Фаза 5: 12

Отложено: 5, 6
```

---

## Критические файлы

| Файл | Роль | Фаза |
|------|------|------|
| `shared/src/physics/integrator.ts` | Ядро: exp(-k*dt) анизотропный decay | 1-2 |
| `shared/src/physics/flightAssist.ts` | Surface-множители + удаление zoneSpeedMultiplier | 1-2 |
| `shared/src/surfaceConfig.ts` | **НОВЫЙ**: SurfaceConfig + утилиты + маппинг | 1 |
| `shared/src/constants.ts` | ZONE_TYPE_SAND = 6 | 1 |
| `shared/src/config.ts` | WorldPhysicsConfig + DEFAULT_BALANCE_CONFIG + resolveBalanceConfig | 1 |
| `shared/src/trackConfig.ts` | TrackPhysicsConfig: linearDragK → forwardDragK | 1 |
| `config/balance.json` | Параметры + секция surfaces | 1 |
| `server/src/meta/data/trackPresets.ts` | **ПРОПУЩЕН ранее**: linearDragK в пресете трассы | 1 |
| `client/src/lab/BonkLab.ts` | Миграция зон, drag, FA на новую модель | 3 |
| `client/src/lab/ui/LabToolbar.tsx` | 10 пресетов | 3 |
| `client/src/lab/ui/LabPanel.tsx` | Слайдеры forwardDragK + lateralGripMultiplier | 3 |
| `client/src/lab/main.ts` | Стартовый пресет | 3 |
| `server/tests/tracks-smoke.test.js` | **ПРОПУЩЕН ранее**: assertion linearDragK | 4 |
| `server/tests/anisotropic-friction.test.js` | **НОВЫЙ**: 11 тест-кейсов | 4 |

---

## Верификация

1. `npm run build` — проект собирается
2. `npm run test` — детерминизм + orb-bite + arena-generation + tracks-smoke зелёные
3. BonkLab: все 10 пресетов переключаются
4. BonkLab: "Slime Arena" и "BonkRace v0.1" — поведение как раньше (изотропный)
5. BonkLab: "Рельсы" — блоб намертво прилипает к траектории, боковая скорость гасится за 0.3с
6. BonkLab: "Картинг" — плотное сцепление, лёгкий дрифт на высокой скорости
7. BonkLab: "Ралли" — заметный дрифт на поворотах, контролируемый
8. BonkLab: "Дрифт (без FA)" — ярко выраженное скольжение
9. BonkLab: "Космос" — нулевое трение, свободный полёт
10. BonkLab: зоны Ice/Mud/Sand/Turbo корректно влияют на физику через SurfaceConfig
11. BonkLab: слайдеры forwardDragK и lateralGripMultiplier работают в реальном времени
12. Документация обновлена (GDD, reverse docs, TZ)

---

## Риски

| Риск | Митигация |
|------|-----------|
| `exp(-k*dt)` отличается от текущей force-based модели | Допустимо. Тест допуска 0.1% при grip=1.0 |
| BonkLab legacy зоны (frictionMultiplier, accelBoost) | Полная миграция на SurfaceConfig в задаче 7 |
| Отложенные задачи 5/6 (сервер, raceMain) | Зафиксированы в Beads. Алгоритмы в shared — переносимы |
| Отрицательные множители в конфиге | Runtime clamp в задаче 11 |
| Пресеты отходят от ТЗ §10.1 (grip != 1.0) | Сознательное решение оператора |
