import defaults from '../config/tuglab_defaults.json';
import type { Attachment, BodyState, CouplingState, TugConfig, Vec2 } from '../types';
import { applyImpulse, cross, dot } from './body';
export interface AttachmentState { arm: Vec2; position: Vec2; velocity: Vec2 }
export interface CouplingGeometry {
  a: AttachmentState; b: AttachmentState; distance: number; normal: Vec2;
  radialVelocity: number; relativeSpeed: number; inverseMass: number;
}
export function createCoupling(config: TugConfig): CouplingState {
  const frequency = 2 * Math.PI * config.springFrequency;
  return { type: config.couplingType, connected: true, attachmentA: config.attachmentA, attachmentB: config.attachmentB,
    length: config.length, restLength: config.length, minLength: config.length * config.springMinRatio,
    maxLength: config.length * config.springMaxRatio, k: config.springReferenceMass * frequency * frequency,
    c: 2 * config.springDamping * config.springReferenceMass * frequency,
    lastNormal: { x: -1, y: 0 }, accumulatedImpulse: 0 };
}
export function attachmentState(body: BodyState, attachment: Attachment): AttachmentState {
  const radius = attachment === 'nose' ? body.radius : -body.radius;
  const arm = { x: radius * Math.cos(body.angle), y: radius * Math.sin(body.angle) };
  return { arm, position: { x: body.position.x + arm.x, y: body.position.y + arm.y },
    velocity: { x: body.velocity.x - body.angularVelocity * arm.y,
      y: body.velocity.y + body.angularVelocity * arm.x } };
}
export function couplingGeometry(aBody: BodyState, bBody: BodyState,
  coupling: Pick<CouplingState, 'attachmentA' | 'attachmentB' | 'lastNormal'>): CouplingGeometry {
  const a = attachmentState(aBody, coupling.attachmentA), b = attachmentState(bBody, coupling.attachmentB);
  const dx = b.position.x - a.position.x, dy = b.position.y - a.position.y;
  const distance = Math.hypot(dx, dy);
  const fallbackLength = Math.hypot(coupling.lastNormal?.x ?? 0, coupling.lastNormal?.y ?? 0);
  const normal = distance >= defaults.normalEpsilon ? { x: dx / distance, y: dy / distance }
    : fallbackLength > 0 ? { x: coupling.lastNormal.x / fallbackLength, y: coupling.lastNormal.y / fallbackLength }
      : { x: 1, y: 0 };
  const relative = { x: b.velocity.x - a.velocity.x, y: b.velocity.y - a.velocity.y };
  return { a, b, distance, normal, radialVelocity: dot(relative, normal), relativeSpeed: Math.hypot(relative.x, relative.y),
    inverseMass: 1 / aBody.mass + 1 / bBody.mass + cross(a.arm, normal) ** 2 / aBody.inertia
      + cross(b.arm, normal) ** 2 / bBody.inertia };
}
export function applyCouplingImpulse(a: BodyState, b: BodyState, geometry: CouplingGeometry, impulse: number): void {
  const vector = { x: geometry.normal.x * impulse, y: geometry.normal.y * impulse };
  applyImpulse(a, vector, geometry.a.arm);
  applyImpulse(b, { x: -vector.x, y: -vector.y }, geometry.b.arm);
}
export function solveRod(a: BodyState, b: BodyState, coupling: CouplingState, dt: number, config: TugConfig): number {
  if (!coupling.connected || coupling.type !== 'rod') return 0;
  const geometry = couplingGeometry(a, b, coupling);
  coupling.lastNormal = geometry.normal;
  // Исправляем дрейф ограниченной скоростью: перемещение центров напрямую изменило бы угловой импульс.
  const bias = Math.max(-config.maxPositionBias, Math.min(config.maxPositionBias,
    (geometry.distance - coupling.restLength) / dt));
  const impulse = (geometry.radialVelocity + bias) / geometry.inverseMass;
  applyCouplingImpulse(a, b, geometry, impulse);
  coupling.accumulatedImpulse += impulse;
  return impulse;
}
