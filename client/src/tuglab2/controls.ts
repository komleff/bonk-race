import { LabInput } from '../lab/LabInput';
import type { InputA } from './session';

// Все источники ввода освобождаются вместе; обычное отпускание не означает потерю ввода.
export class TrainControls {
  readonly pilot: LabInput;
  private space = false;
  private a = new Set<number>();
  private rear = new Set<number>();
  private canvasPointers = new Set<number>();
  private dispose: (() => void)[] = [];
  constructor(canvas: HTMLCanvasElement, brakeA: HTMLElement, brakeRear: HTMLElement, loss: () => void) {
    this.pilot = new LabInput(canvas, { keyboard: true });
    const listen = (target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler, options); this.dispose.push(() => target.removeEventListener(type, handler, options));
    };
    const lost = () => { this.clear(); loss(); };
    listen(window, 'blur', lost); listen(window, 'orientationchange', lost);
    listen(document, 'visibilitychange', () => { if (document.hidden) lost(); });
    listen(window, 'touchcancel', lost);
    listen(document, 'focusin', (event) => {
      if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable=true]')) { this.pilot.clear(); this.space = false; }
    });
    listen(window, 'keydown', (event) => {
      const e = event as KeyboardEvent;
      if (e.code !== 'Space' || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement).closest('input,select,textarea,button,[contenteditable=true]')) return;
      e.preventDefault(); if (!e.repeat) this.space = true;
    });
    listen(window, 'keyup', (event) => { if ((event as KeyboardEvent).code === 'Space') { this.space = false; event.preventDefault(); } });
    const hold = (element: HTMLElement, held: Set<number>) => {
      listen(element, 'pointerdown', (event) => {
        const e = event as PointerEvent; if (e.button !== 0) return;
        e.preventDefault(); held.add(e.pointerId);
        try { element.setPointerCapture(e.pointerId); } catch { /* Синтетический указатель не имеет браузерного захвата. */ }
      });
      listen(element, 'pointerup', (event) => {
        const e = event as PointerEvent; held.delete(e.pointerId);
        if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId);
      });
      listen(element, 'pointercancel', lost);
      listen(element, 'lostpointercapture', (event) => { if (held.has((event as PointerEvent).pointerId)) lost(); });
      listen(element, 'contextmenu', event => event.preventDefault());
    };
    hold(brakeA, this.a); hold(brakeRear, this.rear);
    listen(canvas, 'pointerdown', (event) => {
      const e = event as PointerEvent; if (e.button !== 0) return;
      this.canvasPointers.add(e.pointerId); canvas.setPointerCapture(e.pointerId);
    });
    listen(canvas, 'pointerup', (event) => { this.canvasPointers.delete((event as PointerEvent).pointerId); });
    listen(canvas, 'pointercancel', lost);
    listen(canvas, 'lostpointercapture', (event) => { if (this.canvasPointers.has((event as PointerEvent).pointerId)) lost(); });
  }
  get brake(): boolean { return this.space || this.a.size > 0; }
  get rearBrake(): boolean { return this.rear.size > 0; }
  read(): InputA { const p = this.pilot.getState(); return { x: p.x, y: p.y, magnitude: p.magnitude, brake: this.brake }; }
  clear(): void { this.pilot.clear(); this.space = false; this.a.clear(); this.rear.clear(); this.canvasPointers.clear(); }
  destroy(): void { this.dispose.forEach(fn => fn()); this.pilot.destroy(); this.clear(); }
}
