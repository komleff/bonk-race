## TugLab — usability/share, реализация

bonk-race-554: единый патч UI/capture/share прошёл финальные gates и self-review: 200/200 TugLab, общий npm test/build и обе оболочки/version PASS, адресные mobile/share/numeric/stock/root/nested browser PASS. Новые проверки полного snapshot/атомарности/совместимости, ближайших точек и границ всех трёх сцепок; browser QA мобильного интерфейса и независимых страниц. PM закрывает задачу после одного независимого итогового review. Новые жёсткое/одношарнирное крепления вынесены в bonk-race-555, в этот патч не входят.

Round1 review: три Important исправлены; 205/205 TugLab PASS, browser regressions auto/manual mass/radius + Restart/share, repeated-invalid recovery, waiting/started Step PASS. Исправления ожидают scoped re-review; исходный генератор/решатель и pipeline не менялись.

# Progress

Отслеживание статуса задач.

## TugLab — публичный тест доступен (3 октября 2026)

- PR35 и PR36 merged по прямому согласованию оператора. Pages CI37055835128 build/deploy SUCCESS на main958329c; root BonkLab и /tuglab/ HTTPS/browser PASS, собственные JS200, pageerror0.
- bonk-race-tug закрыта после merge35, bonk-race-553 закрыта после подготовки. .7: публикация подтверждена, rollback остаётся follow-up; .6 Android не выполнялась. Parent не объявлен полностью завершённым по исходным внешним AC.

## TugLab — GitHub Pages (3 октября 2026)

- Согласована публикация /bonk-race/tuglab/ через существующий workflow и единый артефакт. Исходники/ветка остаются в bonk-race, отдельного репозитория нет.
- Подготовка bonk-race-553 принята: сборки, assembled root+nested browser и numeric8/8 PASS, scoped review APPROVED; фактическая публикация .7 требует разрешённого deployment из main после операторского merge. Android .6 отдельно. U2 PR833 закрыт, лишний worktree удалён, ошибочная задача552 отменена.

## U2 TugLab — локальная поставка принята (3 октября 2026)

- Этапы 1–5 готовы: оригинальный BonkLab плюс прицеп, три сцепки/длина/k, отдельная статическая оболочка. Оператор подтвердил ручную desktop-игру.
- QA `16158ea`: 182 tests, 63 игровых + 42 изолированных, static/UI/lifecycle/120с RAF PASS. Первый actual GitHub CI PASS, самостоятельный архив проверен.
- Final review: architecture/physics и security/build APPROVED на `16158ea`. Quality F1/F2 исправлены в `8205235`; scoped re-review APPROVED, independent keystroke 8/8 PASS. Физика не менялась; широкий review не повторялся.
- По запросу оператора самопроверка PM_ERR/DOC_PR: `bonk-race-550`, отчёт в docs. PR body актуализирован; избыточный review effort признан. QA advisory map invariant отложен `bonk-race-551`, без нового fix/review цикла.
- `.5` закрыта; `.6` Android и `.7` production/HTTPS/rollback открыты, parent остаётся in_progress. DNS готов, сайт не опубликован. Ветка/worktree/сервер 5174 сохраняются, merge только оператор.

## U2 TugLab — возобновлено после обновления

- Закрыта задача аудита `bonk-race-tow-reuse`; задачи2–5 и план заменены минимальным расширением существующего BonkLab. Оригинальные сцена/контент/управление сохраняются, новая группа параметров прицепа и сцепки.
- `.1` закрыта: P2 исправлен в `b57b677`, scoped review spec/quality APPROVED. 90/90 тестов PASS; bounded predictive rod принят. `.2` начата, игровая интеграция/UI ещё отсутствуют.

- Этап2 закрыт: трос/пружина/CCD и прямое k, commits `55e7127`, `7d91595`. 144/144 tests, typecheck PASS; независимый scoped review spec/quality APPROVED. Статический CCD и адаптивный callback готовы; `.3` начата — интеграция оригинальной сцены.

- Этап3 закрыт: opt-in BonkLab/исходная карта/stock FA/пассивный B/орбы/шипы/общий респаун/пауза и Step. `6f80929` + `8ba429b`, 177/177 tests, typechecks/npmtest PASS; исходные общие сборки PASS. Независимые spec/quality APPROVED после двух переходных исправлений. `.4` начата: UI/рендер/отдельная оболочка.

- Этап4 закрыт: тот же main/input/renderer/panel/toolbar, отдельная TugLab оболочка и сборка, opt-in WASD, параметры сцепок, B/линия/миникарта. `7f3823e` + `8a3b976`; 182tests и builds PASS, dev/static/stock browser smoke PASS; independent spec/quality APPROVED после сброса held input при респауне. `.5` начата — финальная QA/guide/artifact. Игра локально на :5174/tuglab.html или static :5184/, HTTPS-host ещё не опубликован.

## U2 TugLab — сохранённый контекст паузы VS Code/Codex

- ПАУЗА по запросу оператора. Checkpoint `1bd985d`: два тела, двигатели, штанга и конфигурация. Повторные проверки PM: typecheck PASS, 32/32 теста ядра PASS. Developer: существующие тесты и полная сборка PASS. Независимое code review ещё предстоит; `.1` остаётся in_progress.
- Игровая интеграция, трос, пружина и CCD ещё отсутствуют. Это сохранение промежуточной работы, а не готовый игровой стенд. Следующие этапы не запускаются до возобновления.
- Последние уточнения заменяют прежний план: сцена/генератор BonkLab и управление bonk-race сохраняются; дополнения — прицеп, три сцепки, длина и жёсткость пружины. Максимальное переиспользование, минимальные переделки; запись исключена.
- Перед продолжением `.2`–`.4` PM выполняет `bonk-race-tow-reuse` и актуализирует старые требования новых сцен/управления. Численная и браузерная приёмка всего стенда пока не выполнена.

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
