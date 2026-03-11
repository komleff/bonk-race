# Progress

Отслеживание статуса задач.

## Контроль изменений

- **last_checked_commit**: `sprint/trails-direction-triangle` merged @ 11 марта 2026
- **Активная ветка**: `main`
- **Production:** BonkLab на GitHub Pages, основная игра не задеплоена
- **Версия:** 0.4.0
- **GDD версия**: v4.0 (`docs/gdd/GDD-index.md`)

---

## Sprint: Trails + Direction Triangle + Tech Debt (11 марта 2026) — ЗАВЕРШЁН

**PR:** #15 (`sprint/trails-direction-triangle`) — Merged
**Ревью:** Copilot, GPT-5 Codex, GPT-5.3 Codex, Claude Haiku — все P2 исправлены
**Тесты:** 21/21

- [x] bonk-race-vyh: Треугольник-стрелка внутри круга персонажа
- [x] bonk-race-hmg: Следы движения (circular buffer 600 точек, fade, distance thinning)
- [x] bonk-race-2tp: Баг авто-старта (зоны в spawn area)
- [x] bonk-race-d9o: replayData Number.isFinite валидация
- [x] bonk-race-dh0: Hardcoded константы → balance.json
- [x] bonk-race-gl2: Sand zone не генерируется
- [x] bonk-race-83p: Зонные SurfaceConfig слайдеры в LabPanel
- [x] Все замечания PR review (trail cleanup, zone clamping, i18n)

---

## Релиз 0.3.0 — Анизотропное трение (10 марта 2026) — ЗАВЕРШЁН

**PR:** #14 (`tz-lateral-grip`) — Merged
**Ревью:** 5× APPROVED (Security, Architecture, Code Quality, Gemini, Codex)
**Тесты:** 15/15 anisotropic-friction + все остальные

- [x] Анизотропный decay exp(-k*dt) вместо force-based drag
- [x] SurfaceConfig: ISurfaceParams (4 поля) + ISurfaceAssistParams (3 поля)
- [x] 12 BonkLab пресетов (BonkRace v0.3 по умолчанию)
- [x] inertiaFactor → "Коэф. формы"
- [x] clampSurfaceConfig() с NaN guard
- [x] Зона Sand (ZONE_TYPE_SAND = 6)
- [x] Серверные зоны через getSurfaceParams()/getSurfaceAssistParams()

---

## Countdown и респаун-оверлей (10 марта 2026) — В РАБОТЕ

**PR:** #12 (`feat/countdown-and-respawn-overlay`)
**Ревьюеры:** Copilot, GPT-5 Codex (CHANGES_REQUESTED), GPT-5.3 Codex ✅

- [x] Countdown 3→2→1→Go! при старте/рестарте (0.7с × 4 = 2.8с)
- [x] Go!→Go! после смерти (2×0.4с = 0.8с)
- [x] Анимация punch-in (easeOutQuad, жёлтый glow)
- [x] Общий `computePunchIn()` в shared
- [x] CSS-оверлей заменён на canvas-рендер
- [ ] GhostRecorder: запись кадров во время freeze/respawnGo
- [ ] Русификация комментариев (англицизмы)

---

## Hotfix: Lab input direction (10 марта 2026) — ЗАВЕРШЁН

**PR:** #11 (`fix/lab-input-direction`) — Merged

- [x] Fix: направление мыши от экранной позиции персонажа
- [x] CHAR_SCREEN_Y_RATIO = 0.65
- [x] Визуальный тач-джойстик для мобильных

---

## Sprint 2 (2026-03-09/10) — BonkLab v1.2 — ЗАВЕРШЁН

**PR:** #9 (`feat/bonklab-v1.2`) — APPROVED, ready to merge

- [x] Rename slime → mud
- [x] Configurable obstacle radii
- [x] Orb generation/physics/rendering
- [x] Finish detection + overlay
- [x] Camera offset, distance HUD, preset tracking

---

## Sprint 1b (2026-03-09) — BonkLab v1.0 — ЗАВЕРШЁН

**PR:** #6 (`feat/bonklab-v1`) — Merged

---

## Sprint 1a (2026-03-07/08) — MVP playable loop — ЗАВЕРШЁН

**PR:** #5 (`feat/vite-proxy-client-connect`) — OPEN, ожидает merge

---

## Pre-Sprint (2026-03-07) — Инфраструктура

- [x] PR#1–#4 — Shared, tracks, migrations, ребрендинг — all Merged

---

## Ожидает следующий спринт

### Рефакторинг BonkLab (bonk-race-wig, P2 epic)

Архитектурный анализ 11 марта 2026. BonkLab.ts — God Object (1168 строк).

| Фаза | Beads ID | Задача |
|------|----------|--------|
| 1 | bonk-race-coe | PARAM_GROUPS → paramDefs.ts (P2) |
| 1 | bonk-race-6th | PRESETS → presets.ts + дедупликация (P2) |
| 1 | bonk-race-9xw | color utils → colorUtils.ts (P3) |
| 1 | bonk-race-cm1 | formatTime, ZONE_LABELS дедупликация (P3) |
| 2 | bonk-race-r94 | SandboxState типы → labTypes.ts (P2) |
| 2 | bonk-race-pk5 | LabParamManager (зависит от r94) (P2) |
| 2 | bonk-race-6jf | OrbSimulator (зависит от r94) (P3) |

### Техдолг

| Приоритет | Beads ID | Проблема |
|-----------|----------|---------|
| P1 | bonk-race-b18.1 | raceMain.ts — анизотропное трение (LG-6) |
| P1 | bonk-race-6nu | Серверная интеграция movementSystems (LG-5) |
| P2 | bonk-race-sz1 | reverseZoneAngleDeg — не реализован |
| P2 | bonk-race-qp0 | BonkLab track editor |
| P2 | bonk-race-hyf | correctionPercent always 1.0 |
| P2 | bonk-race-ovb | Zone modifier 1-tick lag |
| P2 | bonk-race-lx2 | runs/submit идемпотентность |
| P3 | bonk-race-t7p | Sub-pixel anti-aliasing blur |
| P3 | bonk-race-col | Guest opponent ghost profiles |

### Приоритетные фичи

1. BonkLab track editor — визуальное редактирование
2. DevAuth flow — переключение профилей
3. CI/CD — GitHub Actions

---

*История slime-arena: `.memory_bank/archive/`*
