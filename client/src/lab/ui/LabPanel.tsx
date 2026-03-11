/**
 * LabPanel — Preact-компонент боковой панели для настройки параметров BonkLab.
 *
 * Рендерит все физические/FA параметры из ТЗ разделов 3.1–3.11 в виде группированных
 * слайдеров с двусторонней привязкой к BonkLab.updateParams().
 */

import { Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import type { BonkLab } from "../BonkLab";
import panelCss from "./lab-panel.css?raw";

// ─── Типы ────────────────────────────────────────────────────────────────────

interface ParamDef {
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

interface GroupDef {
    title: string;
    params: ParamDef[];
}

// ─── Определения параметров (ТЗ 3.1–3.11) ────────────────────────────────────

const PARAM_GROUPS: GroupDef[] = [
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

// ─── Вспомогательные функции ──────────────────────────────────────────────────

/**
 * Вычисляет шаг на основе диапазона. Целочисленные диапазоны получают step=1,
 * малые дробные — 0.01 или 0.001.
 */
function autoStep(min: number, max: number): number {
    const range = max - min;
    // Если min очень маленький, используем шаг, способный его представить
    if (min > 0 && min < 0.01) return 0.001;
    if (min > 0 && min < 0.1) return 0.01;
    if (range <= 0.2) return 0.001;
    if (range <= 2) return 0.01;
    if (range <= 20) return 0.1;
    if (range <= 200) return 1;
    return Math.max(1, Math.round(range / 1000));
}

/**
 * Форматирует число для отображения. Избегает артефактов плавающей точки.
 */
function formatValue(v: number, step: number): string {
    if (step >= 1) return String(Math.round(v));
    const decimals = step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
    return v.toFixed(decimals);
}

// ─── Подкомпоненты ───────────────────────────────────────────────────────────

function ParamSlider({
    def,
    value,
    onChange,
}: {
    def: ParamDef;
    value: number | boolean | string;
    onChange: (key: string, val: number | boolean | string) => void;
}) {
    const [tooltipOpen, setTooltipOpen] = useState(false);

    // Выбор цвета
    if (def.isColor) {
        const colorValue = typeof value === "string" ? value : "#44aaff";

        // Локальный state для текстового ввода hex — позволяет печатать промежуточные значения
        const [hexInput, setHexInput] = useState(colorValue);
        const [hexFocused, setHexFocused] = useState(false);

        // Синхронизация при внешнем изменении (color picker, reset, import)
        useEffect(() => {
            if (!hexFocused) setHexInput(colorValue);
        }, [colorValue, hexFocused]);

        // Валидация формата hex-цвета
        const isValidHex = (hex: string): boolean => /^#[0-9a-fA-F]{6}$/.test(hex);

        const handleColorChange = (newColor: string) => {
            // HTML5 color input всегда возвращает валидный #RRGGBB
            if (!def.locked) onChange(def.key, newColor);
        };

        const applyHexValue = (raw: string) => {
            if (isValidHex(raw) && !def.locked) {
                onChange(def.key, raw);
            } else {
                // Откатить к текущему валидному значению
                setHexInput(colorValue);
            }
        };

        const handleHexInput = (e: Event) => {
            setHexInput((e.target as HTMLInputElement).value);
        };

        const handleHexBlur = () => {
            setHexFocused(false);
            applyHexValue(hexInput);
        };

        const handleHexKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                applyHexValue(hexInput);
                (e.target as HTMLInputElement).blur();
            }
        };

        return (
            <div class={`lab-param${def.locked ? " locked" : ""}`}>
                <div class="lab-param-label-row">
                    <span class="lab-param-label">
                        {def.locked && <span class="lab-lock-icon">&#x1F512;</span>}
                        {def.label}
                    </span>
                    {def.tooltip && (
                        <button
                            class="lab-param-info"
                            onClick={() => setTooltipOpen(!tooltipOpen)}
                            title="Подсказка"
                        >
                            i
                        </button>
                    )}
                </div>
                {tooltipOpen && def.tooltip && (
                    <div class="lab-param-tooltip">{def.lockTooltip || def.tooltip}</div>
                )}
                <div class="lab-param-controls">
                    <input
                        type="color"
                        class="lab-param-color"
                        value={colorValue}
                        onChange={(e) => handleColorChange((e.target as HTMLInputElement).value)}
                    />
                    <input
                        type="text"
                        class="lab-param-hex"
                        value={hexInput}
                        placeholder="#44aaff"
                        onInput={handleHexInput}
                        onFocus={() => setHexFocused(true)}
                        onBlur={handleHexBlur}
                        onKeyDown={handleHexKeyDown}
                        title="Формат: #RRGGBB (например #44aaff)"
                    />
                </div>
            </div>
        );
    }

    // Выпадающий список
    if (def.isSelect) {
        const selectValue = typeof value === "string" ? value : "drift";
        const options = def.options || [];
        return (
            <div class={`lab-param${def.locked ? " locked" : ""}`}>
                <div class="lab-param-label-row">
                    <span class="lab-param-label">
                        {def.locked && <span class="lab-lock-icon">&#x1F512;</span>}
                        {def.label}
                    </span>
                    {def.tooltip && (
                        <button
                            class="lab-param-info"
                            onClick={() => setTooltipOpen(!tooltipOpen)}
                            title="Подсказка"
                        >
                            i
                        </button>
                    )}
                </div>
                {tooltipOpen && def.tooltip && (
                    <div class="lab-param-tooltip">{def.lockTooltip || def.tooltip}</div>
                )}
                <div class="lab-param-controls">
                    <select
                        class="lab-param-select"
                        value={selectValue}
                        onChange={(e) => !def.locked && onChange(def.key, (e.target as HTMLSelectElement).value)}
                    >
                        {options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    // Булевый переключатель
    if (def.isBoolean) {
        const checked = Boolean(value);
        return (
            <div class={`lab-param${def.locked ? " locked" : ""}`}>
                <div class="lab-toggle-row">
                    <div class="lab-param-label-row" style={{ flex: 1, marginBottom: 0 }}>
                        <span class="lab-param-label">
                            {def.locked && <span class="lab-lock-icon">&#x1F512;</span>}
                            {def.label}
                        </span>
                        {def.tooltip && (
                            <button
                                class="lab-param-info"
                                onClick={() => setTooltipOpen(!tooltipOpen)}
                                title="Подсказка"
                            >
                                i
                            </button>
                        )}
                    </div>
                    <button
                        class={`lab-toggle-switch${checked ? " on" : ""}`}
                        onClick={() => !def.locked && onChange(def.key, !checked)}
                    />
                </div>
                {tooltipOpen && def.tooltip && (
                    <div class="lab-param-tooltip">{def.lockTooltip || def.tooltip}</div>
                )}
            </div>
        );
    }

    // Числовой слайдер
    const numValue = typeof value === "number" ? value : 0;
    const step = def.step ?? autoStep(def.min ?? 0, def.max ?? 100);

    const handleSlider = (e: Event) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(v)) onChange(def.key, v);
    };

    const handleNumber = (e: Event) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(v)) {
            // Ограничить диапазоном если min/max определены
            const min = def.min ?? Number.NEGATIVE_INFINITY;
            const max = def.max ?? Number.POSITIVE_INFINITY;
            const clamped = Math.min(max, Math.max(min, v));
            onChange(def.key, clamped);
        }
    };

    return (
        <div class={`lab-param${def.locked ? " locked" : ""}`}>
            <div class="lab-param-label-row">
                <span class="lab-param-label">
                    {def.locked && <span class="lab-lock-icon">&#x1F512;</span>}
                    {def.label}
                </span>
                {def.tooltip && (
                    <button
                        class="lab-param-info"
                        onClick={() => setTooltipOpen(!tooltipOpen)}
                        title="Подсказка"
                    >
                        i
                    </button>
                )}
            </div>
            {tooltipOpen && def.tooltip && (
                <div class="lab-param-tooltip">
                    {def.lockTooltip || def.tooltip}
                </div>
            )}
            <div class="lab-param-controls">
                <input
                    type="range"
                    class="lab-param-slider"
                    min={def.min ?? 0}
                    max={def.max ?? 100}
                    step={step}
                    value={numValue}
                    onInput={handleSlider}
                    disabled={def.locked}
                />
                <input
                    type="number"
                    class="lab-param-number"
                    min={def.min}
                    max={def.max}
                    step={step}
                    value={formatValue(numValue, step)}
                    onInput={handleNumber}
                    disabled={def.locked}
                />
                {def.unit && <span class="lab-param-unit">{def.unit}</span>}
            </div>
            {def.min !== undefined && def.max !== undefined && (
                <div class="lab-param-range">
                    [{formatValue(def.min, step)} ... {formatValue(def.max, step)}]
                </div>
            )}
        </div>
    );
}

function PanelGroup({
    group,
    expanded,
    onToggle,
    values,
    onChange,
}: {
    group: GroupDef;
    expanded: boolean;
    onToggle: () => void;
    values: Record<string, number | boolean | string>;
    onChange: (key: string, val: number | boolean | string) => void;
}) {
    return (
        <div class="lab-group">
            <div class="lab-group-header" onClick={onToggle}>
                <span class="lab-group-title">{group.title}</span>
                <span class="lab-group-badge">
                    <span class="lab-group-count">{group.params.length}</span>
                    <span class={`lab-group-chevron${expanded ? " open" : ""}`}>
                        &#x25B6;
                    </span>
                </span>
            </div>
            {expanded && (
                <div class="lab-group-body">
                    {group.params.map((p) => (
                        <ParamSlider
                            key={p.key}
                            def={p}
                            value={values[p.key] ?? 0}
                            onChange={onChange}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Главный компонент ───────────────────────────────────────────────────────

export interface LabPanelProps {
    lab: BonkLab;
    /** Инкрементируется извне (reset/import/preset) для синхронизации значений */
    syncTrigger?: number;
    /** Вызывается при ручном изменении параметра через слайдер */
    onParamChanged?: () => void;
}

export function LabPanel({ lab, syncTrigger, onParamChanged }: LabPanelProps) {
    // Инжектируем стили один раз
    useEffect(() => {
        injectStyles("lab-panel-styles", panelCss);
    }, []);

    // Состояние открытия/закрытия панели
    const [panelOpen, setPanelOpen] = useState(true);

    // Раскрытые группы — первые 2 раскрыты по умолчанию
    const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>(() => {
        const map: Record<number, boolean> = {};
        PARAM_GROUPS.forEach((_, i) => {
            map[i] = i < 2;
        });
        return map;
    });

    // Локальная копия значений для реактивности
    const [values, setValues] = useState<Record<string, number | boolean | string>>(
        () => ({ ...lab.params }),
    );

    // Повторная синхронизация при внешнем изменении параметров (reset/import/preset)
    useEffect(() => {
        if (syncTrigger !== undefined && syncTrigger > 0) {
            setValues({ ...lab.params });
        }
    }, [syncTrigger, lab]);

    const toggleGroup = useCallback((index: number) => {
        setExpandedGroups((prev) => ({
            ...prev,
            [index]: !prev[index],
        }));
    }, []);

    const handleChange = useCallback(
        (key: string, val: number | boolean | string) => {
            lab.updateParams(key, val);
            // После updateParams некоторые ключи вызывают побочные эффекты (напр. mass → авто-синхронизация плотности орбов).
            // Перечитываем все параметры, которые могли измениться.
            setValues({ ...lab.params });
            onParamChanged?.();
        },
        [lab, onParamChanged],
    );

    // На мобильных панель скрыта по умолчанию
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth < 768,
    );

    useEffect(() => {
        const onResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // На мобильных скрываем панель при инициализации
    useEffect(() => {
        if (isMobile) setPanelOpen(false);
    }, [isMobile]);

    // Кнопка переключения панели
    const toggleButton = (
        <button
            class="lab-panel-toggle"
            onClick={() => setPanelOpen(!panelOpen)}
            title={panelOpen ? "Скрыть панель" : "Показать панель"}
        >
            {panelOpen ? "\u00BB" : "\u00AB"}
        </button>
    );

    if (!panelOpen) {
        return <Fragment>{toggleButton}</Fragment>;
    }

    return (
        <Fragment>
            {toggleButton}
            <div class="lab-panel">
                <div class="lab-panel-header">
                    <h2>BonkLab</h2>
                    <button
                        class="lab-panel-close"
                        onClick={() => setPanelOpen(false)}
                        title="Скрыть"
                    >
                        &times;
                    </button>
                </div>
                <div class="lab-panel-content">
                    {PARAM_GROUPS.map((group, i) => (
                        <PanelGroup
                            key={i}
                            group={group}
                            expanded={!!expandedGroups[i]}
                            onToggle={() => toggleGroup(i)}
                            values={values}
                            onChange={handleChange}
                        />
                    ))}
                </div>
            </div>
        </Fragment>
    );
}

export default LabPanel;
