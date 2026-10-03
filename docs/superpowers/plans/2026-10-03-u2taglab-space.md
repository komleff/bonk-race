# U2TagLab Space Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Выполнять последовательно, без повторных запросов разрешения на уже одобренную работу.

**Goal:** локальная самостоятельная космическая версия TugLab на кругах для ручной проверки буксировки, FA и одинаковых заездов по ссылке.
**Architecture:** opt-in space-профиль существующего BonkLab/TugLab; реальные силы/инерция и отдельный каталог мира. Переиспользуем ввод, Canvas, панели, генератор, сцепки и жизненный цикл; новые законы/схема отделены от аркадного режима.
**Tech Stack:** TypeScript, Preact, Canvas, Vite, существующие node:test/Playwright инструменты.
**Spec:** [одобренный проект](../specs/2026-10-03-u2taglab-space-design.md).

## Global Constraints

- Оператор одобрил проект и прямо поручил сборку: «да ок … вперед». Технический план фиксирует исполнение этого поручения, не вводит ещё один approval-loop.
- Репозиторий bonk-race, существующий worktree bonk-race-tuglab; ветка feat/u2taglab-space-v0.1. U2 read-only. Не менять pipeline/OverGate/backend, не создавать репозиторий.
- Сначала круги. Прямоугольники561.7 и жёсткая/одношарнирная555 остаются последующими задачами. Не задерживать первую локальную сборку ради них.
- Вакуум: ambient linear/angular drag0, включая B и астероиды. Двигатели/FA только A. Один V_FA — предел модуля скорости. FA ON default; toggle сохраняет состояние.
- Существующие BonkLab/TugLab, входной input и share-v1 сохраняют поведение. Комментарии в новом коде по-русски, идентификаторы по-английски. Без новых зависимостей.
- Новый entry client/u2taglab.html, отдельная сборка client/vite.config.u2taglab.ts и локальный порт5175. Существующий :5174 не останавливать.

## Числовой профиль и решения PM

Выбран **явно расчётный профиль** на базе U2 authoring, не полный fitted M. A: Титан M60×27м, shell+propulsion300000кг; B: оболочка Каравана L108×48м,680000кг. Масса A не объявляется полной массой оснащённого корабля. F_A=16228800/6955200/4173120Н (вперёд/назад/вбок), source Neutral Industrial M. Russian identity не добавляет незамкнутый национальный множитель.

`R=(L²+W²)/(2(L+W))`; A24.879310344827587м, B44.76923076923077м. `I=m(L²+W²)/12`: A108225000, B791520000кг·м². Инерция независимо от radius override.

Начальные лабораторные FA-настройки, явно помеченные как адаптация: V_FA250м/с; crew-g4.5 по размерной M-кривой; coast-deadzone1.5м/с, комфортное торможение3.5с, аварийное0.2с, lateral comfort20м/с², yaw stop1с по runtime-опоре U2 Стриж. Yaw cap M24°/с по размерной кривой. **Расчётный** yaw alpha24°/с² даёт torque=I_dry*24*pi/180≈45333181.99Н·м; при изменении текущей массы torque не увеличивается. Эти значения доступны для настройки и снабжены справкой о происхождении.

Первичный масштаб сцепок: rope288–2000м, default288м; rod/spring20–2000м, default288м. Пружина default f0.15Гц и zeta0.5: k=mu*(2*pi*f)², c=2*zeta*sqrt(k*mu), mu=mA*mB/(mA+mB). Диапазон k0–1e8Н/м, zeta0–1.5, масса A10000–1e7кг, massRatio0.1–10, radiusB2–250м. В новом режиме повторная сцепка rope сохраняет настроенную длину (>=288м) и допускает провис; тела не перемещаются. Rod/spring сохраняют фактическую длину захвата. Верхние границы допускаются только при проверенной устойчивости/явном атомарном solver-stop; нельзя обещать, что любой крайне жёсткий состав безопасно интегрируется. Если solver требует более узких границ, Developer сужает их согласованно и фиксирует причину.

## Review Focus

- Переключение режима/параметра не возвращает аркадный FA, drag или незаметный clamp; тяга/torque соответствуют источнику.
- При экстремальной длине/массе старт проверяет весь состав и сцепку, solver не оставляет частично обновлённый мир.
- FA после внешнего импульса/по диагонали управляет модулем скорости физическими силами; B не получает бесплатных двигателей.
- Пауза, Step и Restart согласованно управляют всеми движущимися объектами/полями; seed не зависит от wall-clock.
- Ссылка в новой оболочке воспроизводит все физические настройки/движения, несовместимая схема не применяется частично; старые ссылки остаются рабочими.

