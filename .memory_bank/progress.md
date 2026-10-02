# Progress

Отслеживание статуса задач.

## U2 TugLab — подготовка спринта PM (2 октября 2026)

- Подготовлен [план реализации](../docs/superpowers/plans/2026-10-02-u2-tuglab.md) по PR #35; рабочая ветка `feat/u2-tuglab-v0.1` в отдельном worktree.
- `bonk-race-tow` переведена в P1/in_progress для координации; созданы девять задач `.1`–`.9` и их зависимости. Статусы задач — только в Beads.
- `bonk-race-tow-plan` учитывает подготовку; `bonk-race-tow-review` — review письменного плана оператором до запуска Developer.
- Подготовка плана закрыта после трёх независимых проверок (физика/ввод/архитектура, APPROVED). План и описания задач синхронизированы; оператору передаётся сокращённый объём.
- Реализация, численная матрица 21 комбинации, браузерные проверки и сборочный артефакт пока отсутствуют. Статус draft исходного ТЗ сохранён.
- После уточнения оператора запись, экспорт/импорт и playback исключены; AC-21–22 сняты. Стенд предназначен для ручной игры. Исследование с пятью тестерами снято из объёма; реальный Android-планшет и публикация с откатом выделены отдельно.
- Совместимый Beads CLI использован локально в JSONL-режиме; существующие задачи сохранены, исходный checkout не мигрирован.

## U2 TugLab — ТЗ для ревью (2 октября 2026)

- `bonk-race-tug`: подготовлено ТЗ v0.1 в [docs/tz/spec_u2_tuglab_v0.1.md](../docs/tz/spec_u2_tuglab_v0.1.md), ожидает ревью документации.
- `bonk-race-tow`: будущая реализация по принятому ТЗ; остаётся в очереди.
- 25 критериев приёмки заданы как требования к будущей сборке. Физический расчёт, управление и публикация ещё не реализованы и не проверены.
- Поставка документации не меняет версию 0.6.0 и состояние работающего BonkLab.

## Контроль изменений

- **last_checked_commit**: PR #26 `fix/trail-rendering-order` @ 13 марта 2026
- **Активная ветка**: `chore/release-v0.6.0-prep`
- **Production:** BonkLab на GitHub Pages, основная игра не задеплоена
- **Версия:** 0.6.0
- **GDD версия**: v4.0 (`docs/gdd/GDD-index.md`)

---

## Sprint: BonkLab Render Interpolation (13 марта 2026) — ЗАВЕРШЁН

**PR:** #25 (`fix/bonklab-render-interpolation`) — Merged
**PR:** #26 (`fix/trail-rendering-order`) — На ревью (фикс следа)
**Ревью:** Copilot (×2), GPT-5 Codex, GPT-5.3-Codex, Claude Opus 4.6 (×2)
**Тесты:** 15/15

- [x] Объединение двух RAF-циклов в один (main.ts)
- [x] Интерполяция состояния между тиками физики (getInterpolatedState)
- [x] syncPrevState() во всех точках телепортации
- [x] lerpAngle() для углов через ±π
- [x] Однопроходный drawTrail() → непрерывная per-point альфа + обход по возрасту
- [x] Number.isFinite guard в update()
- [x] Пересчёт distanceM/progressPct по интерполированной позиции
- [x] Русификация комментариев (убраны англицизмы)
- [x] Версия в тулбаре BonkLab

---

## Sprint: BonkLab Tech Debt + Zone Tuning + Arena Balancing (13 марта 2026) — ЗАВЕРШЁН

**PR:** #22 (`fix/bonklab-techdebt`) — Merged
**Тесты:** 15/15

- [x] bonk-race-hyf, ovb, dom, yno, d63, pdi — баг-фиксы и рефакторинг
- [x] Тюнинг зон: Ice, Turbo, Mud, Sand
- [x] Балансировка арены: зоны 8, камни 4, шипы 2, проходы 1

---

## Sprint: Trail Coloring + Spike Knockback (11 марта 2026) — ЗАВЕРШЁН

**PR:** #17 — Merged | **Тесты:** 15/15

---

## Sprint: Trails + Direction Triangle (11 марта 2026) — ЗАВЕРШЁН

**PR:** #15 — Merged | **Тесты:** 21/21

---

## Sprint: Анизотропное трение v0.3.0 (10 марта 2026) — ЗАВЕРШЁН

**PR:** #14 — Merged | **Тесты:** 15/15

---

## Countdown и респаун-оверлей (10 марта 2026) — В РАБОТЕ

**PR:** #12 — Open
- [x] bonk-race-a5b: Countdown 3→2→1→Go!
- [x] bonk-race-4iq: Go!-Go! после смерти
- [ ] GhostRecorder: запись кадров во время freeze/respawnGo
- [ ] Русификация комментариев

---

## Ожидает следующий спринт

### Техдолг

| Приоритет | Beads ID | Проблема |
|-----------|----------|---------|
| P1 | bonk-race-b18.1 | raceMain.ts — анизотропное трение (LG-6) |
| P1 | bonk-race-6nu | Серверная интеграция movementSystems (LG-5) |
| P2 | bonk-race-sz1 | reverseZoneAngleDeg — не реализован |
| P2 | bonk-race-qp0 | BonkLab track editor |
| P2 | — | Пресеты зон в balance.json |
| P2 | — | Weighted random для зон |
| P2 | bonk-race-lx2 | runs/submit идемпотентность |
| P2 | — | tick() аллокации: pre-allocation, trail aging |
| P3 | bonk-race-t7p | Sub-pixel anti-aliasing blur |
| P3 | bonk-race-col | Guest opponent ghost profiles |

### Приоритетные фичи

1. BonkLab track editor — визуальное редактирование
2. DevAuth flow — переключение профилей
3. CI/CD — GitHub Actions

---

*История slime-arena: `.memory_bank/archive/`*
