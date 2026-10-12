# Независимое ревью Task 2 TugLab-2

Вердикт: **CHANGES_REQUESTED**.

Замороженный commit: `a8d668e6306011f56ee92e2b72f76a81ede3ca58`. Reviewer не автор. Проверены assistant/session/recording/recordingLimits/scenes/telemetry, конфигурация и тесты относительно ТЗ `docs/tz/spec_u2_tuglab2_v0.1.md`, Task2/Verification Contract и отчёта `docs/reports/tuglab2-session.md`. Уточнение primary B angle от начального A и бокового ухода от начальной линии A принято как контракт до опытов. UI, полная матрица, AC23, Android, workflow и публикация не квалифицируются.

## Подтверждённые замечания

### R1 — P2: импорт допускает противоречащие фактическому C команды телеметрии, после replay собственный JSON не импортируется

Место: `client/src/tuglab2/recording.ts:51`, использование — `client/src/tuglab2/session.ts:128`.

Минимальное воспроизведение: создать штатную coast-сессию текущей сборки, resume, один idle tick, сериализовать запись; изменить только `ticks[0].telemetry.assistant.command.retro` на `.25`, оставив `ticks[0].commandC.retro` и `telemetry.commandC.retro` равными0. `importRecording` принимает JSON. При replay физика использует фактическую команду0, но `sampleTelemetry` берёт вложенную `assistant.command`; результат имеет `tick.commandC.retro=0`, `tick.telemetry.commandC.retro=.25`. Экспорт результата затем отвергается собственным `importRecording`.

Проверяется только форма/диапазон вложенной команды, но не её равенство принятой команде. Нарушены согласованность записанных команд и точность replay/импорта (AC14/22). Нужна дешёвая проверка всех каналов на равенство фактической принятой команде и тест import→replay→export→import, без повторной физики при parse.

### R2 — P2: публичный replay обходит проверку идентичности сборки и приписывает результат чужому SHA

Место: `client/src/tuglab2/recording.ts:123` и `:129`.

Для корректной in-memory записи текущей сборки заменить `sourceSHA` на `foreign-build` и вызвать `replayRecording(recording)` напрямую. Воспроизведение принимается и новая запись получает `sourceSHA='foreign-build'`, хотя исполняется текущий код. Причина — `validateRecording(r,{appVersion:r.appVersion,sourceSHA:r.sourceSHA})`, то есть недоверенная идентичность сравнивается с собой. Тот же общий путь используют recompute и compare. Для той же записи обычный `importRecording` корректно отказывает, но публичные replay API эту гарантию не сохраняют.

По умолчанию нужна текущая `buildIdentity()`. Для тестов/явно известного источника допустим отдельный параметр доверенной identity; её нельзя автоматически выводить из входного JSON. Это условие same-build replay и достоверного исходного SHA (§11/AC22), а не требование сетевой подписи.

### R3 — P2: после смены корпуса поля используют площадь старого стандартного тела

Место: `client/src/tuglab2/session.ts:62` и `:134`; источник устаревших данных — `world.fieldShipRadii` нового состава.

Воспроизведение: `cfg=createDefaultTrainConfig(); cfg.ships.A=fitTrainShip('XL')`, добавить положительное plasma-поле, создать `new TrainSession(cfg)` и принять тик. Физический радиус A теперь99.51724137931035м, но `state.world.fieldShipRadii.A` остаётся24.879310344827587м от M. Read-only `sampleSpaceFieldResponse` использует именно последний радиус для A/B: эффективная площадь поля получается в16раз меньше. Аналогично меняется B при переключении его корпуса. Стандартный M–L–M скрывает расхождение.

Независимый пример с pressure2Pa даёт записанную среднюю `A_external_Fx≈3038.234Н`, тогда как мгновенная начальная сила по фактической XL-площади≈48785.705Н; небольшое отличие отношения от16 связано с временным усреднением и работающим FA. Доказательство самой ошибки не зависит от этих эффектов: используемые радиусы отличаются ровно в4раза.

Нужно канонизировать fieldShipRadii из новых профилей A/B при безопасном новом старте, сохранив согласованными config/world/snapshot. При импорте готового начального состояния несогласованные радиусы следует отвергать, а не незаметно исправлять записанный опыт. Прежний модуль полей изменять не требуется. Это нарушение независимости профилей и воспроизводимого физического смысла полей (§4/5/9, AC09/14).

### R4 — P2: сравнение многократно возобновляет уже остановившийся вариант и теряет момент собственного завершения

