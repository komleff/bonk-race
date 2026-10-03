## TugLab 0.1.1: URL fragment

Share статический, без API/ID/новых зависимостей: base64url UTF-8 JSON, fragment ≤16000 символов, JSON ≤12000; несовместимость явная. Диапазоны включают реальную схему скрытых полей и штатные preset/default, а не только slider limits. Тест ui-share.cjs использует внешний Playwright/Chrome, PNG и JSON; мобильные 360/390/412 portrait и 844×390 landscape — эмуляция, Android остаётся отдельным follow-up. Версия репозитория 0.6.2 синхронизирована штатным sync-version; версия оболочки 0.1.1. Существующий Pages pipeline сохранён.

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

Существующие продуктовые зависимости, без добавлений. `npm run dev:tuglab` открывает LAN `0.0.0.0:5174/tuglab.html`; `npm run build:tuglab` выдаёт `client/dist-tuglab/index.html` с базой `./`. Версия приложения 0.1.0 плюс SHA, репозиторий 0.6.1. Тот же `lab/main` выбирает опцию по `data-mode="towing"`; обычный `lab.html` сохраняет штатный путь. Stock browser smoke проверил отсутствие towing/WASD, сохранение export/import и немедленный штатный numeric input.

`test:tuglab` — 182 проверки physics/runtime/LabInput. `qa:tuglab:matrix` — 63 игровых и 42 изолированных прогона. `qa:tuglab:browser` — собственный временный HTTP, root/nested/stock, PNG и локальные 120 секунд RAF; `TUGLAB_PERF_SECONDS=0` оставляет smoke. Результаты в игнорируемой `.cache/tuglab-qa/`.

Browser QA использует внешний Playwright/Chrome: `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `TUGLAB_URL`. Продуктовая зависимость не добавляется. `test:tuglab:ui`, `tests/tuglab/ui-lifecycle.cjs` и `tests/tuglab/ui-numeric.cjs` проверяют реальный ввод, смерть/респаун и посимвольный numeric draft. Tow draft принимается по blur/Enter; промежуточный текст не меняет модель, slider/quick и reset/preset синхронизируют draft/error. Эти checks включены в существующий browser step нового readonly workflow.

CI `TugLab checks and artifact` только проверяет и выдаёт tar/SHA/source manifest/QA evidence, без публикации и secrets. Run 37047921348 для HEAD `16158ea` прошёл на Node 20/Linux. Действующий workflow BonkLab не изменён. Generated dist/cache игнорируются Git, серверный API не нужен.

Схема Caddy: `docs/deploy/tuglab-vps.md`, production не изменён. DNS 83.217.202.233 готов, HTTPS ещё не опубликован. Реальный Android отдельно, touch emulation не считается устройством.
