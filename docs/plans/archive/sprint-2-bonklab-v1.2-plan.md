# BonkLab v1.2 — Sprint 2 Plan

## Контекст

BonkLab (v1.1) — dev-only песочница физики, задеплоена на GitHub Pages. По результатам тестирования нужен Sprint 2 с улучшениями UX, настраиваемыми размерами объектов и добавлением подвижных орбов. BonkLab эволюционирует в будущий **редактор карт для BonkRace**, но сейчас фокус на самом BonkLab — основную игру не трогаем.

**Принципы:**

- `balance.json` и серверный код **не трогаем** — все новые дефолты как BonkLab-оверрайды.
- Переименование `slime` → `mud` — **полное**, во всех shared-типах, генераторе, рендерере. Серверный код (`ArenaRoom.ts`) обновляем тоже, чтобы не было рассинхрона типов. Это safe — сервер импортирует shared типы.
- Будущее: настройки из BonkLab будут использоваться в BonkRace (карты, динамика). Сейчас — этап прототипирования, конечные числа неизвестны.

---

## Часть A: ТЗ BonkLab-TZ-v1.2 (что обновить)

### A1. Дефолты арены [v1.2]

| Параметр | Было (v1.1) | Стало (v1.2) |
|----------|-------------|--------------|
| Высота (длина трассы) | 1000 м | **5000 м** |
| Ширина | 1000 м | **800 м** |
| Базовый радиус | 10 м | **20 м** |
| Макс. базовый радиус (слайдер) | 30 м | **40 м** |
| Макс. плотность | 10.0 | **40.0** |

Дефолты применяются как BonkLab-оверрайды в `buildFlatParams()`. `balance.json` не трогаем.

### A2. Пресеты [v1.2]

| Действие | Детали |
|----------|--------|
| Переименовать | «По умолчанию» → **«Slime Arena»** (пресет со значениями из balance.json) |
| Новый дефолт | **«Лёгкий и быстрый»** применяется при старте BonkLab |
| Новый пресет | **«Ультралёгкий»** — ещё легче/быстрее: mass≈20, thrustForward≈80000, speedLimit≈500, drag≈0.001 |

Порядок в списке: Ультралёгкий, Лёгкий и быстрый, Slime Arena, Тяжёлый и инертный, Минимальный FA, Космос.

### A3. Переименование зон — полное [v1.2]

**Полный rename `"slime"` → `"mud"` во всех слоях:**

| Слой | Файлы | Что менять |
|------|-------|-----------|
| Shared типы | `shared/src/physics/arenaGenerator.ts` | `ArenaZone.type` union: `"slime"` → `"mud"`, `ZONE_TYPES`, `ZONE_PARAMS` |
| Shared physics | `shared/src/physics/index.ts` | Реэкспорт (если упоминается) |
| BonkLab core | `client/src/lab/BonkLab.ts` | `zones.slime.*` → `zones.mud.*`, zone checks |
| Renderer | `client/src/lab/LabRenderer.ts` | `ZONE_COLORS.slime` → `ZONE_COLORS.mud`, цвет `"#8B5E3C"` |
| Turbo цвет | `client/src/lab/LabRenderer.ts` | `turbo: "#ccaa44"` → `turbo: "#ff8800"` |
| LabPanel | `client/src/lab/ui/LabPanel.tsx` | Ключи `zones.slime.*` → `zones.mud.*`, подписи «Грязь» |
| TelemetryHUD | `client/src/lab/TelemetryHUD.ts` | Zone label `"slime"` → `"mud"` / «Mud» |
| Сервер | `server/src/rooms/ArenaRoom.ts`, `server/src/rooms/systems/collisionSystem.ts` | Обновить все ссылки на `"slime"` zone type |

### A4. Смерть и респаун [v1.2]

- После смерти (spike contact): **сброс секундомера** (`elapsedTime = 0`)
- Вместо полного обратного отсчёта 3-2-1-GO: короткое **«Go!»** (1 фаза вместо 4)
- Freeze 0.8с остаётся без изменений

### A5. Настраиваемые размеры объектов [v1.2]

Новая группа параметров «Геометрия трассы» в LabPanel:

