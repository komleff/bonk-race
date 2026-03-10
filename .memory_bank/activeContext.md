# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (10 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Активная ветка:** `tz-lateral-grip` (PR#14, от main)
**GDD версия:** 4.0 (`docs/gdd/GDD-index.md`)
**Версия:** 0.3.0

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
| #14 | `tz-lateral-grip` | **Анизотропное трение + BonkRace v0.3 пресеты** | **Open — готов к merge** |

---

## Релиз 0.3.0 — Анизотропное трение + BonkRace v0.3 (10 марта 2026)

**PR:** #14 (`tz-lateral-grip`)
**Ревью:** 3× APPROVED (Security, Architecture, Code Quality) + Gemini + Codex
**Тесты:** 15/15 anisotropic-friction, все остальные зелёные

### Ключевые изменения

| Фича | Описание |
|------|---------|
| **Анизотропный decay** | `exp(-k*dt)` вместо force-based drag. Forward/lateral/angular decay раздельно |
| **SurfaceConfig** | `ISurfaceParams` (4 поля) + `ISurfaceAssistParams` (3 поля) для 5 зон |
| **12 BonkLab пресетов** | Ультралёгкий, Slime Arena, BonkRace v0.1, **BonkRace v0.3**, Грузовик, Дрифт, Космос FA-On, Космос FA-Off, Ралли, Бампер-кар, Картинг, Формула |
| **BonkRace v0.3 (дефолт)** | mass=40, inertia=0.05, thrust=70k, torque=80k, grip=25, стрейфы=25k — казуальное аркадное управление |
| **inertiaFactor** | Переименован в "Коэф. формы", default 0.10, min 0.01 |
| **Runtime-валидация** | `clampSurfaceConfig()` с NaN guard |
| **Зона Sand** | `ZONE_TYPE_SAND = 6` с вязким характером |
| **Серверные зоны** | `getSurfaceParams()`/`getSurfaceAssistParams()` в ArenaRoom |

### Пресеты по категориям

**Слаймы/абстрактные** (со стрейфами):
- Ультралёгкий, Slime Arena, BonkRace v0.1, BonkRace v0.3, Бампер-кар

**Автомобили** (без стрейфов):
- Грузовик, Дрифт, Ралли, Картинг, Формула

**Космос** (со стрейфами, Elite Dangerous):
- Космос FA-On (drag=0, FA активен), Космос FA-Off (полный Ньютон)

### Отложено

- LG-5 (bonk-race-6nu): Серверная интеграция movementSystems
- LG-6 (bonk-race-b18.1): raceMain.ts — анизотропный decay

---

## Известный техдолг

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `server/src/meta/routes/runs.ts:57` | replayData: нет проверки `Number.isFinite` |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P2 | `client/src/lab/BonkLab.ts` | Zone modifier 1-tick application lag |
| P2 | `client/src/lab/BonkLab.ts` | correctionPercent in static collisions always 1.0 |
| P2 | `client/src/lab/BonkLab.ts` | reverseZoneAngleDeg — не реализован |
| P2 | `shared/src/physics/arenaGenerator.ts` | ZONE_PARAMS legacy — заменён SurfaceConfig |
| P3 | `client/src/raceMain.ts` | Isotropic drag (TODO LG-6) |
| P3 | `client/src/raceMain.ts:208` | `INPUT_THRUST_BLEND = 0.3` hardcoded |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Guest без profiles — нет opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur |

---

## Новые задачи (Beads)

| ID | Тип | Описание |
|----|-----|---------|
| bonk-race-vyh | P2 feature | Перерисовать персонажа: треугольник внутри круга |
| bonk-race-hmg | P2 feature | Следы движения (motion trails) |

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
