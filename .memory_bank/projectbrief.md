# Project Brief — BonkRace

## Что это
BonkRace — гоночная браузерная игра (time-trial), форк SlimeArena. Игрок управляет блобом по трассе, собирает монетки, обходит препятствия.

## Архитектурный сдвиг от SlimeArena
- **Физика на клиенте** (GDD §10.1) — нет Colyseus real-time для MVP
- **REST API** вместо WebSocket state sync
- **Трасса дня** — seed-based, одна для всех игроков
- **Ghost система** — replay предыдущей попытки

## Что переиспользуется из SlimeArena
- Auth (Yandex, Telegram, VK, Dev)
- WalletService, ShopService, AdsService
- Admin dashboard
- Platform adapters (Telegram, CrazyGames, Yandex Games)
- DB миграции 001-010
- InputManager, joystick, GameLoopManager, SmoothingSystem

## Новое в BonkRace
- TrackConfig (checkpoints, surfaces, walls, obstacles, pickups)
- Wall-thrust механика (GDD §3.4)
- GhostRecorder / GhostPlayer
- Tracks API (GET /today, /list, /:id)
- Runs API (POST /submit)
- Medals, Streaks
- DB миграции 011-013

## Ключевые механики
- **Поверхности:** Slow (drag x3), Ice (drag x0.05), Boost (drag x0.3 + speed clamp)
- **Wall-thrust:** при скольжении о стену — ускорение вдоль стены
- **Пикапы:** Nitro (рывок), Teleport (shortcut)
- **Медали:** Bronze/Silver/Gold/Author по времени финиша

## Стек
- TypeScript монорепо (npm workspaces)
- Preact (UI), Canvas (рендеринг)
- Express (meta-server)
- PostgreSQL + Redis
- Vite (клиентская сборка)
