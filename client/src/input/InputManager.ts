/**
 * InputManager - централизованное управление вводом
 *
 * Объединяет keyboard, pointer (touch/pen), mouse обработчики.
 * Делегирует джойстик в joystick.ts модуль.
 */

import { clamp } from "@bonk-race/shared";
import {
    type JoystickState,
    type JoystickConfig,
    resetJoystick as resetJoystickState,
    updateJoystickFromPointer as updateJoystickFromPointerModule,
    updateJoystickVisual as updateJoystickVisualModule,
    setJoystickVisible as setJoystickVisibleModule,
} from "./joystick";

// ========== Типы ==========

export interface MouseState {
    active: boolean;
    screenX: number;
    screenY: number;
    worldX: number;
    worldY: number;
    moveX: number;
    moveY: number;
}

export interface InputManagerDeps {
    canvas: HTMLCanvasElement;
    joystickState: JoystickState;
    joystickConfig: JoystickConfig;
    joystickBase: HTMLDivElement;
    joystickKnob: HTMLDivElement;
    joystickFixedBase: { x: number; y: number };
    getJoystickActivationGate: () => { maxX: number; minY: number };
    isCoarsePointer: () => boolean;
    mouseDeadzone: number;
    mouseMaxDist: number;
    getScreenToWorld: (screenX: number, screenY: number) => { x: number; y: number };
    balanceConfig: any;
}

export interface InputCallbacks {
    onSendInput: (moveX: number, moveY: number, abilitySlot?: number) => void;
    onSendStopInput: () => void;
    onTalentChoice: (index: number) => void;
    onAbilityCardChoice: (index: number) => void;
    getPlayerPendingCards: () => { hasTalentCard: boolean; hasAbilityCard: boolean };
    isClassSelectMode: () => boolean;
}

// ========== InputManager ==========

export class InputManager {
    private deps: InputManagerDeps;
    private callbacks: InputCallbacks;

    // Состояние
    readonly mouseState: MouseState = { active: false, screenX: 0, screenY: 0, worldX: 0, worldY: 0, moveX: 0, moveY: 0 };
    private _hasFocus = false;
    private joystickPointerListenersAttached = false;
    private lastSentInput = { x: 0, y: 0 };

    get hasFocus(): boolean {
        return this._hasFocus;
    }

    // Debug
    private debugEnabled = false;
    private debugMoveThrottleMs = 80;
    private lastMoveLogMs = 0;

    // Bound handlers для корректного удаления listeners
    private boundOnKeyDown: (e: KeyboardEvent) => void;
    private boundOnPointerDown: (e: PointerEvent) => void;
    private boundOnPointerMove: (e: PointerEvent) => void;
    private boundOnPointerUp: (e: PointerEvent) => void;
    private boundOnPointerCancel: (e: PointerEvent) => void;
    private boundOnMouseMove: (e: MouseEvent) => void;
    private boundOnMouseLeave: (e: MouseEvent) => void;
    private boundOnFocus: () => void;
    private boundOnBlur: () => void;
    private boundOnVisibilityChange: () => void;

    constructor(deps: InputManagerDeps, callbacks: InputCallbacks) {
        this.deps = deps;
        this.callbacks = callbacks;

        // Bind all handlers
        this.boundOnKeyDown = this.onKeyDown.bind(this);
        this.boundOnPointerDown = this.onPointerDown.bind(this);
        this.boundOnPointerMove = this.onPointerMove.bind(this);
        this.boundOnPointerUp = this.onPointerUp.bind(this);
        this.boundOnPointerCancel = this.onPointerCancel.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseLeave = this.onMouseLeave.bind(this);
        this.boundOnFocus = this.onFocus.bind(this);
        this.boundOnBlur = this.onBlur.bind(this);
        this.boundOnVisibilityChange = this.onVisibilityChange.bind(this);

        // Check debug flag
        this.debugEnabled = new URLSearchParams(window.location.search).get("debugJoystick") === "1";
    }

    // ========== Lifecycle ==========

    attach(): void {
        const { canvas } = this.deps;

        window.addEventListener("keydown", this.boundOnKeyDown);
        canvas.addEventListener("pointerdown", this.boundOnPointerDown, { passive: false });
        canvas.addEventListener("mousemove", this.boundOnMouseMove, { passive: true });
        canvas.addEventListener("mouseleave", this.boundOnMouseLeave, { passive: true });
        window.addEventListener("focus", this.boundOnFocus);
        window.addEventListener("blur", this.boundOnBlur);
        document.addEventListener("visibilitychange", this.boundOnVisibilityChange);
    }

