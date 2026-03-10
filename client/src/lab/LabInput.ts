/**
 * LabInput — lightweight input handler for BonkLab
 *
 * Desktop: mouse click-drag from character screen position to cursor → direction vector.
 * Mobile:  virtual joystick — touch start sets origin, drag gives direction.
 *
 * Self-contained, no dependencies on the game InputManager.
 */

// ========== Types ==========

export interface LabInputState {
    /** Normalized direction X (-1..1) */
    x: number;
    /** Normalized direction Y (-1..1) */
    y: number;
    /** Input magnitude 0..1 */
    magnitude: number;
    /** Whether input is currently held */
    active: boolean;
    /** Screen X of current touch/click point (for visualization) */
    screenX: number;
    /** Screen Y of current touch/click point (for visualization) */
    screenY: number;
    /** Whether this input comes from touch (vs mouse) */
    isTouch: boolean;
    /** Touch joystick base screen X (only meaningful when isTouch=true) */
    baseScreenX: number;
    /** Touch joystick base screen Y (only meaningful when isTouch=true) */
    baseScreenY: number;
}

export interface LabInputConfig {
    /** Dead zone threshold — magnitudes below this are treated as zero. Default 0.05 */
    deadZone: number;
    /** Max radius in pixels for touch joystick. Default 100 */
    maxRadius: number;
}

const DEFAULT_CONFIG: LabInputConfig = {
    deadZone: 0.05,
    maxRadius: 100,
};

// ========== LabInput ==========

export class LabInput {
    private canvas: HTMLCanvasElement;
    private config: LabInputConfig;

    // --- Mouse state ---
    private mouseDown = false;
    private mouseScreenX = 0;
    private mouseScreenY = 0;

    // --- Touch state ---
    private touchId: number | null = null;
    private touchBaseX = 0;
    private touchBaseY = 0;
    private touchCurrentX = 0;
    private touchCurrentY = 0;

    // --- Character screen position (updated externally each frame) ---
    private charScreenX = 0;
    private charScreenY = 0;
    private charScreenPosSet = false;

    // --- Computed state (updated on every input event) ---
    private state: LabInputState = {
        x: 0,
        y: 0,
        magnitude: 0,
        active: false,
        screenX: 0,
        screenY: 0,
        isTouch: false,
        baseScreenX: 0,
        baseScreenY: 0,
    };

    // --- Bound handlers ---
    private _onMouseDown: (e: MouseEvent) => void;
    private _onMouseMove: (e: MouseEvent) => void;
    private _onMouseUp: (e: MouseEvent) => void;
    private _onTouchStart: (e: TouchEvent) => void;
    private _onTouchMove: (e: TouchEvent) => void;
    private _onTouchEnd: (e: TouchEvent) => void;
    private _onTouchCancel: (e: TouchEvent) => void;

    constructor(canvas: HTMLCanvasElement, config?: Partial<LabInputConfig>) {
        this.canvas = canvas;
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Bind handlers
        this._onMouseDown = this.onMouseDown.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseUp = this.onMouseUp.bind(this);
        this._onTouchStart = this.onTouchStart.bind(this);
        this._onTouchMove = this.onTouchMove.bind(this);
        this._onTouchEnd = this.onTouchEnd.bind(this);
        this._onTouchCancel = this.onTouchEnd.bind(this); // same logic

        // Attach
        canvas.addEventListener("mousedown", this._onMouseDown);
        window.addEventListener("mousemove", this._onMouseMove);
        window.addEventListener("mouseup", this._onMouseUp);
        canvas.addEventListener("touchstart", this._onTouchStart, { passive: false });
        window.addEventListener("touchmove", this._onTouchMove, { passive: false });
        window.addEventListener("touchend", this._onTouchEnd);
        window.addEventListener("touchcancel", this._onTouchCancel);
    }

    /** Returns the current input state (read-only snapshot). */
    getState(): Readonly<LabInputState> {
        return this.state;
    }

    /**
     * Set the character's screen position (CSS pixels).
     * Mouse direction is calculated from this point to the cursor.
     * Call once per frame before getState().
     */
    setCharacterScreenPos(x: number, y: number): void {
        this.charScreenX = x;
        this.charScreenY = y;
        this.charScreenPosSet = true;
        // Recalculate mouse direction if mouse is held
        if (this.mouseDown) {
            this.updateMouseState();
        }
    }

    /** Remove all event listeners. Call when done with this input handler. */
    destroy(): void {
        this.canvas.removeEventListener("mousedown", this._onMouseDown);
        window.removeEventListener("mousemove", this._onMouseMove);
        window.removeEventListener("mouseup", this._onMouseUp);
        this.canvas.removeEventListener("touchstart", this._onTouchStart);
        window.removeEventListener("touchmove", this._onTouchMove);
        window.removeEventListener("touchend", this._onTouchEnd);
        window.removeEventListener("touchcancel", this._onTouchCancel);
        this.clearState();
    }

    // ========== Mouse handlers ==========

