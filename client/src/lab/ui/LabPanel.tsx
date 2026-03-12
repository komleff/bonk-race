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
import { PARAM_GROUPS, type ParamDef, type GroupDef } from "./paramDefs";

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
