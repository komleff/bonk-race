/** BonkLab — dev-only playground for testing game mechanics */

import { render, h } from "preact";
import { BonkLab } from "./BonkLab";
import { LabInput } from "./LabInput";
import { LabRenderer } from "./LabRenderer";
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
const input = new LabInput(canvas);
const renderer = new LabRenderer(canvas);

// Handle window resize
function onResize(): void {
    renderer.resize();
}
window.addEventListener("resize", onResize);
onResize(); // initial sizing

// Track re-render key so toolbar can force panel to re-read params
let panelRenderKey = 0;

function renderUI(): void {
    panelRenderKey++;
    render(h(LabPanel, { lab, key: panelRenderKey }), uiContainer);
}

// Render toolbar
render(
    h(LabToolbar, {
        lab,
        onParamsChanged: () => renderUI(),
    }),
    toolbarContainer,
);

// Render parameter panel
renderUI();

// Expose to window for dev console access
(window as unknown as Record<string, unknown>).__bonkLab = lab;
(window as unknown as Record<string, unknown>).__labInput = input;
(window as unknown as Record<string, unknown>).__labRenderer = renderer;

// ── Unified render + simulation loop ──
let rafId: number | null = null;

function frame(): void {
    // Feed input into simulation
    const inputState = input.getState();
    lab.setInput(inputState.x, inputState.y, inputState.magnitude);

    // Update normalization from current params
    renderer.setNormalization(
        lab.params["limits.speedLimitForwardMps"] as number,
        lab.params["propulsion.thrustForwardN"] as number,
    );

    // Get simulation state and render
    const state = lab.getState();
    renderer.render(state, inputState);

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
