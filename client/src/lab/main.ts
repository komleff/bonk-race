/** BonkLab — песочница для отладки игровых механик */

import { render, h } from "preact";
import { BonkLab } from "./BonkLab";
import { LabInput } from "./LabInput";
import { LabRenderer, CHAR_SCREEN_Y_RATIO, type TrailPattern } from "./LabRenderer";
import { TelemetryHUD } from "./TelemetryHUD";
import { LabPanel } from "./ui/LabPanel";
import { LabToolbar } from "./ui/LabToolbar";
import tuglabCss from "./ui/tuglab.css?raw";
import { injectStyles } from "../ui/utils/injectStyles";
import { decodeSpaceShareFragment } from "../u2taglab/share";
import { decodeShareFragment } from "../tuglab/share";
import { PRESETS, DEFAULT_PRESET_IDX } from "./ui/presets";

const root = document.getElementById("lab-root")!;
const space = root.dataset.mode === "space";
const towing = space || root.dataset.mode === "towing";
if (space) document.body.dataset.spaceMode = "true";
if (towing) { document.body.dataset.labMode = "towing"; injectStyles("tuglab-styles", tuglabCss); }

// Создать canvas — заполняет область видимости (правый край зарезервирован для панели параметров)
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

// Контейнеры для Preact UI
const toolbarContainer = document.createElement("div");
toolbarContainer.id = "lab-toolbar-ui";
root.appendChild(toolbarContainer);

const uiContainer = document.createElement("div");
uiContainer.id = "lab-ui";
root.appendChild(uiContainer);


// Инициализация основных систем
const lab = new BonkLab(canvas, towing ? { towing: true, space } : undefined);

// Применить пресет "BonkRace v0.3" при запуске — казуальные аркадные гонки
if (!space) for (const [key, val] of Object.entries(PRESETS[DEFAULT_PRESET_IDX].values)) {
    lab.updateParams(key, val);
}

const input = new LabInput(canvas, { keyboard: towing });
const renderer = new LabRenderer(canvas);
const hud = new TelemetryHUD();
const onBrakeKey = (event: KeyboardEvent) => {
    if (!space || event.code !== "Space") return;
    if (event.type === "keydown" && document.activeElement !== document.body && document.activeElement !== canvas) return;
    event.preventDefault();
    if (event.type === "keydown" && event.repeat) return;
    lab.setSpaceBrake(event.type === "keydown", "keyboard");
};
if (space) { window.addEventListener("keydown", onBrakeKey); window.addEventListener("keyup", onBrakeKey); }
if (towing) lab.reset();
let startupError = "";
const sharedLaunch = towing && location.hash.length > 0;
if (sharedLaunch) {
    try { if (space) lab.applySpaceShareSnapshot(decodeSpaceShareFragment(location.hash));
        else lab.applyShareSnapshot(decodeShareFragment(location.hash, lab.getDefaults())); }
    catch (error) { startupError = error instanceof Error ? error.message : "Повреждённая ссылка TugLab"; lab.pause(); }
}

// Обработка изменения размера окна
function onResize(): void {
    if (towing) {
        const toolbarHeight = toolbarContainer.querySelector(".lab-toolbar")?.getBoundingClientRect().height ?? 56;
        const statusHeight = toolbarContainer.querySelector(".tug-status")?.getBoundingClientRect().height ?? 24;
        const top = toolbarHeight + statusHeight;
        document.body.style.setProperty("--toolbar-height", `${toolbarHeight}px`);
        document.body.style.setProperty("--lab-top", `${top}px`);
        canvas.style.top = `${top}px`;
        canvas.style.height = `calc(100dvh - ${top}px)`;
        canvas.style.width = root.querySelector(".lab-panel") && window.innerWidth >= 900 ? "calc(100vw - 320px)" : "100vw";
    }
    renderer.resize();
}
window.addEventListener("resize", onResize);
window.visualViewport?.addEventListener("resize", onResize);
onResize(); // начальный размер

// Триггеры синхронизации для межкомпонентного взаимодействия
let syncTrigger = 0;        // toolbar → panel: перечитать параметры
let paramChangeCounter = 0; // panel → toolbar: пометить пресет как «Свой»

function renderToolbar(): void {
    render(
        h(LabToolbar, {
            lab,
            towing,
            syncTrigger,
            startupError,
            onStartupRecovered: () => { startupError = ""; renderToolbar(); },
            onPanelVisibilityChanged: onResize,
            onClearInput: towing ? () => { input.clear(); lab.setInput(0, 0, 0); renderer.clearTrail(); } : undefined,
            onParamsChanged: () => renderPanel(),
            externalParamChange: paramChangeCounter,
        }),
        toolbarContainer,
    );
}

function renderPanel(): void {
    syncTrigger++;
    if (towing) { renderToolbar(); onResize(); return; }
    render(
        h(LabPanel, {
            lab,
            towing,
            onPanelVisibilityChanged: onResize,
            syncTrigger,
            onParamChanged: () => {
                paramChangeCounter++;
                renderToolbar();
            },
        }),
        uiContainer,
    );
}

// Повторный переход к fragment той же оболочки не перезагружает страницу.
function onShareHashChanged(): void {
    if (!towing) return;
    input.clear(); lab.setInput(0, 0, 0); renderer.clearTrail();
    startupError = "";
    if (location.hash) {
        try { if (space) lab.applySpaceShareSnapshot(decodeSpaceShareFragment(location.hash));
        else lab.applyShareSnapshot(decodeShareFragment(location.hash, lab.getDefaults())); }
        catch (error) { startupError = error instanceof Error ? error.message : "Повреждённая ссылка TugLab"; lab.pause(); }
    }
    renderPanel();
}
if (towing) window.addEventListener("hashchange", onShareHashChanged);

