## U2TagLab — длина повторного захвата Task580

LabTowing.setConnection после выбора ближайшей пары нос/хвост и проверки допуска задаёт coupling.restLength измеренной дистанцией для троса, штанги и пружины. У троса этот restLength является пределом одностороннего натяжения; при сближении он провисает. Рабочий захват отделён от params[tow.length]: настройка остаётся пределом допуска и источником начальной длины для Restart/Share. Корабли и их скорости при захвате не изменяются, отказ атомарен. Независимые mass/module edits сохраняют захват; явные type/length edits по прежнему контракту используют настройку. Абсолютная HUD-шкала размера A не зависит от захвата.

## U2TagLab — контрастный джойстик Task573

## U2TagLab — актуальный интерфейс Task574–579 (4 октября)

SPACE_OVERLAY_WIDTH105/HEIGHT136 CSS, HUD слева/фон0.35/крупная скорость24CSS, DPR компенсируется Canvas scale. Локальный радар справа136CSS/5км до центра liveobjects/heading-up/мировойNorth(0,-1)/cyanvelocity; nonspace minimap прежний. Старый промежуточный wholemap574 заменён577. Текущая телеметрия сцепки в HUD, время одно, тело строк шаг8CSS; spring scale0…2×referenceA180/360/720/1440, reference50%, capturedrest отдельнойотличимойметкой, fillactualdistance/overflow. SnapshotspaceTugSize берет actualgeometryA, module/B/manualmass/configuredlength не источникмасштаба; solver unchanged. U2statusstrip отсутствует/canvas.top52, pausefocus у верхней кнопки, rare error через44pxdetails.

Тормоз складывает независимые pointer/keyboard-командыOR и очищает ихstop/pause/reset. spaceBrake snapshot — actual command, не вычисленная сила; HUD BRAKE и persistent pressed CSS следуют ему. Nonpassive touch guards только у тормоза. Стабильный keyedDOM при popup сохраняетcapture; вторичный touch активируется наpointerup и дедуплицируетcompatibilityclick. FA и CONNECT сразу; DISCONNECT черезcapturedrefconfirm и stale scene/pause/time guards. ЛевыеFA/сцепка вертикальны, BRBrake96x72, центрконтейнера пропускает input. Actions второго пальца сохраняютjoystick/hold, settings/pause/reset/focus сохраняютcleanup. Прежняя раскладкаFAверх573 ниже — историческая.

V_FA recommendation mapS200/M175/L150/XL95 применён в полном sizeAprofile/startM175; B/module/manualexplicitsharecaps сохраняются. Схемы Share и геометрическая валидация не менялись.

LabRenderer передаёт Boolean(state.spaceWorld) только в приватный drawTouchJoystick: U2 использует бирюзовые заливки и контуры основы/ручки, прочие оболочки сохраняют прежние серые цвета. Геометрия и ввод не менялись. U2-only padding верхних кнопок6px сохраняет строку52px и targets≥44px даже с FA OFF на360px; brake≥48px остаётся внизу.

## U2TagLab — мобильные контролы Task569

«Инфо» — локальное состояние раскрытия Toolbar, доступная кнопка с aria-expanded/controls и hidden panel всего прежнего абзаца. Оно не входит в физический профиль/Share. После Task573 FA расположен в toolbar перед сцепкой, нижняя группа содержит только тормоз. CSS user-select и WebKit callout ограничены space-fa и footer buttons/children; preventDefault/contextmenu стоят на двух кнопках, прочий текст и textarea остаются доступными для копирования.

У тормоза один owner pointerId. clearSpaceBrake обнуляет владельца до releasePointerCapture; чужие окончания игнорируются. isPrimary не ограничивает второй палец с джойстиком, right mouse не начинает удержание. Cancel/lostcapture/blur/visibility/pause очищают owner/hold; move после отмены не включает тормоз. Runtime setSpaceBrake/FA и физика прежние. Новый browser helper подключён к существующему UI runner для source/root/nested QA.

## U2TagLab — выбор размеров Task568 (4 октября)

