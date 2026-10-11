# TugLab-2 — протокол квалификации до опытов

2026-10-11. **Только подготовка; матрица, численные результаты и Android не запускались.** Прочитаны ТЗ v0.1 (23 AC), `task-4-brief.md`, `docs/reports/tuglab2-session.md`, VC в плане, существующие physics/session tests и публичные scenes/telemetry/config. Ни один продуктовый файл не изменён. PM принял этот протокол до исполнения; результаты и PASS здесь не заявлены.

## Вывод аудита и решения

Базовые counts brief правильны: **126 + 144 + 12 = 282**. Но общий denominator пока не задан: остальные bullets не фиксируют декартовы произведения g/Csize/delay2, size/scene, modes/mirrors/route/events. Ниже приведён ограниченный полный manifest из **466 логических simulation cases**. Это выбранное расширение покрытия, не единственный обязательный минимум ТЗ. Exact dedup разрешён только после формирования полного нормализованного config+initialState+input+event identity; logical count и unique executed count показываются отдельно. Нельзя дедуплицировать разные g/delay потому, что в coast они физически похожи.

Primary AC23 brief и finalized Session report согласованы и уже определены до измерений: боковой уход от **начальной линии A**, угол B от **начального heading A**, абсолютный развёрнутый угол; обе метрики включают исходное возмущение. Менять на B−A/B−C после просмотра результатов недопустимо.

Уточнение PM после аудита: для empty/turn/passage/detach разрешён pre-brake ≤20s + полные60s после первого тормоза, то есть до80s total. Стандартные тормозные серии brakeA от t0 имеют максимум60s. Короткие/нетормозные сценарии получают `observation_budget/censored`, `measurementComplete=false`; это не60s timeout. Размер записи не повышается: фактический recording budget stop остаётся диагностическим неуспехом с импортируемым префиксом.

## Замороженный manifest

Общие значения, если строка не переопределяет их: seed **20261011**, dt1/60, g1, delay.25, FAtrue, исходная скорость40 по+X, A=C=M, geometryB=L, сухая штатная масса B1556800kg, пружиныM/l0=360m. Каждый case хранит оба link профиля отдельно. Mirror± одновременно меняет B offset/angle/vy и зеркальный input/event route; все режимы одной пары получают буквально одинаковые initial bodies/world/inputA.

| IDs/cohort | Точное произведение | Count |
|---|---|---:|
| mass60 | 7 ratios(.1,.25,.5,1,2,5,10) ×2 mirrors×3 modes×3 delays(0,.25,1), braking40 |126|
| rate-control |4 masses(.1,1,10,1556800/401200)×2 rates(30,120)×2 mirrors×3 modes×3 delays |144|
| standard |2 speeds(40,80)×2 mirrors×3 modes, delay.25 |12|
| strength |2 g(0,.5)×2 mirrors×3 modes, standard40 |12|
| rear-size |C=S/L/XL×2 mirrors×3 modes, standard40; C=M six cases reference standard40 |18|
| delay2 |standard40×2 mirrors×3 modes, delay2 |6|
| size-scenes |A=C=S/L/XL ×2 B(own,next)×2 scenes(empty,braking40)×2 mirrors×3 modes |72|
| turns |4 variants(45,90,180,arc)×2 mirrors×3 modes |24|
| passage |2 routes(straight,turn90)×2 mirrors×3 modes, one frozen seed |12|
| failure |4 variants(g0,delay2,lateral0,retro0)×2 mirrors×3 modes |24|
| moving-detach |2 links(AB,BC)×2 mirrors×3 modes, detach+recapture timeline |12|
| single-control |2 speeds(40,80)×2 mirrors; composition single, coast |4|
| **Logical total** ||**466**|

First282 + remaining184 =466. Сценарии failure g0/delay2 могут ссылаться на strength/delay2 **только если** полностью совпадают нормализованный initialState, последовательность inputs/events, длительность и scene metadata. Без такого доказательства исполняются как отдельные случаи. Недопустимая initial geometry — отдельный результат manifest с reason, не замена корпуса/массы/длины и не вычёркивание из denominator.

Для size-scenes: S ownB=S/rest120, nextB=M/rest180; L ownB=L/rest480, nextB=XL/rest720; XL ownB=XL/rest960, nextB=XXL/rest1440. Обе связи используют модуль своего тягача, фиксированные catalog k/c. XXL есть в текущем catalog, но experimental reserve: эти12 логических XL→XXL случаев явно experimental, не production rating. Если frozen target уберёт XXL,12 marked unavailable с причиной; тогда454 executable candidates, logical requested466 остаётся. Geometry B неизменна при ratio-массе; I пересчитывается по прямоугольному профилю, thrust/k/c не меняются.

