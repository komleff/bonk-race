# TugLab 0.1.1 — первая часть

Beads `bonk-race-554`, [PR38](https://github.com/komleff/bonk-race/pull/38). Исходники остаются в bonk-race, существующем worktree и пайплайне. Реализованы компактные действия, сворачиваемые настройки, длина до100 м, ближайшие крепления и статическая ссылка на одинаковый начальный заезд. На390×844 toolbar238→52 px, canvas582→766 px. Step — один тик1/60 с на паузе после явного запуска.

Код `5385dad` и исправления `2b8fb9b`. Итог:205/205 TugLab PASS, типизация и client/lab/tug builds PASS. Исходный общий npm test/build и check-version PASS; затронутые gates повторены после исправлений. Эмуляция360/390/412 px и844×390, numeric8сценариев, mouse/touch/keyboard, корень/`/bonk-race/tuglab/`/stock PASS. Сравнивались фактические арены, орбы, параметры и начальные тела независимых страниц; при импорте таймер0 до Start.

Единственное независимое полное [review](https://github.com/komleff/bonk-race/pull/38#issuecomment-5966672790) выявило три Important. Все исправлены одним циклом с RED/green и [scoped APPROVED](https://github.com/komleff/bonk-race/pull/38#issuecomment-5966788999):

- Начальные массы орбов согласованы после mass/radius-only изменения и Restart; проверены automatic/manual density без дополнительной генерации в fixture.
- Повторный повреждённый fragment после восстановления снова показывает сообщение и кнопку обычного заезда.
- Step до первого Start не меняет тела/орбы/таймер, в том числе после настроек; Step после начала countdown и обычной паузы сохранён.

CI продуктовой исходной ревизии5385dad PASS: [основной](https://github.com/komleff/bonk-race/actions/runs/37105359814), [Pages build](https://github.com/komleff/bonk-race/actions/runs/37105359817), [TugLab artifact](https://github.com/komleff/bonk-race/actions/runs/37105359815). Финальная ревизия проверяется в PR38 после push. Этот отчёт не объявляет релиз опубликованным; merge/deploy отдельно.

Физический Android, реальные системные Clipboard permissions и полноценный rollback не проверялись в этом патче. Существующие follow-up остаются открытыми. Бенчмарк и широкую физическую матрицу вручную повторно не запускали; новых гарантий производительности нет. Новые крепления — bonk-race-555.

Самопроверка PM по PM_ERR.md/DOC_PR.md: документы прочитаны из U2 только как справочные. Проверяемый результат — игровое поле и воспроизводимый заезд, не инфраструктура. Без новых репозиториев, процесса OverGate или изменений U2. Три содержательных дефекта закрыты на уровне причин одним fix cycle; повторное review ограничено исправлениями. Отчёты опубликованы в PR, статус задач синхронизирован, исходный пользовательский checkout/stash сохранён.

Браузерные PNG/JSON: `.cache/tuglab-qa/fix1-share-built/` и `.cache/tuglab-qa/fix1-static/`. Полные логи разработки и review сохраняются в `/tmp/bonk-tuglab-tools/tuglab-usability-share-20261003/` после очистки scratch данного плана.

## Уточнение скорости захвата — bonk-race-556

По замечанию пользователя фиксированный порог 2 м/с заменён минимумом текущих линейных лимитов тягача вперёд/назад/вбок; стандартно 180 м/с. Равенство разрешено, изменения настроек действуют сразу. Относительная скорость креплений по-прежнему учитывает вращение; положения и скорости тел при захвате сохраняются. При превышении сообщение показывает актуальный предел.

Код `24d6616`: 220/220 TugLab PASS, typecheck:tuglab/build:tuglab PASS. Browser 390×844: при лимитах160/90/130 захват80 м/с успешен,100 отклонён с пределом90; ошибок страницы0. Одно [scoped review](https://github.com/komleff/bonk-race/pull/38#issuecomment-5967341109): APPROVED, замечаний0. Документация и действующий план согласованы. Поправка входит в тот же открытый PR38; версии и пайплайн сохранены. Доказательства: `/tmp/bonk-tuglab-tools/capture-speed-feedback/`.

## Публикация 3 октября 2026

Оператор прямо одобрил публикацию/релиз. PR38 merged `151eb7e`; [Pages build/deploy](https://github.com/komleff/bonk-race/actions/runs/37112938677) и [TugLab QA на main](https://github.com/komleff/bonk-race/actions/runs/37112961989) SUCCESS. [Игра](https://komleff.github.io/bonk-race/tuglab/) показывает TugLab0.1.1/repo0.6.2/SHA151eb7e. Root BonkLab и собственные JS обеих оболочек HTTPS200; Chrome390×844: toolbar52/canvas766 px, capture80accepted/100reject при cap90 без изменения тел, share same snapshot/arena на независимой странице, таймер0 до Start и успешный Start, pageerror/requestfailed0. Это публичная проверка после deployment, не локальная сборка.

[GitHub Release v0.6.2](https://github.com/komleff/bonk-race/releases/tag/v0.6.2) опубликован с архивом main151eb7e и sha256. SOURCE_SHA и опубликованный JS совпали; скачанный release archive прошёл проверку SHA256 `cccf518d52719f7cae8d5fea43c6b7e3e390432c890b4d34e82001849c314a93`. Доказательства: `/tmp/bonk-tuglab-tools/release-v0.1.1/`. Beads557 закрыта. Существующий Docker failure (такой же на предыдущем main) зарегистрирован558: runtime npm ci не находит install-hooks.js; игровая Pages публикация и standalone PASS. Полный rollback/реальный Android остаются отдельными follow-up.
