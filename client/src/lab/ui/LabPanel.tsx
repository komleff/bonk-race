/**
 * LabPanel — Preact sidebar component for BonkLab parameter tuning.
 *
 * Renders all physics/FA parameters from TZ sections 3.1-3.11 as grouped
 * sliders with live two-way binding to BonkLab.updateParams().
 */

import { Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import type { BonkLab } from "../BonkLab";
import panelCss from "./lab-panel.css?raw";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParamDef {
    label: string;
    key: string;
    min: number;
    max: number;
    unit?: string;
    tooltip?: string;
    locked?: boolean;
    lockTooltip?: string;
    isBoolean?: boolean;
}

interface GroupDef {
    title: string;
    params: ParamDef[];
}

// ─── Parameter definitions (TZ 3.1–3.11) ────────────────────────────────────

const PARAM_GROUPS: GroupDef[] = [
    // 3.1 Geometry & Mass
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
                max: 30,
                unit: "м",
                tooltip:
                    "Радиус тела персонажа.",
            },
            {
                label: "Коэф. инерции",
                key: "geometry.inertiaFactor",
                min: 0.1,
                max: 2.0,
                tooltip:
                    "Множитель момента инерции (I = factor * mass * r^2). Больше = труднее поворачивать.",
            },
        ],
    },
    // 3.2 Propulsion
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
    // 3.3 Speed limits
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
    // 3.4 FA — Linear control
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
    // 3.5 FA — Angular control
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
    // 3.6 FA — Reverse zone (LOCKED)
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
    // 3.7 FA — Drift compensation
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
    // 3.8 FA — Damping
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
    // 3.9 Environment (world physics)
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
                max: 10000,
                unit: "м",
                tooltip:
                    "Высота игрового поля. Увеличьте для длинной трассы (старт внизу, финиш наверху).",
            },
            {
                label: "Линейное сопротивление",
                key: "worldPhysics.linearDragK",
                min: 0,
                max: 1.0,
                unit: "1/с",
                tooltip:
                    'Коэффициент "воздушного" трения. Сила = -dragK * velocity. Больше = быстрее тормозит.',
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
    // 3.10 Zones
    {
        title: "Зоны",
        params: [
            {
                label: "Лёд: трение",
                key: "zones.ice.frictionMultiplier",
                min: 0,
                max: 1.0,
                tooltip: "Множитель трения на ледяной зоне.",
            },
            {
                label: "Слизь: трение",
                key: "zones.slime.frictionMultiplier",
                min: 0.5,
                max: 10.0,
                tooltip: "Множитель трения на слизи.",
            },
            {
                label: "Слизь: скорость",
                key: "zones.slime.speedMultiplier",
                min: 0.1,
                max: 1.0,
                tooltip: "Множитель скорости на слизи.",
            },
            {
                label: "Турбо: скорость",
                key: "zones.turbo.speedMultiplier",
                min: 1.0,
                max: 10.0,
                tooltip: "Множитель скорости на турбо-зоне.",
            },
        ],
    },
    // 3.11 Mass scaling
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
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate step based on range. Integer ranges get step=1,
 * small floating ranges get 0.01 or 0.001.
 */
function autoStep(min: number, max: number): number {
    const range = max - min;
    if (range <= 0.2) return 0.001;
    if (range <= 2) return 0.01;
    if (range <= 20) return 0.1;
    if (range <= 200) return 1;
    return Math.max(1, Math.round(range / 1000));
}

/**
 * Format a number for display. Avoids floating point ugliness.
 */
function formatValue(v: number, step: number): string {
    if (step >= 1) return String(Math.round(v));
    const decimals = step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
    return v.toFixed(decimals);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ParamSlider({
    def,
    value,
    onChange,
}: {
    def: ParamDef;
    value: number | boolean;
    onChange: (key: string, val: number | boolean) => void;
}) {
    const [tooltipOpen, setTooltipOpen] = useState(false);

    // Boolean toggle
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
                                title="Info"
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

    // Numeric slider
    const numValue = typeof value === "number" ? value : 0;
    const step = autoStep(def.min, def.max);

    const handleSlider = (e: Event) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(v)) onChange(def.key, v);
    };

    const handleNumber = (e: Event) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(v)) {
            // Clamp to range
            const clamped = Math.min(def.max, Math.max(def.min, v));
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
                        title="Info"
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
                    min={def.min}
                    max={def.max}
                    step={step}
                    value={numValue}
                    onInput={handleSlider}
                />
                <input
                    type="number"
                    class="lab-param-number"
                    min={def.min}
                    max={def.max}
                    step={step}
                    value={formatValue(numValue, step)}
                    onInput={handleNumber}
                />
                {def.unit && <span class="lab-param-unit">{def.unit}</span>}
            </div>
            <div class="lab-param-range">
                [{formatValue(def.min, step)} ... {formatValue(def.max, step)}]
            </div>
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
    values: Record<string, number | boolean>;
    onChange: (key: string, val: number | boolean) => void;
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

// ─── Main component ──────────────────────────────────────────────────────────

export interface LabPanelProps {
    lab: BonkLab;
}

export function LabPanel({ lab }: LabPanelProps) {
    // Inject styles once
    useEffect(() => {
        injectStyles("lab-panel-styles", panelCss);
    }, []);

    // Panel open/closed state
    const [panelOpen, setPanelOpen] = useState(true);

    // Expanded groups — first 2 expanded by default
    const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>(() => {
        const map: Record<number, boolean> = {};
        PARAM_GROUPS.forEach((_, i) => {
            map[i] = i < 2;
        });
        return map;
    });

    // Local copy of values for reactivity
    const [values, setValues] = useState<Record<string, number | boolean>>(
        () => ({ ...lab.params }),
    );

    const toggleGroup = useCallback((index: number) => {
        setExpandedGroups((prev) => ({
            ...prev,
            [index]: !prev[index],
        }));
    }, []);

    const handleChange = useCallback(
        (key: string, val: number | boolean) => {
            lab.updateParams(key, val);
            setValues((prev) => ({ ...prev, [key]: val }));
        },
        [lab],
    );

    // On mobile, default panel hidden
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

    // On mobile, panel hidden by default
    useEffect(() => {
        if (isMobile) setPanelOpen(false);
    }, [isMobile]);

    // Toggle button
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
