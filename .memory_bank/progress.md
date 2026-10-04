## U2TagLab0.2.0 опубликован — BonkRacev0.6.4 (4 октября 2026)

Оператор одобрил выпуск. PR44 слит; annotated tag v0.6.4 и GitHub Release опубликованы на SOURCE_SHA058fcc0e6d09673a4b1e0eaec8fede8b7bf488f9. Публичная игра: https://komleff.github.io/bonk-race/u2taglab/. Доступны жёсткая COM-сцепка front/rear, nearest4 свободный захват, исправленная повторная ссылка и компактная масса кг/т/кт/Мт. BonkLab и TugLab0.1.1 сохранены.

Свежие435/435, npm test/check-version PASS; release metadata Quality APPROVED. PR packaging37200789859 и Pages build/deploy37201164371 SUCCESS. Merge tree побайтно совпадает с tested release head dd31d1f; отдельные stamped архивы построены на058fcc0, built14 root/nested PASS. Live Chrome390 подтвердил три HTTP200/режимы/stamp058fcc0/BONK0.6.4, U2v0.2.0, rendered401т, rigidfront/rear tangent+exactShare, userS/L180 Reset→sameURL;7 checks/errors[]. Два ранних live запуска получили ERR_SOCKET_NOT_CONNECTED до приложения получателя; повтор с HTTP/1.1 полностью прошёл. HTTPS verification не отключалась; публичный JS побайтно совпал с локальной release сборкой. Физический телефон не заявляется.

Четыре release assets опубликованы; SOURCE_SHA обоих архивов, скачанные байты, SHA256-файлы и API digest сверены. Тег immutable058fcc0. Подробный итог: docs/reports/u2taglab-v0.2.0-release.md; человеческое описание: docs/releases/v0.6.4-release-notes.md. Task585 закрыт по фактическому выпуску.

Отдельный Publish Docker Containers37201164381 повторил известный558: отсутствует /app/scripts/install-hooks.js при runtime npm ci. Pages/standalone archives от него не зависят; отказ записан в558 и не выдаётся за зелёный общийCI. Governor572/passiveB571/прямоугольники и следующие физические этапы остаются отдельными задачами. Исходный checkout/U2/stash сохранены, прямого push main не было.

## Выпуск BonkRace0.6.4 / U2TagLab0.2.0 — Task585 (4 октября 2026)

Оператор явно одобрил релиз PR44. Подготовлены синхронизация версий и release notes с жёсткой сцепкой front/rear, повторными ссылками и единицами массы. Gameplay после принятого c596fcf не меняется; QA584 прошёл CI37199893441. Проверки нового release HEAD, merge/tag/Pages/GitHub Release выполняются PM. До подтверждения live выпуск не объявляется завершённым. Исходный checkout/stash/U2 сохраняются.

## Task584 — независимый legacy endpoint built QA

CI PR44 выявил зависимость stale-share test от глобального TUGLAB_URL5194, чей сервер запускается позже. RED ERR_CONNECTION_REFUSED подтверждён локально. Существующий built harness теперь сам раздаёт dist-tuglab под /legacy-tuglab/ и передаёт явный ephemeral TUGLAB_URL дочерним тестам. Product/workflow/assertions прежние. С внешним недоступным5194 root/nested UI15/HUD151, sizes5, rigid6, stale11 (включая oldTug link) PASS/errors[]; node --check PASS. Передача commit/CI у PM; Beads не закрыт.

## Текущий патч — Task555/582/583 готов к локальной приёмке (4 октября 2026)

Продуктовый commit c596fcf: настоящая жёсткая COM-сцепка в U2TagLab, два стартовых положения, свободный nearest4 нос/хвост, массовое сближение и сохранение импульсов. Новая schema4 и прежние ссылки1/2/3; повторный переход после Reset/редактирования восстанавливает исходные настройки благодаря очистке устаревшего fragment. HUD автоматически показывает массу в кг/т/кт/Мт до3 значащих цифр; параметры/физика не менялись.

Свежие435/435 и check-version PASS; npm test, типизации, общая и standalone сборки PASS. Готовые root/nested UI15/HUD151, sizes5, rigid6, stale10 без ошибок; PM отдельно18 физико-проб и14 built UI/capture/share проверок. Точная S/L180 ссылка и Native Chrome Reset→sameURL GREEN. Architecture/Quality/Security APPROVED, открытых замечаний0, найденные wall P1 и finite Minor закрыты. Подробности: docs/reports/u2taglab-rigid.md и u2taglab-share-reopen.md.

Доставка в feat/u2taglab-rigid-coupling и draft PR; merge/публикация ждут локальной приёмки. 5175/u2taglab.html — действующий worktree. Исходный checkout/U2/stash сохранены; governor572, passiveB571 и физический телефон остаются отдельными задачами.

## Task583 — компактная масса HUD

Приборы используют кг/т/кт/Мт с порогами1000/10⁶/10⁹ кг, до3 значащих цифр и повышением единицы при округлении999500 кг→1 кт. Настройки и физические значения прежние. Boundary table RED→GREEN; существующий Canvas HUD harness проверяет семь масс, glyph bounds и разные DPR/размеры. Полный435/435 PASS; финальные gates и доставка у PM.

## Task582 — повторное открытие ссылки