| Параметр | Ключ | Ед. | Дефолт | Диапазон | Подсказка |
|----------|------|-----|--------|----------|-----------|
| Радиус столбов | `arena.pillarRadius` | м | = baseRadius (20) | [5 … 100] | Радиус серых препятствий-столбов |
| Радиус шипов | `arena.spikeRadius` | м | = baseRadius (20) | [5 … 100] | Радиус красных шипованных препятствий |
| Радиус столба прохода | `arena.passageRadius` | м | = baseRadius (20) | [5 … 100] | Радиус каждого столба в проходе |
| Зазор прохода | `arena.passageGap` | м | = diameter × 1.2 (48) | [10 … 200] | Расстояние между поверхностями столбов прохода |

При изменении любого из этих параметров — перегенерация арены. Участвуют в Export/Import.

### A6. Турбо: макс. скорость [v1.2]

| Параметр | Дефолт | Мин | Макс |
|----------|--------|-----|------|
| `zones.turbo.speedMultiplier` | **10.0** (было 1.4) | 1.0 | **50.0** |

### A7. Орбы (новая механика) [v1.2]

#### Концепция

Подвижные объекты на арене из Slime Arena. Чисто физические — без FA, без поедания, без реакции на зоны. Двигаются по инерции + drag, сталкиваются со всем: друг с другом, персонажем, препятствиями, стенами.

#### Цвет

