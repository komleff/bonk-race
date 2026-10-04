import type { Arena } from '@bonk-race/shared';
import type { AdvanceResult, ApplyVelocity, BodyState, CaptureResult, CouplingState, Diagnostics, TugConfig } from './types';
import defaults from './config/tuglab_defaults.json';
import { captureRigid, validRigidGeometry } from '../u2taglab/physics/rigid';
import { createCoupling, couplingGeometry } from './physics/coupling';
import { advancePair } from './physics/advance';
import { isValidBody } from './physics/body';

export const TOW_DEFAULTS: Record<string, number | string> = {
  'tow.massRatio': 1, 'tow.radiusB': 20, 'tow.length': 8, 'tow.type': 'spring',
  'tow.stiffness': 1250, 'tow.dampingRatio': 0.5,
};
const ranges: Record<string, readonly [number, number]> = {
  'tow.massRatio': [0.1, 10], 'tow.radiusB': [2, 60], 'tow.length': [4, 100],
  'tow.stiffness': [0, 10000], 'tow.dampingRatio': [0, 1.5],
};
const clone = (b: BodyState): BodyState => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } });
export interface TowingProfile {
  defaults: Record<string, number | string>; ranges: Record<string, readonly [number, number]>;
  inertiaB: (mass: number) => number; reducedMass?: boolean;
  springModules?: Readonly<Record<string, { k: number; c: number }>>;
  ropeMinLength: number; captureMinLength: number; clearCoupling?: boolean;
  spawnSearch?: { depth: number; step: number; lateral: number }; maxValidatedSpeed?: number; rigidEnabled?: boolean;
}
export interface TowingSnapshot {
  B: BodyState; coupling: CouplingState; distance: number; relativeSpeed: number;
  paused: boolean; reason?: string; needsRestart: boolean; diagnostics: Diagnostics;
}

// Владеет только прицепом и сцепкой: постоянной копии ведущего тела здесь нет.
export class LabTowing {
  readonly params: Record<string, number | string>;
  B: BodyState;
  coupling: CouplingState;
  reason?: string;
  needsRestart = false;
  diagnostics: Diagnostics = { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false };
  private referenceMass: number;

