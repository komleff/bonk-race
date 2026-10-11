# Независимая QA первого coast-прототипа TugLab-2

**Статус: FAIL по одной подтверждённой проблеме AB reconnect.** Сам поезд управляется на desktop и в tablet touch-эмуляции. Это проверка первого играбельного этапа на накате, без ассистента и без заявления full AC-13/Android.

Дата: 2026-10-11; окно QA ~15:24–15:30 UTC. Проверен WIP frontend PM поверх frozen core `d82e9d3`. Продуктовые файлы, зависимости, Beads и git/PR агент QA не менял.

## Подтверждённый дефект

**CQA-01, существенный для кнопки повторной сцепки:** после открытия на стартовой паузе нажать `AB: расцепить`, затем `AB: сцепить`. AB остаётся OFF; появляется «Крепления вне диапазона захвата от 2 м до LAB-предела модуля». Время остаётся 0, BC сохраняется. Повторяется и на dev `http://192.168.68.65:5176/tuglab2.html`, и на настоящей общей built странице `http://192.168.68.65:5177/tuglab2/`.

Чистый probe существующего compiled core устанавливает причину: стартовая дистанция AB `360.00000000000006`, `captureMaxLength=360`; `setTrainConnection` строго проверяет `distance > captureMaxLength`. BC имеет дистанцию ровно `360`, её начальный reconnect проходит. Таким образом, начальная штатная сцепка AB после расцепки не может быть восстановлена из-за округления на границе допуска. QA продукт не исправлял.

Evidence: `reconnect-probe.json` (четыре пробы dev/built × AB/BC), `reconnect-core.json`, четыре `{dev,built}-{AB,BC}-reconnect.png`. Все пути evidence ниже относительно `.cache/tuglab2-qa/coast-independent/`.

## Что прошло независимо

| Проверка | Результат | Evidence |
|---|---|---|
| Существующий `tests/tuglab2/coast-browser.cjs` на built URL | exit 0; speedA>1 после настоящего Start/KeyD, HUD A/B/C/AB/BC, время, расцепка AB при сохранении BC, Restart→pause/time0; ошибок страницы нет | `existing-built.log` |
| Независимые dev и built desktop 1280×800 | PASS: исходная пауза/time0, реальные кнопки Start/Pause/Restart/FA/zoom/fit, обе независимые расцепки с сохранением другой связи, Restart восстанавливает обе | `report.json`, `independent.log`, desktop PNG |
| Направление KeyD сразу после кнопки Start | PASS dev/built: speedA>1, увеличивается экранная разность x(A)−x(C). Читаются только реальные canvas draw transforms; физика не модифицируется | `report.json`, `*-piloted.png` |
| Реальная мышь вправо | PASS built: x(A)−x(C) 1097.20→1098.58; speedA 2.15 м/с. Отдельные mouse проверки dev/built также speedA>1 | `brake-mouse.json`, `report.json` |
| Tablet 800×1280, CDP touch pilot вправо | PASS: speedA>1, увеличивается x(A)−x(C), виден joystick hold. CDP touchCancel приводит к паузе и принятые часы остаются неизменными | `report.json`, `built-tablet-touch-held.png`, `built-tablet-piloted.png` |
| Window blur при удержанном pilot | PASS на dev/built desktop и built tablet: появляется Start, принятые часы останавливаются | `report.json` |
| Реальная кнопка Brake A | PASS desktop mouse hold/up: speedA 2.15→0.22 за ~300ms; tablet touch hold/cancel: 16.28→5.05, cancel также ставит на паузу | `brake-mouse.json`, `brake-{desktop,tablet}.png` |
| Console/page errors | `errors: []` в полном независимом pilot runner | `report.json` |

Независимый runner имеет 15 успешных блоков поверх отдельных reconnect probes. Его `report.json status:PASS` относится только к перечисленным блокам; общий итог этого отчёта FAIL из-за CQA-01. Существующий coast harness не проверяет reconnect, поэтому его зелёный результат дефект не опровергает.

## Читаемость и ограничения мобильного прототипа

Просмотрены реальные `built-desktop-initial.png` 1280×800 и `built-tablet-initial.png` 800×1280. Заголовки, A/B/C, обе связи, HUD и тормоз читаемы; горизонтального overflow нет. На 800px header переносится на две строки, но заканчивается до canvas. Поезд полностью виден в исходном fit.

- У zoom `+`/`−` ширина **37.8px**, высота 44px: touch цели уже желательных 44px по ширине. Это конкретный refinement для полного UI Task3.
- HUD показывает скорости/массы/длину/силу связи, но не direction/команды двигателей; направленность проверялась render-only инструментированием canvas. Нет UI индикации активного тормоза.
- UI этого coast-этапа не даёт настройки состава/профилей/масс, записи/replay/share/comparison и ассистента. Это граница прототипа, не результат их тестирования.
- Проверены только эти два размера; телефонные узкие viewport, rotation/resize, native touch menu и настоящий Android-сеанс не заявляются. Tablet CDP эмуляция не закрывает Android task.
- Blur/cancel проверяют паузу и остановку принятых часов; полноценную квалификацию всех источников ввода/OS потери capture в AC-13 это не заменяет.

## Воспроизведение и время

Node20 `/tmp/bonk-tuglab2-tools/node-v20.20.2-darwin-arm64/bin`, cached Playwright `/Users/komleff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`, Chrome `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, headless. Native Chrome окна не управлялись.

Существующий harness запускается с `TUGLAB2_URL=http://192.168.68.65:5177/tuglab2/` и заданными `PLAYWRIGHT_MODULE/CHROME_PATH`. Scratch `independent.cjs`, `reconnect-probe.cjs`, `brake-mouse.cjs` сохранены для воспроизведения. Продуктовых зависимостей не добавлено. Полный успешный независимый pilot runner занял9.33s; log windows/UTC timestamps — `timing.json`. 16 PNG сохранены. Длительных sleeps не было; короткие900/300/250ms — окна настоящего ввода и проверки остановки времени.

Передача PM: вернуть CQA-01 разработчику; после исправления повторить initial AB/BC reconnect на dev и обновлённом built артефакте. Успешные pilot проверки не дают оснований объявлять полный TugLab-2/ассистент или реальный Android завершёнными.

## Scoped повтор после core fix `4172997` — 15:34 UTC

**Последний итог: PASS для CQA-01.** Исходный FAIL выше сохранён как найденный дефект; повтор выполнен независимо на обновлённых dev5176 и общем built5177. На исходной паузе отдельно расцеплены и повторно захвачены AB и BC — четыре пробы dev/built × AB/BC. После каждого захвата обе кнопки показывают «расцепить», HUD обеих связей `360.0 / 360.0 м · 0 Н`, сообщения диапазона нет; пауза/time0 сохраняются. Продукт QA не менял. Успешные pilot проверки не повторялись.

Доказательства последнего прогона: `reconnect-after4172997.log`, `reconnect-after4172997.json`, четыре `{dev,built}-{AB,BC}-reconnect-after4172997.png`. Повтор использовал тот же `reconnect-probe.cjs`, поэтому его обычные JSON/PNG выходы также теперь отражают последний прогон. Исходный FAIL остаётся в наблюдениях этого отчёта, `failure.txt` и `reconnect-core.json`; первоначальные screenshot filenames обновлены последним повтором. Это не новый Android/полный UI PASS; отмеченные выше мобильные ограничения остаются.
