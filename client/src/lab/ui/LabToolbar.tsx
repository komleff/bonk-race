/**
 * LabToolbar — top toolbar for BonkLab with restart, seed, reset, export/import, presets.
 */

import { Fragment } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import type { BonkLab } from "../BonkLab";
import toolbarCss from "./lab-toolbar.css?raw";
import { PRESETS, DEFAULT_PRESET_IDX } from "./presets";
import { formatTime } from "../labConstants";

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExportModal({
    json,
    onClose,
}: {
    json: string;
    onClose: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleCopy = useCallback(() => {
        if (textareaRef.current) {
            textareaRef.current.select();
            navigator.clipboard.writeText(json).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
            });
        }
    }, [json]);

    return (
        <div class="lab-modal-backdrop" onClick={onClose}>
            <div class="lab-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Экспорт параметров</h3>
                <textarea ref={textareaRef} readOnly value={json} />
                <div class="lab-modal-actions">
                    <button class="lab-tb-btn" onClick={onClose}>
                        Закрыть
                    </button>
                    <button class="lab-tb-btn lab-tb-btn--accent" onClick={handleCopy}>
                        {copied ? "Скопировано!" : "Копировать"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ImportModal({
    onApply,
    onClose,
}: {
    onApply: (data: Record<string, number | boolean | string>) => void;
    onClose: () => void;
}) {
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    const handleApply = useCallback(() => {
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                setError("JSON должен быть объектом { ключ: значение }");
                return;
            }
            onApply(parsed as Record<string, number | boolean | string>);
            onClose();
        } catch {
            setError("Невалидный JSON");
        }
    }, [text, onApply, onClose]);

    return (
        <div class="lab-modal-backdrop" onClick={onClose}>
            <div class="lab-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Импорт параметров</h3>
                <textarea
                    value={text}
                    onInput={(e) => {
                        setText((e.target as HTMLTextAreaElement).value);
                        setError("");
                    }}
                    placeholder='{"propulsion.thrustForwardN": 35000, ...}'
                />
                {error && <div class="lab-modal-error">{error}</div>}
                <div class="lab-modal-actions">
                    <button class="lab-tb-btn" onClick={onClose}>
                        Отмена
                    </button>
                    <button class="lab-tb-btn lab-tb-btn--accent" onClick={handleApply}>
                        Применить
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface LabToolbarProps {
    lab: BonkLab;
    /** Called when params are changed externally (reset/import/preset) so panel can sync */
    onParamsChanged?: () => void;
    /** Incremented when user changes a param via LabPanel slider — marks preset as Custom */
    externalParamChange?: number;
}

export function LabToolbar({ lab, onParamsChanged, externalParamChange }: LabToolbarProps) {
    // Inject styles once
    useEffect(() => {
        injectStyles("lab-toolbar-styles", toolbarCss);
    }, []);

    // True defaults (balance.json + BonkLab overrides, before startup preset)
    const [defaults] = useState<Record<string, number | boolean | string>>(() => lab.getDefaults());

    // Active preset tracking (-1 = Custom, index = preset)
    const [activePreset, setActivePreset] = useState(DEFAULT_PRESET_IDX); // BonkRace v0.3

    // When LabPanel changes a param, mark preset as Custom
    useEffect(() => {
        if (externalParamChange !== undefined && externalParamChange > 0) {
            setActivePreset(-1);
        }
    }, [externalParamChange]);

    // Seed & density state
    const [seed, setSeed] = useState(42);
    const [density, setDensity] = useState(5.0);

    // Timer — poll elapsed time from lab state
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const id = setInterval(() => {
            setElapsed(lab.getState().elapsedTime);
        }, 100);
        return () => clearInterval(id);
    }, [lab]);

    // Modal state
    const [showExport, setShowExport] = useState(false);
    const [showImport, setShowImport] = useState(false);

    // ── Restart (countdown управляется BonkLab.start()) ──
    const handleRestart = useCallback(() => {
        lab.stop();
        lab.reset();
        lab.start();
        setElapsed(0);
    }, [lab]);

    // ── Seed ──
    const handleSeedChange = useCallback(
        (e: Event) => {
            const v = parseInt((e.target as HTMLInputElement).value, 10);
            if (!isNaN(v)) {
                setSeed(v);
                lab.regenerateArena(v, density);
            }
        },
        [lab, density],
    );

    const handleRandomSeed = useCallback(() => {
        const newSeed = Math.floor(Math.random() * 999999);
        setSeed(newSeed);
        lab.regenerateArena(newSeed, density);
    }, [lab, density]);

    // ── Density ──
    const handleDensityChange = useCallback(
        (e: Event) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            if (!isNaN(v)) {
                setDensity(v);
                lab.updateParams("arena.objectDensity", v);
                setActivePreset(-1);
                onParamsChanged?.();
            }
        },
        [lab, onParamsChanged],
    );

    // ── Reset params to defaults + BonkRace v0.3 preset ──
    const handleResetParams = useCallback(() => {
        const preset = PRESETS[DEFAULT_PRESET_IDX];
        // Сброс orbDensityManual перед пакетным применением
        lab.resetOrbDensityManual();
        // Сначала вернуть все параметры к базовым дефолтам (balance.json)
        for (const [key, val] of Object.entries(defaults)) {
            lab.updateParams(key, val);
        }
        // Затем применить пресет поверх
        for (const [key, val] of Object.entries(preset.values)) {
            lab.updateParams(key, val);
        }
        // Синхронизировать toolbar density
        const restoredDensity = (lab.params["arena.objectDensity"] as number) ?? 5.0;
        setDensity(restoredDensity);
        setActivePreset(DEFAULT_PRESET_IDX);
        lab.reset();
        onParamsChanged?.();
    }, [lab, defaults, onParamsChanged]);

    // ── Export (full config) ──
    const getExportJson = useCallback((): string => {
        return JSON.stringify(lab.params, null, 2);
    }, [lab]);

    // ── Import (full config — applies all params from JSON) ──
    const handleImport = useCallback(
        (data: Record<string, number | boolean | string>) => {
            // Reset orbDensityManual before batch-applying imported params
            lab.resetOrbDensityManual();
            // First reset all params to defaults (handles keys missing from old exports)
            for (const [key, val] of Object.entries(defaults)) {
                lab.updateParams(key, val);
            }
            // Then apply imported values on top
            for (const [key, val] of Object.entries(data)) {
                // Only apply keys that exist in current params (ignore unknown keys)
                if (key in lab.params && (typeof val === "number" || typeof val === "boolean" || typeof val === "string")) {
                    lab.updateParams(key, val);
                }
            }
            // Sync toolbar density from imported values
            if (typeof data["arena.objectDensity"] === "number") {
                setDensity(data["arena.objectDensity"]);
            }
            setActivePreset(-1);
            onParamsChanged?.();
        },
        [lab, defaults, onParamsChanged],
    );

    // ── Presets ──
    const handlePreset = useCallback(
        (e: Event) => {
            const idx = parseInt((e.target as HTMLSelectElement).value, 10);
            if (isNaN(idx) || idx < 0) return;

            const preset = PRESETS[idx];

            // Reset orbDensityManual before batch-applying params
            lab.resetOrbDensityManual();

            // First reset all params to defaults
            for (const [key, val] of Object.entries(defaults)) {
                lab.updateParams(key, val);
            }

            // Then apply preset overrides
            for (const [key, val] of Object.entries(preset.values)) {
                lab.updateParams(key, val);
            }

            // Sync toolbar density from restored/overridden value
            setDensity((lab.params["arena.objectDensity"] as number) ?? 5.0);
            setActivePreset(idx);
            onParamsChanged?.();
        },
        [lab, defaults, onParamsChanged],
    );

    return (
        <Fragment>
            <div class="lab-toolbar">
                {/* Title */}
                <span class="lab-toolbar-title">BonkLab <span style="opacity:0.5;font-size:0.75em">v{__APP_VERSION__}</span></span>

                <div class="lab-tb-sep" />

                {/* Restart + timer */}
                <button class="lab-tb-btn lab-tb-btn--accent" onClick={handleRestart}>
                    Restart
                </button>
                <span class="lab-tb-timer">{formatTime(elapsed)}</span>

                <div class="lab-tb-sep" />

                {/* Seed */}
                <div class="lab-tb-seed-group">
                    <span class="lab-tb-seed-label">Seed:</span>
                    <input
                        type="number"
                        class="lab-tb-seed-input"
                        value={seed}
                        onInput={handleSeedChange}
                    />
                    <button class="lab-tb-btn lab-tb-btn--small" onClick={handleRandomSeed}>
                        Rnd
                    </button>
                </div>

                {/* Density */}
                <div class="lab-tb-seed-group">
                    <span class="lab-tb-seed-label" title="Количество объектов на карте (0.1 – 25.0)">
                        Насыщенность:
                    </span>
                    <input
                        type="range"
                        min="0.1"
                        max="25.0"
                        step="0.1"
                        value={density}
                        onInput={handleDensityChange}
                        style={{ width: "80px" }}
                    />
                    <span style={{ minWidth: "28px", textAlign: "center", fontSize: "12px" }}>
                        {density.toFixed(1)}
                    </span>
                </div>

                <div class="lab-tb-sep" />

                {/* Reset params */}
                <button class="lab-tb-btn" onClick={handleResetParams}>
                    Сброс
                </button>

                {/* Export */}
                <button class="lab-tb-btn" onClick={() => setShowExport(true)}>
                    Экспорт
                </button>

                {/* Import */}
                <button class="lab-tb-btn" onClick={() => setShowImport(true)}>
                    Импорт
                </button>

                <div class="lab-tb-sep" />

                {/* Presets */}
                <select class="lab-tb-select" value={activePreset} onChange={handlePreset}>
                    <option value={-1}>
                        {activePreset === -1 ? "Custom" : "Пресеты..."}
                    </option>
                    {PRESETS.map((p, i) => (
                        <option key={i} value={i}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Export modal */}
            {showExport && (
                <ExportModal json={getExportJson()} onClose={() => setShowExport(false)} />
            )}

            {/* Import modal */}
            {showImport && (
                <ImportModal onApply={handleImport} onClose={() => setShowImport(false)} />
            )}
        </Fragment>
    );
}

export default LabToolbar;