Место: `client/src/tuglab2/recording.ts:135`–`:140`.

Воспроизведение: исходная сессия из покоя с `mode:'guard',delay:0,epsilon:.1,Td:.25`; resume и600 тиков `brake:true` на60Гц. Источник остаётся running10с. `compareRecording(source.recording,'coast')` впервые достигает stopped наtick120, ровно2с. Затем цикл автоматически вызывает resume ещё480раз, принимает все600тиков и возвращает `telemetry.time≈10`, `stoppedFor≈10`,481событие, `measurementComplete=true`.

Сравниваемый вариант должен сохранить итог при первом собственном stopped/timeout/численном/записном отказе. Текущий код симулирует ещё8с после установленного итога и возвращает время/путь не до первой остановки. Это искажает метрики сравнений §9/AC23. PM подтвердил контракт: сохранить тот же префикс A-ввода; `completeInput=false` при раннем terminal; `measurementComplete=true` только для фактически завершённого измерения stopped/timeout, численные/бюджетные исходы помечать отдельно. Не создавать resume ради потребления хвоста источника. Обычный replay/recompute может воспроизводить реальные явные resume-события источника, но не должен выдумывать их.

## Независимые проверки

Node: `/tmp/bonk-tuglab2-tools/node-v20.20.2-darwin-arm64/bin/node`,20.20.2.

```text
tsc -p client/tsconfig.tuglab2-test.json --outDir .cache/tuglab2-qa/task2-review/build
node --test .cache/tuglab2-qa/task2-review/physics.test.cjs .cache/tuglab2-qa/task2-review/session.test.cjs
tsc -p client/tsconfig.tuglab2-test.json --noEmit
node .cache/tuglab2-qa/task2-review/independent.cjs
node .cache/tuglab2-qa/task2-review/discovery.cjs
```

- Свежая изолированная компиляция/typecheck PASS. На момент сборки reviewed production/tests соответствовали frozen SHA. Копии тестов перенаправлены исключительно на эту сборку.
- **59/59 штатных тестов PASS** (31core+28session). Включены принятые повторные попытки, контакты, bounded-import, атомарные пределы записи и реальный7200tick/60с/120Гц экспорт→импорт.
- Собственные задержка/release-проверки на30/60/120Гц при delay.251с: реакция после8/16/31тиков соответственно; более ранних команд нет, release использует ту же задержку, pause сбрасывает историю: PASS.
- Сетка mode×g×brakeRequest: forward0, retro25%/100%×g, lateral/yaw≤50%×g; ordinary C mapper; немедленная блокировка retro текущимBC; detach latch после recapture и g-change снимается только явным mode; B engine wrench0: PASS.
- Поле сопротивления и ненулевой ввод A: отдельно восстановлен весь принятый шаг через core sampler; полное состояние совпало, средние engine/external wrench совпали с интегралом принятых подшагов (1e-7 абсолютный допуск на компоненты), B получает только поле: PASS.
- 80тиков с направленным вводом, mode/g/pause/resume событиями: replay даёт точные тела/готовые команды, causal recompute совпадает; наблюдения совпадают в JSON-представлении (JSON канонизирует −0 в0). Compare сохраняет тот же ввод A в незавершённом коротком окне: PASS.
- Импорт отвергает опасные ключи `__proto__`/`constructor`/`prototype`, неверный source при обычном import, несовместимые mass/radius/inertia, неограниченный solver; загрязнения Object.prototype нет: PASS. Штатные tests отдельно подтверждают допустимые toString/hasOwnProperty ID в словарях без прототипа.
- Primary угол от начального направления A учитывает начальные5° и совместный поворот A/B; непрерывные углы и абсолютная линия отсчёта, двухсекундная остановка, строгий speed<1 и60сdeadline: PASS.
- Принудительный предел числа тиков: provisional шаг не меняет тела/мир/запись, accepted prefix импортируется, resume после лимита отвергается, restart восстанавливает рабочую сессию: PASS.
- Для minClearance признано честно объявленное измерение только на принятых снимках, не непрерывная CCD-оценка; для короткого сравнения не предполагается полный60сопыт.

Evidence: `.cache/tuglab2-qa/task2-review/tests.log`, `independent.cjs/.log`, `discovery.cjs/.log`; все четыре R1–R4 воспроизводятся последним файлом на изолированном frozen-build. Исходные production, DB/Beads, Git и внешние API reviewer не изменял. PM уведомлён сразу после подтверждения замечаний; ожидается одна class fix и scoped re-review без повторения общего ревью.

