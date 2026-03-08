/**
 * LabInput — lightweight input handler for BonkLab
 *
 * Desktop: mouse click-drag from canvas center to cursor → direction vector.
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

    // --- Computed state (updated on every input event) ---
    private state: LabInputState = {
        x: 0,
        y: 0,
        magnitude: 0,
        active: false,
        screenX: 0,
        screenY: 0,
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
        // Direction from canvas center to cursor
        const rect = this.canvas.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = this.mouseScreenX - centerX;
        const dy = this.mouseScreenY - centerY;
        const dist = Math.hypot(dx, dy);

        // Use half the smaller canvas dimension as max distance for magnitude scaling
        const maxDist = Math.min(rect.width, rect.height) / 2;

        if (dist < 1) {
            // Cursor essentially at center
            this.state.x = 0;
            this.state.y = 0;
            this.state.magnitude = 0;
            this.state.active = true;
            this.state.screenX = this.mouseScreenX;
            this.state.screenY = this.mouseScreenY;
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const rawMagnitude = Math.min(dist / maxDist, 1);

        this.applyState(nx, ny, rawMagnitude, this.mouseScreenX, this.mouseScreenY);
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
        this.applyState(0, 0, 0, touch.clientX, touch.clientY);
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
            this.applyState(0, 0, 0, this.touchCurrentX, this.touchCurrentY);
            return;
        }

        const nx = dx / dist;
        const ny = dy / dist;
        const rawMagnitude = Math.min(dist / this.config.maxRadius, 1);

        this.applyState(nx, ny, rawMagnitude, this.touchCurrentX, this.touchCurrentY);
    }

    // ========== Shared ==========

    private applyState(
        nx: number,
        ny: number,
        rawMagnitude: number,
        screenX: number,
        screenY: number,
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
    }

    private clearState(): void {
        this.state.x = 0;
        this.state.y = 0;
        this.state.magnitude = 0;
        this.state.active = false;
        this.state.screenX = 0;
        this.state.screenY = 0;
    }
}
