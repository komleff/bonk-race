// ─── Типы ────────────────────────────────────────────────────────────────────

export interface ParamDef {
    label: string;
    key: string;
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
    tooltip?: string;
    locked?: boolean;
    lockTooltip?: string;
    isBoolean?: boolean;
    isColor?: boolean;
    isSelect?: boolean;
    options?: Array<{ label: string; value: string | number }>;
}

export interface GroupDef {
    title: string;
    params: ParamDef[];
}

// ─── Определения параметров (ТЗ 3.1–3.11) ────────────────────────────────────

export const PARAM_GROUPS: GroupDef[] = [
    // 3.1 Геометрия и масса
    {
        title: "Геометрия и масса",
        params: [
            {
                label: "Масса",
                key: "mass",
                min: 10,
                max: 1000,
                unit: "кг",
                tooltip:
                    "Масса персонажа. Влияет на инерцию и ускорение (a = F/m).",
            },
            {
                label: "Базовый радиус",
                key: "geometry.baseRadiusM",
                min: 3,
                max: 40,
                unit: "м",
                tooltip:
                    "Радиус тела персонажа.",
            },
            {
                label: "Коэф. формы",
                key: "geometry.inertiaFactor",
                min: 0.01,
                max: 2.0,
                tooltip:
                    "Распределение массы: 0 = вся в центре (легко крутится), 0.5 = сплошной диск, 1.0 = полое кольцо (трудно крутится).",
            },
        ],
    },
    // 3.2 Тяга
    {
        title: "Тяга (двигатели)",
        params: [
            {
                label: "Маршевый (вперёд)",
                key: "propulsion.thrustForwardN",
                min: 1000,
                max: 100000,
                unit: "Н",
                tooltip:
                    "Сила переднего двигателя. Определяет ускорение вперёд: a = F/m.",
            },
            {
                label: "Тормозной (назад)",
                key: "propulsion.thrustReverseN",
                min: 1000,
                max: 50000,
                unit: "Н",
                tooltip:
                    "Сила заднего двигателя. Меньше маршевого = торможение медленнее разгона.",
            },
            {
                label: "Боковые (стрейф)",
                key: "propulsion.thrustLateralN",
                min: 1000,
                max: 50000,
                unit: "Н",
                tooltip:
                    "Сила боковых двигателей. Для коррекции дрейфа и стрейфа.",
            },
            {
                label: "Поворотные (момент)",
                key: "propulsion.turnTorqueNm",
                min: 1000,
                max: 100000,
                unit: "Н*м",
                tooltip:
                    "Крутящий момент поворотных двигателей. Больше = быстрее поворот.",
            },
        ],
    },
    // 3.3 Лимиты скорости
    {
        title: "Лимиты скорости",
        params: [
            {
                label: "Макс. вперёд",
                key: "limits.speedLimitForwardMps",
                min: 50,
                max: 600,
                unit: "м/с",
                tooltip:
                    "Мягкий лимит. FA мягко тормозит при превышении (не жёсткий clamp).",
            },
            {
                label: "Макс. назад",
                key: "limits.speedLimitReverseMps",
                min: 50,
                max: 400,
                unit: "м/с",
                tooltip: "Лимит скорости движения задним ходом.",
            },
            {
                label: "Макс. вбок",
                key: "limits.speedLimitLateralMps",
                min: 50,
                max: 500,
                unit: "м/с",
                tooltip: "Лимит бокового скольжения.",
            },
            {
                label: "Макс. угловая",
                key: "limits.angularSpeedLimitRadps",
                min: 0.5,
                max: 12.6,
                unit: "рад/с",
                tooltip: "Лимит скорости вращения.",
            },
        ],
    },
    // 3.4 FA — Линейное управление
    {
        title: "FA — Линейное управление",
        params: [
            {
                label: "Время разгона",
                key: "assist.accelTimeS",
                min: 0.05,
                max: 3.0,
                unit: "с",
                tooltip:
                    "Желаемое время набора скорости. Реальное ограничено тягой и массой (a <= thrust/mass).",
            },
            {
                label: "Время торможения",
                key: "assist.comfortableBrakingTimeS",
                min: 0.5,
                max: 10.0,
                unit: "с",
                tooltip:
                    "Желаемое время остановки при отпускании ввода. Также ограничено тягой.",
            },
            {
                label: "Порог ошибки скорости",
                key: "assist.velocityErrorThreshold",
                min: 0.01,
                max: 0.5,
                tooltip:
                    "Минимальная разница скоростей для коррекции FA. Ниже порога — FA не вмешивается.",
            },
            {
                label: "Мёртвая зона ввода",
                key: "assist.inputMagnitudeThreshold",
                min: 0.001,
                max: 0.1,
                tooltip:
                    "Минимальное отклонение джойстика для распознавания ввода.",
            },
            {
                label: "Доля тяги автоторм.",
                key: "assist.autoBrakeMaxThrustFraction",
                min: 0.1,
                max: 1.0,
                tooltip:
                    "Какую долю тяги FA использует для торможения при холостом ходе. 1.0 = полная тяга.",
            },
        ],
    },
    // 3.5 FA — Угловое управление
    {
        title: "FA — Угловое управление",
        params: [
            {
                label: "Усиление поворота",
                key: "assist.yawRateGain",
                min: 0.5,
                max: 20.0,
                tooltip:
                    "Множитель отклика поворота. Больше = резче реакция.",
            },
            {
                label: "Угол полн. откл.",
                key: "assist.yawFullDeflectionAngleRad",
                min: 0.5,
                max: 3.14,
                unit: "рад",
                tooltip:
                    "При каком угле джойстика от носа достигается макс. скорость поворота.",
            },
            {
                label: "Мёртвая зона угла",
                key: "assist.angularDeadzoneRad",
                min: 0,
                max: 0.1,
                unit: "рад",
                tooltip:
                    "Угол рассогласования, ниже которого FA не поворачивает. Гасит дрожание.",
            },
            {
                label: "Время реакции",
                key: "assist.reactionTimeS",
                min: 0,
                max: 0.5,
                unit: "с",
                tooltip:
                    "Задержка между вводом и началом поворота. Имитирует инерцию отклика.",
            },
            {
                label: "Время остановки вращ.",
                key: "assist.angularStopTimeS",
                min: 0.05,
                max: 1.0,
                unit: "с",
                tooltip:
                    "За сколько секунд прекращается поворот после отпускания ввода.",
            },
            {
                label: "Усиление угл. торм.",
                key: "assist.angularBrakeBoostFactor",
                min: 1.0,
                max: 5.0,
                tooltip:
                    "Множитель скорости остановки поворота (>1 = тормозит быстрее, чем разгоняется).",
            },
        ],
    },
    // 3.6 FA — Задний ход (ЗАБЛОКИРОВАНО)
    {
        title: "FA — Задний ход",
        params: [
            {
                label: "Угол зоны задн. хода",
                key: "assist.reverseZoneAngleDeg",
                min: 0,
                max: 90,
                unit: "\u00B0",
                tooltip:
                    "Новая механика, пока не реализована в движке. Будет доступна в следующем обновлении.",
                locked: true,
                lockTooltip:
                    "Новая механика, пока не реализована в движке. Будет доступна в следующем обновлении.",
            },
        ],
    },
    // 3.7 FA — Компенсация дрейфа
    {
        title: "FA — Компенсация дрейфа",
        params: [
            {
                label: "Включена",
                key: "assist.counterAccelEnabled",
                min: 0,
                max: 1,
                isBoolean: true,
                tooltip:
                    "Активная компенсация бокового сноса. Выключение = дрифт.",
            },
            {
                label: "Порог угла",
                key: "assist.counterAccelDirectionThresholdDeg",
                min: 5,
                max: 90,
                unit: "\u00B0",
                tooltip:
                    "При каком расхождении вектора скорости и курса включается коррекция.",
            },
            {
                label: "Время коррекции",
                key: "assist.counterAccelTimeS",
                min: 0.05,
                max: 1.0,
                unit: "с",
                tooltip:
                    "За сколько секунд гасится боковая составляющая скорости.",
            },
            {
                label: "Мин. скорость",
                key: "assist.counterAccelMinSpeedMps",
                min: 0,
                max: 200,
                unit: "м/с",
                tooltip:
                    "Ниже этой скорости коррекция не работает (чтобы не мешать на малом ходу).",
            },
        ],
    },
    // 3.8 FA — Демпфирование
    {
        title: "FA — Демпфирование",
        params: [
            {
                label: "Гашение превыш. скорости",
                key: "assist.overspeedDampingRate",
                min: 0,
                max: 1.0,
                unit: "доля/тик",
                tooltip:
                    'Какая доля "лишней" скорости гасится за тик. 0 = не гасить.',
            },
            {
                label: "Окно детекции осцилляций",
                key: "assist.yawOscillationWindowFrames",
                min: 4,
                max: 30,
                unit: "кадров",
                tooltip:
                    "Сколько кадров анализируется для обнаружения рысканья.",
            },
            {
                label: "Порог переключ. знака",
                key: "assist.yawOscillationSignFlipsThreshold",
                min: 2,
                max: 10,
                unit: "шт.",
                tooltip:
                    "Сколько смен направления поворота считаются осцилляцией.",
            },
            {
                label: "Демпфирование рысканья",
                key: "assist.yawDampingBoostFactor",
                min: 1.0,
                max: 5.0,
                tooltip:
                    "Во сколько раз снижается команда поворота при обнаружении осцилляции.",
            },
        ],
    },
    // 3.9 Окружение (мировая физика)
    {
        title: "Окружение",
        params: [
            {
                label: "Ширина карты",
                key: "worldPhysics.widthM",
                min: 200,
                max: 5000,
                unit: "м",
                tooltip:
                    "Ширина игрового поля. Перегенерирует трассу при изменении.",
            },
            {
                label: "Высота карты",
                key: "worldPhysics.heightM",
                min: 200,
                max: 25000,
                unit: "м",
                tooltip:
                    "Высота игрового поля. Увеличьте для длинной трассы (старт внизу, финиш наверху).",
            },
            {
                label: "Продольное сопротивление",
                key: "worldPhysics.forwardDragK",
                min: 0,
                max: 1.0,
                unit: "1/с",
                tooltip:
                    "Коэффициент продольного трения (вдоль направления движения). Больше = быстрее тормозит.",
            },
            {
                label: "Боковое сцепление",
                key: "worldPhysics.lateralGripMultiplier",
                min: 0,
                max: 100,
                unit: "×",
                tooltip:
                    "Множитель бокового сцепления. 1 = изотропно (как раньше). Больше = сильнее гасит боковое скольжение.",
            },
            {
                label: "Угловое сопротивление",
                key: "worldPhysics.angularDragK",
                min: 0,
                max: 5.0,
                unit: "1/с",
                tooltip: "Аналог для вращения.",
            },
            {
                label: "Упругость столкновений",
                key: "worldPhysics.restitution",
                min: 0,
                max: 1.0,
                tooltip:
                    "0 = полностью неупругое (прилипание), 1 = идеально упругое (полный отскок).",
            },
            {
                label: "Упругость проходов",
                key: "worldPhysics.passageRestitution",
                min: 0,
                max: 1.0,
                tooltip:
                    "Упругость столкновений с проходами (passage). По умолчанию вдвое ниже основной — мягче гасит скорость.",
            },
        ],
    },
    // Геометрия трассы
    {
        title: "Геометрия трассы",
        params: [
            {
                label: "Радиус столбов",
                key: "arena.pillarRadius",
                min: 5, max: 100,
                unit: "м",
                tooltip: "Радиус серых препятствий-столбов",
            },
            {
                label: "Радиус шипов",
                key: "arena.spikeRadius",
                min: 5, max: 100,
                unit: "м",
                tooltip: "Радиус красных шипованных препятствий",
            },
            {
                label: "Радиус столба прохода",
                key: "arena.passageRadius",
                min: 5, max: 100,
                unit: "м",
                tooltip: "Радиус каждого столба в проходе",
            },
            {
                label: "Зазор прохода",
                key: "arena.passageGap",
                min: 10, max: 200,
                unit: "м",
                tooltip: "Расстояние между поверхностями столбов прохода. Должен быть > диаметра персонажа.",
            },
        ],
    },
    // Орбы
    {
        title: "Орбы",
        params: [
            {
                label: "Количество",
                key: "orbs.count",
                min: 0, max: 100,
                unit: "шт.",
                tooltip: "Количество орбов на арене. Независимо от плотности препятствий.",
            },
            {
                label: "Плотность (физ.)",
                key: "orbs.density",
                min: 0.001, max: 10,
                unit: "кг/м²",
                tooltip: "Физическая плотность орбов. Масса = density × π × radius². Auto-sync с плотностью персонажа.",
            },
            {
                label: "Мин. радиус",
                key: "orbs.minRadius",
                min: 2, max: 50,
                unit: "м",
                tooltip: "Минимальный радиус орба при генерации",
            },
            {
                label: "Макс. радиус",
                key: "orbs.maxRadius",
                min: 2, max: 100,
                unit: "м",
                tooltip: "Максимальный радиус орба при генерации",
            },
            {
                label: "Мин. скорость",
                key: "orbs.minSpeed",
                min: 0, max: 200,
                unit: "м/с",
                tooltip: "Минимальная начальная скорость орба",
            },
            {
                label: "Макс. скорость",
                key: "orbs.maxSpeed",
                min: 0, max: 500,
                unit: "м/с",
                tooltip: "Максимальная начальная скорость орба",
            },
            {
                label: "Гибнет от шипов",
                key: "orbs.spikeKill",
                min: 0, max: 1,
                isBoolean: true,
                tooltip: "Орб исчезает при контакте с шипом",
            },
        ],
    },
    // Настройки шипов
    {
        title: "Шипы",
        params: [
            {
                label: "Убивает",
                key: "spike.killOnHit",
                min: 0, max: 1,
                isBoolean: true,
                tooltip: "Вкл = мгновенная смерть (как раньше). Выкл = отбрасывание.",
            },
            {
                label: "Уничтожается",
                key: "spike.destroyOnHit",
                min: 0, max: 1,
                isBoolean: true,
                tooltip: "Шип исчезает после столкновения.",
            },
            {
                label: "Импульс отбрасывания",
                key: "spike.knockbackImpulse",
                min: 5_000, max: 200_000,
                step: 1_000,
                unit: "Н·с",
                tooltip: "Импульс при столкновении. dv = импульс / масса. Тяжёлый блоб отлетает меньше.",
            },
        ],
    },
    // 3.11 Масштабирование по массе
    {
        title: "Масштабирование по массе",
        params: [
            {
                label: "Экспонента тяги вперёд",
                key: "massScaling.thrustForwardN.exp",
                min: 0,
                max: 2.0,
                tooltip:
                    "0 = не масштабируется, 0.5 = sqrt, 1.0 = линейно.",
            },
            {
                label: "Экспонента тяги назад",
                key: "massScaling.thrustReverseN.exp",
                min: 0,
                max: 2.0,
                tooltip:
                    "0 = не масштабируется, 0.5 = sqrt, 1.0 = линейно.",
            },
            {
                label: "Экспонента боковой тяги",
                key: "massScaling.thrustLateralN.exp",
                min: 0,
                max: 2.0,
                tooltip:
                    "0 = не масштабируется, 0.5 = sqrt, 1.0 = линейно.",
            },
            {
                label: "Экспонента момента",
                key: "massScaling.turnTorqueNm.exp",
                min: 0,
                max: 3.0,
                tooltip:
                    "0 = момент не растёт с массой, 1.0 = линейно, >1.5 = компенсирует рост инерции (тяжёлые крутятся не хуже лёгких).",
            },
            {
                label: "Экспонента лимита скор.",
                key: "massScaling.speedLimitForwardMps.exp",
                min: 0,
                max: 1.0,
                tooltip:
                    "0 = скорость одинакова для всех масс, 1.0 = тяжёлые медленнее лёгких пропорционально массе.",
            },
        ],
    },
    // Настройки поверхностей зон
    ...["ice", "mud", "turbo", "sand"].map((zone): GroupDef => ({
        title: `Зона: ${zone}`,
        params: [
            { label: "Трение (продольное)", key: `zone.${zone}.forwardDragMultiplier`, min: 0.01, max: 10.0, tooltip: "Множитель продольного трения в зоне." },
            { label: "Сцепление (боковое)", key: `zone.${zone}.lateralGripMultiplier`, min: 0.01, max: 10.0, tooltip: "Множитель бокового сцепления в зоне." },
            { label: "Угл. трение", key: `zone.${zone}.angularDragMultiplier`, min: 0.01, max: 10.0, tooltip: "Множитель углового трения в зоне." },
            { label: "Зонная тяга", key: `zone.${zone}.zoneThrustN`, min: 0, max: 50000, unit: "Н", tooltip: "Постоянная сила по направлению в зоне (турбо-эффект)." },
            { label: "Мн. тяги", key: `zone.${zone}.thrustMultiplier`, min: 0, max: 5.0, tooltip: "Множитель тяги двигателей в зоне." },
            { label: "Мн. поворота", key: `zone.${zone}.turnTorqueMultiplier`, min: 0, max: 5.0, tooltip: "Множитель крутящего момента в зоне." },
            { label: "Мн. лимита скорости", key: `zone.${zone}.speedLimitMultiplier`, min: 0.1, max: 3.0, tooltip: "Множитель лимита скорости в зоне." },
        ],
    })),
    // Trail / Следы движения
    {
        title: "Следы движения",
        params: [
            {
                label: "Включен",
                key: "trail.enabled",
                min: 0, max: 1,
                isBoolean: true,
                tooltip: "Показывать следы движения персонажа.",
            },
            {
                label: "Паттерн",
                key: "trail.pattern",
                isSelect: true,
                options: [
                    { label: "Моноцвет", value: "off" },
                    { label: "По дрифту", value: "drift" },
                    { label: "Радуга", value: "rainbow" },
                ],
                tooltip: "Способ раскраски следов: один цвет, по углу дрифта или радуга.",
            },
            {
                label: "Основной цвет",
                key: "trail.primaryColor",
                isColor: true,
                tooltip: "Цвет следа при движении прямо.",
            },
            {
                label: "Цвет дрифта",
                key: "trail.driftColor",
                isColor: true,
                tooltip: "Цвет следа при боковом движении (дрифте).",
            },
            {
                label: "Период радуги",
                key: "trail.rainbowPeriodSec",
                min: 0.5, max: 10.0,
                unit: "с",
                tooltip: "Период полного цикла радуги в секундах.",
            },
            {
                label: "Длина",
                key: "trail.maxAge",
                min: 0.1, max: 5.0,
                unit: "с",
                tooltip: "Время жизни точки следа. Больше = длиннее хвост.",
            },
            {
                label: "Непрозрачность",
                key: "trail.baseAlpha",
                min: 0.1, max: 1.0,
                tooltip: "Начальная непрозрачность точки следа.",
            },
        ],
    },
];
