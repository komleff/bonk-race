# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (10 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Активная ветка:** `fix/lab-input-direction` (PR#11, от main)
**GDD версия:** 4.0 (`docs/gdd/GDD-index.md`)
**Версия:** 0.1.0 (релиз: BonkLab v1.2)

---

## PR-история

| PR | Ветка | Описание | Статус |
|----|-------|---------|--------|
| #1 | `race/init` | Shared package: TrackConfig, physics types, rng | Merged |
| #2 | `race/phase5-track` | Starter Circuit, tracks API, wall/surface physics | Merged |
| #3 | `fix/db-defaults-uuid` | UUID миграции fix, bonk_race DB defaults | Merged |
| #4 | `chore/rebrand-and-memory-bank` | Ребрендинг slime-arena → bonk-race | Merged |
| #5 | `feat/vite-proxy-client-connect` | Sprint 1: auth, submit, ghosts, vertical track | **Open → ready to merge** |
| #6 | `feat/bonklab-v1` | BonkLab v1.0: physics sandbox | Merged |
| #7 | `ci/deploy-lab-workflow` | CI: GitHub Pages deployment for BonkLab | Merged |
| #8 | `fix/lab-pages-base` | Fix: base path for GitHub Pages | Merged |
| #9 | `feat/bonklab-v1.2` | **BonkLab v1.2: orbs, finish, geometry, presets** | **APPROVED → ready to merge** |
| #10 | `feat/gdd-v4-ugc` | GDD v4.0: UGC-секция, русификация | Merged |
| #11 | `fix/lab-input-direction` | **Fix: направление мыши в BonkLab (2x angle error)** | **Open — ревью пройдено** |

---

## Sprint 2 — BonkLab v1.2 (ЗАВЕРШЁН 10 марта 2026)

**PR:** #9 (`feat/bonklab-v1.2`) — 7 коммитов, 4 ревьюера (GPT-5 Codex, GPT-5.3-Codex, GPT-5.4, Claude Opus 4.6)
**Итог:** 2 × APPROVED (Claude, GPT-5.3), 1 × CHANGES_REQUESTED с 1 остаточным P1 (GPT-5.4 — исправлен), 11 багов найдено и исправлено.

### Что реализовано

| Фича | Описание |
|------|---------|
| **Орбы** | Баллистические cyan-объекты: drag, collision (orb-orb, orb-player, orb-obstacle, orb-wall), spike kill с анимацией, детерминизм от seed |
| **Геометрия трассы** | `arena.pillarRadius`, `arena.spikeRadius`, `arena.passageRadius`, `arena.passageGap` — перегенерация при изменении |
| **Финиш** | Circle-vs-AABB по обеим осям, оверлей с временем/дистанцией, best time tracking |
| **Камера** | Персонаж на 65% от верха экрана |
| **Прогресс и дистанция** | HUD-телеметрия: метры, процент, прогресс-бар |
| **Пресет-трекинг** | Dropdown с активным пресетом, «Custom» при ручном изменении |
| **Пресет «Ультралёгкий»** | mass=20, thrust=80000, speedLimit=500, drag=0.001 |
| **Rename slime → mud** | Полный rename: shared types, server, BonkLab, renderer, panel, HUD. Цвет: #6B3A1F |
| **Turbo rework** | `speedMultiplier → accelBoost`, сила в направлении скорости |
| **Смерть/респаун** | Сброс таймера, «Go!» overlay 0.8с с fade-out |

### Ключевые исправления по ревью

| Приоритет | Баг | Исправление |
|-----------|-----|-------------|
| P0 | Финиш-детекция — только по Y | Circle-vs-AABB с высотой полосы 24px |
| P1 | Начальная арена density=1.0 vs UI 5.0 | `buildArena(42, this.lastDensity)` |
| P1 | orbDensityManual залипал после reset/preset | `resetOrbDensityManual()` в reset/import/preset |
| P1 | Auto-sync density не обновлял массы орбов | Пересчёт `orb.mass` для живых орбов |
| P1 | Defaults snapshot после startup preset | `trueDefaults` до startup preset |
| P1 | orbDensityManual терялся при regenerateArena | Save/restore вокруг reset() |

---

## Hotfix: Lab input direction (10 марта 2026)

**PR:** #11 (`fix/lab-input-direction`) — ревью пройдено (Copilot, GPT-5, GPT-5.3 — APPROVED)
**Ветка:** `fix/lab-input-direction`

**Проблема:** В BonkLab жёлтый маяк (beacon) и направление движения не совпадали с позицией курсора мыши. Ошибка угла ~2x при курсоре под 45°.

**Причина:** `LabInput.updateMouseState()` вычислял направление от центра canvas (50% высоты), а персонаж рендерился на 65% высоты (`CHAR_SCREEN_Y_RATIO`).

**Что исправлено:**

- `LabInput.ts` — добавлен `setCharacterScreenPos()`, направление от позиции персонажа к курсору
- `LabRenderer.ts` — извлечена константа `CHAR_SCREEN_Y_RATIO`, кэш `getBoundingClientRect()`, визуальный тач-джойстик
- `lab/main.ts` — передача экранной позиции персонажа каждый кадр

**Статус:** Ожидает merge в main.

---

## Известный техдолг (Sprint 3)

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `server/src/meta/routes/runs.ts:57` | replayData: нет проверки `Number.isFinite` |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P2 | `client/src/lab/BonkLab.ts` | Zone modifier 1-tick application lag (architectural) |
| P2 | `client/src/lab/BonkLab.ts` | correctionPercent in static collisions always 1.0 |
| P2 | `client/src/lab/BonkLab.ts` | reverseZoneAngleDeg — не реализован в движке |
| P2 | `client/src/lab/main.ts` ↔ `LabToolbar.tsx` | STARTUP_PRESET дублирует PRESETS[2].values |
| P3 | `client/src/raceMain.ts:208` | `INPUT_THRUST_BLEND = 0.3` hardcoded |
| P3 | `client/src/raceMain.ts:632` | `CAMERA_LOOKAHEAD_Y = -120` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:17` | `MAX_COINS_PER_RUN` hardcoded |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Гостевые без `profiles` — нет opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur on object edges |
| P3 | `client/src/lab/` | Hardcoded физические константы → config |

---

## Инфраструктура (локальная)

| Компонент | Порт | Запуск |
|-----------|------|--------|
| Meta-server | :3000 | `cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts` |
| Client (Vite) | :5173 | `npm run dev:client` |
| BonkLab | :5173/lab | `npm run dev:client` → `/lab` |
| PostgreSQL | :5432 | Docker `slime-pg` (БД `bonk_race`, user `bonk`) |
| Redis | :6379 | Docker `slime-redis` |

---

## Следующие шаги (Sprint 3)

1. Merge PR#5 (MVP loop) в main
2. Sprint 3: BonkLab track editor (визуальное редактирование объектов)
3. Sprint 3: `reverseZoneAngleDeg` — реализовать в движке
4. Sprint 3: DevAuth flow (быстрое переключение профилей)
5. Sprint 3: Вынести hardcoded константы в config
6. Sprint 3: replayData — `Number.isFinite` валидация
7. Sprint 3: idempotency для `/api/v1/runs/submit`
8. CI/CD для bonk-race

---

## Команды

```bash
# Сборка
npm run build           # shared -> server -> client

# Разработка
cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts
npm run dev:client      # http://localhost:5173
# BonkLab: http://localhost:5173/lab

# Тесты
npm run test            # determinism + orb-bite + arena-generation

# Beads
bd ready
bd list --status=open
```
