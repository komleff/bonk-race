import type { Arena } from '@bonk-race/shared';
import type { AdvanceResult, ApplyVelocity, BodyState, CaptureResult, CouplingState, Diagnostics, TugConfig } from './types';
import defaults from './config/tuglab_defaults.json';
import { createCoupling, couplingGeometry } from './physics/coupling';
import { advancePair } from './physics/advance';
import { isValidBody } from './physics/body';

export const TOW_DEFAULTS: Record<string, number | string> = {
  'tow.massRatio': 1, 'tow.radiusB': 20, 'tow.length': 8, 'tow.type': 'spring',
  'tow.stiffness': 1250, 'tow.dampingRatio': 0.5,
};
const ranges: Record<string, readonly [number, number]> = {
  'tow.massRatio': [0.1, 10], 'tow.radiusB': [2, 60], 'tow.length': [4, 24],
  'tow.stiffness': [0, 10000], 'tow.dampingRatio': [0, 1.5],
};
const clone = (b: BodyState): BodyState => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } });
export interface TowingSnapshot {
  B: BodyState; coupling: CouplingState; distance: number; relativeSpeed: number;
  paused: boolean; reason?: string; needsRestart: boolean; diagnostics: Diagnostics;
}

// Владеет только прицепом и сцепкой: постоянной копии ведущего тела здесь нет.
export class LabTowing {
  readonly params = { ...TOW_DEFAULTS };
  B: BodyState;
  coupling: CouplingState;
  reason?: string;
  needsRestart = false;
  diagnostics: Diagnostics = { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false };
  private referenceMass: number;

