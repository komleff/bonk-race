## TugLab — компактный интерфейс и ссылки (3 октября 2026)

Ветка feat/tuglab-usability-share, Beads bonk-race-554. Реализованы компактные действия заезда, сворачиваемые настройки и viewport; длина 4–100 м, ближайшие нос/хвост крепления для трёх сцепок. Share передаёт полный валидируемый снимок фактического генератора/параметров и создаёт новый заезд в ожидании явного Старт. Версии 0.6.2 / TugLab 0.1.1. Финальные gates и self-review PASS, TugLab 200/200, общий npm test/build/typecheck/version PASS; mobile/share/stock/root/nested browser PASS; PR38 draft, независимое итоговое review организует PM. Не объявлять новый патч опубликованным.

Round1 исправления трёх Important: автоматическая плотность синхронизирует исходные arena.orbs и живые орбы, включая mass/radius-only + Restart; ошибка ссылки теперь одна controlled parent state с явной очисткой при recovery; Step запрещён до первого Start, включая изменения настроек в ожидании, но сохранён при started countdown/паузе. Адресные RED воспроизвели все три дефекта, 205/205 TugLab и client TS/build + обе оболочки PASS; dev mobile/share и static root/nested/stock PASS. PM проводит scoped re-review тем же reviewer.

# Active Context — BonkRace

Текущее состояние проекта и фокус работы.

## TugLab — опубликован в GitHub Pages (3 октября 2026)