    detach(): void {
        const { canvas } = this.deps;

        window.removeEventListener("keydown", this.boundOnKeyDown);
        canvas.removeEventListener("pointerdown", this.boundOnPointerDown);
        canvas.removeEventListener("mousemove", this.boundOnMouseMove);
        canvas.removeEventListener("mouseleave", this.boundOnMouseLeave);
        window.removeEventListener("focus", this.boundOnFocus);
        window.removeEventListener("blur", this.boundOnBlur);
        document.removeEventListener("visibilitychange", this.boundOnVisibilityChange);

        this.detachJoystickPointerListeners();
    }

    // ========== Public API ==========

    getMovementInput(): { x: number; y: number } {
        const { joystickState } = this.deps;

        // Приоритет: joystick > мышь
        if (joystickState.active) {
            return { x: joystickState.moveX, y: -joystickState.moveY };
        }

        // Мышь
        if (this.mouseState.active) {
            return { x: this.mouseState.moveX, y: this.mouseState.moveY };
        }

        return { x: 0, y: 0 };
    }

    updateMouseDirection(playerWorldX: number, playerWorldY: number, scale: number): void {
        if (!this.mouseState.active) return;

        const { mouseDeadzone, mouseMaxDist } = this.deps;

        // Конвертируем deadzone и maxDist из экранных пикселей в мировые единицы
        // чтобы чувствительность не зависела от зума камеры
        const deadzoneWorld = mouseDeadzone / scale;
        const maxDistWorld = mouseMaxDist / scale;

        // Вычисляем направление в мировых координатах
        const dx = this.mouseState.worldX - playerWorldX;
        const dy = this.mouseState.worldY - playerWorldY;
        const dist = Math.hypot(dx, dy);

        // Мёртвая зона (фиксирована в экранных пикселях)
        if (dist < deadzoneWorld) {
            this.mouseState.moveX = 0;
            this.mouseState.moveY = 0;
            return;
        }

        // Нормализуем направление
        const nx = dx / dist;
        const ny = dy / dist;

        // Интенсивность зависит от расстояния (линейно до maxDist)
        const intensity = clamp((dist - deadzoneWorld) / (maxDistWorld - deadzoneWorld), 0, 1);

        this.mouseState.moveX = nx * intensity;
        this.mouseState.moveY = ny * intensity;
    }

    setLastSentInput(x: number, y: number): void {
        this.lastSentInput = { x, y };
    }

    resetJoystick(): void {
        const { joystickState, joystickBase, joystickKnob } = this.deps;
        setJoystickVisibleModule(false, joystickBase, joystickKnob);
        updateJoystickVisualModule(joystickState, joystickBase, joystickKnob);
        resetJoystickState(joystickState);
    }

    isJoystickActive(): boolean {
        return this.deps.joystickState.active;
    }

    resetInputState(): void {
        this._hasFocus = false;
        this.mouseState.active = false;
        this.mouseState.screenX = 0;
        this.mouseState.screenY = 0;
        this.mouseState.worldX = 0;
        this.mouseState.worldY = 0;
        this.mouseState.moveX = 0;
        this.mouseState.moveY = 0;
        this.lastSentInput = { x: 0, y: 0 };
    }

    // ========== Keyboard Handlers ==========

    private onKeyDown(event: KeyboardEvent): void {
        if (document.visibilityState !== "visible") return;
        if (!document.hasFocus()) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.repeat) return;
        if (this.callbacks.isClassSelectMode()) return;

        const key = event.key.toLowerCase();
        this._hasFocus = true;

        // Ability slots 1-3
        if (key === "1" || key === "2" || key === "3") {
            const slot = parseInt(key) - 1;
            this.callbacks.onSendInput(this.lastSentInput.x, this.lastSentInput.y, slot);
            event.preventDefault();
            return;
        }

