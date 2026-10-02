# Tech Context — BonkRace

## Структура монорепо
```
bonk-race/
  shared/          @bonk-race/shared — типы, константы, rng, mathUtils
  server/          @bonk-race/server — meta-server (Express :3000) + match-server (Colyseus :2567, не используется в MVP)
  client/          @bonk-race/client — Vite + Preact + Canvas
  admin-dashboard/ — Admin UI (Preact)
  docker/          — Dockerfiles, compose, entrypoints
```

## Ключевые файлы
| Файл | Назначение |
|------|------------|
| `shared/src/trackConfig.ts` | TrackConfig, TrackPhysicsConfig, surface/pickup constants |
| `shared/src/rng.ts` | Детерминированный LCG RNG |
| `server/src/meta/routes/tracks.ts` | Tracks API (today/list/:id) |
| `server/src/meta/data/trackPresets.ts` | Hand-crafted track: Starter Circuit |
| `client/src/raceMain.ts` | Client-side physics, rendering, game loop |
| `client/src/game/GhostRecorder.ts` | Ghost recording |
| `client/src/game/GhostPlayer.ts` | Ghost playback |
| `client/src/rendering/blob.ts` | Player blob rendering |
| `client/src/rendering/track.ts` | Track elements rendering |
| `server/src/db/pool.ts` | PostgreSQL + Redis connection |
| `server/src/db/migrate.ts` | Migration runner |

## БД
- **PostgreSQL:** bonk_race (user: bonk, pass: bonk_dev_password, port: 5432)
- **Redis:** localhost:6379
- **Миграции:** 001-013 (001-010 от SlimeArena, 011-013 новые для BonkRace)
- **Новые таблицы:** race_leaderboard, ghost_replays, medals, daily_streaks

## Сборка
```bash
npm run build       # shared -> server -> client -> admin
npm run dev:client  # Vite HMR на :5173
# Meta-server:
cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts
```

## Физика (client-side)
- Fixed timestep accumulator (configurable tickRate, default 60 Hz)
- FlightAssist -> Physics -> Collision -> CheckpointDetection
- Named constants: WALL_RESTITUTION=1.6, OBSTACLE_RESTITUTION=1.8, BOOST_SPEED_CAP=200
- Wall-thrust: boostForce = wallThrustCoeff * |dotN| * tangentDirection

## Паттерны
- Pool.ts default DATABASE_URL: `postgresql://bonk:bonk_dev_password@localhost:5432/bonk_race`
- Track ID validation: DANGEROUS_KEYS blocklist + regex `^[a-z0-9\-_.]+$/i` + max 128 chars
- `stringHash()` — generic hash for seeds and daily rotation
- TICK_RATE constant in trackPresets.ts (used for both physics and inactivity threshold)

## U2 TugLab — checkpoint, ещё без игровой интеграции

- Исходники: `client/src/tuglab/{types.ts,config/,physics/}`. Отдельный TypeScript-конфиг `client/tsconfig.tuglab-test.json` и тесты `tests/tuglab/*.test.cjs`. Новые зависимости не добавлены.
- Проверки: `npm run typecheck:tuglab`, `npm run test:tuglab` (32/32 PASS на checkpoint `1bd985d`). Существующая сборка и тесты также проходят по отчёту Developer.
- Репозиторий в рабочей ветке: версия 0.6.1 по политике PATCH. Готовой точки входа/сборки TugLab пока нет; трос, пружина, CCD, UI и публикация не реализованы.

## TugLab — самостоятельная оболочка (3 октября 2026)

Существующие зависимости без добавлений. `npm run dev:tuglab`→LAN0.0.0.0:5174/tuglab.html; `npm run build:tuglab`→client/dist-tuglab/index.html сbase './'. Собственная версия0.1.0+gitcommit, репозиторий0.6.1. Тотжеlab/main выбираетопциюпоdata-mode="towing"; defaultlab.html сохраняетstockpath. Вbuiltstockпроверены noTowing/noWASD/export-import.

`test:tuglab` включаетphysics/runtime/LabInput (182tests). `test:tuglab:ui` — browserinteraction через externalPlaywright/Chrome, задаютсяPLAYWRIGHT_MODULE/CHROME_PATH/TUGLAB_URL; defaultпути локальногоQAв/tmp/mac, неproductdependency. Дополнительный `tests/tuglab/ui-lifecycle.cjs` проверяетrealspike death/respawnheldinput. ФинальнаяQA/CIartifact вработе.

Generateddist-tuglab/dist-lab и.cache/tuglab-qa игнорируютсяGit. СерверныйAPIне нужен; Caddyготоваясхема docs/deploy/tuglab-vps.md, productionнеизменён. DNSresolved83.217.202.233, HTTPSTLSпоканеуспешен. Androiddeviceнепроверен.