Причина подтверждена на опубликованном v0.6.3: после Reset/edit URL оставался прежним, переход к идентичному hash не создавал hashchange. Shell сравнивает нормализованный экспорт с распознанной ссылкой после изменения настроек и удаляет только устаревший fragment через replaceState. Seed/random/Restart используют существующее уведомление панели. Physics/share schema не менялись. Exact user schema3 S/L180, sizes/length/type/seed/density/FA, неизменный Restart/pause/reload, schema4 front/rear и старый TugLab: source11 checks PASS/errors[]. Полный434/434 и npm test/types/builds PASS; финальные built root/nested у PM/Developer.

## Публичный выпуск U2TagLab0.1.0 / BonkRacev0.6.3 — завершён

## Task555 — жёсткий состав U2TagLab, реализация для ревью (4 октября 2026)

В изолированной ветке feat/u2taglab-rigid-coupling добавлена отдельная COM-модель: касательные прежние круги, параллельная ось инерции, двигатели только A, поля обоих корпусов и взаимные импульсы астероидов. Начальный A front/rear; свободный захват nearest4 допускает нос/нос и хвост/хвост с общей продольной осью. Snap сохраняет COM/P/L; несовместимая энергия/занятый путь атомарно отклоняется. Расцепка сохраняет point velocities/omega. Смена типа/arrangement/массы/радиуса требует Restart без перестановки корпусов в полёте.

Schema4/circles-rigid-v5 записывает стартовую настройку и catalog geometry; прежние strict schema1/2/3 и spring default сохраняются. UI скрывает длину/k/c/module для rigid, справка и HUD показывают смысл/выбранные крепления; интерполяция через COM сохраняет касание. Непрерывный поиск использует нижние квадратичные/кубические оценки дуги; ограниченный численный бюджет и epsilon10⁻⁶ м не заменяют прочность или универсальную гарантию манёвров.

Developer проверяет30 новых физико-runtime тестов (включая48catalog arrangements), всю suite и root/nested/browser. Независимое итоговое ревью и push/PR выполняет PM; merge/публикация не выполнялись. Исходный checkout и U2 сохранены. Финальные результаты — docs/reports/u2taglab-rigid.md.


4 октября2026: PR42 merged, tag/release v0.6.3 на784ca3a, человеческие release notes и четыре standalone assets опубликованы. Pages deploy и tag checks/package SUCCESS. Live три URL HTTP200/stamp784ca3a/без ошибок; сцепка троса фиксирует actual200 вместо configured1000. Архивы и публичные загрузки сверены по SOURCE_SHA/SHA256. Beads581 закрыт. Docker558 повторился отдельно и остаётся открытым; игровые572/571 и дальнейшие этапы не расширялись.

## Task580 — длина троса при сцепке (4 октября 2026)

Готово b2ec1f9: трос принимает фактическую дистанцию выбранных креплений как пружина/штанга. Configured length для допуска/Restart/Share сохраняется. Исправлена одна строка поведения и справка; добавлены реальные capture/solver/atomic regressions. 335/335, npm test, types/client/U2 builds и адресный stamped root/nested browser PASS. Три review области APPROVED без замечаний; полный отчёт в приёмке. Beads580 закрывается с доставкой в существующий PR42 без merge/deploy.

## Task573 — мобильная FA и контрастный джойстик приняты (4 октября 2026)

## Task574–579 — компактный полётный интерфейс (4 октября 2026)

Готовоb55cd81: приборы слева, локальный5км радар справа с мировым Севером; крупная скорость, телеметрия/шкала сцепки и компактная причина паузы. Нижние FA/сцепка слева вертикально, главный тормоз справа; FA/Connect сразу, только Disconnect подтверждается. Второй палец работает при удержании джойстика/тормоза. Независимые Space/pointer и BRAKE; native удержание принятo оператором Samsung Z Fold8 Chrome.

Применены V_FA S200/M175/L150/XL95. Последняя абсолютная шкала пружины0…2×referenceA180/360/720/1440 с эталоном50%, отдельнымcapturednormal иactualdistancefill/overflow.329/329, types/client/U2/source/oldTug и финальные root/nested UI+sizes PASS, stampb55cd81/w6kMiDTE. Три специализированных review области APPROVED, один Minor отказа захвата устранён; Beads574–579 закрываются с доставкой PR42. Новые native двухпальцевые случаи отдельно не заявлены,572/571 и физические этапы остаются backlog. Полный отчёт — docs/reports/u2taglab-acceptance.md.

Код3b0db7c: FA вверху непосредственно перед «Расцепить / Сцепить»; только тормоз остаётся справа внизу. U2 основа/ручка джойстика бирюзовые с контуром, старые оболочки сохраняют серые цвета. Guards обеих кнопок локальны, brake lifecycle/Share/physics прежние. Source и stamped root/nested UI13/sizes4 PASS/errors[]; paused/running360/390/412/844×390/1280 и FA OFF помещаются в одну52px строку, targets≥44/48px. Types/client/U2build/oldTug PASS;3 независимых scoped reviews APPROVED/0 замечаний. PM просмотрел actualtouch source390/built360 PNG, обновил руководство/patterns/приёмку;573 CLOSED. Физическое устройство не проверено, tow.6 сохраняется.572P1/571 и default250 не изменялись. Доставка в существующий draft PR42, без merge/deploy; исходный checkout/stash/U2 сохранены.

## Task570 — расчёт манёвренного V_FA