selectSpaceSize собирает полный кандидат через strict Share и safe-start до изменения живого состояния. A S–XL получает оснащённую массу, двигатели, LAB-вращение и фиксированный модуль; B XS–XXL — пассивную оснащённую массу и геометрию. Масса другого тела сохраняется абсолютной. Текущие L/W задают радиус, прямоугольную инерцию и площадь полей. Геометрические замыкания заменяются при импорте и полном сбросе; radiusA синхронизируется также с плоскими params. Кнопки48px подсвечиваются по фактическому fitted-профилю; ручное изменение снимает соответствующее совпадение.

Выбор размеров создаёт schema3/model u2-space-circles-catalog-v4. Геометрия ограничена каталогом по роли, B допускает прежние108×48. world.radiusA сохраняет исходную карту при смене A; старые schema1/2 остаются прежними до выбора размеров. Невозможный старт сохраняет состояние целиком. Диапазоны ratio0.001–250, forward150 МН и torque2 ГН·м охватывают24 пары; прежний TugLab не изменён. Длина90–1440 м основана на принятой соседней таблице и явно экспериментальном расширении, одинакова для всех трёх типов.

## Task567 — постоянный c и два контракта Share

Новый оснащённый круговой профиль: M401200/L1556800 кг, геометрия60×27/120×54 м. У пружины отдельный физический c; опциональный путь shared TugConfig оставляет прежний TugLab на ζ. LabTowing сохраняет c при refresh/mass/reset/capture, preset меняет толькоk/c, сохраняя configured/actualrest и движение; ручная правка помечает модуль как Custom. Трос и штанга не используют эти коэффициенты, скрытые значения сохраняются.

Новый strict-share schema2/model u2-space-circles-fixed-v3 содержит geometryA/B, tow.dampingMode fixed|legacy, tow.dampingCoefficient, tow.module S|M|L|XL|custom. Генератор area-catalog-v3 прежний. Настоящий старый schema1/disk-v2 имеет свою точную key schema и известную старую геометрию60×27/108×48; старые данные проверяются до дополнения внутреннего представления. Неконвертированный legacy экспортируется как schema1. После применения fixed/module переход в schema2 необратим для этой сессии: обратный выбор legacy-режима сохраняет новый скрытыйc/геометрию при обмене. Candidate import остаётся off-state/атомарным. Полный reset создаёт новый профиль и новую inertiaB closure, исключая утечку геометрии из прежнего импорта. Итог567 принят:318/318,types/builds/source+stamped root/nested,oldUI/share,matrix и три независимых review прошли.

## Применимость свойств сцепки (уточнение4окт)

Source: applySpring использует k/c только spring; rod fixed-distance bilateral impulseconstraint, rope unilateral max-distance/slack, нет физических stiffness/damping/friction/break/masslink. Task566: k/ζ скрываются вне spring, но сохраняются в params/share. Общий начальный length288 м и диапазон20–2000 м всехтрёхтипов; rope>=288/XL требование отменено. Новаяпружина k328718.2527 Н/м, ζ1 (f.20 Гц для sourceM/L), cпо текущейμ. Переключение сохраняетвыбраннуюдлину, тип не меняет worldrecipe/clock/FA. Новыеdefaults не заменяют явно записанные значения прежних ссылок; model/generator IDs сохраняются, поскольку физическиезаконы и encoded recipe не меняются. All newsliders CSS body[data-space-mode=true] hit44/visual4, oldBonk/Tug preserved.

## U2TagLab — принятая космическая физика/мир/поля (3 октября 2026)

Opt-in BonkLab(canvas,{towing:true,space:true}) сохраняет ввод/Canvas/панели и старые пути. profile.ts хранит SI-массы/силы/геометрию и явно LAB FA-калибровку. Инерция корабля m(L²+W²)/12 независимо от collision radius. spaceEngineWrench возвращает силу/момент; двигатель толькоA. FA ON/OFF живой, один предел модуля V_FA, yaw damping в обоих; фон linear/angular drag0, B пассивен.

