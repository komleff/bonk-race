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