## Task 1: A — рабочая физика на кругах — Beads561.2/561.3

**Files:** Create client/src/u2taglab/{profile.ts,physics/flightAssist.ts}; client/u2taglab.html; client/vite.config.u2taglab.ts. Modify client/src/lab/{BonkLab.ts,main.ts}, client/src/tuglab/labTowing.ts, при необходимости physics/advance.ts/types.ts и LabToolbar/LabPanel/paramDefs.ts. Test tests/tuglab/u2taglab-physics.test.cjs и u2taglab-lifecycle.test.cjs; подключить новые модули в существующий test tsconfig.

**Interfaces:** `SpaceProfile` хранит SI geometry/mass/force/FA/coupling параметры и источник; `spaceEngineWrench(body:BodyState,input:InputFrame,fa:boolean,profile:SpaceProfile,dt:number):EngineWrench` возвращает силу/момент без прямой записи скорости. `BonkLab(canvas,{towing:true,space:true})` включает только новый профиль. LabTowing получает optional mode-owned профиль диапазонов/геометрии/инерции; дефолт остаётся прежним. Взаимодействие UI с FA через атомарный живой toggle текущего mode-owned состояния.

- [x] Добавить RED: vacuum/no engines сохраняет v/omega A/B; F/m и torque/I совпадают с числовым профилем; B passive; radius override не меняет I скрыто.
- [x] Добавить RED: FA ON coast, lateral damping, diagonal magnitude250; OFF raw linear/no governor; yaw torque действует в обоих; toggle сохраняет тела/seed. Soft overspeed после внешнего импульса уменьшается без мгновенного clamp.
- [x] Добавить RED: rope>=288, rod/spring/nearest attachment, relaxed captureV_FA, изменение масс не добавляет torque; длинный старт и экстремальный solver-stop атомарны.
- [x] Запустить npm run test:tuglab и убедиться, что новые адресные тесты падают по ожидаемой причине.
- [x] Реализовать профиль/FA и узкие hooks BonkLab, исключить старый FA/drag из space-path; reuse advancePair/couplings с корректными инерциями и диапазонами. Если нужен выделенный adapter, сохранить контракт и записать решение.
- [x] Добавить entry/build/dev скрипты и минимальный компактный UI с FA/параметрами. На этом этапе карта может быть временной безопасной исходной ареной с явно отмеченным масштабом, но игра должна реально запускаться/летать и соединяться.
- [x] Запустить npm run test:tuglab, npm run typecheck:tuglab, client typecheck, build:tuglab и build:u2taglab. Проверить браузером :5175/u2taglab.html, root BonkLab и :5174/tuglab.html.
- [x] Commit; self-review; один свежий task reviewer проверяет spec+quality. PM показывает пользователю готовую локальную физику и продолжает остальные этапы без ожидания разрешения.

## Task 2: B — космический мир — Beads561.4

**Files:** Create client/src/u2taglab/{world.ts,physics/worldContacts.ts}; Modify BonkLab.ts/LabRenderer.ts/space adapter, при необходимости общие contacts/advance только с сохранением старого пути. Test tests/tuglab/u2taglab-world.test.cjs.

**Interfaces:** `SpaceWorld` хранит seed, статические объекты и динамические `BodyState` астероидов со стабильными ID; `createSpaceWorld(profile,seed,density)` возвращает детерминированный начальный мир; `advanceSpaceWorld` использует общий dt/substep для сцепки и контактов всех тел. Render snapshot содержит семантический тип station/derelict/asteroid; не маскировать их под съедаемые орбы.

- [ ] RED: один seed воспроизводит типы/геометрию/начальные скорости; свободны A/B/сцепка/коридор; сцена масштабирована под трос288–2000м.
- [ ] RED: asteroid m=4*pi*r³*2500/3, I=2*m*r²/5; v/omega без drag; A/B/asteroid и asteroid/asteroid контакты сохраняют суммарный импульс, учитывают массу; static station не движется.
- [ ] RED: Pause/Step/Restart согласованны для всего мира; быстрый asteroid не проходит сквозь A/B/станцию в объявленном диапазоне; ошибка шага атомарна.
- [ ] Запустить адресные RED, реализовать детерминированный каталог/контакты/рендер. Радиусы астероидов5–50м; начальная скорость0–5м/с default, настройка максимум100м/с только при подтверждённом CCD. Runtime baseline U2 SectorInitializationSystem: станция100×100м/R70.710678, заброшенная платформа1000×1000м/R707.106781. Это текущие baseline, не окончательные asset-derived габариты. Коэффициент столкновения0.8 — runtime fallback GameWorld, настраиваемый0–1; Перекрёсток0.95 доступен как source-reference.
- [ ] Адресные и регрессионные тесты + браузерный полёт; commit/self-review/task review.

