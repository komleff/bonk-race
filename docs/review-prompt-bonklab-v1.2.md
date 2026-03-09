# Промпт для AI-ревью: BonkLab v1.2 (Sprint 2)

## Контекст

Ты — AI-ревьюер проекта **Bonk Race** (HTML5 мультиплеерная гоночная аркада). Тебе нужно провести code review изменений **BonkLab v1.2** — dev-only песочницы для настройки физики движения.

**BonkLab — это НЕ игра.** Это инструмент для геймдизайнеров и разработчиков: один персонаж на тестовой трассе, ~50 параметров, real-time редактирование, экспорт/импорт JSON.

---

## Что изменилось в Sprint 2 (v1.2)

### Новые фичи
1. **Орбы** — подвижные баллистические объекты (без FA): `resolveCircleCircleCollision()`, drag, spike kill с cyan-анимацией смерти. Детерминированная генерация от seed. Auto-sync density с массой/радиусом игрока.
2. **Настраиваемая геометрия трассы** — `arena.pillarRadius`, `arena.spikeRadius`, `arena.passageRadius`, `arena.passageGap` (перегенерация арены при изменении).
3. **Финиш** — физическое касание клетчатой полосы (circle-vs-rect по обеим осям), оверлей с временем/дистанцией, best time tracking.
4. **Камера** — персонаж на 65% от верха экрана (больше обзора вперёд).
5. **Прогресс и дистанция** — HUD-телеметрия: метры, процент, прогресс-бар.
6. **Пресет-трекинг** — dropdown показывает активный пресет, «Custom» при ручном изменении. Cross-component sync LabPanel↔LabToolbar.
7. **Пресет «Ультралёгкий»** — mass=20, thrust=80000, speedLimit=500, drag=0.001.

### Рефакторинг
8. **Rename `slime` → `mud`** — полный rename по всем слоям (shared types, server, BonkLab, renderer, panel, HUD). Цвет: `#6B3A1F` (коричневый).
9. **Turbo: `speedMultiplier` → `accelBoost`** — сила = accelBoost × mass в направлении скорости (физически корректнее).
10. **Смерть** — таймер сбрасывается к 0, countdown только «Go!» (0.8 с), сообщение с дистанцией/прогрессом.

### Параметры (BonkLab overrides поверх balance.json)
- Высота карты: 5120 м (было 1000), ширина: 800 м
- baseRadius: 20 м (было 10), max slider: 40
- Density default: 5.0, max: 25.0
- Turbo accelBoost: 1000 (max 10000)
- Mud friction: 500 (max 2000), speed: 0.5
- Ice friction: 0.1
- Orbs count: 25

---

## Файлы для ревью

### Обязательные (core logic)

| Файл | Строк изм. | Что смотреть |
|------|-----------|-------------|
| `client/src/lab/BonkLab.ts` | ~350+ | Орб-физика (drag, collisions, spike kill), финиш-детекция, auto-sync density, death/respawn, BonkLab overrides |
| `client/src/lab/LabRenderer.ts` | ~160+ | Рендеринг орбов + анимация смерти, финиш-оверлей, death message, камера offset, minimap viewport |
| `shared/src/physics/arenaGenerator.ts` | ~10 | Настраиваемые радиусы, орб-генерация, density max |
| `shared/src/index.ts` | ~2 | Реэкспорт `resolveCircleCircleCollision` |

### UI

| Файл | Строк изм. | Что смотреть |
|------|-----------|-------------|
| `client/src/lab/ui/LabPanel.tsx` | ~120+ | Новые группы «Геометрия трассы» и «Орбы», autoStep fix для малых значений, auto-sync re-read |
| `client/src/lab/ui/LabToolbar.tsx` | ~60+ | Пресет-трекинг, «Custom» при изменении, externalParamChange prop |
| `client/src/lab/main.ts` | ~60+ | Cross-component sync (paramChangeCounter), startup preset |
| `client/src/lab/TelemetryHUD.ts` | ~20 | Дистанция + прогресс (2 новые строки HUD) |

### Документация (справочно)