## Ввод и seed: конечные reproducible templates

Input вычисляется только по accepted tick index, dt, seed и mirror; никогда по текущим положению/скорости варианта. Одна canonical input generator создаёт общую последовательность; режим/задержка/состав не меняют её. Пара публикует hash input template и равенство общего accepted prefix. Никакое «похожее пилотирование», adaptive route или подмена скорости не допустимы.

- **brake0**: initial всех vx40/80, B имеет mirror×.1RB lateral offset, mirror×5° angle, mirror×2m/s vy; A/C vy0. `InputA={x:0,y:0,magnitude:0,brake:true}`, rearBrakefalse постоянно отt0. Исходные l0 сохраняются. Это mass/rate/standard/strength/rear-size/delay2/failure/single template.
- **empty**: speed0 без возмущения; [0,5)s input+X magnitude1; [5,10)s idle; с10s brake0 до realterminal/70s. Mirrors в empty отражают nominal template, даже когда физические начальные состояния совпадают.
- **turnθ**: aligned start40; [0,5)s input+X1; [5,15)s fixed world direction(cosθ,mirror×sinθ), magnitude1; [15,20)s idle; с20s brake0 до80s. θ45/90/180°. **arc** заменяет направление [5,15) на θ(t)=mirror×π/2×(3u²−2u³), u=(t−5)/10; после15 idle. Уточняется одна версия этой формулы до запуска, а не выбирается удачная после результатов.
- **passage-straight**: seed генерирует ровно сохранённые statics; [0,20)s input+X1, с20 brake0 до80. **passage-turn90**: [0,10)+X1; [10,20) world+mirrorY1; с20 brake0. Для зеркальной пары сохранить отражённый world y и исходные velocities/angles; текущая scene factory passage сама не отражает препятствия по mirror — caller сохраняет явный initialState. Прохождение оценивается отдельным geometry predicate для **всех** корпусов за выходом последнего obstacle, иначе честный `route_incomplete/contact`; успешное торможение не равно успешному проходу.
- **failure**: тот же perturbed initialState brake0, меняются ровно g0/delay2/ClateralForce0/CreverseForce0. Factory `failure` сама не применяет B-возмущение — использовать явный frozen initialState, иначе это скрыто1D замена стандартного опыта. Режим coast остаётся valid zero reference, mode-specific effect не выдумывается.
- **moving-detach**: aligned40; [0,2)s input+X1; event detach выбранной link в начале первого accepted tick t≥2; idle доt3; event recapture вt3; вt3+dt explicit setMode исходного режима; сt4 brake0 до64s. Отказ capture фиксируется как отказ, без teleport/обнуления скорости; обязан быть отдельный legal successful-moving-capture unit fixture из имеющегося core. После detach C=0 до explicit mode, другая связь остаётся. Снимки непосредственно before/after каждого события обязательны.
- **single-control**: исходные A/B точно совпадают с paired train start, C/BC физически отсутствуют. Его input тот же brake0. Подписать изменившуюся общую массу, а не объявлять single эквивалентом train-coast.

Все event times переводятся в integer tick index заранее; dt/rate и effective delay записываются. `brakeA` и независимый `rearBrake` хранятся отдельно. Выше Brake A одновременно задаёт delayed rear request в режиме brake через штатный Session контракт, дополнительного rearBraketrue нет.

## AC16–22: точные gates и reuse

