/**
 * LabToolbar — top toolbar for BonkLab with restart, seed, reset, export/import, presets.
 */

import { Fragment } from "preact";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import { LabPanel } from "./LabPanel";
import { createSpaceShareUrl } from "../../u2taglab/share";
import { createTrainShareUrl } from "../../u2taglab/trainShare";
import { createShareUrl, validateShareSnapshot } from "../../tuglab/share";
import { SPACE_SOURCE } from "../../u2taglab/profile";
import { SPACE_FIELD_INFO } from "../../u2taglab/fields";
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
    onStartupRecovered?: () => void;
    onClearInput?: () => void;
    /** Called when params are changed externally (reset/import/preset) so panel can sync */
    onParamsChanged?: () => void;
    /** Incremented when user changes a param via LabPanel slider — marks preset as Custom */
    externalParamChange?: number;
}

type FlightConfirmation = {
    kind: "coupling";
    enabled: boolean;
    sceneToken: number | undefined;
    seed: number;
    density: number;
    paused: boolean;
    worldTime: number;
};

export function LabToolbar({ lab, onParamsChanged, externalParamChange, towing = false, onClearInput, syncTrigger, onPanelVisibilityChanged, startupError, onStartupRecovered }: LabToolbarProps) {
    const space = lab.isSpace;
    const [infoOpen, setInfoOpen] = useState(false);
    const [confirmation, setConfirmation] = useState<FlightConfirmation | null>(null);
    const confirmationRef = useRef<FlightConfirmation | null>(null);
    const clearConfirmation = useCallback(() => { confirmationRef.current = null; setConfirmation(null); }, []);
    useLayoutEffect(clearConfirmation, [syncTrigger, externalParamChange, startupError]);
    const [brakeHeld, setBrakeHeld] = useState(false);
    const brakePointer = useRef<number | null>(null);
    const brakeButton = useRef<HTMLButtonElement>(null);
    const clearSpaceBrake = useCallback((pointerId?: number) => {
        if (pointerId !== undefined && pointerId !== brakePointer.current) return;
        const captured = brakePointer.current; brakePointer.current = null;
        lab.setSpaceBrake(false); setBrakeHeld(Boolean(lab.getState().spaceBrake));
        if (captured !== null && brakeButton.current?.hasPointerCapture(captured)) brakeButton.current.releasePointerCapture(captured);
    }, [lab]);
    const [rearHeld, setRearHeld] = useState(false), [trainError, setTrainError] = useState('');
    const rearPointer = useRef<number | null>(null), rearButton = useRef<HTMLButtonElement>(null);
    const clearRearBrake = useCallback((pointerId?: number) => {
        if (pointerId !== undefined && pointerId !== rearPointer.current) return;
        const captured = rearPointer.current; rearPointer.current = null;
        lab.setTrainRearBrake(false); setRearHeld(false);
        if (captured !== null && rearButton.current?.hasPointerCapture(captured)) rearButton.current.releasePointerCapture(captured);
    }, [lab]);
    const clearHolds = () => { clearSpaceBrake(); clearRearBrake(); };
    const cancelTrainInput = () => { clearHolds(); onClearInput?.(); lab.pause(); refreshFlight(); };
    const trainLinkTouch = useRef(new Set<string>());
    useEffect(() => {
        if (!space) return;
        const clear = () => { clearSpaceBrake(); clearRearBrake(); };
        const hidden = () => { if (document.hidden) { clear(); clearConfirmation(); } };
        window.addEventListener("blur", clear); document.addEventListener("visibilitychange", hidden);
        return () => { window.removeEventListener("blur", clear); document.removeEventListener("visibilitychange", hidden); clear(); };
    }, [space, clearSpaceBrake, clearRearBrake]);
    useLayoutEffect(() => {
        const buttons = [brakeButton.current, rearButton.current].filter((button): button is HTMLButtonElement => !!button);
        if (!space || !buttons.length) return;
        // Нативное действие тапа подавляется локально до долгого удержания.
        const guard = (event: TouchEvent) => { if (event.cancelable) event.preventDefault(); };
        for (const button of buttons) { button.addEventListener("touchstart", guard, { passive: false }); button.addEventListener("touchend", guard, { passive: false }); }
        return () => { for (const button of buttons) { button.removeEventListener("touchstart", guard); button.removeEventListener("touchend", guard); } };
    }, [space, lab.towingComposition]);
    const faTouchActivation = useRef(false);
    const couplingTouchActivation = useRef(false);
    const [fa, setFa] = useState(() => Boolean(lab.params["space.fa"]));
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
    const [seed, setSeed] = useState(() => towing ? lab.getScenarioInfo().seed : 42);
    const [density, setDensity] = useState(() => towing ? lab.getScenarioInfo().density : 5.0);

    const [panelOpen, setPanelOpen] = useState(false);
    const [shareLink, setShareLink] = useState("");
    const [shareNotice, setShareNotice] = useState("");
    const [shareError, setShareError] = useState("");
    const [worldHelp, setWorldHelp] = useState("");
    const launchError = startupError ?? "";
    useLayoutEffect(() => {
        if (towing && panelOpen) {
            const snapshot = lab.getScenarioInfo();
            setSeed(snapshot.seed); setDensity(snapshot.density); setActivePreset(matchingPreset());
            if (space) setFa(Boolean(lab.params["space.fa"]));
        }
    }, [panelOpen, syncTrigger, externalParamChange]);
    const handleShare = async () => {
        setShareNotice(""); setShareError("");
        try {
            const link = lab.towingComposition === "ABC" ? createTrainShareUrl(location.href, lab.exportTrainShareSnapshot()) : space ? createSpaceShareUrl(location.href, lab.exportSpaceShareSnapshot())
                : createShareUrl(location.href, validateShareSnapshot(lab.exportShareSnapshot(), defaults));
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
    const [trainState, setTrainState] = useState(() => lab.getState().train);
    const flightState = trainState ?? towState, train = lab.towingComposition === 'ABC';
    const refreshFlight = () => { const state = lab.getState(); setTowState(state.towing); setTrainState(state.train); };
    const trainAction = (action: () => { ok: boolean; reason?: string }) => {
        const result = action(); setTrainError(result.ok ? '' : result.reason || 'Действие не применено'); refreshFlight();
    };
    useLayoutEffect(() => { onPanelVisibilityChanged?.(); }, [train, onPanelVisibilityChanged]);
    useEffect(() => { if (space && flightState?.paused) { clearHolds(); clearConfirmation(); } }, [space, flightState?.paused, clearSpaceBrake, clearRearBrake]);
    const toggleFA = () => { const enabled = !Boolean(lab.params["space.fa"]); lab.setSpaceFA(enabled); setFa(enabled); onParamsChanged?.(); };
    const openConfirmation = (kind: FlightConfirmation["kind"]) => {
        const state = lab.getState(), scenario = lab.getScenarioInfo();
        const pending: FlightConfirmation = { kind, enabled: !Boolean(state.towing?.coupling.connected),
            sceneToken: syncTrigger, seed: scenario.seed, density: scenario.density, paused: Boolean(state.towing?.paused), worldTime: state.elapsedTime };
        confirmationRef.current = pending; setConfirmation(pending);
    };
    const activateCoupling = () => {
        if (lab.getState().towing?.coupling.connected) openConfirmation("coupling");
        else { lab.setTowingConnection(true); setTowState(lab.getState().towing); }
    };
    const confirmFlightAction = () => {
        const pending = confirmationRef.current;
        clearConfirmation();
        if (!pending) return;
        const state = lab.getState(), scenario = lab.getScenarioInfo();
        if (pending.sceneToken !== syncTrigger || pending.seed !== scenario.seed || pending.density !== scenario.density ||
            pending.paused !== Boolean(state.towing?.paused) || state.elapsedTime < pending.worldTime) return;
        lab.setTowingConnection(pending.enabled); setTowState(lab.getState().towing);
    };
    useEffect(() => {
        const id = setInterval(() => {
            setElapsed(lab.getState().elapsedTime);
            if (towing) refreshFlight();
            if (space) { setFa(Boolean(lab.params["space.fa"])); setBrakeHeld(Boolean(lab.getState().spaceBrake)); setRearHeld(Boolean(lab.getState().train?.rearBrake)); }
        }, 100);
        return () => clearInterval(id);
    }, [lab, towing]);

    // Modal state
    const [showExport, setShowExport] = useState(false);
    const [showImport, setShowImport] = useState(false);

    // ── Restart (countdown управляется BonkLab.start()) ──
    const handleRestart = useCallback(() => {
        if (space) { clearHolds(); clearConfirmation(); }
        onClearInput?.();
        lab.stop();
        lab.reset();
        lab.start();
        setElapsed(0);
        if (towing) onParamsChanged?.();
    }, [lab, onClearInput, onParamsChanged, towing]);

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
                if (towing) onParamsChanged?.();
            }
        },
        [lab, density, towing, onClearInput, onParamsChanged],
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
        if (towing) onParamsChanged?.();
    }, [lab, density, towing, onClearInput, onParamsChanged]);

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
        if (space) {
            onClearInput?.(); lab.resetSpaceParams(); if (wasRunning) lab.start();
            setDensity(lab.getScenarioInfo().density); setFa(true); onParamsChanged?.(); return;
        }
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

    if (towing && flightState) {
        const structuralLocked = train && !flightState.paused;
        const settings = <div class="tug-settings-controls">
            <div class="lab-tb-seed-group"><label for="tug-seed">Seed:</label>
                {space && <button class="lab-param-info" aria-label="Справка: Seed" aria-expanded={worldHelp === "seed"} onClick={() => setWorldHelp(worldHelp === "seed" ? "" : "seed")}>i</button>}
                <input id="tug-seed" disabled={structuralLocked} type="number" class="lab-tb-seed-input" aria-label="Seed" min="0" max="4294967295" value={seed} onInput={handleSeedChange} />
                <button class="lab-tb-btn" disabled={structuralLocked} onClick={handleRandomSeed}>Rnd</button></div>
            {space && worldHelp === "seed" && <p>Seed — целое число 0–4294967295. Внутренний генератор повторяет размещение объектов, начальные движения и поля. Изменение запускает новый мир с временем 0; число само по себе не задаёт физические настройки.</p>}
            <label class="tug-density">Насыщенность: {density.toFixed(1)}
                {space && <button type="button" class="lab-param-info" aria-label="Справка: Насыщенность" aria-expanded={worldHelp === "density"} onClick={() => setWorldHelp(worldHelp === "density" ? "" : "density")}>i</button>}
                <input type="range" aria-label="Насыщенность арены" disabled={structuralLocked} min="0.1" max="25" step="0.1" value={density} onInput={handleDensityChange} /></label>
            {space && worldHelp === "density" && <p>LAB-множитель 0.1–25: меняет число станций, платформ, астероидов и полей. Большая насыщенность оставляет меньше свободного пространства. Пересоздаёт мир из текущего seed и обнуляет время. Размеры статичных объектов — runtime U2; массы и радиусы астероидов — общий 2D-каталог LAB.</p>}
            {!space && <select class="lab-tb-select" aria-label="Пресет движения" value={activePreset} onChange={handlePreset}>
                <option value={-1}>Custom</option>{PRESETS.map((preset, i) => <option key={i} value={i}>{preset.label}</option>)}
            </select>}
            {space && <Fragment><button type="button" class="lab-tb-btn" aria-expanded={infoOpen} aria-controls="space-intro-info"
                onClick={() => setInfoOpen(!infoOpen)}>Инфо</button>
                <div id="space-intro-info" hidden={!infoOpen}><p>{SPACE_SOURCE.mass}<br />Космический мир: 6000×18000 м, станции, платформы, подвижные астероиды и локальные поля. Вне полей — вакуум.<br />Мышь/тач/WASD задают мировой курс и тягу. Space или кнопка «Тормоз» — двигательный тормоз.</p></div></Fragment>}
            {space && <details><summary>Поля: законы и границы модели</summary>
                <p>Плавный smoothstep по расстоянию до края — LAB. Дрейф геометрии задан seed и временем симуляции. Поля не меняют тягу, FA, топливо или параметры друг друга.</p>
                {Object.entries(SPACE_FIELD_INFO).map(([key, info]) => <p key={key}><strong>{info.label}.</strong> {info.description}</p>)}
            </details>}
            <div class="tug-settings-actions"><button class="lab-tb-btn" disabled={structuralLocked} onClick={handleResetParams}>Сброс</button>
                <button class="lab-tb-btn" onClick={handleShare}>Поделиться</button></div>
            {space && !train && <button class="lab-tb-btn" onClick={() => { lab.restoreSpaceRadiusB(); onParamsChanged?.(); }}>Радиус B по ТТХ</button>}
            <span class="tug-build">{space ? "U2TagLab v0.2.0 · расчётный профиль" : "TugLab v0.1.1"} · {__TUGLAB_COMMIT__} · BonkRace v{__APP_VERSION__}</span>
            {shareError && <p role="alert">{shareError}</p>}
        </div>;
        return <Fragment>
            <div class={`lab-toolbar tug-race-toolbar${train ? " tug-train-toolbar" : ""}`} onClick={e => (e.target as HTMLElement).closest('button')?.blur()}>
                <button class="lab-tb-btn lab-tb-btn--accent" onClick={handleRestart} disabled={!!launchError}>Restart</button>
                <div class="tug-actions">
                    <button class="lab-tb-btn" aria-label={flightState.paused ? (lab.hasStarted ? "Продолжить" : "Старт") : "Пауза"}
                        disabled={flightState.needsRestart || !!launchError} onClick={() => { clearConfirmation(); onClearInput?.(); flightState.paused ? lab.resume() : lab.pause(); refreshFlight(); }}>{flightState.paused ? "▶" : "Ⅱ"}</button>
                    {space && (flightState.reason && (flightState.needsRestart || !flightState.reason.toLowerCase().includes("фокус")) ? <details class="space-stop-reason">
                        <summary>{flightState.needsRestart ? "Нужен Restart" : flightState.reason.startsWith("Захват:") ? "Захват: отказ" : "Причина"}</summary><div role="alert">{flightState.reason}{flightState.needsRestart ? " — нужен Restart" : ""}</div>
                    </details> : <span class="space-pause-status" aria-live="polite" title={flightState.reason ?? ""} aria-label={flightState.reason || (flightState.paused ? "Пауза" : "Полёт")}>
                        {flightState.reason ? flightState.reason.toLowerCase().includes("фокус") ? "Пауза: фокус" : flightState.reason : flightState.paused ? "Пауза" : "Полёт"}
                    </span>)}
                    {flightState.paused && <button class="lab-tb-btn" disabled={!lab.hasStarted || flightState.needsRestart || !!launchError}
                        onClick={() => { onClearInput?.(); lab.stepOnce(); refreshFlight(); }}>Step</button>}
                    {!space && <button class="lab-tb-btn" onClick={() => { onClearInput?.(); lab.setTowingConnection(!towState!.coupling.connected); refreshFlight(); }}>{towState!.coupling.connected ? "Расцепить" : "Сцепить"}</button>}
                </div>
                {space && <label class="space-composition"><span class="space-composition-title">Состав</span><select aria-label="Состав" value={lab.towingComposition} disabled={!flightState.paused || !!launchError}
                    onChange={e => { clearHolds(); clearConfirmation(); onClearInput?.(); trainAction(() => lab.setTowingComposition(e.currentTarget.value as 'AB' | 'ABC')); onParamsChanged?.(); }}><option value="AB">AB</option><option value="ABC">ABC</option></select></label>}
                {train && trainState && <label class="space-composition space-assistant-mode">C<select aria-label="Помощь заднего тягача" value={trainState.settings.mode}
                    onChange={e => { trainAction(() => lab.setTrainSettings({ mode: e.currentTarget.value as 'coast' | 'guard' | 'brake' })); e.currentTarget.blur(); onParamsChanged?.(); }}>
                    <option value="coast">Накат</option><option value="guard">Страховка</option><option value="brake">Помощь при торможении</option></select></label>}
                <button class="lab-tb-btn tug-settings-toggle" aria-label="Настройки" aria-expanded={panelOpen}
                    onClick={() => { clearHolds(); clearConfirmation(); onClearInput?.(); setPanelOpen(!panelOpen); }}>⚙</button>
            </div>
            {trainError && <p class="space-train-error" role="alert">{trainError}</p>}
            {train && trainState && <div class="tug-status space-train-status" data-testid="train-flight-status" data-rear={trainState.rearBrake}>
                <span>C: {{ coast: 'Накат', guard: 'Страховка', brake: 'Помощь при торможении' }[trainState.settings.mode]} · {{ coast: 'выключен', waiting: 'ждёт задержку', guarding: 'страхует', braking: 'тормозит', saturated: 'предел тяги', disconnected: 'расцеплен' }[trainState.assistant.status]} · g={Math.round(trainState.settings.g * 100)}% · задержка {trainState.settings.delay} с</span>
                <span>Команды C: ретро {Math.round(trainState.commandC.retro * 100)}% · бок {Math.round(trainState.commandC.lateral * 100)}% · момент {Math.round(trainState.commandC.yaw * 100)}% · марш 0</span>
            </div>}
            {!space && <div class="tug-status" aria-live="polite"><span class="lab-tb-timer">{formatTime(elapsed)}</span> ·
                {{ rod: "Штанга", rope: "Трос", spring: "Пружина", rigid: "Жёсткая" }[towState!.coupling.type]} · {towState!.distance.toFixed(2)} м · {towState!.coupling.connected ? "соединено" : "расцеплено"}
                {flightState.paused && " · пауза"}
                {flightState.reason && <span role="alert"> · {flightState.reason}{flightState.needsRestart ? " — нужен Restart" : ""}</span>}
            </div>}
            {space && <div class="space-flight-controls">
                <div class="space-secondary-controls">
                    <button key="fa" class="lab-tb-btn space-fa" aria-label="Flight Assist" aria-pressed={fa}
                        onPointerDown={e => { e.preventDefault(); faTouchActivation.current = e.pointerType === "touch"; }} onContextMenu={e => e.preventDefault()}
                        onPointerUp={e => { if (e.pointerType === "touch") toggleFA(); }}
                        onClick={e => { if (e.detail > 0 && faTouchActivation.current) { faTouchActivation.current = false; return; } toggleFA(); }}>FA {fa ? "ON" : "OFF"}</button>
                    {train ? (['AB', 'BC'] as const).map(id => { const link = trainState?.connections.find(l => l.id === id); return <button key={id} class="lab-tb-btn" aria-label={`${id}: ${link?.connected ? 'расцепить' : 'сцепить'}`}
                        onPointerDown={e => { e.preventDefault(); if (e.pointerType === 'touch') trainLinkTouch.current.add(id); }} onContextMenu={e => e.preventDefault()}
                        onPointerUp={e => { if (e.pointerType === 'touch') trainAction(() => lab.setTrainConnection(id, !link?.connected)); }}
                        onClick={e => { if (e.detail > 0 && trainLinkTouch.current.delete(id)) return; trainAction(() => lab.setTrainConnection(id, !link?.connected)); e.currentTarget.blur(); }}>{id}: {link?.connected ? 'расцепить' : 'сцепить'}</button>; }) : <button key="coupling" class="lab-tb-btn" onPointerDown={e => { e.preventDefault(); couplingTouchActivation.current = e.pointerType === "touch"; }} onContextMenu={e => e.preventDefault()}
                        onPointerUp={e => { if (e.pointerType === "touch") activateCoupling(); }}
                        onClick={e => { if (e.detail > 0 && couplingTouchActivation.current) { couplingTouchActivation.current = false; return; } activateCoupling(); }}>{towState!.coupling.connected ? "Расцепить" : "Сцепить"}</button>}
                </div>
                <div class="space-brakes">
                {train && <button ref={rearButton} class="lab-tb-btn space-rear-brake" aria-label="Тормоз заднего" aria-pressed={rearHeld} disabled={flightState.paused}
                    onContextMenu={e => e.preventDefault()} onPointerDown={e => { e.preventDefault(); if (e.button !== 0 || rearPointer.current !== null) return; rearPointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); lab.setTrainRearBrake(true); setRearHeld(true); }}
                    onPointerUp={e => clearRearBrake(e.pointerId)} onPointerCancel={() => cancelTrainInput()}
                    onLostPointerCapture={e => { if (rearPointer.current === e.pointerId) cancelTrainInput(); }}>Тормоз C</button>}
                <button key="brake" ref={brakeButton} class="lab-tb-btn space-brake" aria-label="Тормоз" aria-pressed={brakeHeld}
                    onContextMenu={e => e.preventDefault()} onPointerDown={e => {
                        e.preventDefault();
                        // Второй палец может тормозить, пока первый управляет джойстиком.
                        if (e.button !== 0 || brakePointer.current !== null) return;
                        brakePointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId);
                        lab.setSpaceBrake(true); setBrakeHeld(true);
                    }}
                    onPointerUp={e => clearSpaceBrake(e.pointerId)} onPointerCancel={e => { if (train) cancelTrainInput(); else clearSpaceBrake(e.pointerId); }}
                    onLostPointerCapture={e => { if (train && brakePointer.current === e.pointerId) cancelTrainInput(); else clearSpaceBrake(e.pointerId); }} onBlur={() => { if (brakePointer.current === null) clearSpaceBrake(); }}>Тормоз</button>
                </div>
                {confirmation && <div class="space-confirmation" role="group" aria-label="Подтверждение действия">
                    <span>{confirmation.enabled ? "Сцепить состав?" : "Расцепить состав?"}</span>
                    <div><button class="lab-tb-btn" aria-label={confirmation.enabled ? "Подтвердить сцепление" : "Подтвердить расцепление"}
                        onPointerDown={e => e.preventDefault()} onPointerUp={e => { if (e.pointerType === "touch") confirmFlightAction(); }} onClick={confirmFlightAction}>Подтвердить</button>
                    <button class="lab-tb-btn" onPointerDown={e => e.preventDefault()} onPointerUp={e => { if (e.pointerType === "touch") clearConfirmation(); }} onClick={clearConfirmation}>Отмена</button></div>
                </div>}
            </div>}
            <LabPanel lab={lab} towing panelOpen={panelOpen} onOpenChange={open => { if (open) clearConfirmation(); setPanelOpen(open); }} settingsContent={settings}
                syncTrigger={syncTrigger} onPanelVisibilityChanged={onPanelVisibilityChanged} onParamChanged={onParamsChanged} />
            {shareLink && <div class="lab-modal-backdrop"><div class="lab-modal" role="dialog" aria-label="Поделиться заездом">
                <h3>Поделиться заездом</h3><p aria-live="polite">{shareNotice}</p>
                <textarea readOnly aria-label="Ссылка на заезд" value={shareLink} onFocus={event => event.currentTarget.select()} />
                <button class="lab-tb-btn" onClick={() => setShareLink("")}>Закрыть</button>
            </div></div>}
            {launchError && <div class="lab-modal-backdrop"><div class="lab-modal" role="dialog" aria-label="Ошибка ссылки">
                <p role="alert">{launchError}</p><button class="lab-tb-btn" onClick={() => {
                    history.replaceState(null, "", location.pathname + location.search);
                    onStartupRecovered?.(); handleResetParams(); lab.start(); refreshFlight();
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