**Cyan (#00cccc)** — максимальный контраст с палитрой (серый pillar, красный spike, голубой ice, коричневый mud, оранжевый turbo).

#### Параметры (новая группа «Орбы» в LabPanel)

| Параметр | Ключ | Ед. | Дефолт | Диапазон | Подсказка |
|----------|------|-----|--------|----------|-----------|
| Количество | `orbs.count` | шт. | 10 | [0 … 100] | Количество орбов на арене. Независимо от density. |
| Плотность (физ.) | `orbs.density` | кг/м² | auto = mass/(π×r²) персонажа | [0.01 … 10.0] | Плотность орбов. Auto-sync при изменении mass/radius персонажа (можно переопределить вручную). |
| Мин. радиус | `orbs.minRadius` | м | 5 | [2 … 50] | Минимальный радиус при генерации |
| Макс. радиус | `orbs.maxRadius` | м | 25 | [2 … 100] | Максимальный радиус при генерации |
| Мин. скорость | `orbs.minSpeed` | м/с | 0 | [0 … 200] | Минимальная начальная скорость |
| Макс. скорость | `orbs.maxSpeed` | м/с | 50 | [0 … 500] | Максимальная начальная скорость |
| Гибнет от шипов | `orbs.spikeKill` | вкл/выкл | вкл | — | Орб исчезает при контакте с spike |

#### Физика орбов

- **Движение:** чистая инерция + `worldPhysics.linearDragK` (тот же drag, что и у персонажа)
- **Столкновения:** переиспользуем существующие функции из `shared/src/physics/collisions.ts`:
  - `resolveCircleCircleCollision()` для орб-орб и орб-персонаж
  - `resolveCircleStaticCollision()` для орб-obstacle
  - `resolveWallCollision()` для орб-стены
- **Масса:** `mass = density × π × radius²` (плоский мир, площадь круга)
- **Зоны:** игнорируют (зоны только для персонажа)
- **Spike death:** при включённом флаге — орб исчезает при контакте с spike (без респауна)
- **Детерминизм:** начальные позиции и скорости орбов определяются seed карты → при рестарте повторяются
- **Респаун:** орбы не респаунятся. При Restart — регенерация из того же seed (те же позиции/скорости).

#### Auto-sync плотности орбов

При изменении `mass` или `geometry.baseRadiusM` персонажа → `orbs.density` автоматически пересчитывается как `mass / (π × baseRadius²)`, если пользователь не выставил плотность вручную. Флаг `orbDensityManual` отслеживает ручное переопределение.

#### Рендеринг орбов

- Заполненный круг цвета cyan (#00cccc) с небольшой тенью/свечением
- На минимапе: маленькие cyan точки
- Мёртвые орбы (spikeKill) не отрисовываются

#### Анимация смерти орба [v1.2]

По аналогии с анимацией смерти персонажа (расходящиеся кольца + полупрозрачный круг), но **в цветах орба** (cyan / ярче — `#33ffff`), чтобы игрок не путал со своей смертью на плотных картах.

---

## Часть B: План реализации

### Фаза 1: Shared — rename + генератор

#### Задача 1.1: Полный rename slime → mud

- Файлы:
  - `shared/src/physics/arenaGenerator.ts` — `ArenaZone.type` union, `ZONE_TYPES`, `ZONE_PARAMS`
  - `server/src/rooms/ArenaRoom.ts` — все ссылки на zone type `"slime"`
  - `server/src/rooms/systems/collisionSystem.ts` — если есть ссылки
  - `config/balance.json` — ключ `zones.slime` → `zones.mud` (если используется генератором)
- Атомарное изменение — все файлы в одном коммите
- Зависимости: нет

#### Задача 1.2: Настраиваемые радиусы в ArenaConfig

- Файл: `shared/src/physics/arenaGenerator.ts`
- Добавить опциональные поля в `ArenaConfig`: `pillarRadius?`, `spikeRadius?`, `passageRadius?`, `passageGap?`
- Заменить хардкод-константы на `config.X ?? DEFAULT`
- Зависимости: нет

#### Задача 1.3: Генерация орбов

- Файл: `shared/src/physics/arenaGenerator.ts`
- Добавить интерфейс `ArenaOrb`: `{x, y, vx, vy, radius, mass, alive: boolean}`
- Добавить `orbs: ArenaOrb[]` в `Arena`
- Добавить орб-параметры в `ArenaConfig`: `orbCount?`, `orbMinRadius?`, `orbMaxRadius?`, `orbDensity?`, `orbMinSpeed?`, `orbMaxSpeed?`
- Генерация: через `canPlace()` (spawn exclusion zones), Rng для позиций и скоростей
- Масса: `density × π × radius²`
- Зависимости: нет

#### Задача 1.4: Макс. плотность 40

- Файл: `shared/src/physics/arenaGenerator.ts`
- `clampDensity()`: max 10.0 → 40.0
- Зависимости: нет

### Фаза 2: BonkLab core

#### Задача 2.1: BonkLab-оверрайды дефолтов

- Файл: `client/src/lab/BonkLab.ts`
- `buildFlatParams()`: оверрайдить `geometry.baseRadiusM: 20`, `worldPhysics.widthM: 800`, `worldPhysics.heightM: 5000`
- Пересчитать начальный radius персонажа при инициализации
- Зависимости: нет

#### Задача 2.2: Параметры геометрии трассы в BonkLab

- Файл: `client/src/lab/BonkLab.ts`
- Добавить ключи `arena.pillarRadius`, `arena.spikeRadius`, `arena.passageRadius`, `arena.passageGap` в `buildFlatParams()`
- `updateParams()`: при изменении → `regenerateArena()` с новыми значениями через `ArenaConfig`
- Зависимости: Задача 1.2

#### Задача 2.3: Орбы в симуляции

- Файл: `client/src/lab/BonkLab.ts`
- Добавить `SandboxOrb[]` в состояние, инициализировать из `arena.orbs`
- Добавить орб-ключи в `buildFlatParams()` и `updateParams()`
- Auto-sync `orbs.density` при изменении mass/baseRadius (с флагом `orbDensityManual`)
- В `tick()` после физики персонажа — орб-цикл:
  1. Для каждого живого орба: drag (`v *= 1 - dragK × dt`), интеграция позиции
  2. Столкновения (4 итерации): орб-obstacle, орб-стены, орб-орб, орб-персонаж — всё через существующие функции из `shared/src/physics/collisions.ts`
  3. Spike death check: если флаг и контакт → `alive = false`, запуск анимации смерти
- При Restart → орбы пересоздаются из того же seed (детерминизм)
- При изменении орб-параметров → `regenerateArena()` с пересозданием орбов
- **Переиспользование:** `resolveCircleCircleCollision`, `resolveCircleStaticCollision`, `resolveWallCollision` (уже импортированы)
- **Перформанс:** O(n²) для орб-орб, 100 орбов × 4 итерации ≈ 20K проверок/тик — приемлемо для dev-tool
- Зависимости: Задача 1.3

#### Задача 2.4: Новое поведение смерти

- Файл: `client/src/lab/BonkLab.ts`
- При респауне после spike death: `elapsedTime = 0`
- Зависимости: нет

#### Задача 2.5: Rename slime → mud в BonkLab core

- Файл: `client/src/lab/BonkLab.ts`
- Ключи `zones.slime.*` → `zones.mud.*` в `buildFlatParams()`, `updateParams()`, zone checks
- Зависимости: Задача 1.1

### Фаза 3: UI и рендеринг

#### Задача 3.1: Цвета зон и rename в рендерере

- Файл: `client/src/lab/LabRenderer.ts`
- `ZONE_COLORS`: ключ `slime` → `mud`, цвет `"#8B5E3C"` (коричневый); `turbo: "#ff8800"` (оранжевый)
- Зависимости: Задача 1.1

#### Задача 3.2: Рендеринг орбов + анимация смерти

- Файл: `client/src/lab/LabRenderer.ts`
- Метод `drawOrbs()`: заполненные cyan (#00cccc) круги с тенью
- Анимация смерти орба: расходящиеся кольца в цвете `#33ffff` (яркий cyan), аналогично анимации смерти персонажа но другого цвета
- Орбы на минимапе: маленькие cyan точки
- Не рисовать орбы с `alive === false` (кроме момента анимации смерти)
- Зависимости: Задача 2.3

#### Задача 3.3: Пресеты и тулбар

- Файл: `client/src/lab/ui/LabToolbar.tsx`
- Переименовать «По умолчанию» → «Slime Arena»
- Добавить пресет «Ультралёгкий»: mass=20, thrustForward=80000, speedLimit=500, drag=0.001
- Density slider max: 40.0
- Обратный отсчёт при смерти: заменить `["3","2","1","GO!"]` на `["Go!"]` (1 фаза ≈0.6с)
- Зависимости: нет

#### Задача 3.4: Применение дефолтного пресета при старте

- Файл: `client/src/lab/main.ts`
- После создания `BonkLab`: программно применить значения пресета «Лёгкий и быстрый» до первого `generateArena()`
- Зависимости: Задача 3.3

#### Задача 3.5: LabPanel — новые группы и обновления

- Файл: `client/src/lab/ui/LabPanel.tsx`
- Группа «Геометрия и масса»: baseRadius max → 40
- Группа «Зоны»: rename `zones.slime.*` → `zones.mud.*`, подписи «Mud: трение», «Mud: скорость»; turbo speedMultiplier: default=10, min=1, max=50
- Новая группа **«Геометрия трассы»**: pillarRadius, spikeRadius, passageRadius (= «Радиус столба прохода»), passageGap (4 слайдера)
- Новая группа **«Орбы»**: count, density, minRadius, maxRadius, minSpeed, maxSpeed, spikeKill (7 параметров)
- Зависимости: Задача 2.2, Задача 2.3

#### Задача 3.6: TelemetryHUD — rename зоны

- Файл: `client/src/lab/TelemetryHUD.ts`
- Zone label `"slime"` → `"mud"` / «Mud»
- Зависимости: Задача 1.1

### Фаза 4: Документация

#### Задача 4.1: BonkLab-TZ-v1.2.md

- Файл: `docs/tz/BonkLab-TZ-v1.2.md`
- Обновить TZ по секциям A1-A7 этого плана
- Зависимости: все реализационные задачи

---

## Часть C: Порядок выполнения

```text
Фаза 1 (shared):  1.1 ──→ 2.5, 3.1, 3.5, 3.6
                   1.2 ──→ 2.2
                   1.3 ──→ 2.3
                   1.4 ─── (независимо)

Фаза 2 (core):    2.1 ─── (независимо)
                   2.2 ──→ 3.5
                   2.3 ──→ 3.2, 3.5
                   2.4 ─── (независимо)
                   2.5 ─── (после 1.1)

Фаза 3 (UI):      3.1 ─── (после 1.1)
                   3.2 ──→ после 2.3
                   3.3 ─── (независимо)
                   3.4 ──→ после 3.3
                   3.5 ──→ после 1.1 + 2.2 + 2.3
                   3.6 ─── (после 1.1)

Фаза 4 (docs):    4.1 ──→ после всего
```

**Оптимальный порядок (для одного разработчика):**

1. Задача 1.1 (rename slime→mud — атомарный коммит shared + server)
2. Задачи 1.2 + 1.3 + 1.4 (shared: radii config, orb gen, density max)
3. Задачи 2.1 + 2.4 + 2.5 + 3.1 + 3.3 + 3.6 (независимые малые задачи)
4. Задача 2.2 (obstacle params в BonkLab)
5. Задача 2.3 (орбы в симуляции — самая большая задача)
6. Задачи 3.2 + 3.5 (рендеринг орбов + LabPanel)
7. Задача 3.4 (применение пресета при старте)
8. Задача 4.1 (документация TZ v1.2)

---

## Часть D: Риски

| Риск | Влияние | Митигация |
|------|---------|-----------|
| O(n²) орб-орб коллизий при count=100 | Просадка FPS при 60Hz | Приемлемо для dev-tool. При необходимости — spatial hash. |
| Rename slime→mud в shared ломает сервер | Compile error в ArenaRoom | Атомарный коммит: shared + server вместе. Задача 1.1. |
| Новые дефолты (radius=20) ломают баланс пресетов | Пресеты подобраны под radius=10 | Пересмотреть все пресеты с учётом radius=20. |
| Auto-sync density орбов при ручном переопределении | Пользователь выставил density, потом меняет mass — density сбросится | Флаг `orbDensityManual` — если пользователь вручную менял density, auto-sync выключается. |

---

## Часть E: Переиспользуемый код из Slime Arena

| Функция | Файл | Reuse |
|---------|------|-------|
| `resolveCircleCircleCollision()` | `shared/src/physics/collisions.ts` | **100%** — орб-орб, орб-персонаж |
| `resolveCircleStaticCollision()` | `shared/src/physics/collisions.ts` | **100%** — орб-obstacle |
| `resolveWallCollision()` | `shared/src/physics/collisions.ts` | **100%** — орб-стены |
| `getOrbRadius()` | `shared/src/formulas.ts` | **100%** — расчёт радиуса из массы и плотности |
| `Rng` | `shared/src/rng.ts` | **100%** — детерминированная генерация орбов |
| Damping/drag pattern | `server/src/rooms/systems/orbSystem.ts` | **Паттерн** — `v *= (1 - dragK * dt)`, написать как чистую функцию |
| `drawCircle()` | `client/src/rendering/draw.ts` | **Паттерн** — BonkLab уже имеет свой рендер |

**НЕ переиспользуем** (game-specific): `tryEatOrb()`, `forceSpawnOrb()` (Colyseus Schema), `pickOrbType()` (balance типы).

---

## Верификация

1. `npm run dev:client` → `http://localhost:5173/lab`
2. При старте применён пресет «Лёгкий и быстрый» (не Slime Arena)
3. Арена 800×5000, персонаж radius=20
4. Зоны: **Mud** (коричневый #8B5E3C), **Turbo** (оранжевый #ff8800), **Ice** (голубой)
5. Зона Turbo: speedMultiplier по умолчанию = 10, макс = 50
6. Слайдер плотности до 40 — генерирует очень насыщенную карту
7. Изменить pillarRadius → столбы меняют размер при перегенерации
8. Изменить passageGap → зазоры проходов меняются
9. Орбы: при count=10 — видны cyan круги, двигаются, отскакивают от стен и друг друга
10. Орб-персонаж: столкновение по массе (тяжёлый персонаж толкает лёгкий орб)
11. Spike + орб (spikeKill=on) → орб исчезает с cyan-анимацией смерти
12. Изменить mass персонажа → orbs.density auto-sync (если не менялась вручную)
13. Экспорт JSON → содержит все орб-параметры и геометрию трассы
14. Импорт → восстанавливает орбы и размеры
15. Смерть → секундомер сброс + «Go!» (без 3-2-1)
16. `npm run build:lab` → сборка без ошибок
17. `npm run test` → существующие тесты проходят (rename slime→mud не ломает)
18. Push → GitHub Pages автодеплой
