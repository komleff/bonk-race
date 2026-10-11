# Поезд ABC в существующем U2TagLab — UI Developer report

12 октября 2026. Целевая поставка — существующая `/u2taglab/`, расширение обычной игровой оболочки. Отдельный dashboard не используется. Состав AB по умолчанию, прежние LabInput/мышь/WASD/touch joystick, FA, A brake и экранная опора A сохранены.

## Реализация

В текущем toolbar доступны переключатель AB/ABC (на паузе) и видимый live режим C: «Накат», «Страховка», «Помощь при торможении». C получает собственную удерживаемую кнопку тормоза; AB/BC сцепляются независимо. Отпускание C не снимает клавиатурный тормоз A или первый палец джойстика. Потеря указателя, фокуса и ориентации очищает удержания; пауза не оставляет команд. Никакого нового способа пилотирования A нет.

Настройки C, двух пружин и ассистента встроены в существующую панель. Structural изменения доступны на паузе; режим/g/delay ассистента доступны в полёте без сброса времени/карты. Невалидная длина сохраняет состояние и показывает ошибку. LAB capture cap модуля отделён от restLength; C speedLimit явно синхронизирует три capture tolerance, без clipping скорости.

Existing renderer рисует B/C, обе пружины, принятые средние engine wrench A/C и C в radar. Камера вмещает весь состав с прежней опорой A. HUD показывает текущую геометрию связей, команды и отдельно подписанные принятые средние двигателей; на низком экране сокращается, чтобы не закрывать FA. Share dispatch использует `#u2train=` для ABC и прежний `#u2tag=` для AB; импорт атомарно выполняет façade.

## Проверка и границы доказательства

Meaningful RED: прежний cold artifact не содержал selector «Состав». GREEN тест `tests/tuglab/u2taglab-train-browser.cjs` использует реальный Chrome, UI события и façade read-only snapshots; ручных physics steps нет. Статическая поставка проверяется с собственного root и assembled `client/dist-pages` под `/bonk-race/u2taglab/`.

Проверены W, поворот D, A Space+rear brake, фактическая retro/engine force C, независимое отпускание, live mode/g0, invalid BC length, обе независимые связи, Share roundtrip и AB↔ABC. На 1280×800, 820×1180, 1180×820, 390×844, 844×390 — bounds/44px targets, native CDP два пальца (pilot+rear), pointer cancel и orientation cleanup. Физический Android не проверен.

Отдельный чистый участок маршрута seed42/density5: 5 static obstacles,40 asteroids,10 fields. Весь состав прошёл первую station, t=23.45 с; A=(71.6792,6485.7293), C=(113.1289,7399.1413), station=(-482.3982,7498.0988). Минимальная surface clearance A=458.8 м, без контакта со станцией. Конец принятого состояния: solverSubsteps4/solverAttempts1; AB impulse226358.60, BC47837.66; reason отсутствует. Это доказывает адресный полёт мимо реального препятствия, не весь маршрут18км и не гарантии торможения ассистента.

Первый попытанный длинный участок остановился «Большой интервал кадра: нажмите Продолжить». ONE unchanged retry из чистого контекста выполнен без screenshots во время полёта и с редкими лёгкими снимками раз в2с; GREEN. Frame guard не менялся; точный первый frameDt не был записан. Причину первого wallclock gap нельзя доказательно приписать screenshot, повторного отказа в чистом запуске не было. Никакой остановки не скрывали.

Evidence: `.cache/u2taglab-train-qa/{root,nested}.json/png`, `*-manual-flight.json`, `manual-route.json`, `route-diagnostic.json`, `viewports.json`, five viewport PNG. Исходный маркер intermediate cold artifact — HEAD8388f75184f76c9030d4fb13c79cb126262f0c18 + uncommitted integration WIP; это не frozen product SHA. PM после commit выполнит финальную общую сборку и независимую приёмку.

Команды (Node20.20.2): `npm run build:u2taglab`; `node_modules/.bin/tsc -p client/tsconfig.json --noEmit`; `node tests/tuglab/u2taglab-train-browser.cjs`; адресный route той же командой с `U2TRAIN_LONG_ROUTE=1 U2TRAIN_ROUTE_ONLY=1`. Playwright и Chrome берутся из существующего runtime. Pure physics integration проверки принадлежат physics Developer и здесь не приписываются UI автору.

Итог собственных gates: cold `build:u2taglab` PASS, fullclient TSX PASS, focused root/common +5 native-touch viewport PASS (exit0), clean station route PASS (exit0), неизменённый `tests/tuglab/u2taglab-ui.cjs` PASS. Последний проверяет прежний AB mouse/touch/brake/FA, одну52px строку на360/390/412/844/1280, Share и параметры/impact. Его initial RED360px overflow исправлен сокращением только подписи селектора на маленьком экране; условия теста не менялись. Последняя UI правка затронула эту подпись, повторный AB тест выполнен после неё. Logs находятся в `.superpowers/sdd/2026-10-11-tuglab2/u2train-ui-{build,type,browser,route,legacy}.log`. Общие pure tests/3apps final build и independent review выполняет PM после freeze.