        // Card choice 7/8/9
        if (key === "7" || key === "8" || key === "9") {
            const choiceIndex = parseInt(key) - 7;
            const { hasTalentCard, hasAbilityCard } = this.callbacks.getPlayerPendingCards();

            if (hasTalentCard) {
                this.callbacks.onTalentChoice(choiceIndex);
            } else if (hasAbilityCard) {
                this.callbacks.onAbilityCardChoice(choiceIndex);
            }

            event.preventDefault();
            return;
        }
    }

    // ========== Pointer Handlers (Touch/Pen) ==========

    private attachJoystickPointerListeners(): void {
        if (this.joystickPointerListenersAttached) return;
        window.addEventListener("pointermove", this.boundOnPointerMove, { passive: false });
        window.addEventListener("pointerup", this.boundOnPointerUp, { passive: false });
        window.addEventListener("pointercancel", this.boundOnPointerCancel, { passive: false });
        this.joystickPointerListenersAttached = true;
    }

    private detachJoystickPointerListeners(): void {
        if (!this.joystickPointerListenersAttached) return;
        window.removeEventListener("pointermove", this.boundOnPointerMove);
        window.removeEventListener("pointerup", this.boundOnPointerUp);
        window.removeEventListener("pointercancel", this.boundOnPointerCancel);
        this.joystickPointerListenersAttached = false;
    }

    private onPointerDown(event: PointerEvent): void {
        const {
            canvas, joystickState, joystickConfig, joystickBase, joystickKnob,
            joystickFixedBase, getJoystickActivationGate, isCoarsePointer
        } = this.deps;

        const isCoarse = isCoarsePointer();
        const isTouchPointer = event.pointerType === "touch" || event.pointerType === "pen";
        const isMousePointer = event.pointerType === "mouse";

        this.logJoystick("pointerdown", {
            clientX: event.clientX,
            clientY: event.clientY,
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            isCoarse,
        });

        // Mouse не активирует джойстик
        if (isMousePointer) {
            this.logJoystick("pointerdown-skip", { reason: "mouse" });
            return;
        }

        if (!isTouchPointer && !isCoarse) {
            this.logJoystick("pointerdown-skip", { reason: "not-touch-or-coarse" });
            return;
        }

        if (joystickState.active) {
            this.logJoystick("pointerdown-skip", { reason: "already-active" });
            return;
        }

        const gate = getJoystickActivationGate();
        if (event.clientX > gate.maxX) {
            this.logJoystick("pointerdown-skip", { reason: "gate-maxX", maxX: gate.maxX });
            return;
        }
        if (event.clientY < gate.minY) {
            this.logJoystick("pointerdown-skip", { reason: "gate-minY", minY: gate.minY });
            return;
        }

        event.preventDefault();
        this._hasFocus = true;
        joystickState.active = true;
        joystickState.pointerId = event.pointerId;
        joystickState.pointerType = event.pointerType;
        this.attachJoystickPointerListeners();

        if (joystickConfig.mode === "fixed") {
            joystickState.baseX = joystickFixedBase.x;
            joystickState.baseY = joystickFixedBase.y;
        } else {
            joystickState.baseX = event.clientX;
            joystickState.baseY = event.clientY;
        }
        joystickState.knobX = joystickState.baseX;
        joystickState.knobY = joystickState.baseY;

        setJoystickVisibleModule(true, joystickBase, joystickKnob);
        this.updateJoystickFromPointer(event.clientX, event.clientY);
        this.logJoystick("pointerdown-activate", { clientX: event.clientX, clientY: event.clientY });

        try {
            canvas.setPointerCapture(event.pointerId);
        } catch {
            // ignore pointer capture errors
        }
    }

    private onPointerMove(event: PointerEvent): void {
        const { joystickState } = this.deps;

        if (!joystickState.active) return;
        if (event.pointerId !== joystickState.pointerId) return;

        event.preventDefault();
        this.updateJoystickFromPointer(event.clientX, event.clientY);
    }

    private onPointerUp(event: PointerEvent): void {
        const { canvas, joystickState } = this.deps;

        if (!joystickState.active) {
            this.logJoystick("pointerup-skip", { reason: "inactive", pointerId: event.pointerId });
            return;
        }
        if (event.pointerId !== joystickState.pointerId) {
            this.logJoystick("pointerup-skip", { reason: "pointer-id-mismatch", pointerId: event.pointerId });
            return;
        }

        event.preventDefault();
        this.detachJoystickPointerListeners();
        this.resetJoystick();

        if (canvas.hasPointerCapture(event.pointerId)) {
            try {
                canvas.releasePointerCapture(event.pointerId);
            } catch {
                // ignore release errors
            }
        }

        this.logJoystick("pointerup", { clientX: event.clientX, clientY: event.clientY });
        this.callbacks.onSendStopInput();
    }

    private onPointerCancel(event: PointerEvent): void {
        const { canvas, joystickState } = this.deps;

        if (!joystickState.active) {
            this.logJoystick("pointercancel-skip", { reason: "inactive", pointerId: event.pointerId });
            return;
        }
        if (event.pointerId !== joystickState.pointerId) {
            this.logJoystick("pointercancel-skip", { reason: "pointer-id-mismatch", pointerId: event.pointerId });
            return;
        }

        event.preventDefault();
        this.detachJoystickPointerListeners();
        this.resetJoystick();

        if (canvas.hasPointerCapture(event.pointerId)) {
            try {
                canvas.releasePointerCapture(event.pointerId);
            } catch {
                // ignore release errors
            }
        }

        this.logJoystick("pointercancel", { clientX: event.clientX, clientY: event.clientY });
        this.callbacks.onSendStopInput();
    }

    private updateJoystickFromPointer(clientX: number, clientY: number): void {
        const { canvas, joystickState, joystickConfig, joystickBase, joystickKnob } = this.deps;
        const rect = canvas.getBoundingClientRect();

        updateJoystickFromPointerModule(joystickState, joystickConfig, clientX, clientY, rect);
        updateJoystickVisualModule(joystickState, joystickBase, joystickKnob);

        this.logJoystickMove("move", { clientX, clientY });
    }

    // ========== Mouse Handlers ==========

    private onMouseMove(event: MouseEvent): void {
        // Игнорируем mouse события на touch-устройствах
        if (this.deps.isCoarsePointer()) return;
        // Не активируем если уже активен джойстик
        if (this.deps.joystickState.active) return;
        if (this.callbacks.isClassSelectMode()) return;

        this._hasFocus = true;
        this.mouseState.active = true;
        this.mouseState.screenX = event.clientX;
        this.mouseState.screenY = event.clientY;

        // Конвертируем экранные координаты в мировые
        const worldPos = this.deps.getScreenToWorld(event.clientX, event.clientY);
        this.mouseState.worldX = worldPos.x;
        this.mouseState.worldY = worldPos.y;
    }

    private onMouseLeave(event: MouseEvent): void {
        if (this.deps.isCoarsePointer()) return;
        if (document.visibilityState !== "visible") return;
        if (!document.hasFocus()) return;
        if (this.callbacks.isClassSelectMode()) return;

        const rect = this.deps.canvas.getBoundingClientRect();
        this.mouseState.active = true;
        this.mouseState.screenX = clamp(event.clientX, rect.left + 1, rect.right - 1);
        this.mouseState.screenY = clamp(event.clientY, rect.top + 1, rect.bottom - 1);

        // Конвертируем clamped координаты в мировые
        const worldPos = this.deps.getScreenToWorld(this.mouseState.screenX, this.mouseState.screenY);
        this.mouseState.worldX = worldPos.x;
        this.mouseState.worldY = worldPos.y;
    }

    // ========== Focus Handlers ==========

    private onFocus(): void {
        if (this.callbacks.isClassSelectMode()) return;
        this._hasFocus = true;
    }

    private onBlur(): void {
        this._hasFocus = false;
        this.mouseState.active = false;
        this.mouseState.screenX = 0;
        this.mouseState.screenY = 0;
        this.mouseState.worldX = 0;
        this.mouseState.worldY = 0;
        this.mouseState.moveX = 0;
        this.mouseState.moveY = 0;
        this.callbacks.onSendStopInput();
        this.detachJoystickPointerListeners();
        this.resetJoystick();
        this.logJoystick("blur");
    }

    private onVisibilityChange(): void {
        if (document.visibilityState === "hidden") {
            this._hasFocus = false;
            this.mouseState.active = false;
            this.mouseState.screenX = 0;
            this.mouseState.screenY = 0;
            this.mouseState.worldX = 0;
            this.mouseState.worldY = 0;
            this.mouseState.moveX = 0;
            this.mouseState.moveY = 0;
            this.callbacks.onSendStopInput();
            this.detachJoystickPointerListeners();
            this.resetJoystick();
            this.logJoystick("visibility-hidden");
        } else {
            this._hasFocus = true;
            this.logJoystick("visibility-visible");
        }
    }

    // ========== Debug ==========

    private logJoystick(label: string, payload: Record<string, unknown> = {}): void {
        if (!this.debugEnabled) return;
        const state = this.getJoystickDebugState();
        console.log(`[joystick] ${label}`, { t: Date.now(), ...payload, ...state });
    }

    private logJoystickMove(label: string, payload: Record<string, unknown> = {}): void {
        if (!this.debugEnabled) return;
        const now = Date.now();
        if (now - this.lastMoveLogMs < this.debugMoveThrottleMs) return;
        this.lastMoveLogMs = now;
        this.logJoystick(label, payload);
    }

    private getJoystickDebugState(): Record<string, unknown> {
        const { joystickState, joystickConfig } = this.deps;
        return {
            active: joystickState.active,
            pointerId: joystickState.pointerId,
            pointerType: joystickState.pointerType,
            baseX: Math.round(joystickState.baseX),
            baseY: Math.round(joystickState.baseY),
            knobX: Math.round(joystickState.knobX),
            knobY: Math.round(joystickState.knobY),
            moveX: Number(joystickState.moveX.toFixed(3)),
            moveY: Number(joystickState.moveY.toFixed(3)),
            mode: joystickConfig.mode,
            radius: joystickConfig.radius,
            deadzone: joystickConfig.deadzone,
            followSpeed: joystickConfig.followSpeed,
        };
    }
}