| AC | Gate и evidence; что ещё явно требуется |
|---|---|
|16|За60s, engines/fields/statics/contacts OFF, valid nondegenerate links: max accepted-tick relative drift total linear P и total angular L ≤1e−5. Явно сохранить Pscale/Lscale ненулевые из **initial/characteristic** состояния; nearzero отдельные абсолютные ошибки. Суммировать все dynamic bodies; существующие 60s/zero tests реально переиспользовать свежим запуском, не считать копии новыми cases.|
|17|E=Σ(.5mv²+.5Iω²)+Σ(.5k(d−l0)²), оба links. c0 maxabs(E−E0)/E0≤.005 за60s, limit activations0 и contacts0; c>0 max positive growth≤.005. Контракт нельзя подтверждать только конечной энергией. Существующий 60s physics test содержит оба damping варианта.|
|18|Физически single A–B против readonly legacy same dt/profile/inputs. VC position≤1e−4Lchar, angle≤1e−4rad; существующий test600 ticks/60Hz строже(1e−10m,1e−12rad). Сохранять fixture identity и immutable baseline SHA; смешивать legacy со скрытой массой C нельзя.|
|19|Для каждого qualified30/60/120 case каждого accepted tick: finite всех тел/world/links/commands/wrenches, bounds/CCD, normalized length excess и contact penetration. Violation длины сверх1%l0 или penetration сверх1%меньшегоradius не дольше1accepted tick: логировать величину/пару/tick и consecutivecount, fail приcount≥2. Последний снимок finite не подтверждает отсутствие туннелирования. Нужны отдельные CCD fixture allship pairs/asteroid/static/worldbounds, с swept crossing checks и заданными высокими скоростями, особенно30Hz; существующий core CCD на60 не закрывает весь новый rate subset.|
|20|Reverse link traversal, common config/init/inputs10s contact-free: maxcenter differences≤1e−4Lchar и maxangle≤1e−4rad. Lchar=max(initialradii,l0). Existing zero/order test valid reuse, допуск .036m соответствует Lchar360. Указать проверку общего шагаB и отсутствие двойного sampler advance; contact cases вне этого gate.|
|21|Deliberate solver quota fixture: rejected tick leaves exact previous finite accepted state/history/time/record; diagnostic pause/reason, результат numerical_stop, не stopped/delivery. Recording budget отдельно resource_stop, не solver success. Существующие atomic-failure/retry/session budget tests сохраняются как доказательства.|
|22|Импортированный exported JSON той же app/build/SHA/dt: сравнивать **каждый accepted tick**, maxcenter≤1e−6Lchar, angle≤1e−6rad, exactcommandsC и contactcounts/pairs/impulses. Replay не запускает controller; отдельно causal recompute commands по accepted observations. Финальное совпадение не заменяет trajectory test.|

Ограниченный дополнительный replay cohort: **15 source fixtures =5families×3rates**. Families: perturbed standard40; seeded contact; mode/g/delay/FA/pause/resume events; detach/capture events; physical single. Каждая source экспортируется/импортируется, затем replay и recompute проверяются отдельно — source simulation15, replay15, recompute15; в466 matrix denominator не добавляются как новые физические конфигурации. Contact fixture обязана иметь ненулевой фактический contact, иначе coverage FAIL. При fatal stop сохраняется/проверяется ровно accepted prefix и reason. Existing full60s120Hz bounded import test переиспользуется; не увеличивать32MiB/14400tick cap ради80s опыта.

## AC23 frozen evaluator

Начальный reference: pA0 и θA0 из полного исходного snapshot; n⊥=(−sinθA0,cosθA0). Для всех accepted snapshots и **исходного snapshot**:

`sidePeak=max |(pB−pA0)·n⊥|`; `anglePeak=max |unwrappedθB−θA0|`.

Предопределённый primary verdict — standard40, delay.25, g1, две зеркальные пары. Для каждого guard/brake против **того же mirror coast** отдельно `1−assisted/coast` по обоим primary peaks. AC23 проходит, если хотя бы одна из4 comparisons даёт≥.20 по side OR angle, без новых контактов/численных остановок. Не выбирать иную delay/g/массу/окно для основного verdict после результатов. 80m/s — обязательный harsher report, без требования достижения20%.

Coast denominator включён initial perturb, поэтому нулевой reference не ожидается; всё равно нулевой/неполный reference делает improvement N/A, не Infinity/PASS. Отрицательные improvement сохраняются. Рядом показывать **другую primary metric**, путьB послеbrake, stop time/outcome, residual vx/vy/ωB, все body speeds/yaw, forceAB/BC, saturation/limiter times/counts, minimumaccepted clearance. Maxima relativeBA/BC только auxiliary.

`stopped` =все присутствующие v<1m/s, |ω|<1°/s continuously2s послеfirstbrake. `not_stopped_timeout` =полные60s послеfirstbrake без этого условия. `numerical_stop`, `recording_budget_stop`, `invalid_config`, `censored` — отдельные outcomes. Для разных accepted lengths сохранить requested input window, actualprefix и measurementComplete; premature numerical/resource/censored вариант не может получить положительный usefulness verdict по искусственно меньшему peak.

Новые контакты: сохранять event total, accepted-tick index, unorderedpair/type и импульс для каждой пары; представить pairsets и counts assisted/coast рядом. Без новых pair и без увеличения count по baseline pairs — консервативный primary `no_added_contacts`; суммарный импульс показывается, не заменяет count. Numerical/resource stop всегда дисквалифицирует20% сравнение. НеудачаAC23 оставляет calibrationOPEN черезPM, сохраняя исходный baseline; не превращается в generic quality FAIL core и не называется «полезный/безопасный ассистент».

## Остальные AC и владельцы evidence