Условные200/175/150/95м/с по actual90° уклонению отR500м на5км отA;8 corrected60/120Гц PASS, зазоры>250м. Общий safe cap не подтверждён: gentleturn governor bug572P1 и пассивное поперечное движение571 остаются отдельными задачами. Productcode/default250 неизменны, отчёт и Memory обновлены, старыеinvalidradiusprobes исключены. Straight10km50/57/67/105с — оценка крейсерской части, не всего рейса.

## Мобильный интерфейс — Beads569 (4 октября 2026)

Готовоafff025: «Инфо» закрыто по умолчанию; footer-local selection/callout/contextmenu/pointer защита, явный владелец удержания и отмена, два пальца, копирование Share сохранено. Browser RED→GREEN,326/326/typecheck/npm/clientbuild/source/stamped root+nested UI+sizes/oldTug PASS. Три независимых review APPROVED без замечаний. Продуктовая физика, каталог размеров и схемы ссылок не изменены. Реальный Android/iOS и WebKit не проверены; PM обновил документы и закрывает569 вместе с доставкой уже принятого568 в PR42.

## Быстрый выбор размеров — Beads568 (4 октября 2026)

Готово90227b8 + справки6e76de6. Выбор тягача S–XL и пассивного прицепа XS–XXL согласованно подставляет массу, геометрию, радиус, инерцию и общую рекомендуемую длину. A получает свои двигатели и фиксированный модуль; другая масса остаётся абсолютной. Все24 пары доступны с тросом, штангой и пружиной. Безопасный перезапуск сохраняет исходную карту; новая ссылка schema3/catalog-v4 передаёт полный профиль, старые ссылки поддержаны.

326/326 тестов, typecheck/npm test, все сборки, source/stamped root+nested и oldTug UI/share прошли. Три независимых review одобрили изменение; единственный Minor исправлен и проверен адресно. PM обновил Guide, расчёт, приёмку, Memory и PR. Beads568 закрыт. Реальный Android, прочность XXL и дальних пар не заявлены; прежние48 осевых проб не приписываются всей новой матрице. Работа осталась в существующем worktree и draft PR42, серверы5174/5175 сохранены.

## 4 октября 2026 — Task567 завершена

- Beads567 CLOSED, код ca6e185: оснащённые M401.2/L1556.8 т, общая длина360 м, физический фиксированныйc, модули S–XL; трос/штанга сохранены.
- 318/318 full,59 focused,6 TDD,types/builds/source и stamped root/nested Chrome,oldUI/share и matrix12×120 PASS. Три независимых seats Approved C0/I0; Minor inherited warning564.
- Strict schema2/fixed-v3 и настоящая legacy schema1/disk-v2 сохраняют геометрию/коэффициенты/карту; reset-closure и повторный legacy mode после conversion имеют регрессионные проверки.
- Состав оснащения с явными оценками и48 осевых проб — fitted-modules report; Guide/acceptance/Memory обновлены. Merge/deploy не выполнялись;555/561.7/563/564/Android остаются существующим backlog.

## Текущий результат: сцепки Task566 приняты (4 октября 2026)

Для исходных M300 т/L680 т у троса, двухшарнирной штанги и пружины общий начальный ориентир **288 м**, диапазон **20–2000 м**. Прежний минимум XL отменён; переключение сохраняет длину. Пружина k≈328718 Н/м и ζ1 (f0.20 Гц), c пересчитывается по текущей приведённой массе. k/ζ видны только у пружины; скрытые значения и прежние явные270/.15/.5 ссылки воспроизводятся точно.

Код5e3be50 и документы47a05d1. Независимый GPT-6.1 Sol high: Spec compliant / Quality Approved, C0/I0/M1; небольшая неточность о Restart уточнена без изменения кода.312/312, типизация, source/stamped root+nested UI/Share, старые оболочки/ссылки прошли; root повторил312/312 и npm test. Все12 мобильных комбинаций типа/viewport:23/21 ползунка, touch≥44px. Модель/генератор не менялись: все параметры и исходный рецепт явные.

Целевые четыре типа: жёсткая борт-в-борт, трос, штанга, пружина. Три последних доступны сейчас; жёсткая555 отдельно, одношарнирная исключена из U2TagLab. Трос допускает догон при торможении, штанга — большие моменты резкого разворота. Подбор не гарантирует безопасность любых манёвров или прочность материала. Прямоугольники561.7, гиганты563, Minor564 и физический Android остаются в backlog. PR42 остаётся draft; merge/публичный релиз после локальной приёмки оператором.

Самопроверка PM_ERR/DOC_PR: результат — рабочий стенд в существующем bonk-race; исходные checkout/stash/U2 и серверы5174/5175 сохранены. Новая инфраструктура, отдельный репозиторий и физика материалов не добавлялись. Проверен класс изменений profile/UI/share/help/Guide, прежние измерения сохранены как история. Новый этап получил один focused review, прежние три итоговых одобрения не повторялись; некритичный долг не расширял спринт.

## Предыдущие записи

## U2TagLab — новый подбор сцепок M/L (4 октября 2026)

