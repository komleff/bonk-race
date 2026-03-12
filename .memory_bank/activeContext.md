# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (13 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Активная ветка:** `main` (v0.5.0 released)
**GDD версия:** 4.0 (`docs/gdd/GDD-index.md`)
**Версия:** 0.5.0

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
| #11 | `fix/lab-input-direction` | Fix: направление мыши в BonkLab (2x angle error) | Merged |
| #12 | `feat/countdown-and-respawn-overlay` | Countdown 3-2-1-Go! + respawn overlay | **Open — ревью** |
| #14 | `tz-lateral-grip` | Анизотропное трение + BonkRace v0.3 пресеты | **Merged** |
| #15 | `sprint/trails-direction-triangle` | Следы, треугольник направления, техдолг | **Merged** |
| #17 | `feat/trail-coloring` | Trail coloring + spike knockback/destroy | **Merged** |
| #22 | `fix/bonklab-techdebt` | Tech debt + zone tuning + arena balancing | **Merged** |
| #23 | `chore/release-v0.5.0` | Release v0.5.0 | **Merged** |

---

## PR #22 — BonkLab Tech Debt + Zone Tuning + Arena Balancing (13 марта 2026)

**Ветка:** `fix/bonklab-techdebt`
**Ревью:** Copilot (COMMENTED), Claude Opus (2x APPROVED), GPT-5 Codex (CHANGES_REQUESTED → исправлено)
**Тесты:** 15/15 (determinism, orb-bite, arena-generation, anisotropic-friction)

### Ключевые изменения

| Категория | Описание |
|-----------|---------|
| **Рефакторинг BonkLab** | Извлечены spikeResolver.ts, OrbTickConfig; убрано dual ownership lastDensity |
| **Баг-фиксы** | correctionPercent в static collisions, zone 1-tick lag |
| **Тюнинг зон** | Ice (скользкий разгон), Turbo (буст x2), Mud (вязкая ловушка), Sand (занос) |
| **Балансировка арены** | Зоны 8 (turbo 50%, ice 30%), камни 4, шипы 2, проходы 1 |
| **Проходы** | Горизонтальные цепочки 2-3 шаров, светлый цвет #999/#bbb |
| **Орбы** | count 30, minSpeed 10, spikeKill выкл |
| **UI** | «Насыщенность» вместо «Плотность», zoneThrustN max 100k, trail maxAge 1.0 |

---

## PR #17 — Trail Coloring + Spike Knockback (11 марта 2026)

**Ветка:** `feat/trail-coloring`
**Ревью:** 6/6 APPROVED (Opus, GPT-5.3-Codex, GPT-5 Codex, Security/Quality/Architecture Agents)
**Итерации:** 2 (Iter 1: 3P1+7P2 → Developer fix → Iter 2: 6/6 APPROVED)
**Тесты:** 15/15 (determinism, orb-bite, arena-generation, anisotropic-friction)

### Ключевые изменения

| Фича | Описание |
|------|---------|
| **Trail coloring** | 3 паттерна: Моноцвет, По дрифту, Радуга. Color picker + HEX input |
| **Spike knockback** | Импульсный knockback (dv = impulse / mass), velocity cap 2000 м/с |
| **Spike destroy** | Шипы уничтожаются/остаются при столкновении, восстанавливаются при reset |
| **Reset → BonkRace v0.3** | Кнопка Reset применяет пресет BonkRace v0.3 (не raw defaults) |
| **Import/Export** | Поддержка строковых параметров (trail colors, pattern) |

---

## Релиз 0.4.0 — Следы, треугольник, техдолг (11 марта 2026)

**PR:** #15 (`sprint/trails-direction-triangle`)
**Ревью:** Copilot, GPT-5 Codex, GPT-5.3 Codex, Claude Haiku — все замечания P2 исправлены
**Тесты:** 21/21 (determinism, orb-bite, arena-generation, anisotropic-friction)

### Ключевые изменения v0.4.0

| Фича | Описание |
|------|---------|
| **Треугольник направления** | Внутренний белый треугольник-стрелка внутри круга персонажа (bonk-race-vyh) |
| **Следы движения** | Circular buffer 600 точек, distance-based thinning, fade по возрасту (bonk-race-hmg) |
| **Зона Sand** | Добавлена в генератор арены, цвет #c2a64e, метка "Песок" (bonk-race-gl2) |
| **Зонные слайдеры** | 4 зоны × 7 SurfaceConfig параметров в LabPanel (bonk-race-83p) |
| **Авто-старт баг** | Исключение зон из spawn area в генераторе арены (bonk-race-2tp) |
| **replayData валидация** | Number.isFinite проверка каждого элемента (bonk-race-d9o) |
| **Константы → config** | INPUT_THRUST_BLEND, CAMERA_LOOKAHEAD_Y, MAX_COINS_PER_RUN → balance.json (bonk-race-dh0) |
| **Trail UX** | Teleport detection (>500px), cleared on disable, real dt via performance.now() |
| **i18n** | Все комментарии и тултипы на русском, англицизмы убраны |

### Закрытые задачи (Beads)

| ID | Тип | Описание |
|----|-----|---------|
| bonk-race-vyh | feature | Треугольник внутри круга |
| bonk-race-hmg | feature | Следы движения |
| bonk-race-2tp | bug | Авто-старт после Go! |
| bonk-race-d9o | bug | replayData валидация |
| bonk-race-dh0 | task | Hardcoded константы → config |
| bonk-race-gl2 | bug | Sand zone не генерируется |
| bonk-race-83p | bug | Зонные слайдеры отсутствуют |

---

## Известный техдолг

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `shared/src/surfaceConfig.ts` | Пресеты зон захардкожены — вынести в balance.json |
| P2 | `shared/src/physics/arenaGenerator.ts` | Вероятности зон через массив — заменить на weighted random |
| P2 | `client/src/lab/BonkLab.ts` | reverseZoneAngleDeg — не реализован |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P3 | `client/src/raceMain.ts` | Isotropic drag (TODO LG-6) |
| P3 | `shared/src/config.ts` | race.* секция не типизирована в resolveBalanceConfig() |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Guest без profiles — нет opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur |
| P3 | — | Тесты не валидируют реальные preset-значения зон |

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

## Команды

```bash
# Сборка
npm run build           # shared -> server -> client

# Разработка
npm run dev:client      # http://localhost:5173
# BonkLab: http://localhost:5173/lab

# Тесты
npm run test            # determinism + orb-bite + arena-generation + anisotropic-friction

# Beads
bd ready
bd list --status=open
```
