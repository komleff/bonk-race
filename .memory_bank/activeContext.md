# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (13 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Активная ветка:** `main` (v0.6.0 готовится к релизу)
**GDD версия:** 4.0 (`docs/gdd/GDD-index.md`)
**Версия:** 0.6.0

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
| #9 | `feat/bonklab-v1.2` | BonkLab v1.2: orbs, finish, geometry, presets | **APPROVED → ready to merge** |
| #10 | `feat/gdd-v4-ugc` | GDD v4.0: UGC-секция, русификация | Merged |
| #11 | `fix/lab-input-direction` | Fix: направление мыши в BonkLab (2x angle error) | Merged |
| #12 | `feat/countdown-and-respawn-overlay` | Countdown 3-2-1-Go! + respawn overlay | **Open — ревью** |
| #14 | `tz-lateral-grip` | Анизотропное трение + BonkRace v0.3 пресеты | Merged |
| #15 | `sprint/trails-direction-triangle` | Следы, треугольник направления, техдолг | Merged |
| #17 | `feat/trail-coloring` | Trail coloring + spike knockback/destroy | Merged |
| #22 | `fix/bonklab-techdebt` | Tech debt + zone tuning + arena balancing | Merged |
| #23 | `chore/release-v0.5.0` | Release v0.5.0 | Merged |
| #24 | `chore/cleanup` | Архив планов, удаление веток, фикс docs | Merged |
| #25 | `fix/bonklab-render-interpolation` | Устранение jitter: единый RAF + интерполяция тиков | Merged |
| #26 | `fix/trail-rendering-order` | Плавный след: обход ring buffer по возрасту | **На ревью** |

---

## Известный техдолг

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `shared/src/surfaceConfig.ts` | Пресеты зон захардкожены — вынести в balance.json |
| P2 | `shared/src/physics/arenaGenerator.ts` | Вероятности зон через массив — заменить на weighted random |
| P2 | `client/src/lab/BonkLab.ts` | reverseZoneAngleDeg — не реализован |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P2 | `client/src/lab/BonkLab.ts` | Аллокации в tick(): getState объект, Set, body — pre-allocation |
| P2 | `client/src/lab/LabRenderer.ts` | Trail: ageTrail сканирует expired, calculateTrailColor аллоцирует строки |
| P3 | `client/src/raceMain.ts` | Isotropic drag (TODO LG-6) |
| P3 | `shared/src/config.ts` | race.* секция не типизирована в resolveBalanceConfig() |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Guest без profiles — нет opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur |

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