---

# Независимое scoped re-review Task 2 TugLab-2

Вердикт: **APPROVED**.

Проверенный frozen SHA: `573e490b3c1eaaf38087916f90fca8fe1fe98a8a`. База исходного ревью: `a8d668e6306011f56ee92e2b72f76a81ede3ca58`; промежуточный root-docs commit не меняет продукт. Проверены только исправления R1–R4, дополнительный подтверждённый автором R5 и непосредственно связанные регрессии. Открытых P0/P1/P2 замечаний в этом объёме нет.

## Закрытие замечаний

- **R1, P2 — CLOSED.** Import проверяет равенство всех каналов `telemetry.assistant.command`, `telemetry.commandC` и фактической `tick.commandC`. Независимая подмена retro/lateral/yaw теперь отвергается и import, и replay. Валидный import→replay→export→import сохраняет запись. Сравнение команд выполняется по значениям, без зависимости от порядка JSON-ключей.
- **R2, P2 — CLOSED.** Все три публичных пути replay/recompute/compare по умолчанию проверяют текущую build identity. Подмена appVersion либо sourceSHA отвергается. Явная доверенная `options.identity` работает для тестовой идентичности; неправильная доверенная identity также отвергается. Источник больше не используется как собственное основание доверия.
- **R3, P2 — CLOSED.** Новый безопасный старт вычисляет fieldShipRadii A/B из выбранной геометрии на копии config. Внешний config не изменяется. Session с готовым initialState отвергает несовпадение радиусов в обоих представлениях мира. Независимые train/single пробы с A=XL, B=XXL, C=S и почти однородным plasma-полем подтверждают силу `2πR²` для каждого присутствующего корпуса (абсолютный допуск1e-6Н). Подмена A/B field radius в initial-world или в обоих config-представлениях отвергается. Воспроизведение валидного заезда сохраняет тела точно. Штатный новый тест дополнительно сверяет single XL/XXL с read-only legacy60тиков при plasma+resistive.
- **R4, P2 — CLOSED.** Повторено исходное воспроизведение: source guard600тиков/10с, compare coast заканчивается на120тиках/2с, stopped. Сохраняется ровно префикс ввода A, одно resume-событие, `completeInput=false`, `measurementComplete=true`; результат импортируется. Для обычного replay/recompute реальные явные resume после terminal воспроизводятся с точными телами/событиями, запись без необходимых resume отвергается. Для сравнения measurementComplete теперь означает только stopped/timeout, а не численный отказ.
- **R5, P2 — CLOSED.** Сравнение больше не добавляет mode в обычный settings patch. Независимо проверены обе связи AB/BC × четыре патча `{g:.5}`, `{delay:0}`, `{Td:3}`, `{g:.3,delay:0}`: после disconnect→recapture первая команда остаётся нулевой; явный `settings:{mode:'guard'}` включает помощь. Все8сценариев сравнения точно совпали с исходными командами. Явные mode-события по-прежнему заменяются выбранным режимом сравнения.

## Проверки на Node 20.20.2

Runtime: `/tmp/bonk-tuglab2-tools/node-v20.20.2-darwin-arm64/bin/node`.

```text
tsc -p client/tsconfig.tuglab2-test.json --outDir .cache/tuglab2-qa/task2-review/fix-build
node --test .cache/tuglab2-qa/task2-review/fix-physics.test.cjs .cache/tuglab2-qa/task2-review/fix-session.test.cjs
tsc -p client/tsconfig.tuglab2-test.json --noEmit
node .cache/tuglab2-qa/task2-review/fix-probes.cjs
```

Свежая изолированная компиляция PASS; **66/66 тестов PASS**, ошибок/пропусков0; typecheck PASS. Тестовые копии ссылаются только на свежую изолированную сборку. Независимые scoped пробы R1–R5 PASS. Reviewed-файлы сверены с frozen SHA; physics solver и старые TugLab/U2TagLab production-файлы между базой и исправлением не менялись. Две новые строки createTrain канонизируют только производные радиусы A/B на уже клонированной конфигурации.

Evidence: `.cache/tuglab2-qa/task2-review/fix-tests.log`, `fix-probes.cjs`, `fix-probes.log`. Первичный CHANGES_REQUESTED сохранён отдельно как история найденных дефектов; этот отчёт является итогом повторной проверки исправления. Reviewer не изменял production, Git, DB/Beads или внешние системы. Прототип UI, полная матрица, эффективность ассистента AC23, Android и публикация этим вердиктом не квалифицируются.
