# Поезд ABC в существующем U2TagLab — адаптер полёта

12 октября 2026. Worktree `bonk-race-tuglab2`, ветка `feat/u2-tuglab2`. Отдельная страница не используется; этот отчёт относится к физике/состоянию существующей оболочки, не к результатам браузерной приёмки.

## Изменения

- `client/src/lab/LabTrain.ts`: вертикальный безопасный старт на неизменённой seeded-карте; проверка всех корпусов, границ, статических и подвижных препятствий, обеих стартовых пружин. Единственный общий `advanceTrain` обрабатывает A/B/C и весь мир. A получает прежний space engine/FA, C — ограниченную причинную команду ассистента; поля действуют на все тела. Двигатели B выключены.
- `client/src/lab/BonkLab.ts`: явный opt-in AB/ABC; обычный AB сохраняет `advanceSpaceWorld`. Встроены Start/Pause/Continue/Step/Restart, нулевые команды/удержания при паузе и фокусе, независимая OR-команда заднего тормоза, атомарная перестройка профилей и мира на паузе. ABC завершает маршрут после пересечения центрами всех трёх корпусов существующей линии финиша; карта и линия не передвигаются.
- `client/src/lab/labTypes.ts`: отдельный глубоко клонируемый `train` snapshot с B/C, обеими сцепками, диагностикой, настройками, командами и средними фактически принятыми силами двигателей. `towing` остаётся прежним AB snapshot. В ABC snapshot мира также глубоко копирует поля.
- `client/src/u2taglab/trainShare.ts`: отдельный `#u2train=` / `u2taglab-abc-springs-v1`; исходная strict AB-схема вложена как рецепт карты. Сохраняются независимые профили, пружины, настройки ассистента и FA; текущая траектория/история не маскируются под новую стартовую запись. Полная проверка и безопасная сборка предшествуют commit состояния. UTF-8 budget 64 000 байт. Старые `#u2tag` схемы и декодер не изменены.
- `tests/tuglab/u2taglab-train.test.cjs`: 24 адресных интеграционных и характеристических проверки.

`LabTrain` не импортирует `TrainSession`, recording или экспериментальную telemetry/outcome-политику. Игровой loop не имеет лимита журнала 32 MiB, stop-hold, тормозного timeout 60 с или предела длительности; причинная история хранит только необходимое окно около 2 с. Численные отказы и прежние паузы при потере фокуса/большом интервале кадра сохраняются.

## Контракт и адресные уточнения

`BonkLab`: `towingComposition`, `setTowingComposition`, `get/setTrainConfig`, `get/setTrainSettings`, `selectTrainSize`, `setTrainConnection`, `setTrainRearBrake`, `export/applyTrainShareSnapshot`. Структурные изменения корпусов/пружин/мира принимаются только на паузе и создают новый старт на текущем маршруте; отказ не изменяет принятую физику. `getTrainConfig` возвращает копию; переданный config.world не подменяет исходную карту.

Ассистент — отдельное живое управление: `setTrainSettings` атомарно меняет настройки в существующем экземпляре, сохраняя тела, world clock и причинную историю. Явный mode, включая повторный выбор того же режима, снимает detach latch; g/delay не снимают. Coast/g=0 немедленно обнуляют команду C. Наблюдения добавляются только после принятого общего тика, не после rejected retry. Последние engine means обозначают силы принятого шага, а не прогноз новых настроек.

При AB→ABC наследуются текущие A/B, k/c, длина и допустимая длина захвата AB. Отдельный RED воспроизвёл length720 → default cap360 → отказ reconnect; cap теперь сохраняет исходные configured720. Измеренное l0, положения и скорости захват не подменяет. BC независима; solver budgets и tolerances не менялись.

Reset Params возвращает согласованные дефолты физики/окружения и M–L–M, сохраняет текущий seed и прежнюю семантику density5. Whole-config restitution синхронизируется с отображаемым параметром/Share-рецептом; несогласованный скрытый restitution в ссылке отвергается.

## RED → GREEN и свежие gates