  constructor(a: BodyState) {
    this.referenceMass = a.mass / 2;
    this.B = this.bodyB(a);
    this.coupling = createCoupling(this.config());
  }
  private bodyB(a: BodyState): BodyState {
    const mass = a.mass * Number(this.params['tow.massRatio']), radius = Number(this.params['tow.radiusB']);
    return { position: { ...a.position }, velocity: { x: 0, y: 0 }, angle: a.angle, angularVelocity: 0,
      mass, radius, inertia: 0.5 * mass * radius * radius };
  }
  private config(restitution = 0.8): TugConfig {
    return { ...(defaults as TugConfig), couplingType: this.params['tow.type'] as TugConfig['couplingType'],
      length: Number(this.params['tow.length']), springStiffness: Number(this.params['tow.stiffness']),
      springDamping: Number(this.params['tow.dampingRatio']), springReferenceMass: this.referenceMass, restitution };
  }
  private free(b: BodyState, arena: Arena): boolean {
    return isValidBody(b) && Math.abs(b.position.x) + b.radius <= arena.width / 2 + 1e-7
      && Math.abs(b.position.y) + b.radius <= arena.height / 2 + 1e-7
      && arena.obstacles.every(o => o.alive === false || Math.hypot(b.position.x - o.x, b.position.y - o.y) >= b.radius + o.radius - 1e-7);
  }
  fail(reason: string): void { this.reason = reason; this.needsRestart = true; }
  refresh(a: BodyState): void {
    const actual = this.bodyB(a);
    this.B.mass = actual.mass; this.B.radius = actual.radius; this.B.inertia = actual.inertia;
  }
  reset(a: BodyState, arena: Arena): BodyState | undefined {
    this.referenceMass = a.mass / 2;
    const b = this.bodyB(a), coupling = createCoupling(this.config());
    const separation = a.radius + b.radius + coupling.restLength;
    // Ищем состав только в локальной стартовой области; генератор и карта не меняются.
    const startY = Math.min(arena.spawnPoint.y, arena.height / 2 - separation - b.radius);
    for (let offsetY = 0; offsetY <= 300; offsetY += 10) {
      for (const offsetX of [0, -40, 40, -80, 80, -120, 120]) {
        const candidate = clone(a);
        candidate.position = { x: arena.spawnPoint.x + offsetX, y: startY - offsetY };
        b.position = { x: candidate.position.x, y: candidate.position.y + separation };
        if (!this.free(candidate, arena) || !this.free(b, arena)) continue;
        this.B = clone(b); this.coupling = coupling;
        this.reason = undefined; this.needsRestart = false;
        this.diagnostics = { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false };
        this.updateGeometry(candidate);
        return candidate;
      }
    }
    this.fail('Невозможный старт состава: измените размеры и нажмите Restart');
    return undefined;
  }
  validGeometry(a: BodyState, arena: Arena): boolean {
    if (!this.free(a, arena) || !this.free(this.B, arena)
      || Math.hypot(a.position.x - this.B.position.x, a.position.y - this.B.position.y) < a.radius + this.B.radius - 1e-7) return false;
    if (!this.coupling.connected) return true;
    const d = couplingGeometry(a, this.B, this.coupling).distance, c = this.coupling;
    return c.type === 'rod' ? Math.abs(d - c.restLength) <= 0.01 * c.restLength
      : c.type === 'rope' ? d <= c.restLength + 1e-6 : d >= c.minLength - 1e-6 && d <= c.maxLength + 1e-6;
  }
  update(key: string, value: number | boolean | string, a: BodyState, arena: Arena): boolean {
    const valid = key === 'tow.type' ? ['rod', 'rope', 'spring'].includes(String(value)) && typeof value === 'string'
      : key in ranges && typeof value === 'number' && Number.isFinite(value) && value >= ranges[key][0] && value <= ranges[key][1];
    if (!valid) return false;
    this.params[key] = value as number | string;
    const previous = this.coupling;
    this.coupling = createCoupling(this.config());
    this.coupling.connected = previous.connected;
    if (key !== 'tow.length' && key !== 'tow.type') {
      // Независимые настройки массы/пружины сохраняют фактическую длину захвата.
      this.coupling.restLength = previous.restLength;
      this.coupling.minLength = previous.minLength;
      this.coupling.maxLength = previous.maxLength;
    }
    this.refresh(a); this.updateGeometry(a);
    if (!this.validGeometry(a, arena)) this.fail('Геометрия состава несовместима с настройками: нужен Restart');
    return true;
  }
  updateGeometry(a: BodyState): void {
    const g = couplingGeometry(a, this.B, this.coupling);
    this.coupling.length = g.distance; this.coupling.lastNormal = g.normal;
  }
  setConnection(connected: boolean, a: BodyState): CaptureResult {
    const g = couplingGeometry(a, this.B, this.coupling);
    const result: CaptureResult = { ok: true, distance: g.distance, relativeSpeed: g.relativeSpeed };
    if (connected && !this.coupling.connected) {
      if (this.needsRestart) result.reason = this.reason;
      else if (g.distance < 2 || g.distance > 12) result.reason = 'Захват: расстояние креплений должно быть 2–12 м';
      else if (g.relativeSpeed > 2) result.reason = 'Захват: скорость креплений должна быть ≤2 м/с';
      if (result.reason) { this.reason = result.reason; return { ...result, ok: false }; }
      this.coupling.restLength = g.distance;
      this.coupling.minLength = g.distance * defaults.springMinRatio;
      this.coupling.maxLength = g.distance * defaults.springMaxRatio;
    }
    this.coupling.connected = connected; this.coupling.accumulatedImpulse = 0;
    if (!this.needsRestart) this.reason = undefined;
    this.updateGeometry(a);
    return result;
  }
  advance(a: BodyState, arena: Arena, dt: number, restitution: number, passageRestitution: number,
    applyVelocity: ApplyVelocity): AdvanceResult {
    this.refresh(a);
    const result = advancePair(a, this.B, this.coupling, dt, this.config(restitution),
      arena.obstacles.flatMap((o, index) => o.alive === false ? [] : [{ id: `arena:${index}`,
        position: { x: o.x, y: o.y }, radius: o.radius, restitution: o.type === 'passage' ? passageRestitution : restitution }]),
      { minX: -arena.width / 2, maxX: arena.width / 2, minY: -arena.height / 2, maxY: arena.height / 2 }, applyVelocity);
    this.diagnostics = result.diagnostics;
    if (result.stopReason) this.fail(result.stopReason);
    else { this.B = result.B; this.coupling = result.coupling; }
    return result;
  }
  snapshot(a: BodyState, paused: boolean): TowingSnapshot {
    const g = couplingGeometry(a, this.B, this.coupling);
    return { B: clone(this.B), coupling: { ...this.coupling, lastNormal: { ...this.coupling.lastNormal } },
      distance: g.distance, relativeSpeed: g.relativeSpeed, paused, reason: this.reason,
      needsRestart: this.needsRestart, diagnostics: { ...this.diagnostics } };
  }
}