| AC | Coverage/remaining owner |
|---|---|
|01|legacy standalone browser/regression отчёт уже существует; новая assembled Pages availability/newmode и штатная BonkRace остаются отдельными PM/UI gates, не matrix inference.|
|02–04|core pausedgeometry/ports/moments/reciprocalforces tests; matrix initialstates/contactforces поддерживают, не заменяют atomic-port fixture.|
|05–08|session zero/limits/delay/retry/release/detach tests +peraccepted commands/engineforce matrix assertions; pause/focus UI Task3/5.|
|09|matrix семь масс иC sizes confirmsphysics; independentfields/buttons/limits1000% UI Task3.|
|10–11|moving events+core atomiccapture/single baseline+four singlecontrol records; UI state/reset required отдельно.|
|12|CSV/record evidence+scene failures; actual HUD/limiter/saturation/diagnosticreason Task3 browser.|
|13|desktop/touch emulation scoped reports доступны; **реальный Android OPEN**, matrix не закрывает.|
|14|15 replay fixtures, standard12 accepted JSON, pairedinput equality+negative variants; UI exporterror preservescurrentrun отдельно.|
|15|466logical manifest, all invalid/failure counts, initialconfigs, templates, standardmirror/graphs.|
|16–22|gates выше.|
|23|предопределённые40mirror primarycomparisons; truthfulcalibrationnegative.|

## Обязательные retained records и bounded failure reporting

1. `configs.json`:466 logical IDs, cohort, full normalizedconfig+world+initialState, bodies/ports/linkprofiles, seed/mirror/size/mass provenance, module/maxcapture, fa/settings/effective delay/dt/solverlimits, exact input generator+event timeline+hash, sourceSHA/appversion. Сохранить before execute; dedup links к original case, reason unavailable/invalid.
2. `results.json` и `summary.csv`: результат **каждого** logical case, outcome/errorreason/firstfailedtick, requested+acceptedticks/time, firstbrake/deadline/complete, allprimary/auxmetrics, contacts count/pairset/impulse, bounds/finite/length/penetration violation maxima и duration, recordingbytes/budget. Отдельные totals planned/attempted/unique/completed/stopped/timeout/invalid/numerical/resource/censored/replayfail/AC23negative; ни failures ни earlytermination не исчезают из denominator.
3. **Standard12 full normalized accepted JSON gzip**, включая неудачи; не только successes. JSON сохраняет inputsA/rearBrake, finalnormalizedC, delayedobservations, engine/externalwrenches, contacts, events. Отдельно exported/imported evidence; gzip не разрешает bypass uncompressed import budget.
4. `standard-series.csv`, figures SVG+PNG: оба mirrors40/80, все3modes, одинаковыеaxes/units и окна, side/angleB, v/ω/pathB, d/l0forceAB/BC, commands/saturation/contacts. Рад в CSV, градусы допустимы на figure с ясной единицей. Начальные perturb точки наt0 присутствуют.
5. Каждому auxiliary hardFAIL сохранить полный доступный bounded accepted record, provisionalfailurediagnostic и exactconfig/template; иначе summary-only matrix replayablefromseed. Неудачный export не стирает live/evidence source. Failedcase доказательства приоритетнее optionalmassive records.
6. Fresh reused core/session logs с actual counts/names и invariants numeric maxima where available. Нет измеренных численных результатов в этом preparation документе. Retain sourceSHA **по настоящему git commit**, dirtytree marker еслиfrontend WIP; не выдумывать frozenSHA для изменённых исходников.
7. Optional **field-radius review class**: manifest отдельной категории/test fixture с полями/world.fieldShipRadii, changedA/Bgeometry и single/train composition, engine/external force evidence; выявленный radius mismatch — конкретный extra regression, не заменять empty закрытые-system gates. Не добавлять поле во все466 cases и не скрывать текущую review uncertainty.

Итог готовности: арифметика282 подтверждена; предложен конечный manifest466 и15 replay sources. Перед Task4 implementation PM замораживает эти input/event timelines и дополнительных Cartesian counts. После этого новые конфиги только как явно помеченный supplemental cohort; существующие отрицательные данные и initialmetrics не переписываются радиPASS.

## Принятие PM

Протокол независимого QA принят2026-10-11 до выполнения матрицы:466logicalcases,15replay sourcefixtures, перечисленные input/event timelines иprimaryAC23. Compare завершается при первом собственном terminal; сохраняет тот же префикс вводаA, completeInput может бытьfalse при честном остановленном результате. Численный/resource/censored outcome не получает положительныйAC23 по сокращённому окну. Stage2 findings исправляются доUI/matrix; исходные отрицательные результаты сохраняются.
