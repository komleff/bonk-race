# Независимая регрессия прежних стендов — 11 октября 2026

**Статус: PASS в проверенном объёме.** Продуктовые дефекты не подтверждены. Проверены реальные статические standalone-артефакты BonkLab, TugLab и U2TagLab в установленном Google Chrome через Playwright. Реальный Android, штатная сетевая BonkRace и новый TugLab-2 этой проверкой не квалифицированы.

## Среда и границы

- Worktree: `/Users/komleff/Documents/GitHub/bonk-race-tuglab2`, ветка `feat/u2-tuglab2` (задана PM).
- Node `20.20.2`: `/tmp/bonk-tuglab2-tools/node-v20.20.2-darwin-arm64/bin`.
- `PLAYWRIGHT_MODULE=/Users/komleff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
- Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, headless; размеры телефона/тач — эмуляция.
- Прочитаны AGENTS, роли, Memory Bank active/tech context и регрессионные требования ТЗ `docs/tz/spec_u2_tuglab2_v0.1.md` (AC-01, разделы 2 и 13).
- Сборки `client/dist-lab`, `client/dist-tuglab`, `client/dist-u2taglab` приготовил PM штатными командами. Я самостоятельно проверил исполняемые артефакты, а не повторял его npm test/build. Финальные SHA256 всех файлов: `.cache/tuglab2-qa/baseline/artifact-manifest.json`.
- Продуктовые файлы, зависимости, Beads, git/PR не изменялись. Дополнительные скрипты только в QA scratch.

## Проверки и результат

| Проверка | Результат | Доказательства |
|---|---|---|
| `node tests/tuglab/u2taglab-built-browser.cjs` | exit 0; root и `/bonk-race/u2taglab/`, 8 существующих запусков, 74 верхнеуровневых проверки, все `errors: []` | `u2-built.log`, `u2-built/{root,nested}/*/report.json` |
| U2TagLab UI/HUD/control/start/reconnect/share | PASS; 15 checks на каждом пути: FA, brake владельцы/hold/cancel/blur, preset/модули, Start/Step/Restart, reconnect, SI UI, share import и invalid recovery; отдельно sizes 5, rigid 6, stale share 11 на каждом пути | Включено в штатный built harness; 84 U2 PNG |
| Старые ссылки U2 и TugLab | PASS; schema1/2/3/4, точная S/L180, Reset/edit→повтор той же ссылки, неизменные Restart/pause/reload, старый TugLab→same snapshot | `u2-built/*/share-stale-browser/report.json` и UI report |
| `node tests/tuglab/ui-smoke.cjs` против `/tuglab/` static | exit 0; pause/step/restart/capture, W, focus очистка, numeric/map, mouse/touch/blur/layout, отсутствие API | `tug-smoke.log`, `tuglab-desktop-1024.png` |
| `node tests/tuglab/ui-share.cjs` против `/tuglab/` static | exit 0; реальные sender/receiver состояния, старт shared paused, Step, clipboard fallback/success, recovery, viewport 360/390/412/844 | `tug-share.log`, `tug-share/ui-share-report.json`, 9 PNG |
| `node tests/tuglab/ui-lifecycle.cjs` против `/tuglab/` static | повторный запуск exit 0; death/respawn очищают ввод, старый autorepeat не возвращает тягу, после Go `input=0, vy=0, paused=false`, новый press работает | `tug-lifecycle-alone.log` |
| BonkLab static `/bonk-race/` | exit 0; configured base, HTTP/JS без ошибок, отсутствие towing, старый movement preset, Restart/countdown, реальный mouse press/release | `bonklab-report.json`, `bonklab.log`, `bonklab-desktop.png`, scratch `bonklab-smoke.cjs` |

Все пути доказательств в таблице относительно `.cache/tuglab2-qa/baseline/`. Существующие тестовые блоки/assertions не расширялись и не менялись. BonkLab краткий scratch понадобился потому, что TugLab harness ожидают towing, которого у BonkLab нет. Вручную просмотрены PNG BonkLab, TugLab desktop и U2 landscape: страницы реально отрисованы с ожидаемыми элементами.

## Неудачные попытки и ограничения

1. Первый U2 запуск остановился до браузера: default `/tmp/bonk-tuglab-ui/node_modules/playwright` содержит остатки каталогов без entry point. Рабочий существующий cached Playwright указан через штатный env; повторный полный harness exit 0. Продуктовые зависимости не добавлялись.
2. Первый TugLab lifecycle запуск совместно с другими Chrome suite получил timeout 30000ms в `ui-lifecycle.cjs:34`, ожидая завершения death/respawn. `tug-lifecycle.log` сохранён. После завершения тяжёлого U2 harness тот же неизменённый тест прошёл за ~5.4s. Причина первого timeout не доказана; обозначен как неповторившийся QA timeout, а не устранённый продуктовый дефект.
3. Первоначальный BonkLab scratch ошибочно ожидал W; `LabInput` явно включает клавиатуру только для towing. QA expectation исправлено на штатное mouse управление; продукт не менялся. Конечный `bonklab-report.json` PASS, screenshot сохранён.
4. Проверена доступность/работоспособность старых built страниц и контрактов управления/ссылок. Новый общий Pages-артефакт, публикация, физический телефон и сетевая BonkRace требуют отдельных проверок PM; этот отчёт их не заменяет.

## Время

Окно QA ~15:11–15:16 UTC (22:11–22:16 Asia/Novosibirsk). Штатный U2 built harness ~123s после исправления module env (окно log включая первую попытку ~130s); TugLab smoke ~4.7s, share ~7.4s, lifecycle первый timeout ~34.8s, повтор ~5.4s. BonkLab конечный browser duration записан в `bonklab-report.json`; общая log window включает QA correction. Времена создания/последней записи логов и приближённые интервалы сохранены в `timing.json`. Длительных sleeps не было.

Передача PM: принять этот ограниченный PASS как независимую регрессию старых standalone приложений; сохранить initial lifecycle timeout в evidence. При повторении lifecycle timeout исследовать его отдельно, не менять assertions ради зелёного результата.