  constructor(a: BodyState, private readonly profile?: TowingProfile) {
    this.params = { ...(profile?.defaults ?? TOW_DEFAULTS) };
    this.referenceMass = this.reducedMass(a);
    this.B = this.bodyB(a);
    this.coupling = createCoupling(this.physicsConfig());
  }
  private bodyB(a: BodyState): BodyState {
    const mass = a.mass * Number(this.params['tow.massRatio']), radius = Number(this.params['tow.radiusB']);
    return { position: { ...a.position }, velocity: { x: 0, y: 0 }, angle: a.angle, angularVelocity: 0,
      mass, radius, inertia: this.profile ? this.profile.inertiaB(mass) : 0.5 * mass * radius * radius };
  }
  physicsConfig(restitution = 0.8): TugConfig {
    return { ...(defaults as TugConfig), couplingType: this.params['tow.type'] as TugConfig['couplingType'],
      length: Number(this.params['tow.length']), springStiffness: Number(this.params['tow.stiffness']),
      springDamping: Number(this.params['tow.dampingRatio']), springReferenceMass: this.referenceMass, restitution,
      ...(this.params['tow.dampingMode'] === 'fixed' ? { springDampingCoefficient: Number(this.params['tow.dampingCoefficient']) } : {}),
      maxValidatedSpeed: this.profile?.maxValidatedSpeed ?? defaults.maxValidatedSpeed };
  }
  private free(b: BodyState, arena: Arena): boolean {
    return isValidBody(b) && Math.abs(b.position.x) + b.radius <= arena.width / 2 + 1e-7
      && Math.abs(b.position.y) + b.radius <= arena.height / 2 + 1e-7
      && arena.obstacles.every(o => o.alive === false || Math.hypot(b.position.x - o.x, b.position.y - o.y) >= b.radius + o.radius - 1e-7);
  }
  private reducedMass(a: BodyState): number {
    const massB = a.mass * Number(this.params['tow.massRatio']);
    return this.profile?.reducedMass ? a.mass * massB / (a.mass + massB) : a.mass / 2;
  }
  private clearLine(a: BodyState, b: BodyState, coupling: CouplingState, arena: Arena): boolean {
    if (!this.profile?.clearCoupling || !coupling.connected) return true;
    const g = couplingGeometry(a, b, coupling), start = g.a.position, end = g.b.position;
    const dx = end.x - start.x, dy = end.y - start.y, squared = dx * dx + dy * dy;
    return arena.obstacles.every(o => {
      if (o.alive === false) return true;
      const t = Math.max(0, Math.min(1, ((o.x - start.x) * dx + (o.y - start.y) * dy) / Math.max(squared, 1e-12)));
      return Math.hypot(o.x - start.x - t * dx, o.y - start.y - t * dy) >= o.radius + 1;
    });
  }
  fail(reason: string): void { this.reason = reason; this.needsRestart = true; }
  refresh(a: BodyState): void {
    const actual = this.bodyB(a);
    this.B.mass = actual.mass; this.B.radius = actual.radius; this.B.inertia = actual.inertia;
    if (this.profile?.reducedMass) {
      this.referenceMass = this.reducedMass(a);
      this.coupling.c = this.params['tow.dampingMode'] === 'fixed' ? Number(this.params['tow.dampingCoefficient'])
        : 2 * Number(this.params['tow.dampingRatio']) * Math.sqrt(this.coupling.k * this.referenceMass);
    }
  }
  reset(a: BodyState, arena: Arena): BodyState | undefined {
    this.referenceMass = this.reducedMass(a);
    const b = this.bodyB(a), coupling = createCoupling(this.physicsConfig());
    if (coupling.type === 'rigid') {
      coupling.restLength = coupling.length = coupling.minLength = coupling.maxLength = 0;
      coupling.attachmentA = this.params['tow.rigidArrangement'] === 'rear' ? 'nose' : 'tail';
      coupling.attachmentB = coupling.attachmentA === 'nose' ? 'tail' : 'nose';
    }
    const separation = a.radius + b.radius + coupling.restLength;
    // Ищем состав только в локальной стартовой области; генератор и карта не меняются.
    const startY = Math.min(arena.spawnPoint.y, arena.height / 2 - separation - b.radius);
    const search = this.profile?.spawnSearch;
    const offsets = search ? [0, ...Array.from({ length: Math.floor(search.lateral / search.step) }, (_, i) => [(i + 1) * -search.step, (i + 1) * search.step]).flat()]
      : [0, -40, 40, -80, 80, -120, 120];
    for (let offsetY = 0; offsetY <= (search?.depth ?? 300); offsetY += search?.step ?? 10) {
      for (const offsetX of offsets) {
        const candidate = clone(a);
        candidate.position = { x: arena.spawnPoint.x + offsetX, y: startY - offsetY };
        const direction = coupling.type === 'rigid' && this.params['tow.rigidArrangement'] === 'rear' ? -1 : 1;
        b.position = coupling.type === 'rigid' ? { x: candidate.position.x - direction * separation * Math.cos(candidate.angle),
          y: candidate.position.y - direction * separation * Math.sin(candidate.angle) }
          : { x: candidate.position.x, y: candidate.position.y + separation };
        if (!this.free(candidate, arena) || !this.free(b, arena) || !this.clearLine(candidate, b, coupling, arena)) continue;
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
    return c.type === 'rigid' ? validRigidGeometry(a, this.B, c, 1e-7) : c.type === 'rod' ? Math.abs(d - c.restLength) <= 0.01 * c.restLength
      : c.type === 'rope' ? d <= c.restLength + 1e-6 : d >= c.minLength - 1e-6 && d <= c.maxLength + 1e-6;
  }
  update(key: string, value: number | boolean | string, a: BodyState, arena: Arena): boolean {
    if (key === 'tow.module' && this.profile?.springModules) {
      if (typeof value !== 'string' || (value !== 'custom' && !Object.hasOwn(this.profile.springModules, value))) return false;
      this.params[key] = value;
      if (value !== 'custom') {
        const module = this.profile.springModules[value];
        this.params['tow.stiffness'] = this.coupling.k = module.k;
        this.params['tow.dampingCoefficient'] = this.coupling.c = module.c;
        this.params['tow.dampingMode'] = 'fixed';
      }
      // Модуль меняет только коэффициенты, не трогая захват, накопленный импульс и состояние тел.
      return true;
    }
    const ownRanges = this.profile?.ranges ?? ranges;
    const valid = key === 'tow.rigidArrangement' && this.profile?.rigidEnabled ? typeof value === 'string' && ['front', 'rear'].includes(value)
      : key === 'tow.dampingMode' && this.profile?.springModules ? ['fixed', 'legacy'].includes(String(value)) && typeof value === 'string'
      : key === 'tow.type' ? ['rod', 'rope', 'spring', ...(this.profile?.rigidEnabled ? ['rigid'] : [])].includes(String(value)) && typeof value === 'string'
      : key in ownRanges && typeof value === 'number' && Number.isFinite(value) && value >= ownRanges[key][0] && value <= ownRanges[key][1];
    const type = key === 'tow.type' ? value : this.params['tow.type'];
    const length = key === 'tow.length' ? Number(value) : Number(this.params['tow.length']);
    if (!valid || (type === 'rope' && length < (this.profile?.ropeMinLength ?? 0))) return false;
    this.params[key] = value as number | string;
    if (this.profile?.springModules && ['tow.stiffness', 'tow.dampingCoefficient', 'tow.dampingRatio', 'tow.dampingMode'].includes(key)) this.params['tow.module'] = 'custom';
    if (this.profile?.reducedMass) this.referenceMass = this.reducedMass(a);
    const previous = this.coupling;
    this.coupling = createCoupling(this.physicsConfig());
    this.coupling.connected = previous.connected;
    if (this.coupling.type === 'rigid') this.coupling.restLength = this.coupling.length = this.coupling.minLength = this.coupling.maxLength = 0;
    if (key !== 'tow.length' && key !== 'tow.type' && key !== 'tow.rigidArrangement') {
      // Независимые настройки массы/пружины сохраняют фактическую длину захвата.
      this.coupling.attachmentA = previous.attachmentA;
      this.coupling.attachmentB = previous.attachmentB;
      this.coupling.restLength = previous.type === 'rigid' ? 0 : previous.restLength;
      this.coupling.minLength = previous.minLength;
      this.coupling.maxLength = previous.maxLength;
    }
    this.refresh(a); this.updateGeometry(a);
    if ((key === 'tow.type' && (previous.type === 'rigid' || this.coupling.type === 'rigid'))
      || key === 'tow.rigidArrangement' || (this.coupling.type === 'rigid' && ['tow.radiusB', 'tow.massRatio'].includes(key))) {
      this.fail('Настройки жёсткого состава изменены: нужен Restart');
    }
    if (!this.validGeometry(a, arena)) this.fail('Геометрия состава несовместима с настройками: нужен Restart');
    return true;
  }
  updateGeometry(a: BodyState): void {
    const g = couplingGeometry(a, this.B, this.coupling);
    this.coupling.length = g.distance; this.coupling.lastNormal = g.normal;
  }
  setConnection(connected: boolean, a: BodyState, captureMaxSpeed: number, arena?: Arena): CaptureResult {
    let candidate = { ...this.coupling };
    let g = couplingGeometry(a, this.B, candidate);
    if (connected && !this.coupling.connected) {
      // При равенстве сохраняем порядок: нос/нос, нос/хвост, хвост/нос, хвост/хвост.
      let best: typeof g | undefined;
      for (const attachmentA of ['nose', 'tail'] as const) {
        for (const attachmentB of ['nose', 'tail'] as const) {
          const pair = { ...this.coupling, attachmentA, attachmentB };
          const geometry = couplingGeometry(a, this.B, pair);
          if (!best || geometry.distance < best.distance - 1e-9) {
            best = geometry; candidate = pair;
          }
        }
      }
      g = best!;
      const rigid = candidate.type === 'rigid';
      const maxLength = rigid ? a.radius * 2 : Number(this.params['tow.length']);
      const reason = this.needsRestart ? this.reason
        : g.distance < (rigid ? 0 : this.profile?.captureMinLength ?? 2) || g.distance > maxLength ? rigid ? `Захват: ближайшие крепления должны быть не дальше диаметра A (${maxLength.toFixed(2)} м)` : `Захват: расстояние креплений должно быть 2–${maxLength} м`
          : !Number.isFinite(captureMaxSpeed) || captureMaxSpeed <= 0 ? 'Захват: недопустимые линейные лимиты скорости'
            : g.relativeSpeed > captureMaxSpeed ? `Захват: скорость креплений должна быть ≤${captureMaxSpeed} м/с` : undefined;
      if (reason) {
        this.reason = reason;
        return { ok: false, reason, distance: g.distance, relativeSpeed: g.relativeSpeed };
      }
      if (rigid) {
        const snap = arena ? captureRigid(a, this.B, candidate, arena) : { reason: 'Захват: мир не задан' };
        if ('reason' in snap) {
          this.reason = snap.reason;
          return { ok: false, reason: snap.reason, distance: g.distance, relativeSpeed: g.relativeSpeed };
        }
        Object.assign(a, snap.A); this.B = snap.B;
      }
      candidate.restLength = rigid ? 0 : g.distance;
      candidate.minLength = candidate.restLength * defaults.springMinRatio;
      candidate.maxLength = candidate.restLength * defaults.springMaxRatio;
    }
    candidate.connected = connected; candidate.accumulatedImpulse = 0;
    this.coupling = candidate;
    if (!this.needsRestart) this.reason = undefined;
    this.updateGeometry(a);
    return { ok: true, distance: g.distance, relativeSpeed: g.relativeSpeed };
  }
  advance(a: BodyState, arena: Arena, dt: number, restitution: number, passageRestitution: number,
    applyVelocity: ApplyVelocity): AdvanceResult {
    this.refresh(a);
    const result = advancePair(a, this.B, this.coupling, dt, this.physicsConfig(restitution),
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
