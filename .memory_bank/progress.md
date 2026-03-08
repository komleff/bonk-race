# Progress

Отслеживание статуса задач.

## Контроль изменений

- **last_checked_commit**: `feat/bonklab-v1` @ 9 марта 2026 (`a97f5dd`)
- **Активная ветка**: `feat/bonklab-v1` → PR #6, APPROVED, ready to merge
- **Production:** не задеплоен (pre-v0.1.0)
- **Версия:** 0.1.0 (после merge PR#5 + PR#6 создать тег `v0.1.0`)
- **GDD версия**: v3.0 (`docs/gdd/BonkRace-GDD-v3_0.md`)

---

## Sprint 1 (2026-03-07/08) — MVP playable loop — ЗАВЕРШЁН

**Цель:** Играбельный time-trial: трасса, auth, submit, ghost, leaderboard
**PR:** #5 (`feat/vite-proxy-client-connect`) — OPEN, ревью пройдено, ожидает merge
**Ревью:** GPT-5.3-Codex APPROVED + ChatGPT-5.4 APPROVED + Gemini 3.1 Pro APPROVED (4 итерации)

- [x] Guest auth flow (ensureAuth → guest token)
- [x] POST /api/v1/runs/submit с leaderboard position
- [x] GET /api/v1/ghosts — загрузка + воспроизведение ghost replays
- [x] Экран результатов: время + медаль + позиция в рейтинге
- [x] Instant restart (R / tap, < 0.5s)
- [x] Vertical track "First Run" (600×2400, 10 checkpoint, bottom→top)
- [x] Checkered finish line с флагами
- [x] Camera lookahead (GDD §1.5)
- [x] Responsive steering (turnTorqueNm 2400, INPUT_THRUST_BLEND 0.3)
- [x] Cross-platform git hooks installer
- [x] 41 smoke tests pass

---

## Pre-Sprint (2026-03-07) — Инфраструктура Bonk Race

- [x] PR#1 — Fork + Strip: shared package, TrackConfig, rng (Merged)
- [x] PR#2 — Starter Circuit, wall/surface physics, smoke test (Merged)
- [x] PR#3 — UUID миграции fix, bonk_race DB defaults (Merged)
- [x] PR#4 — Ребрендинг slime-arena → bonk-race, README, memory bank (Merged)

---

## Sprint 1b (2026-03-09) — BonkLab physics sandbox — ЗАВЕРШЁН

**Цель:** Dev-only песочница для настройки ~45 параметров движения в реальном времени
**PR:** #6 (`feat/bonklab-v1`) — APPROVED, ready to merge
**Ревью:** GPT-5.4 ✅, GPT-5.3-Codex ✅, Claude ✅, Internal Physics ✅, Internal Frontend ✅ (14 итераций)

- [x] 60Hz physics simulation (FA, integrator, collisions)
- [x] Canvas 2D renderer with camera follow, vectors, minimap
- [x] TelemetryHUD overlay (speed, angVel, mass, FA state, zone)
- [x] Parameter panel (~45 params, grouped, sliders)
- [x] Toolbar (restart, seed, density, reset, export/import, presets)
- [x] Death/respawn (0.8s freeze, full FA state reset)
- [x] Arena generator (shared, deterministic, density control)
- [x] Passage restitution (separate param, default 0.5×)
- [x] Map size controls (width/height sliders)
- [x] Checkered finish line (reused from raceMain)
- [x] Export/Import round-trip verified
- [x] All P0/P1 closed

---

## Ожидает Sprint 2

### Техдолг из Sprint 1a+1b

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `server/src/meta/routes/runs.ts:57` | replayData: нет `Number.isFinite` на элементах |
| P2 | `server/src/meta/routes/runs.ts:43` | `operationId` приходит с клиента, сервер не использует |
| P2 | `client/src/lab/BonkLab.ts` | Zone modifier 1-tick lag (architectural) |
| P2 | `client/src/lab/BonkLab.ts` | correctionPercent in static collisions always 1.0 |
| P3 | `client/src/raceMain.ts:208` | `INPUT_THRUST_BLEND = 0.3` hardcoded |
| P3 | `client/src/raceMain.ts:632` | `CAMERA_LOOKAHEAD_Y = -120` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:17` | `MAX_COINS_PER_RUN` hardcoded |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Гостевые без `profiles` — нет opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur on object edges |
| P3 | `client/src/lab/` | Hardcoded физические константы — вынести в config |

### Приоритетные фичи Sprint 2

1. BonkLab track editor — визуальное редактирование объектов трассы
2. `reverseZoneAngleDeg` — реализовать в движке, разблокировать в UI
3. DevAuth flow — быстрое переключение профилей для local dev
4. Монетная/медальная схема — реализовать начисление
5. CI/CD — настроить GitHub Actions для bonk-race

---

*История предыдущих спринтов slime-arena доступна в `.memory_bank/archive/`*