## Task 3: C — локальные поля — Beads561.5

**Files:** Create client/src/u2taglab/fields.ts; Modify world.ts/space adapter/LabRenderer.ts/param definitions. Test tests/tuglab/u2taglab-fields.test.cjs.

**Interfaces:** `sampleSpaceFields(world,body,simulationTime): {force:Vec2,torque:number}` семплирует A/B отдельно; состояние поля принадлежит seed/симуляции. Описания/единицы по sector_fields spec. Никаких скрытых engine multipliers.

- [ ] RED: вне полей force/torque0; ResistiveMedium drag=-weight*k_R*A_eff*v_rel, falloff один раз; движущаяся геометрия поля не превращается в velocity среды; перекрытия детерминированны.
- [ ] RED: Plasma-force по замкнутому механическому закону; тепловое/пылевое/EM поле само не меняет engine/thrust/drag. Pause/Step и раздельное A/B семплирование корректны.
- [ ] Запустить RED; реализовать только подтверждённые механические воздействия. Замкнутый LAB pressure-law: F=w*p*pi*r²*n, p[Pa], torque0; r корабля из L/W, не collision-only override. Resistive k_R[N*s/m³]; A_eff=pi*r². Начальная pressure50Pa (0–1000), k_R0.5 (0–100); они LAB balance, не паспортные U2 значения. Smoothstep falloff один раз. Поля семплируют все подвижные тела (A/B/астероиды), статика не интегрируется. Профиль коэффициентов/эффективной площади круга явно лабораторный; thermal/dust/EM визуальные области со справкой о границах, без обещания отсутствующих систем.
- [ ] Тесты/браузер/commit/self-review/task review. Не переносить весь thermal/energy/sensor контур U2.

## Task 4: D — интерфейс, обмен, локальная приёмка — Beads561.6/560

**Files:** Create client/src/u2taglab/share.ts и docs/U2TagLab-Guide.md; Modify existing UI/main/input/renderer точечно, scripts QA и Pages для вложенной оболочки; test u2taglab-share.test.cjs/u2taglab-ui.cjs. Version policy: BonkRace0.6.3, новая оболочкаU2TagLab0.1.0; прежний TugLab0.1.1.

**Interfaces:** независимая model/schema/generator share-схема; reuse ограниченное кодирование/атомарная валидация. Полный начальный профиль/overrides/seed/движения/поля/FA передаются вместе; несовместимые ссылки отклоняются, не мигрируют молча.

- [ ] RED: encode/decode/exact keys/finite values/ranges/model compatibility; две независимые страницы имеют одинаковый начальный мир и таймер0 до Старт; изменённые настройки целиком отражаются после импорта.
- [ ] Добавить (i) ко всем новым параметрам и шести tow-параметрам560: смысл/единицы/эффект/source. Сохранить radiusB, compact toolbar и живой FA. Настройки на телефоне прокручиваются, не получают игровой ввод.
- [ ] Проверить360/390/412px, ориентацию/resize, pointer/keyboard, ручной brake/FA, паузу/Step/restart/reconnect и длинную сцепку; browser console0errors. Проверить root/вложенный /bonk-race/u2taglab/ build и предыдущие оболочки/ссылки.
- [ ] Финальные проверки npm run test:tuglab/typecheck:tuglab; shared/client/server typecheck, npm test, npm run build, build:tuglab/build:u2taglab, check-version и существующая матрица/browser QA. Новую физику дополнительно проверить на ограниченной матрице масс/длин/сил, не подменять реальную игру одними тестами.
- [ ] Обновить Guide/Memory Bank/Beads, записать фактические допущения и результаты; commit. Свежий final reviewer полного diff, fix важных замечаний/scoped re-review. Push/PR обязательны, merge/публичный релиз после локальной приёмки оператором.

## Self-review / execution record

Spec coverage: числовые допущения отмечены, FA magnitude/вакуум/passiveB A; сцепки A; мир B; поля C; UI/share/справка D; прямоугольники deferred561.7. Review Focus распределён между A–D. План не требует новой инфраструктуры/репозитория. Точные узкие интеграционные интерфейсы уточняются Developer по существующим классам и фиксируются в реализации; scope не расширяется.

PM хранит фактический прогресс в Beads/Memory Bank и отдельном execution ledger. После каждой рабочей части — проверка результата, затем следующая часть; никаких остановок «продолжать?».
