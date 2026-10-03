/**
 * LabToolbar — top toolbar for BonkLab with restart, seed, reset, export/import, presets.
 */

import { Fragment } from "preact";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import { LabPanel } from "./LabPanel";
import { createShareUrl, validateShareSnapshot } from "../../tuglab/share";
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
    towing?: boolean;
    syncTrigger?: number;
    onPanelVisibilityChanged?: () => void;
    startupError?: string;
    onClearInput?: () => void;
    /** Called when params are changed externally (reset/import/preset) so panel can sync */
    onParamsChanged?: () => void;
    /** Incremented when user changes a param via LabPanel slider — marks preset as Custom */
    externalParamChange?: number;
}

export function LabToolbar({ lab, onParamsChanged, externalParamChange, towing = false, onClearInput, syncTrigger, onPanelVisibilityChanged, startupError }: LabToolbarProps) {
    // Inject styles once
    useEffect(() => {
        injectStyles("lab-toolbar-styles", toolbarCss);
    }, []);

    // True defaults (balance.json + BonkLab overrides, before startup preset)
    const [defaults] = useState<Record<string, number | boolean | string>>(() => lab.getDefaults());

    // Active preset tracking (-1 = Custom, index = preset)
    const matchingPreset = () => PRESETS.findIndex(preset => {
        const expected = { ...defaults, ...preset.values };
        expected["orbs.density"] = Number(expected.mass) / (Math.PI * Number(expected["geometry.baseRadiusM"]) ** 2);
        return Object.entries(expected).filter(([key]) => !key.startsWith("tow."))
            .every(([key, value]) => lab.params[key] === value);
    });
    const [activePreset, setActivePreset] = useState(towing ? matchingPreset : DEFAULT_PRESET_IDX); // BonkRace v0.3

    // When LabPanel changes a param, mark preset as Custom
    useEffect(() => {
        if (externalParamChange !== undefined && externalParamChange > 0) {
            setActivePreset(-1);
        }
    }, [externalParamChange]);

    // Seed & density state
    const [seed, setSeed] = useState(() => towing ? lab.exportShareSnapshot().seed : 42);
    const [density, setDensity] = useState(() => towing ? lab.exportShareSnapshot().density : 5.0);

    const [panelOpen, setPanelOpen] = useState(false);
    const [shareLink, setShareLink] = useState("");
    const [shareNotice, setShareNotice] = useState("");
    const [shareError, setShareError] = useState("");
    const [launchError, setLaunchError] = useState(startupError ?? "");
    useLayoutEffect(() => { setLaunchError(startupError ?? ""); }, [startupError]);
    useLayoutEffect(() => {
        if (towing && panelOpen) {
            const snapshot = lab.exportShareSnapshot();
            setSeed(snapshot.seed); setDensity(snapshot.density); setActivePreset(matchingPreset());
        }
    }, [panelOpen, syncTrigger, externalParamChange]);
    const handleShare = async () => {
        setShareNotice(""); setShareError("");
        try {
            const link = createShareUrl(location.href, validateShareSnapshot(lab.exportShareSnapshot(), defaults));
            setShareLink(link);
            try {
                await navigator.clipboard.writeText(link);
                setShareNotice("Скопировано!");
            } catch { setShareNotice("Скопируйте ссылку вручную из поля ниже."); }
        } catch (error) { setShareError(error instanceof Error ? error.message : "Не удалось создать ссылку"); }
    };

    // Timer — poll elapsed time from lab state
    const [elapsed, setElapsed] = useState(0);
    const [towState, setTowState] = useState(() => lab.getState().towing);
    useEffect(() => {
        const id = setInterval(() => {
            setElapsed(lab.getState().elapsedTime);
            if (towing) setTowState(lab.getState().towing);
        }, 100);
        return () => clearInterval(id);
    }, [lab, towing]);

    // Modal state
    const [showExport, setShowExport] = useState(false);
    const [showImport, setShowImport] = useState(false);

    // ── Restart (countdown управляется BonkLab.start()) ──
    const handleRestart = useCallback(() => {
        onClearInput?.();
        lab.stop();
        lab.reset();
        lab.start();
        setElapsed(0);
    }, [lab, onClearInput]);

    // ── Seed ──
    const handleSeedChange = useCallback(
        (e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            const v = towing ? Number(raw) : parseInt(raw, 10);
            if (towing ? raw.trim() && Number.isInteger(v) && v >= 0 && v <= 4294967295 : !isNaN(v)) {
                const wasRunning = lab.isRunning;
                setSeed(v);
                onClearInput?.();
                lab.regenerateArena(v, density);
                if (towing && wasRunning) lab.start();
            }
        },
        [lab, density, towing, onClearInput],
    );

    const handleRandomSeed = useCallback(() => {
        const wasRunning = lab.isRunning;
        const random = new Uint32Array(1);
        if (towing) crypto.getRandomValues(random);
        const newSeed = towing ? random[0] : Math.floor(Math.random() * 999999);
        setSeed(newSeed);
        onClearInput?.();
        lab.regenerateArena(newSeed, density);
        if (towing && wasRunning) lab.start();
    }, [lab, density, towing, onClearInput]);

    // ── Density ──
    const handleDensityChange = useCallback(
        (e: Event) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            if (Number.isFinite(v) && v >= 0.1 && v <= 25) {
                const wasRunning = lab.isRunning;
                setDensity(v);
                onClearInput?.();
                lab.updateParams("arena.objectDensity", v);
                if (towing && wasRunning) lab.start();
                setActivePreset(-1);
                onParamsChanged?.();
            }
        },
        [lab, onParamsChanged, towing, onClearInput],
    );

    // ── Reset params to defaults + BonkRace v0.3 preset ──
    const handleResetParams = useCallback(() => {
        const wasRunning = lab.isRunning;
        if (towing) {
            const snapshot = lab.exportShareSnapshot();
            const params = { ...defaults, ...PRESETS[DEFAULT_PRESET_IDX].values };
            params["orbs.density"] = Number(params.mass) / (Math.PI * Number(params["geometry.baseRadiusM"]) ** 2);
            lab.applyShareSnapshot({ ...snapshot, params, density: params["arena.objectDensity"], orbDensityManual: false });
            onClearInput?.();
            if (wasRunning) lab.start();
            setDensity(Number(params["arena.objectDensity"])); setActivePreset(DEFAULT_PRESET_IDX);
            onParamsChanged?.(); return;
        }
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
        onClearInput?.();
        lab.reset();
        if (towing) lab.start();
        onParamsChanged?.();
    }, [lab, defaults, onParamsChanged, towing, onClearInput]);

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
        [lab, defaults, onParamsChanged, towing, onClearInput],
    );

    // ── Presets ──
    const handlePreset = useCallback(
        (e: Event) => {
            const idx = parseInt((e.target as HTMLSelectElement).value, 10);
            if (isNaN(idx) || idx < 0) return;

            const wasRunning = lab.isRunning;
            const preset = PRESETS[idx];
            if (towing) {
                const snapshot = lab.exportShareSnapshot();
                const params = { ...defaults, ...preset.values };
                for (const [key, value] of Object.entries(snapshot.params)) if (key.startsWith("tow.")) params[key] = value;
                params["orbs.density"] = Number(params.mass) / (Math.PI * Number(params["geometry.baseRadiusM"]) ** 2);
                lab.applyShareSnapshot({ ...snapshot, params, density: params["arena.objectDensity"], orbDensityManual: false });
                onClearInput?.();
                if (wasRunning) lab.start();
                setDensity(Number(params["arena.objectDensity"])); setActivePreset(idx);
                onParamsChanged?.(); return;
            }

            // Reset orbDensityManual before batch-applying params
            lab.resetOrbDensityManual();

            // First reset all params to defaults
            for (const [key, val] of Object.entries(defaults)) {
                if (!towing || !key.startsWith("tow.")) lab.updateParams(key, val);
            }

            // Then apply preset overrides
            for (const [key, val] of Object.entries(preset.values)) {
                lab.updateParams(key, val);
            }

            // Sync toolbar density from restored/overridden value
            setDensity((lab.params["arena.objectDensity"] as number) ?? 5.0);
            setActivePreset(idx);
            if (towing) { onClearInput?.(); lab.reset(); lab.start(); }
            onParamsChanged?.();
        },
        [lab, defaults, onParamsChanged, towing, onClearInput],
    );

    if (towing && towState) {
        const settings = <div class="tug-settings-controls">
            <div class="lab-tb-seed-group"><label for="tug-seed">Seed:</label>
                <input id="tug-seed" type="number" class="lab-tb-seed-input" aria-label="Seed" min="0" max="4294967295" value={seed} onInput={handleSeedChange} />
                <button class="lab-tb-btn" onClick={handleRandomSeed}>Rnd</button></div>
            <label class="tug-density">Насыщенность: {density.toFixed(1)}
                <input type="range" aria-label="Насыщенность арены" min="0.1" max="25" step="0.1" value={density} onInput={handleDensityChange} /></label>
            <select class="lab-tb-select" aria-label="Пресет движения" value={activePreset} onChange={handlePreset}>
                <option value={-1}>Custom</option>{PRESETS.map((preset, i) => <option key={i} value={i}>{preset.label}</option>)}
            </select>
            <div class="tug-settings-actions"><button class="lab-tb-btn" onClick={handleResetParams}>Сброс</button>
                <button class="lab-tb-btn" onClick={handleShare}>Поделиться</button></div>
            <span class="tug-build">TugLab v0.1.1 · {__TUGLAB_COMMIT__} · BonkRace v{__APP_VERSION__}</span>
            {shareError && <p role="alert">{shareError}</p>}
        </div>;
        return <Fragment>
            <div class="lab-toolbar tug-race-toolbar">
                <button class="lab-tb-btn lab-tb-btn--accent" onClick={handleRestart} disabled={!!launchError}>Restart</button>
                <div class="tug-actions">
                    <button class="lab-tb-btn" aria-label={towState.paused ? (lab.hasStarted ? "Продолжить" : "Старт") : "Пауза"}
                        disabled={towState.needsRestart || !!launchError} onClick={() => { onClearInput?.(); towState.paused ? lab.resume() : lab.pause(); setTowState(lab.getState().towing); }}>{towState.paused ? "▶" : "Ⅱ"}</button>
                    {towState.paused && <button class="lab-tb-btn" disabled={towState.needsRestart || !!launchError}
                        onClick={() => { onClearInput?.(); lab.stepOnce(); setTowState(lab.getState().towing); }}>Step</button>}
                    <button class="lab-tb-btn" onClick={() => { onClearInput?.(); lab.setTowingConnection(!towState.coupling.connected); setTowState(lab.getState().towing); }}>{towState.coupling.connected ? "Расцепить" : "Сцепить"}</button>
                </div>
                <button class="lab-tb-btn tug-settings-toggle" aria-label="Настройки" aria-expanded={panelOpen}
                    onClick={() => { onClearInput?.(); setPanelOpen(!panelOpen); }}>⚙</button>
            </div>
            <div class="tug-status" aria-live="polite"><span class="lab-tb-timer">{formatTime(elapsed)}</span> ·
                {{ rod: "Штанга", rope: "Трос", spring: "Пружина" }[towState.coupling.type]} · {towState.distance.toFixed(2)} м · {towState.coupling.connected ? "соединено" : "расцеплено"}
                {towState.paused && " · пауза"}
                {towState.reason && <span role="alert"> · {towState.reason}{towState.needsRestart ? " — нужен Restart" : ""}</span>}
            </div>
            <LabPanel lab={lab} towing panelOpen={panelOpen} onOpenChange={setPanelOpen} settingsContent={settings}
                syncTrigger={syncTrigger} onPanelVisibilityChanged={onPanelVisibilityChanged} onParamChanged={onParamsChanged} />
            {shareLink && <div class="lab-modal-backdrop"><div class="lab-modal" role="dialog" aria-label="Поделиться заездом">
                <h3>Поделиться заездом</h3><p aria-live="polite">{shareNotice}</p>
                <textarea readOnly aria-label="Ссылка на заезд" value={shareLink} onFocus={event => event.currentTarget.select()} />
                <button class="lab-tb-btn" onClick={() => setShareLink("")}>Закрыть</button>
            </div></div>}
            {launchError && <div class="lab-modal-backdrop"><div class="lab-modal" role="dialog" aria-label="Ошибка ссылки">
                <p role="alert">{launchError}</p><button class="lab-tb-btn" onClick={() => {
                    history.replaceState(null, "", location.pathname + location.search);
                    setLaunchError(""); handleResetParams(); lab.start(); setTowState(lab.getState().towing);
                }}>Начать обычный заезд</button>
            </div></div>}
        </Fragment>;
    }

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
                        aria-label="Seed"
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
                        aria-label="Насыщенность арены"
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

                {!towing && <Fragment>
                {/* Экспорт */}
                <button class="lab-tb-btn" onClick={() => setShowExport(true)}>
                    Экспорт
                </button>

                {/* Import */}
                <button class="lab-tb-btn" onClick={() => setShowImport(true)}>
                    Импорт
                </button>

                </Fragment>}
                <div class="lab-tb-sep" />

                {/* Пресеты */}
                <select class="lab-tb-select" aria-label="Пресет движения" value={activePreset} onChange={handlePreset}>
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