Оператор снял требования к длине троса/штанги (старыйrope>=288 отменён) и запросил рекомендации по удобству/безопасности, пересмотрspring k/ζ/length и скрытие неработающих параметров. Общая начальная длина rope/rod равна рекомендованной spring — ориентирсравнения припрочихравных. Beads566 IN_PROGRESS: read-only числовой/sourceadvisor6.1Solxhigh, затемминимальнаяUI/profile/help/docs реализация. k/ζ действуюттолькопружине; rod двусторонний fixed-distance, rope только tensilemaxdistance/slack, materialbreak/friction/masslink не моделируются. Целевойнабор4: rigidборт-в-борт/rope/rod/spring; одношарнирнуюисключаем, rigid555 остаётсяпоследующимэтапом. Q1mobilefix d3fa317+c85e255 завершёнDeveloper, root/nestedtouch23×4PASS, scopedQualityrereviewидёт; новаякалибровканеобъявленаготовой/опубликованной.

## U2TagLab — круговая сборка реализована, итоговая приёмка в работе (4 октября 2026)

Task4 code commit bde6982: глобальный2D каталог loguniform1–200000т, m=1000πr²/I=mr²/2, независимость massA, strict schema/model/generator ссылка с отдельным actual world recipe, all(i), spring270, minimapTOPRIGHT/FABOTTOMRIGHT, BonkRace0.6.3/U2TagLab0.1.0 и прежнийTugLab0.1.1. Developer сообщил305/305 tests, адресные35 и endpoint1000/2e8kg × CCD100m/s,16safe-startcases, matrix12×120, sourceChromeUI/world/fieldsPASS; самостоятельные stamp/root/nested builds и итоговые отчёты завершаются. Независимое Task4/finalreview ещё впереди, работа не объявлена завершённой или опубликованной. Диапазон/2Dlaw заменяет все старые A-relative/sphere решения ниже (история). Sourceaudit562 закрыт, raregiants563 открыт, rectangles561.7/rigid555 отложены. Исходные checkout/stash/U2 сохранены.

## U2TagLab — итоговая 2D-модель астероидов (4 октября 2026)

Оператор выбрал основной глобальный диапазон 1–200 000 т сейчас, редкие крупные тела позже, и прямо потребовал массу пропорционально квадрату радиуса. PM ruling: loguniform m∈[1000,200000000] кг независимо от массы корабля; m=σπr², σ=1000 кг/м² (LAB 1 т/м²), r≈0.56419–252.31325 м, I=mr²/2 для однородного 2D-диска. Это заменяет прежние sphereρ2500 и промежуточный A-relative0.1–10. Все тела подвижны, взаимный импульс/CCD/вакуум сохраняются. Изменение factory/config/recipe/generatorID/help/tests поручено Task4 Developer; пока не заявлено выполненным. XS/XXL source masses частично fitted/reference, stationXXL на4XXL не имеет закрытых ТТХ; не выдаём коэффициент LAB за природную плотность. Гиганты отдельно в backlog.

## U2TagLab — уточнение масс астероидов (4 октября 2026)

Оператор просит сравнимые с кораблями массы и заметный взаимный обмен импульсом. PM поручил текущему Task4 Developer изменить generated mass на seeded loguniform0.1–10 массыA, сохранённой при генерации (300т→30–3000т), отдельно от radius5–50. ActualI2mr²/5 и mass-aware reciprocal CCD сохранены, фонdrag0. Это LAB адаптация по прямому поручению, заменяет density2500 для generated world; source physical helper может остаться. Recipe/share сохраняютmassreference, liveA не перемасштабируетмир; версияgenerator меняется. Изменение ещё в работе, finalreview после проверок. До этого Task4 actualUI/mobile/share/built paths и293tests/12case matrix PASS; новое mass-требование не объявлено выполненным.

## U2TagLab — поля приняты, финальная интеграция (3 октября 2026)

Task3 ea7e405:15focused/287full tests, типизация/npmtest/build/threeLABbuilds и Chrome desktop/mobile/oldoptout PASS. Независимый GPT-6-Astra spec compliant/quality Approved,C0/I0/M1 inherited test-output noise. Beads561.5 CLOSED,561.6/560 IN_PROGRESS. Унаследованные warnings учтены, Android отдельно не проверялся, старыйshare не изменялся; retry/static contract принятTask2. Task4: отдельная atomically validated ссылка с точным actual generator, полный(i), новая spring270 и map/FA placement,0.6.3/U2TagLab0.1.0 и прежнийTugLab0.1.1, существующий Pages artifact подготовить без deployment. Codecheckpoint ea7e405 pushed; main/usercheckout/stash/U2 сохранены. Новый fresh Developer после PMcommit получает Task4brief; после этой части независимый task gate и три специализированных итоговых reviewer по PM_ROLE. Merge/релиз пока не выполняются.

## U2TagLab — дополнительные поручения оператора (3 октября 2026)

В Task4: перенести мини-карту вверх вправо и FA вниз вправо рядом с тормозом. По просьбе подобрать пружину PM принял расчёт свежего read-only Developer: default270м для текущих A300т/B680т, k184904Н/м, ζ0.5; диапазон270–288м. В измеренных поворотах90°/180° ON/OFF при150/250м/с и разгон/накат/тормоз120Гц peak97.79м/36.22%, gap69.52м,0контактов/лимитеров/stop. 250м дают47.72% в быстром развороте, поэтому не общий default. Критерий<=40% лабораторный, при иных массах/полях нужна перенастройка; длина не меняет собственные k/c/f. Трос>=288 сохраняется. Эти изменения ещё не внесены в продукт: Task3 полей идёт, Task4 следует после ревью. Полный расчёт временно /tmp/bonk-tuglab-tools/u2-space-design/spring-length-report.md; постоянный digest включить в Guide/report.