SpaceWorld имеет seeded стабильные station/derelict/asteroid IDs; statics неизменны, итоговое поручение4окт заменяет астероиды sphere на 2D-диски: m=1000*pi*r², I=mr²/2, глобальный loguniform1–200000т независимо massA (Task4 в реализации). advanceSpaceWorld клонирует весь мир и применяет общий dt/substep/CCD/clock, отказ возвращает A/B/coupling/asteroids/time/tick целиком. Прежний advancePair и новый Nbody используют один advanceCoupledInterval для coupling/contact horizon и бюджета. SpaceForceSampler читает копии всех pre-step тел до любой интеграции, simulationtime/subDt; callback чистый/retry-safe.

Fields immutable/seeded, geometry(t)=center0+drift*t. Самплер отдельно A/B/астероиды; статике силы не нужны. Resistive F=-w*k_R*A*v_sector; LAB pressure F=w*p*A*n и torque0; smoothstep один раз, overlap ID-ordered. A кораблей pi*weightedR(sourceL/W)², не collider override; астероид pi*r². sampleSpaceFieldResponse объединяет engine+wind+drag через analytic average с expm1: extreme сопротивление не создаёт эйлеров reversal/энергию. Thermal/Dust/EM только визуальны с явной справкой об отсутствующих системах.

Task4 bde6982: отдельная strictspace schema1/modelu2-space-circles-disk-v2/generatoru2-space-world-area-catalog-v3; ограниченный UTF8/base64url fragment, exactkeys/finite/ranges. Actual initialworldrecipe (radiusB/length/speed/fields) отделён от liveoverrides. Candidate/world/fullpair проверяются off-state до атомарного импорта, time/distance/progress0 waitingStart; невалидный API import сохраняет весь state, shellhasherror может pause/clearinput по прежней политике. ImportedRestart retainsactualrecipe до явной geometryregeneration. Oldshare-v1 отделён. Геометрия новых прямоугольников и новые сцепки отдельно после круговой приёмки.

## TugLab: полный снимок начальных условий

BonkLab.exportShareSnapshot берёт lastSeed/lastDensity и orbDensityManual, полный params; arena.objectDensity синхронизируется с фактическим генератором. share.ts строго проверяет schema1/generator bonklab-arena-v1, точные ключи и типы, конечные числа/диапазоны/enums до изменений. applyShareSnapshot применяет все параметры без промежуточных генераций, один раз вызывает regenerateArena/reset и оставляет симуляцию в ожидании. Штатный нестрогий JSON import не используется. Настройки в TugLab принадлежат controlled LabPanel внутри Toolbar; layout sync выполняется до paint. На ширине <900 панель перекрывает canvas без desktop-отступа; ResizeObserver и visualViewport.resize поддерживают высоту.

LabParamManager держит ссылки на живые и исходные орбы арены: autoSyncOrbDensity обновляет массы обоих наборов, не меняя карту/раскладку; manual density отключает обе авто-синхронизации. BonkLab связывает initialOrbs после создания/сброса арены. Step проверяет started, который выставляется при явном Start до countdown, поэтому ожидание импорта/настроек неизменно, а паузнутый countdown допускает одиночный тик. Ошибка ссылки принадлежит оболочке; Toolbar получает controlled prop и recovery callback очищает parent state.

# System Patterns
Архитектурные решения и паттерны проектирования.

**Версия GDD:** 3.3.2
**Архитектура:** SlimeArena-Architecture-v4.2.5 (4 части, Soft Launch)

## Границы подсистем
- **Runtime (Server)**: `server/src/index.ts` (точка входа), `server/src/rooms/` (игровая логика).
- **Runtime (Client)**: `client/src/main.ts` (точка входа), `client/src/rendering/` (визуализация), `client/src/input/` (управление).
- **Shared Logic**: `shared/src/` (типы, формулы, парсинг конфигов).
- **Infrastructure**: `.github/workflows/` (CI/CD), `docker/` (контейнеризация).
- **Public Assets**: `client/public/` и корневая папка `assets/`.

## Архитектура
- **Authoritative Server**: Сервер является единственным источником истины. Клиент отправляет только команды ввода.
- **Fixed Timestep**: Игровой цикл работает с фиксированным шагом (30 Гц, 33.3 мс) для обеспечения детерминизма.
- **U2-style Predictive Smoothing**: Клиент использует visual state system с velocity integration для плавного отображения.

