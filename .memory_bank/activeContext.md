# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (8 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Ветка:** `feat/vite-proxy-client-connect` → ожидает merge в `main`
**GDD версия:** 3.0 (`docs/gdd/BonkRace-GDD-v3_0.md`)
**Версия:** 0.1.0

---

## PR-история

| PR | Ветка | Описание | Статус |
|----|-------|---------|--------|
| #1 | `race/init` | Shared package: TrackConfig, physics types, rng в shared | Merged |
| #2 | `race/phase5-track` | Starter Circuit preset, tracks API, wall/surface physics, smoke test | Merged |
| #3 | `fix/db-defaults-uuid` | Миграции UUID fix + bonk_race DB defaults | Merged |
| #4 | `chore/rebrand-and-memory-bank` | Ребрендинг slime-arena → bonk-race, README | Merged |
| #5 | `feat/vite-proxy-client-connect` | **Sprint 1 MVP: auth, submit, ghosts, vertical track** | **Open → ready to merge** |

---

## Sprint 1 — MVP playable loop (ЗАВЕРШЁН, ожидает merge)

**Ревью пройдено:** GPT-5.3-Codex ✅ (iter 4), ChatGPT-5.4 ✅ (iter 4), Gemini 3.1 Pro ✅

### Что реализовано

| Компонент | Файл | Описание |
|-----------|------|---------|
| Guest auth | `client/src/raceMain.ts` | ensureAuth → guest token через metaServerClient |
| Submit results | `server/src/meta/routes/runs.ts` | POST /api/v1/runs/submit, leaderboard position |
| Ghost replays | `client/src/raceMain.ts`, `GhostRecorder.ts`, `GhostPlayer.ts` | Загрузка + воспроизведение |
| Medal + leaderboard | `client/src/raceMain.ts` | На экране результатов |
| Instant restart | `client/src/raceMain.ts` | R / tap, < 0.5s (GDD §2) |
| Vertical track "First Run" | `server/src/meta/data/trackPresets.ts` | 600×2400, 10 cp, bottom→top |
| Finish line | `client/src/rendering/track.ts` | Checkered + flags |
| Camera lookahead | `client/src/raceMain.ts` | Vertical movement (GDD §1.5) |
| Git hooks | `scripts/install-hooks.js` | Cross-platform, postinstall |

### Итерации ревью

| Итерация | Проблемы | Статус |
|----------|---------|--------|
| iter 1 | P0: coin farm, P1: guest auth broken, P1: ghost для гостей | CHANGES_REQUESTED |
| iter 2 | P0: coin farm через trackId, P1: guest FK/PB | CHANGES_REQUESTED |
| iter 3 | P0: farm через повторные submit, P1: idempotency | CHANGES_REQUESTED |
| iter 4 | trackId whitelist, guest FK/PB починен, монеты отложены | **APPROVED** ✅ |

---

## Известный техдолг (Sprint 2)

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `server/src/meta/routes/runs.ts:57` | replayData: нет проверки `Number.isFinite` |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P3 | `client/src/raceMain.ts:208` | `INPUT_THRUST_BLEND` hardcoded (нужен в config) |
| P3 | `client/src/raceMain.ts:632` | `CAMERA_LOOKAHEAD_Y` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:17` | `MAX_COINS_PER_RUN` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:108` | Ответ возвращает `coinsCollected` хотя монеты отложены |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Гостевые записи без `profiles` не участвуют в opponent ghost |

---

## Инфраструктура (локальная)

| Компонент | Порт | Запуск |
|-----------|------|--------|
| Meta-server | :3000 | `cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts` |
| Client (Vite) | :5173 | `npm run dev:client` |
| PostgreSQL | :5432 | Docker `slime-pg` (БД `bonk_race`, user `bonk`) |
| Redis | :6379 | Docker `slime-redis` |

---

## Следующие шаги (после merge PR#5)

1. Создать git tag `v0.1.0` (`git tag v0.1.0 && git push origin v0.1.0`)
2. Sprint 2: DevAuth flow (быстрое переключение профилей для локальной разработки)
3. Sprint 2: Вынести `INPUT_THRUST_BLEND`, `CAMERA_LOOKAHEAD_Y`, `MAX_COINS_PER_RUN` в config
4. Sprint 2: replayData — добавить `Number.isFinite` валидацию
5. Sprint 2: idempotency для `/api/v1/runs/submit` (использовать operationId)
6. Настройка CI/CD для bonk-race (отдельно от slime-arena)

---

## Команды

```bash
# Сборка
npm run build           # shared -> server -> client

# Разработка
cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts
npm run dev:client      # http://localhost:5173

# Тесты
npm run test                              # все тесты
node server/tests/tracks-smoke.test.js   # 41 passed

# Beads
bd ready
bd list --status=open
bd show bonk-race-twu
```