## U2TagLab — космический мир принят, начаты поля (3 октября 2026)

Task2/B e0fd699 + d09b82d: seeded станции/платформы/астероиды, mass-aware CCD, общий атомарный clock и точный Restart/старт0. 272/272 tests, адресные154 и browser/typecheck PASS. GPT-6-Astra: spec APPROVED; Important дублирования устранён shared advanceCoupledInterval, scoped re-review ADDRESSED0. Beads561.4 CLOSED,561.5 IN_PROGRESS; поля следующим свежим Developer. Локальный :5175 восстановлен отдельным процессом PID99049 после воспроизведённого отказа соединения, fresh Chrome HTTP200/canvas/pageerror0. :5174 работает. Новые поручения оператора: рассчитать пружину для L (read-only анализ) и в Task4 перенести мини-карту вверх вправо, FA вниз вправо рядом с тормозом. Поля/space-share пока не готовы; merge/публикация не выполнялись. Отчёты промежуточных этапов в draft PR42.

## U2TagLab — физика принята, начат космический мир (3 октября 2026)

Task1/A864165c: независимый GPT-6-Astra подтвердил Spec/QualityAPPROVED, замечаний0;245tests/typechecks/builds/browserPASS. Beads561.2/.3 CLOSED. Task2/B561.4 IN_PROGRESS: статические station100×100/derelict1000×1000 по runtimeU2, подвижные астероидыrho2500 и sphereI, общий clock/массовые контакты/CCD, seededRestart и корректная стартоваяопораA. Следующий свежий Developer получает отдельный brief; :5174/:5175 продолжают работать. Поля/share ещё не реализованы; круговая версия не объявляется завершённой/опубликованной.

## U2TagLab — первая рабочая физика на кругах (3 октября 2026)

Task1/A реализован свежим Developer gpt-6.1-sol/xhigh, commit864165c. Opt-in space-профиль/чистый закон сил, liveFA/V_FA модуль, вакуум/passiveB/инерция поL/W, сцепкиSI и rope>=288 с провисом, отдельные entry/build/dev и камера состава. http://localhost:5175/u2taglab.html работает (session44409); после прерывания старый :5174 восстановлен PM (session81761), checkout/stash сохранены. 245/245 tests, typechecks, npmtest/build, обе сборки, браузерnew/old/share-v1 PASS по Developer. PM отдельно проверил реальный полёт, сохранность state при FA, паузу/Step/расцепку/radiusB/mobile52px. Task review GPT-6-Astra идёт, .2/.3 ещё in_progress. Сцена временная: начальный progress ненулевой, новый каталог объектов/поля/share ещё не готовы; это Task2–4, работа продолжается без ожидания разрешения.

## U2TagLab — реализация разрешена (3 октября 2026)

Оператор одобрил письменный проект и прямо поручил сборку: «да ок … вперед». Ветка feat/u2taglab-space-v0.1 в прежнем bonk-race worktree. [Implementation-план](../docs/superpowers/plans/2026-10-03-u2taglab-space.md): A круги/FA/сцепки, B мир, C поля, D UI/share/справка/QA. Принимаем явно помеченный расчётный M-профиль, source vs assumptions сохранены; новые вопросы разрешения не требуются. Сначала локальная рабочая физика на :5175; :5174 и пользовательский checkout/stash сохраняются. Прямоугольники561.7 и новые сцепки555 отложены. Продуктового кода пока нет, Developer запускается после фиксации плана.

## U2TagLab — проект космического спринта (3 октября 2026)

