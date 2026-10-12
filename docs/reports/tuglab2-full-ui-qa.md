# TugLab-2 — независимая Full UI / common Pages QA

**PASS в проверенном объёме.** Проверен реальный общий `client/dist-pages` с четырьмя приложениями в обычном static HTTP mount: корень и произвольная подпапка `/arbitrary/deep/site/`. `/bonk-race/assets` alias не добавлялся. Full UI, собственные import/lifecycle probes и все14 legacy browser suite запусков прошли. Продуктовые дефекты не подтверждены; hard failures и повторов для получения зелёного результата в этой серии не было.

Время: 2026-10-11 17:11–17:17 UTC / 2026-10-12 00:11–00:17 Asia/Novosibirsk.

## Точное дерево и среда

- Frozen UI product SHA, заданный PM и подтверждённый реальным JSON download: `1564ba1550a408fda74c9c56c426cb18b899ebee`.
- **Есть pending packaging patch вне этого SHA:** root `package.json build:pages` передаёт BonkLab `--base=./`. Поэтому проверенный общий артефакт — SHA1564 + pending package command, а не чистый неизменённый commit1564. Старые исходники BonkLab не переписаны. Его общий HTML действительно загружает `./assets/lab-C9Txl8ia.js`; source stamp новой TugLab-2/worker и exported recording —1564.
- PM передал freshly completed `npm run build:pages exit0`, log `/tmp/bonk-tuglab2-tools/ui-freeze-pages.log`. Я проверял полученный исполняемый артефакт, собственную сборку/TSX typecheck не приписываю себе. SHA256/размеры **всех** common файлов: `common-artifact-manifest.json`.
- Node20.20.2 `/tmp/bonk-tuglab2-tools/node-v20.20.2-darwin-arm64/bin`; existing cached Playwright `/Users/komleff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`; установленный Google Chrome `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, headless.
- QA выполнена текущим независимым Codex агентом и реальными browser инструментами. Внешние model/API не вызывались; отдельные Opus/Gemini вердикты не имитируются и их availability этим отчётом не проверялась.
- Product/DB/git/dependencies не менялись. Только ignored scratch scripts/evidence и этот отчёт. Native Chrome окна пользователя не управлялись. Реальный Android отсутствует; touch ниже — native browser CDP input в эмуляции viewport.

Все evidence paths далее относительно `.cache/tuglab2-qa/full-ui-independent/`.

## Ordinary common artifact mount

Scratch `server.cjs` раздаёт один filesystem root `client/dist-pages`. Для `/arbitrary/deep/site/` он только снимает этот произвольный prefix; прочие пути обычного root mount. MIME корректен для JS/CSS/JSON/HTML. Подстановка отсутствующих assets, special `/bonk-race` rewrite, Vite/backend и mock physics не используются.

Проверены eight boots (fourapps×root/nested): BonkLab в корне, `/tuglab/`, `/u2taglab/`, `/tuglab2/`. У каждой все HTTP request paths остаются внутри соответствующего mount prefix, нет404 и pageerror. Восемь screenshot `root/nested-{bonklab,tuglab,u2taglab,tuglab2}-boot.png` и реальные request URLs сохранены в `own-report.json`.

## Full UI — существующий author runner, независимо исполненный

`tests/tuglab2/qa-browser.cjs` запускался дважды, на **actual common** root и nested TugLab-2. Scratch `author-root.cjs` / `author-nested.cjs` меняют только evidence destination и filesystem require для существующего compiled session fixture; external URL задаётся штатным env. Test assertions/последовательность не ослаблялись. Внутренний server исходного harness с известным `/bonk-race` маршрутом не использовался.

Оба запуска exit0, JSON в `root/report.json` и `nested/report.json`, errors[] у всех6 блоков каждого запуска:

- Step=dt; Start→реальныйKeyD speed>1; Pause/Restart/независимые параметрыA/C иAB/BC; sevenmass buttons вплотьдоXL1000%; singleбезC/BC;120Hz; запрет структурных изменений в полёте.
- Invalid/foreign/oversize import сохраняют текущий опыт; настоящий JSON download→file chooser→worker import/replay. По каждому accepted tick exactcommandsC/contacts и финальные bodies совпадают; compare4variants повторяет тот же accepted input prefixA.
- CSV engine/external SI columns, actual PNG download, share freshpaused/reopenstale/reloadpassage, камера/устойчивый zoom.
- Большой JSON **2,858,098 bytes /1000ticks**: cancel сохраняет исходный кадр, повторный импорт завершается. Heartbeat maxgap159.7ms(root)/155.6ms(nested), меньше штатного gate1500ms. Evidence `root/nested/large-import.json`.
- Lifecycle pointercancel/unexpectedlostcapture, normalrelease без falsepause, blur/visibility/orientation, Spaceautorepeat.
- **Все5 viewports на каждом mount:**1280×800,820×1180,1180×820,390×844,844×390. Layout: overlapfalse, smalltargets[], overflowfalse; canvasheight440/420/440/300/270px. Все buttons ≥44×44.
- Настоящий CDP двухпальцевый pilot+rear на всех5: второй палец не гасит pilot; отпускание rear оставляет pilot; touchCancel ставит паузу иinput0. Вlandscape страница прокручивается так, чтобы canvas иrearbutton одновременно помещались.

Полные логи: `author-root.log`, `author-nested.log`. Время~12.7/~11.8s.

## Дополнительные собственные meaningful probes

`own.cjs` не читает/меняет physics state; работает через UI/file/download и публичные HUD attributes. Результат `own-report.json`: PASS,16 blocks (8boots +8 дополнительных pairedroot/nested).

1. **BonkLab** на каждом mount: живой configuredboot, oldmovementpreset, Restart/countdown, настоящий mousepress/release очищаетMagnitude. Относительные assets сами разрешаются в arbitrarysubdir.
2. Два wellformed, но semantically invalid импорта на каждом mount: `commandC.forward=1` и initialBmass×2 при прежнем configuredprofile. Worker отклоняет; time и **полный HUDtext** исходного2tick опыта неизменны, Start остаётся enabled.
3. После этих importerrors проверены реальные продолжающие работать listeners: freshKeyD даёт input; blur clearsheldkey иpause; Resume+автоповтор того же удержания inputне восстанавливает; release+freshphysicalpress возвращает input. Это независимая проверка ранее рискованной DOM/listener границы после ошибки.
4. Validsamebuild import/replay: sourceSHA1564 проверен из настоящего download. Replaypreview не разрешает Start/Step; Restart возвращает time0 и управляемыйinitialsession. ОбеAB/BC отдельно detach→recapture послеRestart проходят, другая связь сохраняется.

Evidence: `own.log`, `root/nested-own-record.json`, `root/nested-own-lifecycle.png`. Время~12s; errors[]/HTTPfailures[].

## Старые приложения — существующие suites на actual common tree

Scratch `legacy.cjs` последовательными запусками подставляет только реальные root/nestedU2/TugURL и evidence dirs. Используются неизменённые existingtests. Все14 subprocess exit0; `legacy-results.json` содержит actual durations, `legacy.log` — итог; каждый каталог имеет `browser.log`.

| Suite | root | arbitrarynested | Coverage |
|---|---|---|---|
|u2taglab-ui.cjs|PASS|PASS|15 верхнеуровневыхchecks:HUD/radar/input/FA/brake/layout/settings/share/schema/Start/reconnect|
|u2taglab-sizes-browser.cjs|PASS|PASS|5checks:catalogsizes/mass/geometry/profiles|
|u2taglab-rigid-browser.cjs|PASS|PASS|6checks:rigid/frontrear/capture/runtime/share|
|share-stale-browser.cjs|PASS|PASS|11checks:exactuserS/L180,Reset/edit→sameURL,schemas4front/rear,oldTuglink|
|ui-smoke.cjs (TugLab)|PASS|PASS|pause/step/restart/capture/keyboard/focus/numeric/map/mouse/touch/blur/layout/noAPI|
|ui-share.cjs (TugLab)|PASS|PASS|actualsender/receiverparams/arena/orbs/bodies,clipboardfallback/success,sharedstart,Step/recovery,4viewports|
|ui-lifecycle.cjs (TugLab)|PASS|PASS|death/respawn/Go clearinput,autorepeat cannotrestore,freshpressworks|

U2root/nested —74 верхнеуровневых checks, errors[]; весь legacylogwindow~134s. Ранее baseline concurrent lifecycletimeout не повторился: здесь оба запуска последовательны иexit0. Это не regression test штатной сетевойBonkRace/server; только четыре standalone common apps согласно scope.

## Visual review и phone390 расследование

Просмотрены все5 actual nested fullPagePNG. Desktop/tablet/landscape показывают train/hulls/labels/controls/HUD без перекрытия панели; узкий экран использует длинную вертикальную страницу, graphs/table прокручиваются горизонтально внутри контейнеров. Правая settingspanel на узкихwidth располагается нижеmain; доступ кg/mode требует прокрутки, но canvas иbrakes не перекрыты.

В initial inspection `nested/390x844.png` (длинныйfullPagecapture) train выглядел чрезмерно мелким. **Не объявлен productdefect по одномуPNG.** Независимый `phone-visual.cjs` открыл свежий390×844viewport и сделал normalviewport captures:

- `phone390-viewport.png`:camera.2949px/m; A/Cwidth17.69px,B35.38px, центрыx315.15/187/58.85. A/B/C иAB/BC разнесены, читаемы.
- `phone390-afterfullpage-viewport.png`:послеfullpage capture viewport остаётся корректным, actualcanvas geometry374×300 иdrawpositions сохраняются.
- `phone390-zoomA-viewport.png`:followA+twozoom даёт.4246px/m,Awidth25.48px; B/C могут выйти клевомукраю, где показаныoffscreenmarkers. Wholetrainfit остаётся способом видеть состав полностью.

`phone390-visual.json` сохраняет render-only geometry/drawtransforms; физика не менялась. Поэтому initialfullPage mini-render не трактуется как runtime UXfail/краш. Normalviewport phone изображение корректно. Не делается обещания читаемости всех hull деталей наwholetrainfit390; zoom/camera иHUD дают детали.

## Граница PASS и передача

- Статическая упаковка fourapps/root/arbitraryprefix, FullUI, import/replay/compare controls, desktop иCDPtouch lifecycle прошли.
- Проверенный артефакт содержит pendingrootpackagepatch `--base=./`; после окончательного commit/rebuild PM сохраняет новый artifactidentity и при необходимости повторяет packaging scope. Не выдавать эту сборку за чистый1564 tree.
- НетAC23 effectiveness assertion, запуска466physicalmatrix, realAndroid, публикации/deploy илиrelease qualification. Androidtask остаётсяOPEN.
- ActualPNG count128; artifactmanifest, source downloads, JSONs иtiming.json сохранены. NativeChrome/DB/git/productdependencies не тронуты. StaticQAserver после проверки остановлен.