- После конкретного предложения merge #35, base #36 на main, merge #36 и проверки Pages оператор повторно написал «ок, приступай». Это прямое согласование данного release, не изменение общей политики merge. PR35 merged 2860d9c, PR36 merged 958329c; прямого push main или изменения защиты не было.
- Existing Pages production [CI37055835128](https://github.com/komleff/bonk-race/actions/runs/37055835128) SUCCESS, build/deploy. Рабочие публичные адреса: https://komleff.github.io/bonk-race/ и https://komleff.github.io/bonk-race/tuglab/. Реальные HTTPS HTML/JS200, Chrome154 browser pageerror0, BonkLab towing=false, TugLab towing=true. Исходники остаются в bonk-race; worktree — папка того же repo.
- Подготовка bonk-race-553 закрыта; PR combined artifact CI37055256302 и TugLab CI37055256135 SUCCESS. Публикация части .7 подтверждена, полноценный rollback ещё не выполнен; .7 остаётся in_progress для follow-up. Android .6 отдельно, не объявлен выполненным. Новых широких review/physics QA не было.
- Локальная игра localhost:5174/tuglab.html сохранена. Текущий worktree переведён в docs/tuglab-pages-live от опубликованного origin/main только для фиксации результата; исходный checkout и пользовательский stash не тронуты.

## TugLab — исправление ошибки границ работы (3 октября 2026)

- Оператор напомнил исходную границу: отдельное приложение и сборка внутри bonk-race (PR35), максимальное переиспользование BonkLab. U2 — назначение эксперимента и источник документов при их отсутствии; это не разрешение переносить разработку или менять другой репозиторий.
- После «продолжи работу» PM ошибочно решил продолжить настройкой общего VPS через U2. Созданный draft U2 PR833 содержит только план, без игры/Caddy/compose изменений; PR закрыт, задача bonk-race-552 отменена. Подготовка хостинга в U2 остановлена. Не расширять scope на другой репозиторий на основании вопроса о DNS.
- Стенд остаётся в /Users/komleff/Documents/GitHub/bonk-race-tuglab, branch feat/u2-tuglab-v0.1, PR36. Проверенная локальная поставка 927d938 и CI37051149495 PASS сохраняются. Android/production не выполнены; это не основание автоматически создавать дополнительные этапы в U2.
- Уборка прошлого scratch затронула два отслеживаемых report: task-1-report.md/task-2-report.md. Они восстановлены из Git. Перед удалением временных файлов сначала git ls-files; пользовательский stash/исходные checkout не изменены.

## U2 TugLab — локальная поставка и самопроверка PM (3 октября 2026)

- Пользователь поиграл на `http://localhost:5174/tuglab.html` и подтвердил «отлично», «все ок». Оригинальная сцена/генератор/управление сохранены. Это ручное desktop-подтверждение, не Android или production.
- QA checkpoint `16158ea`: 182 tests, 63 игровых и 42 изолированных прогона, браузерная/static/lifecycle проверка и реальный 120с headless RAF PASS; tick P95 0.90 мс на указанном Mac. Руководство и приёмка в docs; скорости до 2000 м/с не объявлены полностью физически валидированными.
- Actual CI [37047921348](https://github.com/komleff/bonk-race/actions/runs/37047921348) PASS, standalone artifact скачан и SHA-256 проверен. Architecture/physics и security/build APPROVED на `16158ea`; quality нашёл BLOCKER обычного набора tow чисел и принял исправление на `8205235`. UI fix `8205235`: все пять tow numeric drafts принимаются по blur/Enter, F1/F2 закрыты. Адресный re-review тем же reviewer APPROVED, собственный keystroke 8/8 PASS. Физические blobs не менялись.
- По запросу оператора прочитаны PM_ERR/DOC_PR в соседнем u2 и актуальные указатели. [Самопроверка PM](../docs/reports/u2-tuglab-pm-self-check.md), Beads `bonk-race-550`: избыточный review effort и устаревший PR body. PR обновлён; новые широкие review не запускаются. Advisory mapUnchanged отложен в `bonk-race-551`, он не блокирует текущую игру.
- Прошлый exec dev process исчез; сервер восстановлен на том же 5174 (session42089), HTTP200. Worktree сохраняется для игры/PR. Исходный checkout и пользовательский stash не изменены.
- `.6` Android и `.7` production HTTPS/доставка/откат остаются открытыми; merge только оператор.

## U2 TugLab — работа возобновлена

- Оператор написал «продолжай» после обновления VS Code/Codex; пауза завершена. Начаты аудит минимального переиспользования и независимый review checkpoint ядра.
- Для поддомена оператору передана DNS-запись `tuglab A 83.217.202.233`, TTL 300/Auto: публичный DNS apex U2 и play совпадает с этим VPS. Повторная проверка 3 октября: сам `tuglab.u2game.space` уже разрешается в `83.217.202.233`. Настройка Caddy/отдельной доставки TugLab пока отсутствует; сайт не объявляется опубликованным.
- `.9` закрыта как аудит hostname/схемы: [инструкция Caddy](../docs/deploy/tuglab-vps.md) прошла независимое review. HTTPS HEAD пока даёт TLS-ошибку, публикация `.7` открыта; agent SSH не выполняется.
- Аудит `bonk-race-tow-reuse` закрыт: план полностью переписан под opt-in `BonkLab(canvas,{towing:true})` и тот же main/ввод/renderer/панель. Сохранить зоны/шипы/орбы/финиш и исходный генератор; пассивный B сталкивается со всеми объектами. Стандартные параметры A/FA/сопротивления сохраняются, six-DOF ядро не становится управлением игры.
- Новые tow.*: масса B/A 0.1–10, радиус 2–60 (20), длина 4–24 (8), тип spring, k 0–10000 Н/м (1250), damping 0–1.5 (0.5). Параметры меняются без регенерации/телепортации; Restart проверяет свободный старт обоих тел. Начальная опорная масса демпфирования A/2, смена B не меняет c.
- Этап1 принят независимым review: fix `b57b677`, P2 растяжения штанги устранён predictive solve + адаптивными подшагами (лимит128) и атомарным отказом. 90/90 тестов, 56 крайних конфигураций без остановок; max рост энергии0.0681%. `.1` закрыта, `.2` начата: трос/пружина/прямое k/контакты и общий advancePair для последующего подключения stockBonkLab.

- Этап2 закрыт: трос/пружина/CCD и прямое k, commits `55e7127`, `7d91595`. 144/144 tests, typecheck PASS; независимый scoped review spec/quality APPROVED. Статический CCD и адаптивный callback готовы; `.3` начата — интеграция оригинальной сцены.

- Этап3 закрыт: opt-in BonkLab/исходная карта/stock FA/пассивный B/орбы/шипы/общий респаун/пауза и Step. `6f80929` + `8ba429b`, 177/177 tests, typechecks/npmtest PASS; исходные общие сборки PASS. Независимые spec/quality APPROVED после двух переходных исправлений. `.4` начата: UI/рендер/отдельная оболочка.

- Этап4 закрыт: тот же main/input/renderer/panel/toolbar, отдельная TugLab оболочка и сборка, opt-in WASD, параметры сцепок, B/линия/миникарта. `7f3823e` + `8a3b976`; 182tests и builds PASS, dev/static/stock browser smoke PASS; independent spec/quality APPROVED после сброса held input при респауне. `.5` начата — финальная QA/guide/artifact. Игра локально на :5174/tuglab.html или static :5184/, HTTPS-host ещё не опубликован.

## U2 TugLab — сохранённый контекст паузы для обновления

- Оператор уточнил минимальный объём: сохранить оригинальную сцену BonkLab с генератором препятствий и существующее управление bonk-race. Код переиспользовать по максимуму, переделывать минимум.
- В сцепках нужны редактируемая длина и дополнительно жёсткость пружины. Масса/размер груза и три типа сцепок остаются; запись/export/import/replay ранее исключены.
- Отдельный набор новых сцен и новый способ управления из предыдущей редакции плана отменены. Перед продолжением следующих этапов PM актуализирует интеграцию с существующими модулями (Beads `bonk-race-tow-reuse`), сохраняя уже полезное ядро буксировки. Повторный review объёма оператором не требуется.
- ПАУЗА по запросу оператора для обновления VS Code/Codex. Checkpoint ядра: `1bd985d694393f5af93eab12dc2bcacc4abed41c`; реализованы два независимых тела, двигатели, импульсная штанга, конфигурация и валидация. Сцена и интерфейс ещё не подключены. Трос, пружина, CCD и действия со сцепкой ещё не реализованы.
- `npm run typecheck:tuglab` и `npm run test:tuglab` повторно проверены PM: 32/32 PASS, включая 60 секунд сохранения линейного и полного углового импульса для семи отношений масс. Developer сообщил PASS существующих `npm test` и `npm run build`; независимое code review пока не выполнялось. `.1` остаётся in_progress.
- После возобновления: выполнить `bonk-race-tow-reuse`, пересмотреть устаревшие brief задач 2–4 и отдельно проверить уже добавленное ядро. Собственные двигатели из раннего плана не означают согласование замены управления bonk-race. Не запускать новые этапы до команды оператора продолжить.
- Рабочий каталог: `/Users/komleff/Documents/GitHub/bonk-race-tuglab`; ветка `feat/u2-tuglab-v0.1`; PR #36. Исходный checkout bonk-race не используется для изменений.
- Независимые scratch-отчёты/brief/ledger этого плана: `.superpowers/sdd/2026-10-02-u2-tuglab/` в worktree. Они игнорируются git, ключевые результаты должны быть также сохранены в этом Memory Bank/Beads/PR.

## U2 TugLab — реализация согласована (2 октября 2026)

- Оператор согласовал крупные задачи: ручная игра с разными параметрами, без записи. Дополнительно требуется сохранить генератор карты для полёта с прицепом через препятствия.
- План и задачи `.1/.3/.4` актуализированы: отдельная случайная карта, seed/плотность/размеры и новая карта, адаптер чистого `shared/src/physics/arenaGenerator.ts`. Смена массы и Restart сохраняют текущую карту.
- `bonk-race-tow-review` закрыта по ответу оператора, `.1` начата. PM организует последовательную реализацию и независимую проверку этапов в прежнем worktree.
- Базовые `npm run build --workspace=shared` и `npm test` проходят. Установлены существующие зависимости через `npm ci --ignore-scripts`, общие hooks не заменялись.
- Перед кодовым спринтом PATCH повышен до 0.6.1 по политике AGENT_ROLES; собственная версия TugLab планируется 0.1.0. Игровой код и публикация BonkLab на этом этапе не менялись.

## U2 TugLab — PM и подготовка реализации (2 октября 2026)

- Оператор поручил PM создание игрового стенда по [PR #35](https://github.com/komleff/bonk-race/pull/35); роль прочитана из `.agents/PM_ROLE.md` этого репозитория.
- Создан соседний worktree `/Users/komleff/Documents/GitHub/bonk-race-tuglab`, ветка `feat/u2-tuglab-v0.1`, от `origin/docs/u2-tuglab-spec-v0.1` (`feb7305`). Исходный checkout остаётся на `docs/agentic-engineering-talk`.
- Подготовлен [план](../docs/superpowers/plans/2026-10-02-u2-tuglab.md): чистое ядро, три сцепки/CCD, игровые сцены, отдельный интерфейс, QA, реальный планшет, самостоятельная выкладка. Beads: `bonk-race-tow.1`–`.9`, подготовка `bonk-race-tow-plan`, review оператором `bonk-race-tow-review`.
- Уточнение оператора: нужен стенд, чтобы просто поиграть; запись ввода, экспорт/импорт/playback исключены, AC-21–22 исходного ТЗ неприменимы. Формальное исследование с пятью игроками также снято из текущей поставки. Автоматические проверки физики сохраняются, действий пользователя стенд не записывает.
- `bonk-race-tow` теперь P1/in_progress: начата PM-подготовка; код симулятора ещё не реализован. Developer запускается после review плана оператором; `.1` заблокирована задачей review, дальнейшие этапы — последовательными зависимостями.
- Подготовка `bonk-race-tow-plan` закрыта: план прошёл три независимых review Codex по физике, вводу и архитектуре; замечания устранены. `bonk-race-tow-review` остаётся открытой для проверки объёма оператором. `.8` закрыта как снятая из объёма.
- Системный `bd 1.2.2` не поддерживает существующую SQLite-базу. Для этой ветки использован проверенный по SHA256 официальный `bd 0.49.6` в `/tmp/bonk-tuglab-tools/bd`, с `BEADS_DIR` этого worktree и `--no-db --no-daemon`. В config задан `issue-prefix: bonk-race`, потому что автоматическое определение не распознаёт legacy-смешение префиксов. Глобальный CLI и база исходного checkout не мигрированы.
- Численные AC и UI/device QA ещё не выполнялись. DNS/хостинг требуют уточнения в `.9`, настоящий Android-планшет — `.6`; эти зависимости не подменяются эмуляцией или чтением документации U2.
- Ветка содержит подготовительные документы и учёт. Действующие BonkLab, workflows, игровые исходники, зависимости и версия не изменены.

## U2 TugLab — подготовка ТЗ (2 октября 2026)

- По поручению оператора подготовлен [документ для ревью](../docs/tz/spec_u2_tuglab_v0.1.md); задача `bonk-race-tug`.
- Предлагается отдельное приложение и сборка внутри этого репозитория. ТЗ описывает штангу, трос и пружину, взаимное влияние тел и массу прицепа 10–1000%.
- Будущая реализация учитывается задачей `bonk-race-tow`; разработка не начата, численные критерии пока не проверены на симуляторе.
- Целевой адрес предполагается `tuglab.u2game.space`; точное имя и инфраструктура требуют проверки перед выкладкой. DNS и сайт не настроены.
- Поставка содержит только документы и записи задач. BonkRace/BonkLab, версия и действующая публикация не изменены.

## Текущее состояние (18 марта 2026)

**Репозиторий:** `komleff/bonk-race`
**Активная ветка:** `main` (v0.6.0 выпущен)
**GDD версия:** 4.0 (`docs/gdd/GDD-index.md`)
**Версия:** 0.6.0

---

## PR-история

| PR | Ветка | Описание | Статус |
|----|-------|---------|--------|
| #1 | `race/init` | Shared package: TrackConfig, physics types, rng | Merged |
| #2 | `race/phase5-track` | Starter Circuit, tracks API, wall/surface physics | Merged |
| #3 | `fix/db-defaults-uuid` | UUID миграции fix, bonk_race DB defaults | Merged |
| #4 | `chore/rebrand-and-memory-bank` | Ребрендинг slime-arena → bonk-race | Merged |
| #5 | `feat/vite-proxy-client-connect` | Sprint 1: auth, submit, ghosts, vertical track | Merged |
| #6 | `feat/bonklab-v1` | BonkLab v1.0: physics sandbox | Merged |
| #7 | `ci/deploy-lab-workflow` | CI: GitHub Pages deployment for BonkLab | Merged |
| #8 | `fix/lab-pages-base` | Fix: base path for GitHub Pages | Merged |
| #9 | `feat/bonklab-v1.2` | BonkLab v1.2: orbs, finish, geometry, presets | Merged |
| #10 | `feat/gdd-v4-ugc` | GDD v4.0: UGC-секция, русификация | Merged |
| #11 | `fix/lab-input-direction` | Fix: направление мыши в BonkLab (2x angle error) | Merged |
| #12 | `feat/countdown-and-respawn-overlay` | Countdown 3-2-1-Go! + respawn overlay | Merged |
| #14 | `tz-lateral-grip` | Анизотропное трение + BonkRace v0.3 пресеты | Merged |
| #15 | `sprint/trails-direction-triangle` | Следы, треугольник направления, техдолг | Merged |
| #17 | `feat/trail-coloring` | Trail coloring + spike knockback/destroy | Merged |
| #22 | `fix/bonklab-techdebt` | Tech debt + zone tuning + arena balancing | Merged |
| #23 | `chore/release-v0.5.0` | Release v0.5.0 | Merged |
| #24 | `chore/cleanup` | Архив планов, удаление веток, фикс docs | Merged |
| #25 | `fix/bonklab-render-interpolation` | Устранение jitter: единый RAF + интерполяция тиков | Merged |
| #26 | `fix/trail-rendering-order` | Плавный след: обход ring buffer по возрасту | Merged |
| #27 | `chore/v0.6.0-release-prep` | v0.6.0 release prep — memory bank, README, toolbar, release notes | Merged |
| #28 | `chore/release-v0.6.0` | Release v0.6.0 | Merged |
| #29 | `ci/deploy-lab-version-trigger` | CI: trigger BonkLab deploy on version.json change | Merged |

---

## Известный техдолг

| Приоритет | Файл | Проблема |
|-----------|------|---------|
| P2 | `shared/src/surfaceConfig.ts` | Пресеты зон захардкожены — вынести в balance.json |
| P2 | `shared/src/physics/arenaGenerator.ts` | Вероятности зон через массив — заменить на weighted random |
| P2 | `client/src/lab/BonkLab.ts` | reverseZoneAngleDeg — не реализован |
| P2 | `server/src/meta/routes/runs.ts:43` | operationId от клиента не используется сервером |
| P2 | `client/src/lab/BonkLab.ts` | Аллокации в tick(): getState объект, Set, body — pre-allocation |
| P2 | `client/src/lab/LabRenderer.ts` | Trail: ageTrail сканирует expired, calculateTrailColor аллоцирует строки |
| P3 | `client/src/raceMain.ts` | Isotropic drag (TODO LG-6) |
| P3 | `shared/src/config.ts` | race.* секция не типизирована в resolveBalanceConfig() |
| P3 | `server/src/meta/routes/ghosts.ts:78` | Guest без profiles — нет opponent ghost |
| P3 | `client/src/lab/LabRenderer.ts` | Sub-pixel anti-aliasing blur |

---

## Инфраструктура (локальная)

| Компонент | Порт | Запуск |
|-----------|------|--------|
| Meta-server | :3000 | `cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts` |
| Client (Vite) | :5173 | `npm run dev:client` |
| BonkLab | :5173/lab | `npm run dev:client` → `/lab` |
| PostgreSQL | :5432 | Docker `slime-pg` (БД `bonk_race`, user `bonk`) |
| Redis | :6379 | Docker `slime-redis` |

---

## Команды

```bash
# Сборка
npm run build           # shared -> server -> client

# Разработка
npm run dev:client      # http://localhost:5173
# BonkLab: http://localhost:5173/lab

# Тесты
npm run test            # determinism + orb-bite + arena-generation + anisotropic-friction

# Beads
bd ready
bd list --status=open
```
