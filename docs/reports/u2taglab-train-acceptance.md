# Поезд в текущем U2TagLab — приёмка интеграции

12 октября 2026. PR47, ветка `feat/u2-tuglab2`. По последнему прямому уточнению оператора поезд встроен в существующую `/u2taglab/`: прежнее пилотирование A, карта/seed/препятствия/поля, FA и тормоз сохранены; добавлены задний C, BC, независимые сцепки/тормоз и видимый режим помощи C. Состав AB остаётся обычным режимом; ABC выбирается на паузе. Отдельная страница, dashboard и её сборочная точка удалены.

## Наблюдавшаяся проверка

На замороженном продукте `44d2132fb6628eb993fdba227b1e6f8f49e15202` PM самостоятельно получил:

- `npm run test:tuglab`: 459/459 PASS; `npm run test:tuglab2`: 72/72 PASS.
- Общие `npm run build`, `npm test`, полный клиентский TSX typecheck, обе прежние numerical matrix, `check-version`, `git diff --check`: PASS.
- `build:pages`: ровно BonkLab + TugLab + U2TagLab. Прежние built browser suites TugLab/U2TagLab: PASS.
- Новый `qa:u2taglab:train`: настоящий root и общий nested mount `/bonk-race/u2taglab/`, пять экранов, native CDP два пальца, раздельные тормоза, живые настройки C, независимые связи, отказ неверной BC длины и Share roundtrip: PASS. Source label обоих mounts `44d2132`; page errors[]. После1.8с настоящего W: A−28.597м, B−8.161м, C−4.522м; фактическая retro C0.1375 при совместном тормозе. Доказательства `.cache/u2taglab-train-qa/pm-frozen/`.

Автор UI отдельно пролетел всем поездом мимо первой станции на seed42/density5 за23.45с, clearance A458.8м. Это intermediate WIP со stamp8388f75, а не доказательство финального SHA или всех18км. Первый route запуск попал в неизменённую паузу большого интервала кадра, один повтор без изменений прошёл; причина первого gap не доказана. Подробности и ограничения: [UI report](u2taglab-train-ui.md), [адаптер полёта](u2taglab-train-flight.md).

## Ревью и оставшиеся границы

Три независимых агента Codex дали APPROVED после scoped повторной проверки: Security на6383435 с релевантной байтовой сверкой до7f1d175; Architecture и CodeQuality на7f1d175. Старые approvals отдельной оболочки не используются. Исправлены два подтверждённых P2. `6383435ab5a17be4a8f58018d4da05b04fbb3a51` задаёт ранний live numeric budget (substeps/iterations≤128, adaptive/contact events≤4096); constructor/config/Share отклоняют превышение до создания кандидата без clamp. Default4/512/16 сохранён; Security child отвергает прежнюю зависающую ссылку за50мс, штатный dense25 tick принят. `7f1d17552816d720b3021453623cf76f2d27a620` при cancel/неожиданном lostcapture canvas ставит ABC на паузу и очищает C; ordinary release остаётся полётом. Авторы выполнили RED→GREEN и native probe. Свежий PM повтор pure gates на исправленном продукте: 462/462 и72/72 PASS. На исправленном7f1d175 PM повторил полный клиентский TSX, npmtest, build:pages и qa:u2taglab:train: root/common nested +5native-touch экранов PASS. Новые assertions проверяют sole-pilot cancel→pause/zeroC/frozenclock, ordinary sole release→running и реальную потерю implicitcapture. Evidence `.cache/u2taglab-train-qa/pm-fixed/`; page errors[]. Незакрытых подтверждённых P0/P1/P2 этих review нет. Отчёты доступны в `.superpowers/sdd/2026-10-11-tuglab2/final-{security,architecture,codequality}-u2taglab.md`; их краткий итог публикуется в PR. Общий GitHub CI9e816a9 SUCCESS; окончательный docs-only HEAD и его CI/архивы фиксируются в итоговом комментарии PR, чтобы не создавать самоссылку SHA в commit.

Интеграция `.7`, исправления `.9/.10` CLOSED. Расширенная квалификация `.4`, физический Android `.5` и калибровка ассистента `.8` остаются OPEN; parent учитывает их, а не неготовность ручного полёта. Предварительная offline матрица466 случаев сохранена отдельным честным отчётом [qualification](tuglab2-qualification.md), актуальный runner полностью не перезапускался. Все стандартные40/80м/с опыты достигли timeout; на40м/с улучшение угла сопровождалось ухудшением бокового ухода и пути. Это не гарантия безопасной остановки. Recording/replay/compare библиотеки сохранены как offline инструменты; нового обязательного журнала или отдельного dashboard в текущем полёте нет.

Merge, release и публичный deploy не выполняются. Опорный checkout, чужой dev-server5175 и stash сохранены. Поставка — feature PR и локальная сборка текущего U2TagLab.