// Первоначальная отрисовка
renderToolbar();
renderPanel();
const layoutObserver = towing ? new ResizeObserver(onResize) : null;
if (layoutObserver) {
    toolbarContainer.querySelectorAll(".lab-toolbar, .tug-status").forEach(el => layoutObserver.observe(el));
    onResize();
}
let wasPaused = lab.getState().towing?.paused ?? false;
let wasRespawning = false;

// Доступ из консоли разработчика
(window as unknown as Record<string, unknown>).__bonkLab = lab;
(window as unknown as Record<string, unknown>).__labInput = input;
(window as unknown as Record<string, unknown>).__labRenderer = renderer;

// ── Единый цикл рендера + симуляции ──
let rafId: number | null = null;
let lastFrameTs = 0;

// Валидные паттерны следа (вынесено из frame() для избежания аллокации каждый кадр)
const VALID_TRAIL_PATTERNS: TrailPattern[] = ["off", "drift", "rainbow"];

function frame(): void {
    // Вычислить frameDt (секунды с предыдущего кадра)
    const now = performance.now();
    const frameDt = lastFrameTs > 0 ? (now - lastFrameTs) / 1000 : 0;
    lastFrameTs = now;

    // Обновляем экранную позицию персонажа для корректного расчёта направления мыши
    const canvasRect = renderer.getCanvasRect();
    input.setCharacterScreenPos(
        canvasRect.left + canvasRect.width / 2,
        canvasRect.top + canvasRect.height * CHAR_SCREEN_Y_RATIO,
    );

    // Передать ввод в симуляцию
    const inputState = input.getState();
    lab.setInput(inputState.x, inputState.y, inputState.magnitude);

    // Шагнуть физику и получить alpha для интерполяции
    // (update() сам проверяет running и ограничивает dt)
    const alpha = lab.update(frameDt);
    if (towing) {
        const state = lab.getState();
        const paused = state.towing!.paused;
        const respawning = state.deathTimer > 0 || state.respawnCountdown > 0;
        // Снять удержание также в заморозке смерти и на границе выхода из Go!.
        if ((paused && !wasPaused) || respawning || wasRespawning) {
            input.clear();
            lab.setInput(0, 0, 0);
        }
        wasPaused = paused;
        wasRespawning = respawning;
    }

    // Обновить нормализацию из текущих параметров
    renderer.setNormalization(
        lab.params[space ? "space.speedLimit" : "limits.speedLimitForwardMps"] as number,
        lab.params[space ? "space.forwardForce" : "propulsion.thrustForwardN"] as number,
    );

    // Конфигурация следа
    const rawPattern = (lab.params["trail.pattern"] as unknown as string) ?? "drift";
    const trailPattern: TrailPattern = VALID_TRAIL_PATTERNS.includes(rawPattern as TrailPattern)
        ? rawPattern as TrailPattern
        : "drift";
    renderer.setTrailConfig({
        enabled: Boolean(lab.params["trail.enabled"]),
        maxAge: (lab.params["trail.maxAge"] as number) ?? 3.5,
        baseAlpha: (lab.params["trail.baseAlpha"] as number) ?? 0.6,
        pattern: trailPattern,
        primaryColor: (lab.params["trail.primaryColor"] as unknown as string) ?? "#44aaff",
        driftColor: (lab.params["trail.driftColor"] as unknown as string) ?? "#ff4444",
        rainbowPeriodSec: (lab.params["trail.rainbowPeriodSec"] as number) ?? 2.0,
    });

    // Получить интерполированное состояние и отрисовать
    const state = lab.getInterpolatedState(alpha);
    if (space && state.towing) {
        // Сохраняем экранную опору ввода A; zoom вмещает B с запасом у всех длин сцепки.
        const b = state.towing.B, dx = b.position.x - state.x, dy = b.position.y - state.y;
        const shortest = Math.min(canvasRect.width, canvasRect.height);
        renderer.setViewRange(Math.max(400, (dy + b.radius) * shortest / (0.56 * canvasRect.height),
            (-dy + b.radius) * shortest / (1.16 * canvasRect.height),
            (Math.abs(dx) + b.radius) * shortest / (0.88 * canvasRect.width)));
    }
    renderer.render(state, inputState);

    // Отрисовать оверлей телеметрии поверх всего (экранные координаты)
    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        hud.render(ctx, state, lab.params);
    }

    rafId = requestAnimationFrame(frame);
}

// Запуск симуляции и цикла рендеринга
if (!sharedLaunch) lab.start();
rafId = requestAnimationFrame(frame);

// Очистка при горячей перезагрузке — предотвращение устаревших листенеров/циклов при HMR Vite
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        layoutObserver?.disconnect();
        window.removeEventListener("hashchange", onShareHashChanged);
        lab.stop();
        window.removeEventListener("keydown", onBrakeKey); window.removeEventListener("keyup", onBrakeKey);
        input.destroy();
        cancelAnimationFrame(rafId!);
        window.removeEventListener("resize", onResize);
        window.visualViewport?.removeEventListener("resize", onResize);
        render(null, toolbarContainer);
        render(null, uiContainer);
    });
}

console.log("[BonkLab] entry point loaded — use window.__bonkLab to inspect");