- По новому поручению оператора вторая часть теперь — отдельная оболочка `u2taglab` внутри bonk-race с реалистичной космической буксировкой; жёсткая/одношарнирная555 отложены. Существующий worktree `bonk-race-tuglab`, ветка `docs/u2taglab-space-design`, [draft PR41](https://github.com/komleff/bonk-race/pull/41) поверх PR40; U2 только read-only, pipeline прежний.
- Оператор подтвердил: сначала физика на кругах, затем прямоугольники; единый предел **модуля** скорости `V_FA`. FA ON default, живое переключение ON/OFF, угловое двигательное демпфирование A в обоих режимах; B пассивный. Фоновое сопротивление0. Станции/заброшенные объекты статичны, астероиды подвижны; поля с описаниями U2 сохраняются.
- [Проект](../docs/superpowers/specs/2026-10-03-u2taglab-space-design.md) подготовлен для проверки оператором. Beads561 IN_PROGRESS;561.1 аудит/проект,561.2–561.6 открытые этапы круговой версии,561.7 прямоугольники после неё. Справка560 включена. Реализация/публикация новой версии ещё не начаты.
- Аудит локального U2 `0fe06927` выявил готовую геометрию Титан M60×27 / Караван L108×48, Neutral Industrial M тягу и L оболочку680т, но полного fittedM и Industrial yaw torque в runtime нет. 300т — только shell+propulsion, не точная полная масса. Вопрос оператору о расчётном профиле с явно отмеченными допущениями остаётся открытым. Радиус с явными весами/трос минимум288м — предложенные расчётные решения; инерция по U2 `m(L²+W²)/12`.
- PM координирует; для реализации предполагается свежий Developer gpt-6.1-sol/xhigh (пользователь предложил модель). Проверка PM_ERR/DOC_PR не обнаружила переноса репозитория или разрастания pipeline; игровые тесты сейчас не требуются, продуктовый код не изменён. Локальный TugLab :5174, основной checkout и stash сохранены.

## TugLab — дополнение к следующему патчу (3 октября 2026)

По прямому поручению оператора создана открытая `bonk-race-560`: добавить привычную справку по мини-кнопке (i) ко всем новым параметрам прицепа/сцепки, включая параметры следующего этапа555. Сейчас все шесть определений TOW_GROUP не имеют tooltip; существующий LabPanel уже поддерживает кнопку и раскрытие текста. Справка на русском должна объяснять смысл/единицы/влияние параметра и работать нажатием на телефоне/компьютере. Это запись в план следующего патча; код выпущенного TugLab0.1.1 не менялся.

## TugLab 0.1.1 — релиз опубликован (3 октября 2026)

- Оператор прямо уточнил: «отлично» было одобрением публикации и релиза. На этом основании PR38 merged `151eb7e` через GitHub; прямого push в main не было. Тег репозитория `v0.6.2`, версия игры `0.1.1`; [GitHub Release](https://github.com/komleff/bonk-race/releases/tag/v0.6.2) опубликован с самостоятельным архивом и контрольной суммой.
- [Pages37112938677](https://github.com/komleff/bonk-race/actions/runs/37112938677) build/deploy SUCCESS; [main TugLab QA37112961989](https://github.com/komleff/bonk-race/actions/runs/37112961989) SUCCESS (220 tests, штатная матрица/сборки/browser). Публичная игра https://komleff.github.io/bonk-race/tuglab/ показывает `TugLab v0.1.1 · 151eb7e · BonkRace v0.6.2`. Root BonkLab и JS обеих оболочек HTTPS200, ошибок браузера0.
- Chrome390×844: toolbar52 px/canvas766 px; захват80 м/с разрешён и100 запрещён при cap90; тела сохранены. «Поделиться» передаёт одинаковые snapshot/arena независимой странице, до Start таймер0; Start работает. Архив main151eb7e содержит тот же опубликованный JS; SHA256 скачанного release asset проверена.
- По уточнению оператора release notes представляют первый публичный TugLab: человеческое описание игры, три сцепки, обзор настроек, управление и одинаковый заезд по ссылке. Текст опубликован в GitHub Release и сверён с Guide/paramDefs; Beads559 CLOSED.
- Beads557 CLOSED. Новые крепления555 отдельно; настоящий Android .6 и полный rollback .7 остаются follow-up. Существующий Docker workflow падает на отсутствующем `/app/scripts/install-hooks.js`: подтверждено до релиза и сейчас, заведена558; Pages/статический архив не зависят от Docker. Локальный сервер5174 и пользовательский checkout/stash сохранены.

## TugLab — поправка порога захвата, bonk-race-556 (3 октября 2026)

Порог захвата трёх сцепок теперь равен минимуму текущих линейных лимитов A вперёд/назад/вбок, включительно; угловая скорость креплений по-прежнему учитывается. Любое изменение лимита действует сразу; некорректные лимиты и превышение дают атомарный отказ. 220/220 TugLab, typecheck/build:tuglab и browser probe (80 м/с принят, 100 отклонён при cap 90) PASS. Версии 0.6.2/0.1.1 сохранены; поправка к открытому PR38 принята scoped review GPT-6-Astra: APPROVED, замечаний0 (comment5967341109). Beads556 закрыта; merge/deploy отдельно.

## TugLab — usability/share, реализация

## TugLab 0.1.1 — первая часть завершена, PR38 готов к передаче (3 октября 2026)

- `bonk-race-554` закрыта: компактная панель 52 px, настройки в drawer, длина до100 м/ближайшие крепления и «Поделиться». Кодовый итог `2b8fb9b`; 205/205 TugLab, затронутые сборки/типизация и реальные browser-сценарии локального и собранного вложенного пути PASS.
- Один GPT-6-Astra Reviewer: полное review обнаружило 3 Important (initial orb density, повторная ошибка ссылки, Step до первого Start), один общий fix round и scoped review [APPROVED](https://github.com/komleff/bonk-race/pull/38#issuecomment-5966788999), открытых замечаний0. Новых функций/процессной инфраструктуры не добавлено.
- Worktree/репозиторий bonk-race сохранены; localhost:5174/tuglab.html доступен. Новый релиз ещё не опубликован: дальнейшие merge и существующий Pages deployment выполняет оператор. Финальный CI проверяется после push; результат доступен в PR38. Реальный Android и полноценный rollback остаются прежними follow-up.
- Следующая часть `bonk-race-555`: жёсткое/одношарнирное крепления с подтягиванием обратно пропорционально массам, сохраняя центр масс. Она не начата.

bonk-race-554: единый патч UI/capture/share прошёл финальные gates и self-review: 200/200 TugLab, общий npm test/build и обе оболочки/version PASS, адресные mobile/share/numeric/stock/root/nested browser PASS. Новые проверки полного snapshot/атомарности/совместимости, ближайших точек и границ всех трёх сцепок; browser QA мобильного интерфейса и независимых страниц. PM закрывает задачу после одного независимого итогового review. Новые жёсткое/одношарнирное крепления вынесены в bonk-race-555, в этот патч не входят.

Round1 review: три Important исправлены; 205/205 TugLab PASS, browser regressions auto/manual mass/radius + Restart/share, repeated-invalid recovery, waiting/started Step PASS. Исправления ожидают scoped re-review; исходный генератор/решатель и pipeline не менялись.

# Progress

Отслеживание статуса задач.

## TugLab — публичный тест доступен (3 октября 2026)

- PR35 и PR36 merged по прямому согласованию оператора. Pages CI37055835128 build/deploy SUCCESS на main958329c; root BonkLab и /tuglab/ HTTPS/browser PASS, собственные JS200, pageerror0.
- bonk-race-tug закрыта после merge35, bonk-race-553 закрыта после подготовки. .7: публикация подтверждена, rollback остаётся follow-up; .6 Android не выполнялась. Parent не объявлен полностью завершённым по исходным внешним AC.

## TugLab — GitHub Pages (3 октября 2026)

- Согласована публикация /bonk-race/tuglab/ через существующий workflow и единый артефакт. Исходники/ветка остаются в bonk-race, отдельного репозитория нет.
- Подготовка bonk-race-553 принята: сборки, assembled root+nested browser и numeric8/8 PASS, scoped review APPROVED; фактическая публикация .7 требует разрешённого deployment из main после операторского merge. Android .6 отдельно. U2 PR833 закрыт, лишний worktree удалён, ошибочная задача552 отменена.

## U2 TugLab — локальная поставка принята (3 октября 2026)

- Этапы 1–5 готовы: оригинальный BonkLab плюс прицеп, три сцепки/длина/k, отдельная статическая оболочка. Оператор подтвердил ручную desktop-игру.
- QA `16158ea`: 182 tests, 63 игровых + 42 изолированных, static/UI/lifecycle/120с RAF PASS. Первый actual GitHub CI PASS, самостоятельный архив проверен.
- Final review: architecture/physics и security/build APPROVED на `16158ea`. Quality F1/F2 исправлены в `8205235`; scoped re-review APPROVED, independent keystroke 8/8 PASS. Физика не менялась; широкий review не повторялся.
- По запросу оператора самопроверка PM_ERR/DOC_PR: `bonk-race-550`, отчёт в docs. PR body актуализирован; избыточный review effort признан. QA advisory map invariant отложен `bonk-race-551`, без нового fix/review цикла.
- `.5` закрыта; `.6` Android и `.7` production/HTTPS/rollback открыты, parent остаётся in_progress. DNS готов, сайт не опубликован. Ветка/worktree/сервер 5174 сохраняются, merge только оператор.

## U2 TugLab — возобновлено после обновления

- Закрыта задача аудита `bonk-race-tow-reuse`; задачи2–5 и план заменены минимальным расширением существующего BonkLab. Оригинальные сцена/контент/управление сохраняются, новая группа параметров прицепа и сцепки.
- `.1` закрыта: P2 исправлен в `b57b677`, scoped review spec/quality APPROVED. 90/90 тестов PASS; bounded predictive rod принят. `.2` начата, игровая интеграция/UI ещё отсутствуют.

- Этап2 закрыт: трос/пружина/CCD и прямое k, commits `55e7127`, `7d91595`. 144/144 tests, typecheck PASS; независимый scoped review spec/quality APPROVED. Статический CCD и адаптивный callback готовы; `.3` начата — интеграция оригинальной сцены.

- Этап3 закрыт: opt-in BonkLab/исходная карта/stock FA/пассивный B/орбы/шипы/общий респаун/пауза и Step. `6f80929` + `8ba429b`, 177/177 tests, typechecks/npmtest PASS; исходные общие сборки PASS. Независимые spec/quality APPROVED после двух переходных исправлений. `.4` начата: UI/рендер/отдельная оболочка.

- Этап4 закрыт: тот же main/input/renderer/panel/toolbar, отдельная TugLab оболочка и сборка, opt-in WASD, параметры сцепок, B/линия/миникарта. `7f3823e` + `8a3b976`; 182tests и builds PASS, dev/static/stock browser smoke PASS; independent spec/quality APPROVED после сброса held input при респауне. `.5` начата — финальная QA/guide/artifact. Игра локально на :5174/tuglab.html или static :5184/, HTTPS-host ещё не опубликован.

## U2 TugLab — сохранённый контекст паузы VS Code/Codex

- ПАУЗА по запросу оператора. Checkpoint `1bd985d`: два тела, двигатели, штанга и конфигурация. Повторные проверки PM: typecheck PASS, 32/32 теста ядра PASS. Developer: существующие тесты и полная сборка PASS. Независимое code review ещё предстоит; `.1` остаётся in_progress.
- Игровая интеграция, трос, пружина и CCD ещё отсутствуют. Это сохранение промежуточной работы, а не готовый игровой стенд. Следующие этапы не запускаются до возобновления.
- Последние уточнения заменяют прежний план: сцена/генератор BonkLab и управление bonk-race сохраняются; дополнения — прицеп, три сцепки, длина и жёсткость пружины. Максимальное переиспользование, минимальные переделки; запись исключена.
- Перед продолжением `.2`–`.4` PM выполняет `bonk-race-tow-reuse` и актуализирует старые требования новых сцен/управления. Численная и браузерная приёмка всего стенда пока не выполнена.

## U2 TugLab — подготовка спринта PM (2 октября 2026)

- Подготовлен [план реализации](../docs/superpowers/plans/2026-10-02-u2-tuglab.md) по PR #35; рабочая ветка `feat/u2-tuglab-v0.1` в отдельном worktree.
- `bonk-race-tow` переведена в P1/in_progress для координации; созданы девять задач `.1`–`.9` и их зависимости. Статусы задач — только в Beads.
- `bonk-race-tow-plan` учитывает подготовку; `bonk-race-tow-review` — review письменного плана оператором до запуска Developer.
- Подготовка плана закрыта после трёх независимых проверок (физика/ввод/архитектура, APPROVED). План и описания задач синхронизированы; оператору передаётся сокращённый объём.
- Реализация, численная матрица 21 комбинации, браузерные проверки и сборочный артефакт пока отсутствуют. Статус draft исходного ТЗ сохранён.
- После уточнения оператора запись, экспорт/импорт и playback исключены; AC-21–22 сняты. Стенд предназначен для ручной игры. Исследование с пятью тестерами снято из объёма; реальный Android-планшет и публикация с откатом выделены отдельно.
- Совместимый Beads CLI использован локально в JSONL-режиме; существующие задачи сохранены, исходный checkout не мигрирован.

## U2 TugLab — ТЗ для ревью (2 октября 2026)

- `bonk-race-tug`: подготовлено ТЗ v0.1 в [docs/tz/spec_u2_tuglab_v0.1.md](../docs/tz/spec_u2_tuglab_v0.1.md), ожидает ревью документации.
- `bonk-race-tow`: будущая реализация по принятому ТЗ; остаётся в очереди.
- 25 критериев приёмки заданы как требования к будущей сборке. Физический расчёт, управление и публикация ещё не реализованы и не проверены.
- Поставка документации не меняет версию 0.6.0 и состояние работающего BonkLab.

## Контроль изменений

- **last_checked_commit**: PR #26 `fix/trail-rendering-order` @ 13 марта 2026
- **Активная ветка**: `chore/release-v0.6.0-prep`
- **Production:** BonkLab на GitHub Pages, основная игра не задеплоена
- **Версия:** 0.6.0
- **GDD версия**: v4.0 (`docs/gdd/GDD-index.md`)

---

## Sprint: BonkLab Render Interpolation (13 марта 2026) — ЗАВЕРШЁН

**PR:** #25 (`fix/bonklab-render-interpolation`) — Merged
**PR:** #26 (`fix/trail-rendering-order`) — На ревью (фикс следа)
**Ревью:** Copilot (×2), GPT-5 Codex, GPT-5.3-Codex, Claude Opus 4.6 (×2)
**Тесты:** 15/15

- [x] Объединение двух RAF-циклов в один (main.ts)
- [x] Интерполяция состояния между тиками физики (getInterpolatedState)
- [x] syncPrevState() во всех точках телепортации
- [x] lerpAngle() для углов через ±π
- [x] Однопроходный drawTrail() → непрерывная per-point альфа + обход по возрасту
- [x] Number.isFinite guard в update()
- [x] Пересчёт distanceM/progressPct по интерполированной позиции
- [x] Русификация комментариев (убраны англицизмы)
- [x] Версия в тулбаре BonkLab

---

## Sprint: BonkLab Tech Debt + Zone Tuning + Arena Balancing (13 марта 2026) — ЗАВЕРШЁН

**PR:** #22 (`fix/bonklab-techdebt`) — Merged
**Тесты:** 15/15

- [x] bonk-race-hyf, ovb, dom, yno, d63, pdi — баг-фиксы и рефакторинг
- [x] Тюнинг зон: Ice, Turbo, Mud, Sand
- [x] Балансировка арены: зоны 8, камни 4, шипы 2, проходы 1

---

## Sprint: Trail Coloring + Spike Knockback (11 марта 2026) — ЗАВЕРШЁН

**PR:** #17 — Merged | **Тесты:** 15/15

---

## Sprint: Trails + Direction Triangle (11 марта 2026) — ЗАВЕРШЁН

**PR:** #15 — Merged | **Тесты:** 21/21

---

## Sprint: Анизотропное трение v0.3.0 (10 марта 2026) — ЗАВЕРШЁН

**PR:** #14 — Merged | **Тесты:** 15/15

---

## Countdown и респаун-оверлей (10 марта 2026) — В РАБОТЕ

**PR:** #12 — Open
- [x] bonk-race-a5b: Countdown 3→2→1→Go!
- [x] bonk-race-4iq: Go!-Go! после смерти
- [ ] GhostRecorder: запись кадров во время freeze/respawnGo
- [ ] Русификация комментариев

---

## Ожидает следующий спринт

### Техдолг

| Приоритет | Beads ID | Проблема |
|-----------|----------|---------|
| P1 | bonk-race-b18.1 | raceMain.ts — анизотропное трение (LG-6) |
| P1 | bonk-race-6nu | Серверная интеграция movementSystems (LG-5) |
| P2 | bonk-race-sz1 | reverseZoneAngleDeg — не реализован |
| P2 | bonk-race-qp0 | BonkLab track editor |
| P2 | — | Пресеты зон в balance.json |
| P2 | — | Weighted random для зон |
| P2 | bonk-race-lx2 | runs/submit идемпотентность |
| P2 | — | tick() аллокации: pre-allocation, trail aging |
| P3 | bonk-race-t7p | Sub-pixel anti-aliasing blur |
| P3 | bonk-race-col | Guest opponent ghost profiles |

### Приоритетные фичи

1. BonkLab track editor — визуальное редактирование
2. DevAuth flow — переключение профилей
3. CI/CD — GitHub Actions

---

*История slime-arena: `.memory_bank/archive/`*
