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
import { TUG_SIZES, TRAILER_SIZES, SIZE_HELP } from "../../u2taglab/profile";
import { spaceGroups } from "../../u2taglab/ui/paramDefs";
import { fitTrainLink } from "../../tuglab2/config";
import type { AssistantSettings } from "../../tuglab2/assistant";
import type { TrainModule, TrainShipConfig } from "../../tuglab2/types";
import { PARAM_GROUPS, TOW_GROUP, type ParamDef, type GroupDef } from "./paramDefs";

// Те же строки параметров и раскрываемые группы; поезд расширяет существующую панель.
function trainGroups(paused: boolean): GroupDef[] {
    const number = (key: string, label: string, min: number, max: number, step: number, tooltip = ''): ParamDef => ({ key, label, min, max, step, strictNumber: true, tooltip, locked: !paused });
    const modules = ['S', 'M', 'L', 'XL', 'custom'].map(value => ({ value, label: value === 'custom' ? 'Свои значения' : value }));
    return [
        { title: 'Второй тягач C и прицеп B', params: [
            number('mass', 'Масса A, кг', 1, 1e12, 1000), number('train.B.mass', 'Масса B, кг', 1, 1e12, 1000), number('train.C.mass', 'Масса C, кг', 1, 1e12, 1000),
            { key: 'train.C.enginesEnabled', label: 'Двигатели C включены', isBoolean: true, locked: !paused },
            number('train.C.reverseForce', 'C: ретротяга, Н', 0, 1e12, 10000), number('train.C.lateralForce', 'C: боковая тяга, Н', 0, 1e12, 10000),
            number('train.C.yawTorque', 'C: момент, Н·м', 0, 1e14, 100000),
            number('train.C.speedLimit', 'C: допуск скорости захвата, м/с', 0.1, 1000, 1, 'Три осевых LAB-допуска синхронизируются этим полем. Скорости не обрезаются. Маршевая команда C всегда равна нулю.'),
        ] },
        ...(['AB', 'BC'] as const).map(id => ({ title: `Пружина ${id}`, params: [
            { key: `train.${id}.module`, label: `${id}: модуль`, isSelect: true, options: modules, locked: !paused },
            number(`train.${id}.restLength`, `${id}: длина, м`, 20, 2000, 1, 'Норма нового старта. LAB-предел захвата задаётся модулем отдельно и не меняется с этой длиной. Повторная сцепка принимает фактическую длину. Меняет только эту связь; новый старт на той же карте.'),
            number(`train.${id}.k`, `${id}: k, Н/м`, 0, 1e10, 1000), number(`train.${id}.c`, `${id}: c, Н·с/м`, 0, 1e10, 10000),
        ] })),
        { title: 'Ассистент C', params: [
            { key: 'assistant.mode', label: 'Режим C', isSelect: true, options: [{ value: 'coast', label: 'Накат' }, { value: 'guard', label: 'Страховка' }, { value: 'brake', label: 'Помощь при торможении' }], locked: !paused, tooltip: 'После размыкания любой связи помощь выключена до явного выбора режима. B пассивен, у C нет маршевой команды.' },
            number('assistant.g', 'Участие C', 0, 1, 0.01), number('assistant.delay', 'Задержка C, с', 0, 2, 0.01),
            ...(['Td', 'Tv', 'Tlat', 'Tyaw'] as const).map(key => number(`assistant.${key}`, `${key}, с`, 0.25, 10, 0.25)),
            number('assistant.epsilon', 'Мёртвая зона C', 0, 0.1, 0.005), number('assistant.yawDamping', 'Гашение вращения C', 0, 10, 0.1),
        ] },
    ];
}
function panelValues(lab: BonkLab): Record<string, number | string | boolean> {
    const values = { ...lab.params }, config = lab.getTrainConfig(), settings = lab.getTrainSettings();
    if (config) {
        for (const id of ['B', 'C'] as const) for (const [key, value] of Object.entries(config.ships[id])) if (['number', 'string', 'boolean'].includes(typeof value)) values[`train.${id}.${key}`] = value as number | string | boolean;
        for (const id of ['AB', 'BC'] as const) for (const [key, value] of Object.entries(config.links[id])) values[`train.${id}.${key}`] = value;
    }
    if (settings) for (const [key, value] of Object.entries(settings)) values[`assistant.${key}`] = value;
    return values;
}

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
    const towNumber = (def.key.startsWith("tow.") || def.key.startsWith("space.") || def.strictNumber) && typeof value === "number";
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
    const [sizeError, setSizeError] = useState('');
    const [sizeHelp, setSizeHelp] = useState(false);
    const train = lab.towingComposition === 'ABC', paused = lab.getState().train?.paused ?? true;
    const baseGroups = lab.isSpace ? spaceGroups(String(lab.params["tow.type"]), String(lab.params["tow.dampingMode"])) : towing ? [TOW_GROUP, ...PARAM_GROUPS] : PARAM_GROUPS;
    const groups = train ? [...trainGroups(paused).map(group => group.title === 'Ассистент C' ? { ...group, params: group.params.map(def => ({ ...def, locked: false })) } : group), ...baseGroups.filter(group => group.title !== 'Корабли и сцепка (SI)').map(group => ({ ...group, params: group.params.map(def => ({ ...def, locked: !paused })) }))] : baseGroups;
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
        () => panelValues(lab),
    );

    // Повторная синхронизация при внешнем изменении параметров (reset/import/preset)
    useEffect(() => {
        if (syncTrigger !== undefined && syncTrigger > 0) {
            setValues(panelValues(lab));
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
            try {
                let result: { ok: boolean; reason?: string } | undefined;
                if (key.startsWith('assistant.')) result = lab.setTrainSettings({ [key.slice(10)]: val } as Partial<AssistantSettings>);
                else if (key.startsWith('train.')) {
                    const config = lab.getTrainConfig(); if (!config) throw new Error('Поезд не выбран');
                    const [, id, field] = key.split('.');
                    if (id === 'AB' || id === 'BC') {
                        if (field === 'module' && val !== 'custom') config.links[id] = fitTrainLink(val as Exclude<TrainModule, 'custom'>);
                        else { Object.assign(config.links[id], { [field]: val }); if (field !== 'module') config.links[id].module = 'custom'; }
                    } else if (id === 'B' || id === 'C') {
                        Object.assign(config.ships[id], { [field]: val } as Partial<TrainShipConfig>);
                        if (field === 'speedLimit') config.ships[id].speedLimits = { forward: Number(val), reverse: Number(val), lateral: Number(val) };
                    }
                    result = lab.setTrainConfig(config);
                } else lab.updateParams(key, val);
                if (result && !result.ok) throw new Error(result.reason || 'Недопустимые параметры поезда');
                setSizeError('');
            } catch (error) { setSizeError(error instanceof Error ? error.message : 'Ошибка параметров'); }
            setValues(panelValues(lab)); onParamChanged?.();
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
                    {lab.isSpace && <div class="tug-size-picker">
                        {(train ? ['A', 'B', 'C'] as const : ['A', 'B'] as const).map(id => <div class="tug-size-row" role="group" aria-label={id === 'A' ? 'Размер тягача' : id === 'B' ? 'Размер прицепа' : 'Размер тягача C'}>
                            <span>{id === 'A' ? 'Тягач A' : id === 'B' ? 'Прицеп B' : 'Тягач C'}</span>
                            <button class="lab-param-info" aria-label="i" aria-expanded={sizeHelp} onClick={() => setSizeHelp(!sizeHelp)}>i</button>
                            <div class="tug-quick-masses">{(id === 'B' ? TRAILER_SIZES : TUG_SIZES).map(size => <button
                                disabled={train && !paused} aria-pressed={(train ? lab.getTrainConfig()?.ships[id].size : lab.getSpaceSize(id as 'A' | 'B')) === size}
                                onClick={() => {
                                    try { if (train) { const result = lab.selectTrainSize(id, size); if (!result.ok) throw new Error(result.reason); } else lab.selectSpaceSize(id as 'A' | 'B', size); setSizeError(''); setValues(panelValues(lab)); onParamChanged?.(); }
                                    catch (error) { setSizeError(error instanceof Error ? error.message : 'U2TagLab: ошибка выбора'); }
                                }}>{size === 'XXL' ? 'XXL (резерв)' : size}</button>)}</div>
                        </div>)}
                        {sizeHelp && <p class="tug-size-help">{SIZE_HELP}</p>}
                        {sizeError && <p class="tug-error" role="alert">{sizeError}</p>}
                    </div>}
                    {train && <p class="tug-mass-summary">ABC: две независимые пружины. LAB-предел захвата AB {lab.getTrainConfig()?.links.AB.captureMaxLength} м · BC {lab.getTrainConfig()?.links.BC.captureMaxLength} м. Норма старта задаётся отдельно; C без маршевой команды.</p>}
                    {towing && !train && <p class="tug-mass-summary">Масса A: {values.mass} кг · B: {(Number(values.mass) * Number(values["tow.massRatio"])).toFixed(1)} кг</p>}
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