Первоначальные десять новых сценариев — RED отсутствующие composition/adapter/Share API. Два дополнительных RED подтвердили отсутствие dispatch A/world-параметров. Последующие отдельные RED проверили живые настройки без teleport/time-reset; наследуемый capture720; невозможность экспортировать ABC как AB; pause/clear на финише; изменяемую alias-ссылку полей мира; UTF-8 budget; согласованность Reset Params и restitution. Контрольные проверки существующего поведения выполнялись как характеристические GREEN.

Свежие результаты перед передачей:

- `tsc -p client/tsconfig.tuglab-test.json`: PASS.
- `node --test tests/tuglab/u2taglab-train.test.cjs`: 24/24 PASS, failures0.
- Эти 24 + `u2taglab-lifecycle.test.cjs`, `u2taglab-share.test.cjs`, `u2taglab-rigid-runtime.test.cjs`: 70/70 PASS, failures0.
- `tsc -p client/tsconfig.json --noEmit`: PASS.
- `tsc -p client/tsconfig.tuglab2-core-test.json` и прежние `tests/tuglab2/physics.test.cjs`: 31/31 PASS.
- `git diff --check` собственных изменённых tracked-файлов: PASS.

В meaningful AB-control scenario результаты всех A/B/coupling/world равны прямому вызову прежнего `advanceSpaceWorld` с реальным вводом и полями. Проверены 62 с непрерывно принятых тормозных шагов без экспериментальной остановки; delayed C до накопления принятой истории; реальные контакты A/B/C со станцией и движение астероида; атомарный отказ чрезмерной внешней силы без тела/мира/engine/history leakage; масса B=10×XL A (64 192 000 кг) без clamp10⁷.

## Ограничения проверки

Полный управляемый полёт по всем 18 км, UI/Android и сборки страниц этим разработчиком не проверялись; они принадлежат PM/UI/QA. Generated dist-pages не изменялся. Нового игрового журнала нет; существующие offline session/recording/core-модули сохранены отдельно. Конкретный невозможный старт отклоняется, а не исправляется удалением препятствий или расширением мира. Контакты остаются существующими кругами/границами SpaceWorld; новые формы препятствий не добавлены. Core/assistant исходники, solver budgets и физические tolerances не изменены.

## Security S1 / Beads.9: бюджет живого solver

Адресный Security repro принимал `substeps=solverIterations=maxAdaptiveSubsteps=4096` через `#u2train`; первый шаг на density25 не завершался за 6 с. Общая ранняя проверка в `createVerticalTrain` теперь требует положительные целые: substeps≤128, solverIterations≤128, maxAdaptiveSubsteps≤4096, maxContactEvents≤4096, substeps≤maxAdaptiveSubsteps. Проверка предшествует клонированию/поиску старта; constructor, paused setTrainConfig и validate/decode/apply Share проходят через неё. Отказ не clamp-ит вход и не изменяет принятую карту, параметры или тела.

Потолки численных размерностей совпадают с существующим offline boundedConfig, но его recording/object-политики не импортируются. Начальная работа ограничена 128×128 вместо 4096×4096; адаптивные подшаги и contact events сохраняют конечные прежние потолки4096. Штатные substeps4 / maxAdaptiveSubsteps512 / solverIterations16, все tolerances и сам core solver остаются неизменными. Это ограничение численных входов, не обещание срока выполнения кадра: новых таймеров, workers или политики автоматической остановки полёта нет.

RED: два новых теста дали Missing expected exception для worst4096 и substeps129; контрольный dense-world tick был GREEN. После минимального classfix — 27/27 PASS (исходные24 и новые3). Проверены каждый потолок+1, ноль/отрицательные/дробные/NaN/Infinity, совместные включительные границы, несогласованные substeps/adaptive, неизменность входного config и facade после отказа. Исходный Security child запущен без изменения frozen evidence: отдельная копия меняет только require-путь на свежий test build. Normal: accepted, advance=true (38.3 мс); worst: decoder отклоняет, child exit1 за50.3 мс, timeout не наступает. Эти измерения относятся к данной машине и данному запуску.

Свежие gates: test tsc и frontend tsc --noEmit PASS; npm test PASS (exit0); адаптер27 + прежние lifecycle/Share/rigid runtime — 73/73 PASS, failures0; git diff --check собственных трёх paths PASS. Браузер, Android и полный18км маршрут в рамках этого исправления не проверялись; generated dist и остальные владельческие файлы не менялись.
