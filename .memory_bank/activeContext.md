# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (7 марта 2026)

**Репозиторий:** `komleff/bonk-race` (форк `komleff/slime-arena`)
**Ветка:** `main`
**GDD версия:** 3.4.0

---

## Завершённые PR

| PR | Ветка | Описание | Статус |
|----|-------|---------|--------|
| #1 | `race/init` | Shared package: TrackConfig, physics types, rng в shared | Merged |
| #2 | `race/phase5-track` | Starter Circuit preset, tracks API, wall/surface physics, smoke test | Merged |
| #3 | `fix/db-defaults-uuid` | Миграции UUID fix + bonk_race DB defaults | Open |

---

## Что сделано

### Фаза 1: Ребрендинг
- `@slime-arena/*` -> `@bonk-race/*` в package.json

### Фаза 2: Shared package — physics client-side
- `shared/src/trackConfig.ts` — TrackConfig, TrackPhysicsConfig, surface/pickup constants
- `shared/src/rng.ts` — детерминированный LCG RNG (перенесён из server)
- Удалены: formulas.ts, sprites.ts

### Фаза 3: Client — physics loop + rendering
- `client/src/raceMain.ts` — клиентская физика (FlightAssist, collision, wall-thrust)
- `client/src/game/GhostRecorder.ts`, `GhostPlayer.ts`
- `client/src/rendering/blob.ts`, `track.ts`
- Tick-based countdown (3, 2, 1, GO!)
- Named physics constants (WALL_RESTITUTION, BOOST_SPEED_CAP, etc.)

### Фаза 4: Meta-server — tracks REST API
- `server/src/meta/routes/tracks.ts` — GET /today, /list, /:id
- `server/src/meta/data/trackPresets.ts` — Starter Circuit (8 cp, 10 obs, 4 surf, 7 walls)
- Proto pollution protection (DANGEROUS_KEYS blocklist)

### Фаза 5-6: Track preset + Smoke test
- `server/tests/tracks-smoke.test.js` — 41 assertion, 0 failures
- Meta-server подключается к bonk_race DB (PostgreSQL + Redis)
- Миграции 001-013 применены

---

## Инфраструктура (локальная)

| Компонент | Порт | Запуск |
|-----------|------|--------|
| Meta-server | :3000 | `cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts` |
| Client (Vite) | :5173 | `npm run dev:client` |
| PostgreSQL | :5432 | Docker `slime-pg` (БД `bonk_race`, user `bonk`) |
| Redis | :6379 | Docker `slime-redis` (shared с slime-arena) |

---

## Следующие шаги

1. Смержить PR #3 (DB defaults)
2. Настроить Vite proxy для клиента -> meta-server
3. Подключить клиент к серверу: loadTrackOfDay() -> рендер трассы в браузере
4. POST /api/v1/runs/submit — приём результатов
5. Ghost система (запись + воспроизведение)
6. DevAuth flow для локального тестирования

---

## Команды

```bash
# Сборка
npm run build           # shared -> server -> client

# Разработка
cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts
npm run dev:client      # http://localhost:5173

# Тесты
node server/tests/tracks-smoke.test.js   # 41 passed

# Beads
bd ready
bd list --status=open
```