    private onMouseDown(e: MouseEvent): void {
        // Only primary button
        if (e.button !== 0) return;
        this.mouseDown = true;
        this.mouseScreenX = e.clientX;
        this.mouseScreenY = e.clientY;
        this.updateMouseState();
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.mouseDown) return;
        this.mouseScreenX = e.clientX;
        this.mouseScreenY = e.clientY;
        this.updateMouseState();
    }

    private onMouseUp(e: MouseEvent): void {
        if (e.button !== 0) return;
        if (!this.mouseDown) return;
        this.mouseDown = false;
        // If no touch active either, clear state
        if (this.touchId === null) {
            this.clearState();
        }
    }

    private updateMouseState(): void {
        // Direction from character screen position to cursor.
        // Falls back to canvas center if setCharacterScreenPos() was never called.
        const rect = this.canvas.getBoundingClientRect();
        const centerX = this.charScreenPosSet
            ? this.charScreenX
            : rect.left + rect.width / 2;
        const centerY = this.charScreenPosSet
            ? this.charScreenY
            : rect.top + rect.height / 2;

        const dx = this.mouseScreenX - centerX;
        const dy = this.mouseScreenY - centerY;
        const dist = Math.hypot(dx, dy);

        // Use half the smaller canvas dimension as max distance for magnitude scaling
        const maxDist = Math.min(rect.width, rect.height) / 2;

        if (dist < 1) {
            // Cursor essentially at character position
            this.applyState(0, 0, 0, this.mouseScreenX, this.mouseScreenY, false, 0, 0);
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const rawMagnitude = Math.min(dist / maxDist, 1);

        this.applyState(nx, ny, rawMagnitude, this.mouseScreenX, this.mouseScreenY, false, 0, 0);
    }

    // ========== Touch handlers ==========

    private onTouchStart(e: TouchEvent): void {
        // Only track the first touch
        if (this.touchId !== null) return;

        const touch = e.changedTouches[0];
        if (!touch) return;

        e.preventDefault(); // prevent scrolling

        this.touchId = touch.identifier;
        this.touchBaseX = touch.clientX;
        this.touchBaseY = touch.clientY;
        this.touchCurrentX = touch.clientX;
        this.touchCurrentY = touch.clientY;

        // At start, magnitude is 0 (finger hasn't moved yet)
        this.applyState(0, 0, 0, touch.clientX, touch.clientY, true, this.touchBaseX, this.touchBaseY);
    }

    private onTouchMove(e: TouchEvent): void {
        if (this.touchId === null) return;

        const touch = this.findTrackedTouch(e.changedTouches);
        if (!touch) return;

        e.preventDefault(); // prevent scrolling

        this.touchCurrentX = touch.clientX;
        this.touchCurrentY = touch.clientY;
        this.updateTouchState();
    }

    private onTouchEnd(e: TouchEvent): void {
        if (this.touchId === null) return;

        const touch = this.findTrackedTouch(e.changedTouches);
        if (!touch) return;

        this.touchId = null;
        // If mouse not held either, clear
        if (!this.mouseDown) {
            this.clearState();
        }
    }

    private findTrackedTouch(touches: TouchList): Touch | null {
        for (let i = 0; i < touches.length; i++) {
            if (touches[i].identifier === this.touchId) {
                return touches[i];
            }
        }
        return null;
    }

    private updateTouchState(): void {
        const dx = this.touchCurrentX - this.touchBaseX;
        const dy = this.touchCurrentY - this.touchBaseY;
        const dist = Math.hypot(dx, dy);

        if (dist < 1) {
            this.applyState(0, 0, 0, this.touchCurrentX, this.touchCurrentY, true, this.touchBaseX, this.touchBaseY);
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const rawMagnitude = Math.min(dist / this.config.maxRadius, 1);

        this.applyState(nx, ny, rawMagnitude, this.touchCurrentX, this.touchCurrentY, true, this.touchBaseX, this.touchBaseY);
    }

    // ========== Shared ==========

    private applyState(
        nx: number,
        ny: number,
        rawMagnitude: number,
        screenX: number,
        screenY: number,
        isTouch: boolean,
        baseScreenX: number,
        baseScreenY: number,
    ): void {
        if (rawMagnitude < this.config.deadZone) {
            this.state.x = 0;
            this.state.y = 0;
            this.state.magnitude = 0;
        } else {
            this.state.x = nx;
            this.state.y = ny;
            this.state.magnitude = rawMagnitude;
        }
        this.state.active = true;
        this.state.screenX = screenX;
        this.state.screenY = screenY;
        this.state.isTouch = isTouch;
        this.state.baseScreenX = baseScreenX;
        this.state.baseScreenY = baseScreenY;
    }

    private clearState(): void {
        this.state.x = 0;
        this.state.y = 0;
        this.state.magnitude = 0;
        this.state.active = false;
        this.state.screenX = 0;
        this.state.screenY = 0;
        this.state.isTouch = false;
        this.state.baseScreenX = 0;
        this.state.baseScreenY = 0;
    }
}
