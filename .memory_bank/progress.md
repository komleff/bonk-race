# Progress

Отслеживание статуса задач.

## Контроль изменений

- **last_checked_commit**: `feat/vite-proxy-client-connect` @ 8 марта 2026 (`02592da`)
- **Текущая ветка**: `feat/vite-proxy-client-connect` → ожидает merge в `main`
- **Production:** не задеплоен (pre-v0.1.0)
- **Версия:** 0.1.0 (после merge PR#5 создать тег `v0.1.0`)
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

## Ожидает Sprint 2

### Техдолг из Sprint 1

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `server/src/meta/routes/runs.ts:57` | replayData: нет `Number.isFinite` на элементах |
| P2 | `server/src/meta/routes/runs.ts:43` | `operationId` приходит с клиента, сервер не использует |
| P3 | `client/src/raceMain.ts:208` | `INPUT_THRUST_BLEND = 0.3` hardcoded |
| P3 | `client/src/raceMain.ts:632` | `CAMERA_LOOKAHEAD_Y = -120` hardcoded |
| P3 | `server/src/meta/routes/runs.ts:17` | `MAX_COINS_PER_RUN` hardcoded |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Гостевые без `profiles` — нет opponent ghost |

### Приоритетные фичи Sprint 2

1. DevAuth flow — быстрое переключение профилей для local dev
2. Монетная/медальная схема — реализовать начисление (сейчас отложено)
3. CI/CD — настроить GitHub Actions для bonk-race

---

*История предыдущих спринтов slime-arena доступна в `.memory_bank/archive/`*
