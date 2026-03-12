# Sprint: Trails + Direction Triangle + Tech Debt

## Context

BonkLab (клиентская песочница) нуждается в двух визуальных улучшениях:
1. Следы движения (motion trails) — для анализа траекторий при настройке физики
2. Треугольник направления внутри круга — текущий "клювик" снаружи плохо читается

Попутно закрываем 2 мелких техдолга из backlog.

---

## Scope

### Фича 1: bonk-race-vyh — Треугольник-стрелка внутри круга

**Файл:** [LabRenderer.ts:360-377](client/src/lab/LabRenderer.ts#L360-L377)

Существующий белый клюв снаружи круга остаётся без изменений. Добавить **второй треугольник внутри круга**, усиливающий указатель направления:

- Вершина внутреннего треугольника = точка на границе круга (совпадает с основанием клюва): `tipX = x + cos(angle) * radius`, `tipY = y + sin(angle) * radius`
- Основание — два симметричных угла глубже внутри круга: `baseX = x + cos(angle) * radius * 0.2`, `baseLeft/Right = base ± perp * radius * 0.4`
- Цвет: белый (`#ffffff`), с пониженной непрозрачностью (alpha ~0.4–0.5) чтобы сквозь него просвечивал градиент, но стрелка читалась
- Рисовать ДО клюва (сначала внутренний треугольник, потом клюв сверху)

Результат: клюв + внутренняя стрелка образуют единый чёткий указатель направления.

~30 мин. Без зависимостей.

---

### Фича 2: bonk-race-hmg — Motion Trails (Phase 1-2 только)

Phase 3 (Ribbon Trail) и Phase 4 (Particles) откладываем на следующий спринт — сначала валидируем архитектуру буфера.

#### Задача 2a: Trail Data Structure

**Файл:** [LabRenderer.ts](client/src/lab/LabRenderer.ts)

- `TrailPoint { x, y, age, speed }` интерфейс
- Circular buffer: `trailBuffer[]`, `trailHead`, `TRAIL_MAX_POINTS = 120`
- Методы: `pushTrailPoint(x, y, vx, vy, dt)`, `clearTrail()`
- Конфиг: `trailEnabled`, `trailMaxAge = 0.8с`, `trailBaseAlpha = 0.6`

~45 мин.

#### Задача 2b: Trail Rendering

**Файл:** [LabRenderer.ts](client/src/lab/LabRenderer.ts)
**Зависит от:** 2a

- `drawTrail(ctx)` — итерация буфера oldest→newest, circle с fade alpha
- Радиус точки уменьшается с возрастом, alpha = `baseAlpha * (1 - age/maxAge)`
- Цвет: `CHAR_FILL_OUTER` с alpha
- Вставка в `render()` между `drawOrbs` и блоком персонажа (строка ~156)
- Вызов `pushTrailPoint` из `render()`

~45 мин.

#### Задача 2c: Trail UI Controls

**Файлы:** [LabPanel.tsx](client/src/lab/ui/LabPanel.tsx), [BonkLab.ts](client/src/lab/BonkLab.ts)
**Зависит от:** 2a, 2b

- Новая PanelGroup "Trail / Следы":
  - Toggle "Включен" (boolean)
  - Slider "Длина" (0.1–3.0 с)
  - Slider "Непрозрачность" (0.1–1.0)
- Пробросить trail-параметры через `BonkLab.updateParams()` → `LabRenderer`
- Синхронизация при пресетах через существующий `syncTrigger`

~1 час.

---

### Tech Debt

#### bonk-race-d9o: replayData Number.isFinite validation

**Файл:** [runs.ts](server/src/meta/routes/runs.ts)

После проверки `length % 4` добавить цикл валидации `Number.isFinite()` для каждого элемента replayData. ~20 мин. Без зависимостей.

#### bonk-race-dh0: Hardcoded physics constants → config

**Файлы:** [raceMain.ts](client/src/raceMain.ts), [runs.ts](server/src/meta/routes/runs.ts), [balance.json](config/balance.json)

Перенести `INPUT_THRUST_BLEND`, `CAMERA_LOOKAHEAD_Y`, `MAX_COINS_PER_RUN` в config. ~45 мин. Без зависимостей.

---

## Execution Order

```
1. bonk-race-vyh  (triangle)           — 30 мин, quick win
2. bonk-race-d9o  (replayData)         — 20 мин, параллельно возможно
3. bonk-race-hmg: data structure       — 45 мин
4. bonk-race-hmg: rendering            — 45 мин
5. bonk-race-hmg: UI controls          — 1 час
6. bonk-race-dh0  (hardcoded consts)   — 45 мин, в конце спринта
```

## Dependency Graph

```
vyh (triangle)     ─── no deps
d9o (replayData)   ─── no deps
dh0 (constants)    ─── no deps

hmg/data ──→ hmg/render ──→ hmg/UI
```

## NOT included

- **Trails Phase 3-4** (ribbon + particles) — следующий спринт
- **bonk-race-t7p** (anti-aliasing) — P3, не стоит рисков
- **normalizeNickname** — вероятно уже исправлено, требует проверки
- **generateRandomBasicSkin Math.random()** — требует расследования

## Verification

1. `npm run build` — TypeScript компилируется
2. `npm run test` — существующие тесты проходят
3. Визуальная проверка в BonkLab:
   - Треугольник внутри круга, читается направление
   - Trail включается в панели, точки затухают корректно
   - Пресеты не ломают trail-параметры
4. Для d9o: отправить невалидный replayData → 400 ответ
5. Для dh0: значения из config совпадают с прежними hardcoded
