# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## Текущее состояние (9 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Активная ветка:** `feat/bonklab-v1` → PR #6, APPROVED, ready to merge
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
| #6 | `feat/bonklab-v1` | **BonkLab: dev-only physics sandbox** | **APPROVED → ready to merge** |

---

## Sprint 1a — MVP playable loop (ЗАВЕРШЁН, ожидает merge)

**PR:** #5 (`feat/vite-proxy-client-connect`)
**Ревью пройдено:** GPT-5.3-Codex ✅, ChatGPT-5.4 ✅, Gemini 3.1 Pro ✅ (4 итерации)

### Что реализовано
Guest auth, submit results, ghost replays, medal/leaderboard, instant restart, vertical track "First Run", checkered finish line, camera lookahead, git hooks.

---

## Sprint 1b — BonkLab physics sandbox (ЗАВЕРШЁН 9 марта 2026)

**PR:** #6 (`feat/bonklab-v1`) — **APPROVED, ready to merge**
**Ревью:** GPT-5.4 ✅, GPT-5.3-Codex ✅, Claude ✅, Internal Physics ✅, Internal Frontend ✅ (14 итераций)

### Что реализовано

| Компонент | Файл | Описание |
|-----------|------|---------|
| Simulation | `client/src/lab/BonkLab.ts` | 60Hz fixed-step, F=ma, FA, collisions |
| Renderer | `client/src/lab/LabRenderer.ts` | Canvas 2D, camera follow, vectors, minimap |
| TelemetryHUD | `client/src/lab/TelemetryHUD.ts` | Speed, angVel, mass, FA state, zone |
| Input | `client/src/lab/LabInput.ts` | Mouse/touch input |
| Panel | `client/src/lab/ui/LabPanel.tsx` | ~45 params, grouped, sliders + number inputs |
| Toolbar | `client/src/lab/ui/LabToolbar.tsx` | Restart, seed, density, reset, export/import, presets |
| Physics (shared) | `shared/src/physics/` | flightAssist, integrator, collisions, arenaGenerator |
| RNG (shared) | `shared/src/rng.ts` | Deterministic generator |

### Ключевые решения
- Separate Vite entry point (`/lab`), dev-only, не в production bundle
- Physics в `shared/` — единый код для клиента, сервера и BonkLab
- 60Hz (BonkLab) vs 30Hz (сервер) — комментарий в коде
- Death/respawn: 0.8s freeze, full FA state reset
- Passage restitution: отдельный параметр (default 0.5× main)
- `reverseZoneAngleDeg`: locked в UI, не реализован в движке
- Export/Import: full round-trip через `lab.params`

---

## Известный техдолг (Sprint 2)

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `server/src/meta/routes/runs.ts:57` | replayData: нет проверки `Number.isFinite` |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P2 | `client/src/lab/BonkLab.ts` | Zone modifier 1-tick application lag (architectural) |
| P2 | `client/src/lab/BonkLab.ts` | correctionPercent in static collisions always 1.0 |
| P3 | `client/src/raceMain.ts:208` | `INPUT_THRUST_BLEND` hardcoded (нужен в config) |
| P3 | `client/src/raceMain.ts:632` | `CAMERA_LOOKAHEAD_Y` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:17` | `MAX_COINS_PER_RUN` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:108` | Ответ возвращает `coinsCollected` хотя монеты отложены |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Гостевые записи без `profiles` не участвуют в opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur on object edges |
| P3 | `client/src/lab/` | Hardcoded физические константы — вынести в config |

---

## Инфраструктура (локальная)

| Компонент | Порт | Запуск |
|-----------|------|--------|
| Meta-server | :3000 | `cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts` |
| Client (Vite) | :5173 | `npm run dev:client` |
| PostgreSQL | :5432 | Docker `slime-pg` (БД `bonk_race`, user `bonk`) |
| Redis | :6379 | Docker `slime-redis` |

---

## Следующие шаги (после merge PR#5 и PR#6)

1. Merge PR#5 и PR#6 в main
2. Создать git tag `v0.1.0` (`git tag v0.1.0 && git push origin v0.1.0`)
3. Sprint 2: BonkLab track editor (визуальное редактирование объектов трассы)
4. Sprint 2: `reverseZoneAngleDeg` — реализовать в движке, разблокировать в UI
5. Sprint 2: DevAuth flow (быстрое переключение профилей)
6. Sprint 2: Вынести hardcoded константы в config
7. Sprint 2: replayData — `Number.isFinite` валидация
8. Sprint 2: idempotency для `/api/v1/runs/submit`
9. CI/CD для bonk-race

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