## Порядок систем в тике (Architecture v3.3)
| Порядок | Система | Назначение |
|---------|---------|------------|
| 1 | `CollectInputs` | Сбор команд |
| 2 | `ApplyInputs` | Валидация ввода |
| 3 | `AbilitySystem` | Кулдауны, `gcdTicks=3` (100 мс), очередь |
| 4 | `FlightAssistSystem` | Силы/моменты по джойстику |
| 5 | `PhysicsSystem` | Интеграция, сопротивление |
| 6 | `CollisionSystem` | Круг-круг, круг-граница, импульсы |
| 7 | `ZoneSystem` | Эффекты зон (Нектар, Лёд, Слизь, Лава, Турбо) |
| 8 | `CombatSystem` | Урон, i-frames, эффекты контроля |
| 9 | `PickupSystem` | Укус пузырей |
| 10 | `ChestSystem` | Физика сундуков, обручи, награды |
| 11 | `BoostSystem` | Усиления: длительность, стеки, эффекты |
| 12 | `TalentSystem` | Карточки, очередь, автовыбор |
| 13 | `DeathSystem` | Гибель, респаун, респаун-щит 5 сек |
| 14 | `SafeZoneSystem` | Безопасные зоны, урон вне зон (финал) |
| 15 | `KingSystem` | Назначение Короля |
| 16 | `SnapshotSystem` | Рассылка состояния |

## Сущности (Architecture v3.3)
| Сущность | Описание |
|----------|----------|
| `SlimeEntity` | Игрок или бот |
| `OrbEntity` | Пузырь (масса + цвет + плотность) |
| `ProjectileEntity` | Снаряд умения |
| `ChestEntity` | Сундук (тип, обручи, физика) |
| `ZoneEntity` | Зона эффекта (Нектар, Лёд, Слизь, Лава, Турбо) |

## Флаги слайма (битовые маски)
| Флаг | Описание |
|------|----------|
| `FLAG_DASHING` | В процессе рывка |
| `FLAG_SHIELDED` | Активен щит |
| `FLAG_STUNNED` | Оглушён |
| `FLAG_INVISIBLE` | Невидимость |
| `FLAG_INVULNERABLE` | Неуязвимость после урона |
| `FLAG_PUSHING` | Визуализация отталкивания |

## U2-стиль сглаживания (v1.0)
- **Visual State System**: Визуальное состояние (`visualPlayers`, `visualOrbs`) отделено от серверного.
- **Velocity Integration**: `VELOCITY_WEIGHT = 0.7` — движение по скорости из снапшота.
- **Catch-up коррекция**: `CATCH_UP_SPEED = 10.0` — плавное догоняние целевой позиции.
- **Предиктивная экстраполяция**: `targetPos = server_pos + velocity * lookAheadMs`.
- **Единственный параметр в конфиге**: `lookAheadMs = 150` (остальные захардкожены).
- **Документация**: `.memory_bank/modules/U2-smoothing.md`

## Пайплайны и гарантии доставки
- **CI (Continuous Integration)**:
    - Любой PR в `main` запускает проверку сборки. Это гарантирует, что изменения не ломают компиляцию проекта.
    - В будущем планируется добавление автоматического запуска тестов детерминизма (`npm run test`) в пайплайн.
- **Branch Protection**:
    - Реализована программная проверка в `branch-protection.yml`, которая предупреждает о прямых пушах в `main`.
    - Основной рабочий процесс: `feature-branch -> Pull Request -> CI Check -> Merge to main`.

## Ключевые паттерны
- **State Synchronization**: Использование Colyseus Schema для автоматической синхронизации состояния комнаты.
- **Command Pattern**: Ввод пользователя инкапсулируется в `InputCommand` и передается на сервер.
- **Class-based Mechanics**: Разделение игроков на классы (Hunter, Warrior, Collector) с уникальными пассивными и активными свойствами.
- **Ability System**: Система слотов для способностей (Slot 1: Projectile), управляемая через `InputCommand`.
- **Helper Modules**: Вынос сложной математики и логики мира в отдельные утилиты (`mathUtils.ts`, `worldUtils.ts`) для разгрузки классов комнат.

