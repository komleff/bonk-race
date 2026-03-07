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
