# Plan: BonkLab Tech Debt + Bug Fixes

**Branch**: `fix/bonklab-techdebt` (from `main`)

---

## Context

После рефакторинга BonkLab (PR #19-#21) остались 2 бага и 3 единицы техдолга, выявленные ревью.
Плюс 5 задач по тюнингу зон и арены для улучшения геймплея.

---

## Execution Order

```
1. correctionPercent fix      (shared/ — P2 bug, hyf)
2. Zone 1-tick lag fix        (BonkLab.ts — P2 bug, ovb)
3. lastDensity dual ownership (LabParamManager + BonkLab — P2 techdebt)
4. tickOrbs config object     (orbSimulator + BonkLab — P3 techdebt)
5. Spike knockback extraction (new spikeResolver.ts — P3 techdebt)
6. Rename "Плотность"         (LabToolbar — P3 naming)
7. Ice zone tuning            (surfaceConfig — P2 gameplay)
8. Turbo zone tuning          (surfaceConfig — P2 gameplay)
9. Passage visibility         (arenaGenerator + LabRenderer — P2 UX)
10. Sand/Mud differentiation  (surfaceConfig — P2 gameplay)
```

---

## Task 1: correctionPercent in static collisions (bonk-race-hyf)

**File**: `shared/src/physics/collisions.ts`, line ~135

**Bug**: `resolveCircleStaticCollision` не умножает коррекцию на `correctionPercent`,
в отличие от `resolveCircleCircleCollision` (line 84). Статические столкновения
всегда применяют 100% коррекции.

**Fix**: одна строка:
```ts
// Было:
const corrRaw = Math.max(penetration - config.slop, 0);
// Стало:
const corrRaw = Math.max(penetration - config.slop, 0) * config.correctionPercent;
```

**Риск**: Средний — меняет физику сервера. Determinism тесты пройдут (обе комнаты
используют одинаковый код). Визуально: объекты мягче отталкиваются от стен (80% vs 100%).

**Верификация**: `npm run test` (все 4 теста), ручная проверка в BonkLab.

---

## Task 2: Zone modifier 1-tick lag (bonk-race-ovb)

**File**: `client/src/lab/BonkLab.ts`

**Bug**: В tick() определение зоны (шаг 5, строки 758-769) происходит ПОСЛЕ
Flight Assist (шаг 2) и интеграции физики (шаг 3). Игрок входит в зону на тике N,
но FA применяет зонные эффекты только на тике N+1.

**Fix**: Переместить блок определения зоны В НАЧАЛО tick(), перед построением FA input.
Зонное определение читает только `this.x, this.y` и `this.arena.zones` — нет зависимости
от результатов столкновений.

**Новый порядок шагов**:
```
1. Определение зоны (бывший шаг 5)
2. Построение FA input state
3. Flight Assist (теперь с актуальной зоной)
4. Интеграция физики
5. Столкновения + spike knockback
6. Физика орбов
7. Время
8. Финиш
```

Обновить комментарии `// ── N.` в соответствии с новым порядком.

**Верификация**: `npx tsc --noEmit`, ручная проверка — зонный эффект мгновенный при входе.

---

## Task 3: lastDensity dual ownership

**Files**: `LabParamManager.ts`, `BonkLab.ts`

**Проблема**: `lastDensity` хранится и в BonkLab, и в LabParamManager с ручной синхронизацией.

**Fix**:
- Убрать `lastDensity` из LabParamManager (поле, параметр конструктора)
- Добавить `newDensity?: number` в `UpdateEffect`
- `update("arena.objectDensity", val)` → вернуть `{ regenerateArena: true, newDensity: val }`
- `buildFlatParams()` принимает `lastDensity` как параметр
- BonkLab.updateParams() читает `effect.newDensity` и пишет в свой `this.lastDensity`
- Убрать строку синхронизации `this.lastDensity = this.paramManager.lastDensity`

**Верификация**: `npx tsc --noEmit`, ручная — ползунок плотности арены работает.

---

## Task 4: tickOrbs config object

**Files**: `orbSimulator.ts`, `BonkLab.ts`

**Проблема**: 10 позиционных аргументов у tickOrbs() — легко перепутать.

**Fix**: Ввести `OrbTickConfig` interface, упаковать последние 5 аргументов:
```ts
export interface OrbTickConfig {
    collisionConfig: { correctionPercent: number; slop: number; maxCorrection: number };
    dragK: number;
    restitution: number;
    passageRestitution: number;
    spikeKill: boolean;
}
export function tickOrbs(
    orbs: SandboxOrb[], dt: number, playerBody: ICircleBody,
    obstacles: ArenaObject[], wallBounds: IWallBounds, config: OrbTickConfig,
): void
```

Обновить тело функции: `dragK` → `config.dragK`, и т.д.
Обновить call site в BonkLab.ts.

**Верификация**: `npx tsc --noEmit`, ручная — орбы ведут себя как прежде.

---

## Task 5: Spike knockback extraction

**Files**: Новый `client/src/lab/spikeResolver.ts`, `BonkLab.ts`

**Проблема**: ~54 строки spike-логики inline в tick() — наибольший самодостаточный блок.

**Fix**: Извлечь в чистую функцию:
```ts
// spikeResolver.ts
export interface SpikeResult {
    died: boolean;
    deathX: number; deathY: number; deathDistanceM: number;
    vx: number; vy: number;
}
export interface SpikeParams {
    killOnHit: boolean; destroyOnHit: boolean; knockbackImpulse: number;
}
export function resolveSpikeCollision(
    hitSpikes: Set<ArenaObject>,
    spikeNx: number, spikeNy: number,
    x: number, y: number, vx: number, vy: number,
    mass: number, params: SpikeParams,
    maxKnockbackSpeed: number, distanceM: number,
): SpikeResult
```

BonkLab.tick() вызывает функцию и обрабатывает результат (~30 строк вместо ~54).

**Верификация**: `npx tsc --noEmit`, ручная — spike kill, knockback, destroy работают.

---

## Task 6: Переименовать "Плотность" → "Насыщенность"

**File**: `client/src/lab/ui/LabToolbar.tsx`, lines 302-303

**Проблема**: Параметр `arena.objectDensity` назван "Плотность", но это количество
объектов на карте, а не физическая плотность.

**Fix**: В LabToolbar.tsx заменить:
- Label: `"Плотность:"` → `"Насыщенность:"`
- Tooltip: `"Плотность объектов на карте"` → `"Количество объектов на карте"`

**Верификация**: Ручная — label обновился в тулбаре.

---

## Task 7: Тюнинг зоны Ice — скользкий разгон

**File**: `shared/src/surfaceConfig.ts` (SURFACE_PRESETS.ice)

**Проблема**: Лёд слабо выражен — хочется больше линейной скорости и меньше контроля.

**Текущие значения → Новые**:

| Параметр | Было | Стало | Эффект |
|----------|------|-------|--------|
| forwardDragMultiplier | 0.1 | 0.05 | Ещё меньше торможения → быстрее |
| lateralGripMultiplier | 0.2 | 0.1 | Ещё меньше бокового сцепления → больше заноса |
| angularDragMultiplier | 0.3 | 0.15 | Меньше углового трения → руль «плывёт» |
| turnTorqueMultiplier | 0.5 | 0.3 | Слабее повороты → труднее маневрировать |
| speedLimitMultiplier | 1.0 | 1.3 | Лимит скорости выше → разгон на льду |
| thrustMultiplier | 0.8 | 0.6 | Двигатель слабее → нельзя форсить |
| zoneThrustN | 0 | 0 | Без турбо (лёд ≠ турбо) |

**Характер**: Скользкий разгон — быстро набирает скорость от инерции, но очень
трудно повернуть и затормозить. Высокий skillcap: опытный игрок использует лёд
для разгона, новичок врезается в стену.

**Верификация**: Ручная в BonkLab — войти в зону ice, проверить что занос усилился,
скорость растёт, повороты стали вялыми.

---

## Task 8: Тюнинг зоны Turbo — ракетный буст

**File**: `shared/src/surfaceConfig.ts` (SURFACE_PRESETS.turbo)

**Проблема**: Турбо недостаточно сильный. Зоны должны быть ключевыми для быстрого
прохождения.

**Текущие значения → Новые**:

| Параметр | Было | Стало | Эффект |
|----------|------|-------|--------|
| zoneThrustN | 15000 | 40000 | Мощнее импульс — ощутимый толчок |
| speedLimitMultiplier | 1.5 | 2.0 | Лимит скорости x2 — настоящий буст |
| forwardDragMultiplier | 0.5 | 0.3 | Меньше трения — дольше сохраняет скорость |

Остальные без изменений (turnTorqueMultiplier=1.0, lateralGripMultiplier=1.0).

**Также**: Расширить диапазон слайдера `zoneThrustN` в paramDefs.ts:
- `max: 50000` → `max: 100000` (чтобы можно было тестировать экстремальные значения)

**Верификация**: Ручная — войти в turbo зону, ощутить сильный толчок вперёд,
скорость значительно выше обычной.

---

## Task 9: Улучшение видимости проходов (passages)

**Files**: `shared/src/physics/arenaGenerator.ts`, `client/src/lab/LabRenderer.ts`

**Проблемы**:
1. Цвет `#666666` плохо виден на мобильных
2. Случайный угол — проходы не читаются как «ворота»
3. Пара из 2 шаров — недостаточно заметно

### 9a. Цвет проходов

В `LabRenderer.ts`, OBSTACLE_STYLES:

```ts
// Было:
passage: { fill: "transparent", stroke: "#666666" },
// Стало:
passage: { fill: "rgba(180, 175, 160, 0.12)", stroke: "#b0a898" },
```

Светло-серый с тёплым оттенком — светлее «каменных» pillars (`#888888`),
но остаётся в серой палитре статических препятствий. Не конфликтует
с голубыми орбами (`#00cccc`) и не вводит в заблуждение яркостью.

### 9b. Горизонтальная ориентация

В `arenaGenerator.ts`, passage generation (line ~200):
```ts
// Было:
const angle = rng.range(0, Math.PI * 2);
// Стало (горизонтальные ворота — вдоль оси X):
const angle = Math.PI / 2;  // 90° — шары слева и справа
```
Все проходы становятся горизонтальными воротами (перпендикулярно направлению движения).

### 9c. Цепочки из 2-4 шаров

В `arenaGenerator.ts`, вместо одного шара с каждой стороны — генерировать цепочку:
```ts
const chainLength = 2 + Math.floor(rng.range(0, 3)); // 2, 3 или 4 шара
const chainSpacing = passageR * 2.2; // шары вплотную с небольшим зазором
for (let c = 0; c < chainLength; c++) {
    obstacles.push({
        type: "passage",
        x: ax + Math.cos(angle) * c * chainSpacing,
        y: ay + Math.sin(angle) * c * chainSpacing,
        radius: passageR,
    });
    obstacles.push({
        type: "passage",
        x: bx - Math.cos(angle) * c * chainSpacing,
        y: by - Math.sin(angle) * c * chainSpacing,
        radius: passageR,
    });
}
```
Цепочки расходятся от центра вбок, образуя хорошо заметные «стенки» ворот.

**Верификация**: Ручная — проходы голубые, горизонтальные, из 2-4 шаров. Видны на мобильном.

---

## Task 10: Дифференциация Sand vs Mud

**File**: `shared/src/surfaceConfig.ts` (SURFACE_PRESETS.sand, SURFACE_PRESETS.mud)

**Концепция зон**:
| Зона | Скорость | Контроль | Характер |
|------|----------|----------|----------|
| Ice | Быстрее | Низкий | Скользкий разгон |
| Turbo | Намного быстрее | Нормальный | Ракетный буст |
| **Mud** | **Очень медленно** | **Высокий** | **Вязкая ловушка** |
| **Sand** | **Медленно** | **Очень низкий** | **Неуправляемый занос** |

### Mud — вязкая ловушка (уточнение текущих значений)

| Параметр | Было | Стало | Логика |
|----------|------|-------|--------|
| forwardDragMultiplier | 5.0 | 6.0 | Ещё больше торможения |
| lateralGripMultiplier | 4.0 | 5.0 | Высокое сцепление — не сносит |
| angularDragMultiplier | 3.0 | 4.0 | Повороты вязкие, но предсказуемые |
| thrustMultiplier | 0.5 | 0.4 | Двигатель еле тянет |
| turnTorqueMultiplier | 0.6 | 0.7 | Поворачивать можно, но медленно |
| speedLimitMultiplier | 0.5 | 0.4 | Потолок скорости очень низкий |

### Sand — неуправляемый занос

| Параметр | Было | Стало | Логика |
|----------|------|-------|--------|
| forwardDragMultiplier | 2.5 | 2.0 | Умеренное торможение (не как грязь) |
| lateralGripMultiplier | 3.0 | 0.5 | **Ключевое**: почти нет бокового сцепления |
| angularDragMultiplier | 2.0 | 0.5 | Руль «плывёт» |
| thrustMultiplier | 0.6 | 0.7 | Двигатель работает лучше чем в грязи |
| turnTorqueMultiplier | 0.7 | 0.4 | Очень слабые повороты |
| speedLimitMultiplier | 0.6 | 0.7 | Скорость выше чем в грязи |

**Ключевое отличие**: Грязь тормозит, но держит курс. Песок не так сильно тормозит,
но сносит вбок — требует заблаговременной коррекции курса перед входом.

**Верификация**: Ручная — грязь = «вязнешь, но стабильно». Песок = «заносит, руль не слушается».

---

## Verification (после всех задач)

1. `npm run build` — чистая компиляция
2. `npm run test` — все тесты проходят (включая anisotropic friction)
3. Ручная проверка BonkLab:
   - Столкновения с pillars/spikes (correctionPercent)
   - Вход в зону ice/mud/turbo/sand (мгновенный эффект, без 1-tick лага)
   - Ползунок «Насыщенность» арены (регенерация)
   - Орбы: столкновения, spike kill, drag
   - Spike: kill + knockback + destroy
   - Ice: скользко, быстро, руль вялый
   - Turbo: мощный толчок, скорость x2
   - Mud: очень медленно, но стабильно
   - Sand: заносит вбок, руль не слушается
   - Passages: голубые, горизонтальные, цепочки 2-4 шаров, видны на мобильном