## U2 TugLab — промежуточное ядро (2 октября 2026)

- `client/src/tuglab/physics/` — пока отдельные чистые функции для двух тел, двигателей и штанги; в игровой цикл BonkLab они не подключены. `stepWorld` копирует изменяемое состояние; в этой версии рассчитывает только штангу.
- Точка приложения импульса даёт линейное и угловое воздействие на оба тела. Штанга использует эффективную обратную массу и ограниченную коррекцию скорости; тесты проверяют полный угловой импульс, включая орбитальную часть.
- Существующие генератор, сцена и управление должны быть переиспользованы по последнему указанию оператора. Решение об интеграции ещё предстоит; прежний план отдельных сцен и управления отменён.

- Уточнение ядра TugLab (`b57b677`): штанга прогнозирует конечные крепления и применяет Newton-импульс по текущей линии. `rodStepLimit` ограничивает sweep; шаг повторяется с дроблением до128, неудача возвращает исходный мир. Регрессия длины/P/L и ограниченного роста энергии прошла независимый review. В игре будут штатные FA/drag через velocity-only callback, а не six-DOF прототип.

## TugLab: общий расчёт пары (3 октября 2026)

`advancePair` принимает actual A/B, сцепку, круги и bounds, callback только скоростей. Выдаёт новые тела/события либо атомарный отказ с исходными references; внешний yaw-history не допустим в повторяемом callback. Пружина даёт один kick на подшаг; ограничения/CCD чередуются по ограниченному горизонту до ближайшего события, unaccepted trials откатываются. Односторонние ограничения ограничивают итоговый накопленный импульс пробы; завершённые отрезки не откатываются. `stepWorld` пока изолированный прототип; интеграция stock BonkLab в работе. Орбы/линия не входят в статический CCD этого этапа.

## TugLab: opt-in интеграция BonkLab

`BonkLab(canvas,{towing:true})` включает `LabTowing`; безoption старый путь сохранён. ТолькоB/сцепка имеют дополнительное постоянное состояние; A берётся из штатных полей. Sections1–3 FA/история/зоны общие раз/maintick, motion4–6 ветвится. `integratePhysics` в callback отдаёт только скорости, drift/CCD одинобщий. B имеет свой drag/зону, без FA/angularclamp. Исходные Arena ID используются дляspikes, finish поA, смерть любого→общийrespawn. Орбы шагают одинраз; opt-in позиционнаякоррекция уходитворб, mass-dependent импульсы сохранены. Они остаютсяdiscrete contacts.

`pause` сохраняетblur/hidden handlers, очищаетinput; terminalstop снимаетhandlers дажеpaused. `stepOnce` синхронизируетprevA/B. Live независимые mass/radius/k/damping сохраняютcapturedtarget; явные length/type иRestart используютconfiguredtarget. Capture 2–configured tow.length (до100м) и относительная скорость креплений≤min текущих speedLimitForwardMps/ReverseMps/LateralMps включает вращение; линейные лимиты читаются при каждом захвате, angular limit не входит в cap, некорректные лимиты запрещают захват; ближайшая из четырёх пар нос/хвост выбирается детерминированно до изменения coupling. Отказ сохраняет coupling/тела; независимые изменения сохраняют выбранные крепления и фактическую рабочую длину. При невозможнойгеометрии settingsсохраняются, positions/mapне меняются, нуженmanualRestart.

## TugLab: редактируемые числа

У tow числовых полей текстовый draft отделён от принятой модели. onInput сохраняет текст; blur/Enter валидирует и принимает число. Промежуточное/пустое/недопустимое значение сохраняет прежнюю модель. Slider/quick и внешний syncTrigger reset/preset синхронизируют draft/error через useLayoutEffect, чтобы отложенная синхронизация не затирала следующий ввод. Stock BonkLab сохраняет прежний немедленный numeric onInput. Проверка реальных клавиш ui-numeric входит в existing browser CI step.
