# Progress

Отслеживание статуса задач.

## Контроль изменений

- **last_checked_commit**: `fix/lab-input-direction` @ 10 марта 2026
- **Активная ветка**: `fix/lab-input-direction` (PR#11, от main)
- **Production:** BonkLab на GitHub Pages, основная игра не задеплоена
- **Версия:** 0.1.0
- **GDD версия**: v4.0 (`docs/gdd/GDD-index.md`)

---

## Hotfix: Lab input direction (10 марта 2026) — ЗАВЕРШЁН

**PR:** #11 (`fix/lab-input-direction`) — Open, ревью пройдено (Copilot, GPT-5, GPT-5.3 — APPROVED)
**Ревьюеры:** Copilot ✅, GPT-5 ✅, GPT-5.3-Codex ✅

- [x] Fix: направление мыши от экранной позиции персонажа (не от центра canvas)
- [x] Извлечена константа `CHAR_SCREEN_Y_RATIO = 0.65`
- [x] Кэш `getBoundingClientRect()` в LabRenderer
- [x] Визуальный тач-джойстик для мобильных
- [x] Все комментарии на русском (по замечанию Copilot)

---

## Sprint 2 (2026-03-09/10) — BonkLab v1.2 — ЗАВЕРШЁН

**Цель:** Орбы, финиш, настраиваемая геометрия, пресет-трекинг, rename slime→mud
**PR:** #9 (`feat/bonklab-v1.2`) — APPROVED, ready to merge
**Ревью:** GPT-5 Codex, GPT-5.3-Codex ✅, GPT-5.4, Claude Opus 4.6 ✅ (2 итерации, 11 багфиксов)

- [x] Rename slime → mud (shared types, server, BonkLab, renderer, panel, HUD)
- [x] Configurable obstacle radii (pillarRadius, spikeRadius, passageRadius, passageGap)
- [x] Orb generation in arena (spawn exclusion, deterministic from seed)
- [x] Orb physics (drag, circle-circle, circle-static, wall, spike kill)
- [x] Orb rendering + death animation (cyan)
- [x] Orb density auto-sync with player mass/radius
- [x] Finish detection (circle-vs-AABB)
- [x] Finish overlay (time, distance, best time)
- [x] Camera offset (65% from top)
- [x] Distance + progress HUD
- [x] Preset tracking (Custom on manual change)
- [x] Preset «Ультралёгкий»
- [x] Turbo: speedMultiplier → accelBoost
- [x] Death: timer reset + «Go!» overlay 0.8s
- [x] Default map height 10130m, width 800m, baseRadius 20m
- [x] All P0/P1 from review fixed

---

## Sprint 1b (2026-03-09) — BonkLab v1.0 — ЗАВЕРШЁН

**PR:** #6 (`feat/bonklab-v1`) — Merged
**Ревью:** GPT-5.4 ✅, GPT-5.3-Codex ✅, Claude ✅ (14 итераций)

- [x] 60Hz physics simulation (FA, integrator, collisions)
- [x] Canvas 2D renderer with camera follow, vectors, minimap
- [x] TelemetryHUD overlay
- [x] Parameter panel (~45 params, grouped, sliders)
- [x] Toolbar (restart, seed, density, reset, export/import, presets)
- [x] Death/respawn (0.8s freeze)
- [x] Arena generator (shared, deterministic)
- [x] Export/Import round-trip

---

## Sprint 1a (2026-03-07/08) — MVP playable loop — ЗАВЕРШЁН

**PR:** #5 (`feat/vite-proxy-client-connect`) — OPEN, ожидает merge
**Ревью:** GPT-5.3-Codex ✅, ChatGPT-5.4 ✅, Gemini 3.1 Pro ✅ (4 итерации)

- [x] Guest auth flow
- [x] POST /api/v1/runs/submit
- [x] Ghost replays
- [x] Medal/leaderboard
- [x] Instant restart
- [x] Vertical track "First Run"
- [x] Camera lookahead
- [x] 41 smoke tests

---

## Pre-Sprint (2026-03-07) — Инфраструктура

- [x] PR#1 — Shared package (Merged)
- [x] PR#2 — Starter Circuit (Merged)
- [x] PR#3 — UUID миграции (Merged)
- [x] PR#4 — Ребрендинг (Merged)

---

## Ожидает Sprint 3

### Техдолг

| Приоритет | Beads ID | Проблема |
|-----------|----------|---------|
| P2 | bonk-race-sz1 | reverseZoneAngleDeg — не реализован в движке |
| P2 | bonk-race-qp0 | BonkLab track editor |
| P2 | bonk-race-hyf | correctionPercent always 1.0 |
| P2 | bonk-race-ovb | Zone modifier 1-tick lag |
| P2 | bonk-race-lx2 | runs/submit идемпотентность |
| P2 | bonk-race-d9o | replayData Number.isFinite |
| P3 | bonk-race-t7p | Sub-pixel anti-aliasing blur |
| P3 | bonk-race-col | Guest opponent ghost profiles |
| P3 | bonk-race-dh0 | Hardcoded физические константы |

### Приоритетные фичи

1. BonkLab track editor — визуальное редактирование
2. DevAuth flow — переключение профилей
3. CI/CD — GitHub Actions

---

*История slime-arena: `.memory_bank/archive/`*
