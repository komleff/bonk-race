/** BonkLab — dev-only playground for testing game mechanics */

import { render, h } from "preact";
import { BonkLab } from "./BonkLab";
import { LabInput } from "./LabInput";
import { LabRenderer, CHAR_SCREEN_Y_RATIO } from "./LabRenderer";
import { TelemetryHUD } from "./TelemetryHUD";
import { LabPanel } from "./ui/LabPanel";
import { LabToolbar } from "./ui/LabToolbar";

const root = document.getElementById("lab-root")!;

// Create canvas element — fills viewport (reserve right edge for future param panel)
const canvas = document.createElement("canvas");
canvas.id = "lab-canvas";
canvas.style.display = "block";
canvas.style.position = "absolute";
canvas.style.top = "48px";
canvas.style.left = "0";
canvas.style.width = "100vw";
canvas.style.height = "calc(100vh - 48px)";
canvas.style.background = "#1a1a2e";
root.innerHTML = "";
root.appendChild(canvas);

// Mount Preact UI containers
const toolbarContainer = document.createElement("div");
toolbarContainer.id = "lab-toolbar-ui";
root.appendChild(toolbarContainer);

const uiContainer = document.createElement("div");
uiContainer.id = "lab-ui";
root.appendChild(uiContainer);


// Instantiate core systems
const lab = new BonkLab(canvas);

// Apply "BonkRace v0.3" preset on startup — casual arcade racing
const STARTUP_PRESET: Record<string, number | boolean | string> = {
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
    "trail.enabled": true,
    "trail.maxAge": 3.5,
    "trail.baseAlpha": 0.6,
    "trail.pattern": "drift",
    "trail.primaryColor": "#44aaff",
    "trail.driftColor": "#ff4444",
    "trail.rainbowPeriodSec": 2.0,
    "trail.useSpeedBrightness": false,
    "trail.maxSpeed": 350,
};
for (const [key, val] of Object.entries(STARTUP_PRESET)) {
    lab.updateParams(key, val);
}

const input = new LabInput(canvas);
const renderer = new LabRenderer(canvas);
const hud = new TelemetryHUD();

// Handle window resize
function onResize(): void {
    renderer.resize();
}
window.addEventListener("resize", onResize);
onResize(); // initial sizing

// Sync triggers for cross-component communication
let syncTrigger = 0;        // toolbar → panel: re-read params
let paramChangeCounter = 0; // panel → toolbar: mark preset as Custom

function renderToolbar(): void {
    render(
        h(LabToolbar, {
            lab,
            onParamsChanged: () => renderPanel(),
            externalParamChange: paramChangeCounter,
        }),
        toolbarContainer,
    );
}

function renderPanel(): void {
    syncTrigger++;
    render(
        h(LabPanel, {
            lab,
            syncTrigger,
            onParamChanged: () => {
                paramChangeCounter++;
                renderToolbar();
            },
        }),
        uiContainer,
    );
}

// Initial render
renderToolbar();
renderPanel();

// Expose to window for dev console access
(window as unknown as Record<string, unknown>).__bonkLab = lab;
(window as unknown as Record<string, unknown>).__labInput = input;
(window as unknown as Record<string, unknown>).__labRenderer = renderer;

// ── Unified render + simulation loop ──
let rafId: number | null = null;

function frame(): void {
    // Обновляем экранную позицию персонажа для корректного расчёта направления мыши
    const canvasRect = renderer.getCanvasRect();
    input.setCharacterScreenPos(
        canvasRect.left + canvasRect.width / 2,
        canvasRect.top + canvasRect.height * CHAR_SCREEN_Y_RATIO,
    );

    // Feed input into simulation
    const inputState = input.getState();
    lab.setInput(inputState.x, inputState.y, inputState.magnitude);

    // Update normalization from current params
    renderer.setNormalization(
        lab.params["limits.speedLimitForwardMps"] as number,
        lab.params["propulsion.thrustForwardN"] as number,
    );

    // Trail config
    const trailPattern = (lab.params["trail.pattern"] as unknown as string) ?? "drift";
    renderer.setTrailConfig({
        enabled: Boolean(lab.params["trail.enabled"]),
        maxAge: (lab.params["trail.maxAge"] as number) ?? 3.5,
        baseAlpha: (lab.params["trail.baseAlpha"] as number) ?? 0.6,
        pattern: (trailPattern as any),
        primaryColor: (lab.params["trail.primaryColor"] as unknown as string) ?? "#44aaff",
        driftColor: (lab.params["trail.driftColor"] as unknown as string) ?? "#ff4444",
        rainbowPeriodSec: (lab.params["trail.rainbowPeriodSec"] as number) ?? 2.0,
        useSpeedBrightness: Boolean(lab.params["trail.useSpeedBrightness"]),
        maxSpeed: (lab.params["trail.maxSpeed"] as number) ?? 350,
    });

    // Get simulation state and render
    const state = lab.getState();
    renderer.render(state, inputState);

    // Draw telemetry HUD overlay (screen-space, on top of everything)
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        hud.render(ctx, state, lab.params);
    }

    rafId = requestAnimationFrame(frame);
}

// Start simulation (internal physics loop) and render loop
lab.start();
rafId = requestAnimationFrame(frame);

// HMR cleanup — prevent stale listeners/loops on Vite hot reload
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        lab.stop();
        input.destroy();
        cancelAnimationFrame(rafId!);
        window.removeEventListener("resize", onResize);
        render(null, toolbarContainer);
        render(null, uiContainer);
    });
}

console.log("[BonkLab] entry point loaded — use window.__bonkLab to inspect");