- `docs/tz/BonkLab-TZ-v1.2.md` — полное ТЗ с [v1.2] метками
- `docs/BonkLab-Guide.md` — руководство пользователя

---

## Архитектура для понимания

```
balance.json (defaults)
    ↓
BonkLab.buildFlatParams() ← overrides поверх balance.json
    ↓
lab.params: Record<string, number|boolean> ← flat key-value
    ↓
updateParams() → физика (tick), UI (LabPanel, LabToolbar)
    ↓
BonkLab.tick():
  1. FlightAssist → forces
  2. integratePhysics() → position
  3. Collisions (walls, obstacles, passages)
  4. Zone effects (ice, mud, turbo)
  5. Orb loop: drag → integrate → collisions (obstacles, walls, orb-orb, orb-player) → spike kill
  6. Death check (spike contact)
  7. Finish check (circle-vs-rect overlap)
  8. Distance/progress update
```

**Физика:** Ньютоновская, F=ma, semi-implicit Euler, 60 Hz. FA вычисляет силы, но не нарушает физику — все ограничены тягой.

**Shared layer:** `shared/src/physics/` — единый код для сервера, клиента и BonkLab. Коллизии: `resolveCircleCircleCollision()`, `resolveCircleStaticCollision()`, `resolveWallCollision()`.

**UI:** Preact + signals. LabPanel (слайдеры) и LabToolbar (тулбар) — React-подобные компоненты. Canvas 2D для рендеринга.

---

## На что обратить внимание

### P0 — Критичное
- [ ] **Физическая корректность орбов:** drag clamping (`Math.max(0, 1 - dragK * dt)`), collision resolution, mass computation (`density × π × r²`)
- [ ] **Детерминизм:** орбы генерируются от seed через `Rng`, при Restart — те же позиции/скорости
- [ ] **Финиш-детекция:** проверка по обеим осям X и Y (нельзя получить финиш, пролетев мимо полосы)
- [ ] **Нет утечек состояния:** `finished`, `bestTime`, `isNewRecord` корректно сбрасываются при reset/regenerate

### P1 — Важное
- [ ] **Auto-sync orb density:** при изменении mass/baseRadius пересчитывается, если пользователь не менял вручную (`orbDensityManual` флаг)
- [ ] **Пресет-трекинг:** при изменении параметра (panel slider, density slider, import) — dropdown показывает «Custom»
- [ ] **Cross-component sync:** `paramChangeCounter` в main.ts → `externalParamChange` в LabToolbar
- [ ] **Minimap viewport:** корректный для асимметричной камеры (65% offset)
- [ ] **Export/Import round-trip:** новые параметры (орбы, геометрия) включены в экспорт и корректно импортируются

### P2 — Качество кода
- [ ] **Нет дублирования:** физические функции из `shared/` переиспользуются, не копируются
- [ ] **Перформанс:** O(n²) орб-орб коллизий при count≤100 → приемлемо для dev-tool
- [ ] **Типы:** `SandboxOrb` interface, `SandboxState` расширен корректно
- [ ] **Rename slime→mud:** не осталось stale references

### Не ревьюить
- `config/balance.json` — **не менялся** (BonkLab overrides применяются в коде)
- `server/src/` — изменения только rename `slime→mud` (уже в отдельном коммите)
- Production-код игры (`client/src/main.ts`, `client/src/raceMain.ts`) — не затронут

---

## Как проводить ревью

1. **Прочитай `docs/tz/BonkLab-TZ-v1.2.md`** — это source of truth для требований
2. **Начни с `BonkLab.ts`** — ядро всех изменений (орбы, финиш, дефолты)
3. **Затем `LabRenderer.ts`** — визуализация (орбы, финиш-оверлей, камера)
4. **Потом UI** — LabPanel, LabToolbar, main.ts
5. **Проверь shared** — arenaGenerator.ts, index.ts (минимальные изменения)
6. **Сверь с чеклистом** выше

Формат ответа:
```
## Findings

### P0 — Critical
- [файл:строка] Описание проблемы

### P1 — Important
- [файл:строка] Описание проблемы

### P2 — Suggestions
- [файл:строка] Описание

## Summary
Краткий вердикт: approve / request changes / блокеры
```
