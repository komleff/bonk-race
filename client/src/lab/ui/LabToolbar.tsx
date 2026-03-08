/**
 * LabToolbar — top toolbar for BonkLab with restart, seed, reset, export/import, presets.
 */

import { Fragment } from "preact";
import { useState, useEffect, useRef, useCallback } from "preact/hooks";
import { injectStyles } from "../../ui/utils/injectStyles";
import type { BonkLab } from "../BonkLab";
import toolbarCss from "./lab-toolbar.css?raw";

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
    label: string;
    values: Record<string, number | boolean>;
}

const PRESETS: Preset[] = [
    {
        label: "По умолчанию",
        values: {}, // empty = reset to defaults
    },
    {
        label: "Лёгкий и быстрый",
        values: {
            "mass": 40,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 18000,
            "propulsion.thrustLateralN": 22000,
            "propulsion.turnTorqueNm": 40000,
            "limits.speedLimitForwardMps": 400,
            "worldPhysics.linearDragK": 0.005,
        },
    },
    {
        label: "Тяжёлый и инертный",
        values: {
            "mass": 350,
            "propulsion.thrustForwardN": 15000,
            "propulsion.thrustReverseN": 5000,
            "propulsion.thrustLateralN": 6000,
            "propulsion.turnTorqueNm": 12000,
            "limits.speedLimitForwardMps": 150,
            "worldPhysics.linearDragK": 0.04,
        },
    },
    {
        label: "Минимальный FA",
        values: {
            "assist.counterAccelEnabled": false,
            "assist.autoBrakeMaxThrustFraction": 0.1,
            "assist.overspeedDampingRate": 0,
            "assist.yawDampingBoostFactor": 1,
            "assist.angularBrakeBoostFactor": 1,
        },
    },
    {
        label: "Космос",
        values: {
            "worldPhysics.linearDragK": 0,
            "worldPhysics.angularDragK": 0,
            "worldPhysics.restitution": 1.0,
        },
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}

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
    onApply: (data: Record<string, number | boolean>) => void;
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
            onApply(parsed as Record<string, number | boolean>);
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
}

export function LabToolbar({ lab, onParamsChanged }: LabToolbarProps) {
    // Inject styles once
    useEffect(() => {
        injectStyles("lab-toolbar-styles", toolbarCss);
    }, []);

    // Store defaults snapshot (taken once on mount)
    const [defaults] = useState<Record<string, number | boolean>>(() => ({ ...lab.params }));

    // Seed & density state
    const [seed, setSeed] = useState(42);
    const [density, setDensity] = useState(1.0);

    // Timer — poll elapsed time from lab state
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const id = setInterval(() => {
            setElapsed(lab.getState().elapsedTime);
        }, 100);
        return () => clearInterval(id);
    }, [lab]);

    // Countdown state
    const [countdown, setCountdown] = useState<string | null>(null);
    const restartIntervalRef = useRef<number | null>(null);

    // Cleanup restart interval on unmount
    useEffect(() => {
        return () => {
            if (restartIntervalRef.current !== null) {
                clearInterval(restartIntervalRef.current);
            }
        };
    }, []);

    // Modal state
    const [showExport, setShowExport] = useState(false);
    const [showImport, setShowImport] = useState(false);

    // ── Restart with countdown ──
    const handleRestart = useCallback(() => {
        // Cancel previous countdown if still running
        if (restartIntervalRef.current !== null) {
            clearInterval(restartIntervalRef.current);
            restartIntervalRef.current = null;
        }

        lab.stop();
        lab.reset();
        setElapsed(0);

        // 3-2-1-GO countdown
        const steps = ["3", "2", "1", "GO!"];
        let i = 0;
        setCountdown(steps[i]);

        restartIntervalRef.current = window.setInterval(() => {
            i++;
            if (i < steps.length) {
                setCountdown(steps[i]);
            } else {
                setCountdown(null);
                lab.start();
                if (restartIntervalRef.current !== null) {
                    clearInterval(restartIntervalRef.current);
                    restartIntervalRef.current = null;
                }
            }
        }, 800);
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
                lab.regenerateArena(seed, v);
            }
        },
        [lab, seed],
    );

    // ── Reset params to defaults ──
    const handleResetParams = useCallback(() => {
        for (const [key, val] of Object.entries(defaults)) {
            lab.updateParams(key, val);
        }
        // Sync toolbar density from restored defaults
        const restoredDensity = (defaults["arena.objectDensity"] as number) ?? 1.0;
        setDensity(restoredDensity);
        lab.reset();
        onParamsChanged?.();
    }, [lab, defaults, onParamsChanged]);

    // ── Export (full config) ──
    const getExportJson = useCallback((): string => {
        return JSON.stringify(lab.params, null, 2);
    }, [lab]);

    // ── Import (full config — applies all params from JSON) ──
    const handleImport = useCallback(
        (data: Record<string, number | boolean>) => {
            for (const [key, val] of Object.entries(data)) {
                // Only apply keys that exist in current params (ignore unknown keys)
                if (key in lab.params && (typeof val === "number" || typeof val === "boolean")) {
                    lab.updateParams(key, val);
                }
            }
            // Sync toolbar density from imported values
            if (typeof data["arena.objectDensity"] === "number") {
                setDensity(data["arena.objectDensity"]);
            }
            onParamsChanged?.();
        },
        [lab, onParamsChanged],
    );

    // ── Presets ──
    const handlePreset = useCallback(
        (e: Event) => {
            const idx = parseInt((e.target as HTMLSelectElement).value, 10);
            if (isNaN(idx) || idx < 0) return;

            const preset = PRESETS[idx];

            // First reset all params to defaults
            for (const [key, val] of Object.entries(defaults)) {
                lab.updateParams(key, val);
            }

            // Then apply preset overrides
            for (const [key, val] of Object.entries(preset.values)) {
                lab.updateParams(key, val);
            }

            // Sync toolbar density from restored/overridden value
            setDensity((lab.params["arena.objectDensity"] as number) ?? 1.0);
            onParamsChanged?.();
            // Reset select to placeholder
            (e.target as HTMLSelectElement).value = "-1";
        },
        [lab, defaults, onParamsChanged],
    );

    return (
        <Fragment>
            <div class="lab-toolbar">
                {/* Title */}
                <span class="lab-toolbar-title">BonkLab</span>

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
                    <span class="lab-tb-seed-label" title="Плотность объектов на карте (0.1 – 10.0)">
                        Плотность:
                    </span>
                    <input
                        type="range"
                        min="0.1"
                        max="10.0"
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
                <select class="lab-tb-select" onChange={handlePreset}>
                    <option value="-1" selected>
                        Пресеты...
                    </option>
                    {PRESETS.map((p, i) => (
                        <option key={i} value={i}>
                            {p.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Countdown overlay */}
            {countdown && (
                <div class="lab-countdown-overlay">
                    <span class="lab-countdown-text" key={countdown}>
                        {countdown}
                    </span>
                </div>
            )}

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
