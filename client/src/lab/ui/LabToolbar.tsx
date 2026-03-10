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
        label: "Ультралёгкий",
        values: {
            "mass": 20,
            "geometry.inertiaFactor": 0.05,
            "propulsion.thrustForwardN": 80000,
            "propulsion.thrustReverseN": 25000,
            "propulsion.thrustLateralN": 30000,
            "propulsion.turnTorqueNm": 60000,
            "limits.speedLimitForwardMps": 500,
            "worldPhysics.forwardDragK": 0.001,
            "worldPhysics.lateralGripMultiplier": 20.0,
        },
    },
    {
        label: "Slime Arena",
        values: {}, // empty = reset to defaults (grip=1.0, isotropic)
    },
    {
        label: "BonkRace v0.1",
        values: {
            "mass": 40,
            "geometry.inertiaFactor": 0.50,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 18000,
            "propulsion.thrustLateralN": 22000,
            "propulsion.turnTorqueNm": 40000,
            "limits.speedLimitForwardMps": 400,
            "worldPhysics.forwardDragK": 0.005,
            "worldPhysics.lateralGripMultiplier": 1.0,
        },
    },
    {
        // Казуальные аркадные гонки: мгновенный поворот, лёгкая масса, высокая тяга.
        // Блоб-гонки: стрейфы разрешены (слаймы не машины!), но слабее основной тяги.
        // Grip 25 — цепкий на низкой скорости, лёгкий дрифт на высокой.
        label: "BonkRace v0.3",
        values: {
            "mass": 40,
            "geometry.inertiaFactor": 0.05,
            "propulsion.thrustForwardN": 70000,
            "propulsion.thrustReverseN": 30000,
            "propulsion.thrustLateralN": 25000,
            "propulsion.turnTorqueNm": 80000,
            "limits.speedLimitForwardMps": 380,
            "worldPhysics.forwardDragK": 0.05,
            "worldPhysics.lateralGripMultiplier": 25.0,
            "worldPhysics.angularDragK": 0.15,
            "worldPhysics.restitution": 0.80,
        },
    },
    {
        label: "Грузовик",
        values: {
            "mass": 350,
            "geometry.inertiaFactor": 0.80,
            "propulsion.thrustForwardN": 15000,
            "propulsion.thrustReverseN": 5000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 12000,
            "limits.speedLimitForwardMps": 280,
            "worldPhysics.forwardDragK": 0.04,
            "worldPhysics.lateralGripMultiplier": 12.0,
            "worldPhysics.angularDragK": 0.12,
        },
    },
    {
        label: "Дрифт (без FA)",
        values: {
            "mass": 80,
            "geometry.inertiaFactor": 0.30,
            "propulsion.thrustForwardN": 60000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 50000,
            "worldPhysics.forwardDragK": 0.03,
            "worldPhysics.lateralGripMultiplier": 6.0,
            "assist.counterAccelEnabled": false,
            "assist.autoBrakeMaxThrustFraction": 0.1,
            "assist.overspeedDampingRate": 0,
            "assist.yawDampingBoostFactor": 1,
            "assist.angularBrakeBoostFactor": 1,
        },
    },
    {
        // Elite Dangerous FA-On: вакуум (нулевое трение), но Flight Assist активен —
        // автоторможение двигателями, стабилизация вращения. Латеральные RCS-двигатели.
        // Нет среды → drag=0, grip=0. FA компенсирует через assist (counterAccel, autoBrake).
        label: "Космос (FA-On)",
        values: {
            "mass": 150,
            "geometry.inertiaFactor": 0.60,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 20000,
            "propulsion.thrustLateralN": 15000,
            "propulsion.turnTorqueNm": 30000,
            "limits.speedLimitForwardMps": 500,
            "worldPhysics.forwardDragK": 0,
            "worldPhysics.lateralGripMultiplier": 0,
            "worldPhysics.angularDragK": 0,
            "worldPhysics.restitution": 0.3,
        },
    },
    {
        // Elite Dangerous FA-Off: полный Ньютон. Нет автоторможения, нет стабилизации.
        // Корабль сохраняет скорость и вращение до ручной коррекции.
        // Небольшой angularDrag=0.05 имитирует демпфирование reaction wheels.
        label: "Космос (FA-Off)",
        values: {
            "mass": 150,
            "geometry.inertiaFactor": 0.60,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 20000,
            "propulsion.thrustLateralN": 15000,
            "propulsion.turnTorqueNm": 30000,
            "limits.speedLimitForwardMps": 500,
            "worldPhysics.forwardDragK": 0,
            "worldPhysics.lateralGripMultiplier": 0,
            "worldPhysics.angularDragK": 0.05,
            "worldPhysics.restitution": 0.3,
            "assist.counterAccelEnabled": false,
            "assist.autoBrakeMaxThrustFraction": 0,
            "assist.overspeedDampingRate": 0,
        },
    },
    {
        label: "Ралли",
        values: {
            "mass": 120,
            "geometry.inertiaFactor": 0.40,
            "propulsion.thrustForwardN": 55000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 45000,
            "limits.speedLimitForwardMps": 350,
            "worldPhysics.forwardDragK": 0.06,
            "worldPhysics.lateralGripMultiplier": 30.0,
            "worldPhysics.angularDragK": 0.10,
            "worldPhysics.restitution": 0.8,
        },
    },
    {
        label: "Бампер-кар",
        values: {
            "mass": 100,
            "geometry.inertiaFactor": 0.50,
            "propulsion.thrustForwardN": 45000,
            "propulsion.thrustLateralN": 5000,
            "propulsion.turnTorqueNm": 35000,
            "limits.speedLimitForwardMps": 300,
            "worldPhysics.forwardDragK": 0.07,
            "worldPhysics.lateralGripMultiplier": 54.0,
            "worldPhysics.angularDragK": 0.08,
            "worldPhysics.restitution": 0.95,
        },
    },
    {
        label: "Картинг",
        values: {
            "mass": 80,
            "geometry.inertiaFactor": 0.20,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 50000,
            "limits.speedLimitForwardMps": 400,
            "worldPhysics.forwardDragK": 0.08,
            "worldPhysics.lateralGripMultiplier": 40.0,
            "worldPhysics.angularDragK": 0.15,
            "worldPhysics.restitution": 0.7,
        },
    },
    {
        label: "Формула",
        values: {
            "mass": 60,
            "geometry.inertiaFactor": 0.30,
            "propulsion.thrustForwardN": 65000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 60000,
            "limits.speedLimitForwardMps": 450,
            "worldPhysics.forwardDragK": 0.12,
            "worldPhysics.lateralGripMultiplier": 80.0,
            "worldPhysics.angularDragK": 0.20,
            "worldPhysics.restitution": 0.6,
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
    /** Incremented when user changes a param via LabPanel slider — marks preset as Custom */
    externalParamChange?: number;
}

export function LabToolbar({ lab, onParamsChanged, externalParamChange }: LabToolbarProps) {
    // Inject styles once
    useEffect(() => {
        injectStyles("lab-toolbar-styles", toolbarCss);
    }, []);

    // True defaults (balance.json + BonkLab overrides, before startup preset)
    const [defaults] = useState<Record<string, number | boolean>>(() => lab.getDefaults());

    // Active preset tracking (-1 = Custom, index = preset)
    const [activePreset, setActivePreset] = useState(3); // BonkRace v0.3

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

    // ── Reset params to defaults ──
    const handleResetParams = useCallback(() => {
        // Reset orbDensityManual before applying defaults
        lab.resetOrbDensityManual();
        for (const [key, val] of Object.entries(defaults)) {
            lab.updateParams(key, val);
        }
        // Sync toolbar density from restored defaults
        const restoredDensity = (defaults["arena.objectDensity"] as number) ?? 5.0;
        setDensity(restoredDensity);
        setActivePreset(1); // "Slime Arena" = true defaults
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
            // Reset orbDensityManual before batch-applying imported params
            lab.resetOrbDensityManual();
            // First reset all params to defaults (handles keys missing from old exports)
            for (const [key, val] of Object.entries(defaults)) {
                lab.updateParams(key, val);
            }
            // Then apply imported values on top
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
                    <span class="lab-tb-seed-label" title="Плотность объектов на карте (0.1 – 25.0)">
                        Плотность:
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
