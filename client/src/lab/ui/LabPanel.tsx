/**
 * LabPanel — Preact-компонент боковой панели для настройки параметров BonkLab.
 *
 * Рендерит все физические/FA параметры из ТЗ разделов 3.1–3.11 в виде группированных
 * слайдеров с двусторонней привязкой к BonkLab.updateParams().
 */

import { Fragment, type ComponentChildren } from "preact";
import { useState, useEffect, useLayoutEffect, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import type { BonkLab } from "../BonkLab";
import panelCss from "./lab-panel.css?raw";
import { PARAM_GROUPS, TOW_GROUP, type ParamDef, type GroupDef } from "./paramDefs";

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
    syncTrigger,
}: {
    def: ParamDef;
    value: number | boolean | string;
    onChange: (key: string, val: number | boolean | string) => void;
    syncTrigger?: number;
}) {
    const [tooltipOpen, setTooltipOpen] = useState(false);
    const [numberError, setNumberError] = useState("");
    const towNumber = def.key.startsWith("tow.") && typeof value === "number";
    const [numberDraft, setNumberDraft] = useState(String(value));

    // Внешний reset/preset отменяет черновик даже при неизменном принятом числе.
    useLayoutEffect(() => {
        if (towNumber) {
            setNumberDraft(String(value));
            setNumberError("");
        }
    }, [value, syncTrigger, towNumber]);

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
                        aria-label={def.label}
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

    const acceptTowNumber = (v: number) => {
        setNumberDraft(String(v));
        setNumberError("");
        onChange(def.key, v);
    };

    const handleSlider = (e: Event) => {
        const v = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(v)) {
            if (towNumber) acceptTowNumber(v);
            else onChange(def.key, v);
        }
    };

    const commitTowNumber = (e: Event) => {
        const raw = (e.target as HTMLInputElement).value;
        const v = Number(raw);
        if (!raw.trim() || !Number.isFinite(v) || v < (def.min ?? -Infinity) || v > (def.max ?? Infinity)) {
            setNumberError(`Введите число от ${def.min} до ${def.max}; прежнее значение сохранено.`);
            return;
        }
        acceptTowNumber(v);
    };

    const handleNumber = (e: Event) => {
        const raw = (e.target as HTMLInputElement).value;
        if (towNumber) {
            // Префиксы вроде пустой строки и «0.» не должны менять модель или курсор.
            setNumberDraft(raw);
            setNumberError("");
            return;
        }
        const v = parseFloat(raw);
        setNumberError("");
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
                    aria-label={def.label}
                    aria-invalid={!!numberError}
                    min={def.min}
                    max={def.max}
                    step={step}
                    value={towNumber ? numberDraft : formatValue(numValue, step)}
                    onInput={handleNumber}
                    onBlur={towNumber ? commitTowNumber : undefined}
                    onKeyDown={towNumber ? (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                        }
                    } : undefined}
                    disabled={def.locked}
                />
                {def.unit && <span class="lab-param-unit">{def.unit}</span>}
            </div>
            {numberError && <div class="tug-error" role="alert">{numberError}</div>}
            {def.quickValues && <div class="tug-quick-masses">{def.quickValues.map(v =>
                <button type="button" onClick={() => acceptTowNumber(v)} aria-label={`Масса B / A = ${v}`}>{v}</button>
            )}</div>}
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
    syncTrigger,
}: {
    group: GroupDef;
    expanded: boolean;
    onToggle: () => void;
    values: Record<string, number | boolean | string>;
    onChange: (key: string, val: number | boolean | string) => void;
    syncTrigger?: number;
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
                            syncTrigger={syncTrigger}
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
    towing?: boolean;
    panelOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    settingsContent?: ComponentChildren;
    onPanelVisibilityChanged?: () => void;
    /** Инкрементируется извне (reset/import/preset) для синхронизации значений */
    syncTrigger?: number;
    /** Вызывается при ручном изменении параметра через слайдер */
    onParamChanged?: () => void;
}

export function LabPanel({ lab, syncTrigger, onParamChanged, towing = false, onPanelVisibilityChanged, panelOpen: controlledOpen, onOpenChange, settingsContent }: LabPanelProps) {
    const groups = towing ? [TOW_GROUP, ...PARAM_GROUPS] : PARAM_GROUPS;
    // Инжектируем стили один раз
    useEffect(() => {
        injectStyles("lab-panel-styles", panelCss);
    }, []);

    // Состояние открытия/закрытия панели
    const [localOpen, setLocalOpen] = useState(true);
    const panelOpen = controlledOpen ?? localOpen;
    const setPanelOpen = (open: boolean) => onOpenChange ? onOpenChange(open) : setLocalOpen(open);
    useLayoutEffect(() => { onPanelVisibilityChanged?.(); }, [panelOpen, onPanelVisibilityChanged]);

    // Раскрытые группы — первые 2 раскрыты по умолчанию
    const [expandedGroups, setExpandedGroups] = useState<Record<number, boolean>>(() => {
        const map: Record<number, boolean> = {};
        groups.forEach((_, i) => {
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
        if (isMobile && !towing) setPanelOpen(false);
    }, [isMobile]);

    // Кнопка переключения панели
    const toggleButton = (
        <button
            class={`lab-panel-toggle${panelOpen ? " lab-panel-toggle--open" : ""}`}
            onClick={() => setPanelOpen(!panelOpen)}
            title={panelOpen ? "Скрыть панель" : "Показать панель"}
        >
            {panelOpen ? "\u00BB" : "\u00AB"}
        </button>
    );

    if (!panelOpen) {
        return <Fragment>{!towing && toggleButton}</Fragment>;
    }

    return (
        <Fragment>
            {!towing && toggleButton}
            <div class="lab-panel">
                <div class="lab-panel-header">
                    <h2>{towing ? "TugLab" : "BonkLab"}</h2>
                    <button
                        class="lab-panel-close"
                        onClick={() => setPanelOpen(false)}
                        title="Скрыть"
                        aria-label="Скрыть"
                    >
                        &times;
                    </button>
                </div>
                <div class="lab-panel-content">
                    {settingsContent}
                    {towing && <p class="tug-mass-summary">Масса A: {values.mass} кг · B: {(Number(values.mass) * Number(values["tow.massRatio"])).toFixed(1)} кг</p>}
                    {groups.map((group, i) => (
                        <PanelGroup
                            key={i}
                            group={group}
                            expanded={!!expandedGroups[i]}
                            onToggle={() => toggleGroup(i)}
                            values={values}
                            onChange={handleChange}
                            syncTrigger={syncTrigger}
                        />
                    ))}
                </div>
            </div>
        </Fragment>
    );
}

export default LabPanel;
