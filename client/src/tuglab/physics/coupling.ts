import defaults from '../config/tuglab_defaults.json';
import type { Attachment, BodyState, CouplingState, TugConfig, Vec2 } from '../types';
import { applyImpulse, cross, dot } from './body';
// Накопители принадлежат одной пробе при неизменных положениях креплений.
export interface CouplingImpulses { pull: number; push: number }
export interface AttachmentState { arm: Vec2; position: Vec2; velocity: Vec2 }
export interface CouplingGeometry {
  a: AttachmentState; b: AttachmentState; distance: number; normal: Vec2;
  radialVelocity: number; relativeSpeed: number; inverseMass: number;
}
export function createCoupling(config: TugConfig): CouplingState {
  return { type: config.couplingType, connected: true, attachmentA: config.attachmentA, attachmentB: config.attachmentB,
    length: config.length, restLength: config.length, minLength: config.length * config.springMinRatio,
    maxLength: config.length * config.springMaxRatio, k: config.springStiffness,
    c: 2 * config.springDamping * Math.sqrt(config.springStiffness * config.springReferenceMass),
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
// Ограничиваем поворот плеч и их относительное перемещение, не скорость физических тел.
export function rodStepLimit(a: BodyState, b: BodyState, coupling: CouplingState, config: TugConfig): number {
  if (!coupling.connected || coupling.type !== 'rod') return Infinity;
  const relativeSpeedBound = Math.hypot(b.velocity.x - a.velocity.x, b.velocity.y - a.velocity.y)
    + Math.abs(a.angularVelocity) * a.radius + Math.abs(b.angularVelocity) * b.radius;
  const sweepRate = Math.max(relativeSpeedBound / coupling.restLength,
    Math.abs(a.angularVelocity), Math.abs(b.angularVelocity));
  return sweepRate > 0 ? config.rodMaxSweep / sweepRate : Infinity;
}
export function solveRod(a: BodyState, b: BodyState, coupling: CouplingState, dt: number, config: TugConfig): number {
  if (!coupling.connected || coupling.type !== 'rod') return 0;
  return solveDistance(a, b, coupling, dt, config, coupling.restLength);
}
function solveDistance(a: BodyState, b: BodyState, coupling: CouplingState, dt: number, config: TugConfig,
  target: number, direction: 'both' | 'pull' | 'push' = 'both', impulses?: CouplingImpulses): number {
  const geometry = couplingGeometry(a, b, coupling);
  coupling.lastNormal = geometry.normal;
  // Импульс прикладывается по текущей геометрии: так сохраняется полный угловой импульс.
  // Предсказываем именно конечные крепления, включая поворот плеч за подшаг.
  const predict = (body: BodyState, attachment: Attachment): AttachmentState => attachmentState({
    ...body, position: { x: body.position.x + body.velocity.x * dt, y: body.position.y + body.velocity.y * dt },
    angle: body.angle + body.angularVelocity * dt,
  }, attachment);
  const endA = predict(a, coupling.attachmentA), endB = predict(b, coupling.attachmentB);
  const dx = endB.position.x - endA.position.x, dy = endB.position.y - endA.position.y;
  const endDistance = Math.hypot(dx, dy);
  if (endDistance < config.normalEpsilon) return 0;
  const endNormal = { x: dx / endDistance, y: dy / endDistance };
  const spinA = cross(geometry.a.arm, geometry.normal) / a.inertia;
  const spinB = cross(geometry.b.arm, geometry.normal) / b.inertia;
  const inverseLinearMass = 1 / a.mass + 1 / b.mass;
  const derivative = dt * dot(endNormal, {
    x: -geometry.normal.x * inverseLinearMass + spinA * endA.arm.y + spinB * endB.arm.y,
    y: -geometry.normal.y * inverseLinearMass - spinA * endA.arm.x - spinB * endB.arm.x,
  });
  // При слишком большом интервале локальная ветвь решения теряется; вызывающий код дробит шаг.
  if (!(derivative < 0)) return 0;
  const bias = Math.max(-config.maxPositionBias, Math.min(config.maxPositionBias,
    (geometry.distance - target) / dt));
  const targetDistance = direction === 'both' ? geometry.distance - bias * dt : target;
  let impulse = -(endDistance - targetDistance) / derivative;
  if (direction !== 'both') {
    const previous = impulses?.[direction] ?? 0;
    const total = direction === 'pull' ? Math.max(0, previous + impulse) : Math.min(0, previous + impulse);
    impulse = total - previous;
    if (impulses) impulses[direction] = total;
  }
  applyCouplingImpulse(a, b, geometry, impulse);
  coupling.accumulatedImpulse += impulse;
  return impulse;
}

// Сила пружины применяется один раз за подшаг, отдельно от итераций жёстких ограничений.
export function applySpring(a: BodyState, b: BodyState, coupling: CouplingState, dt: number): number {
  if (!coupling.connected || coupling.type !== 'spring') return 0;
  const geometry = couplingGeometry(a, b, coupling);
  const impulse = (coupling.k * (geometry.distance - coupling.restLength) + coupling.c * geometry.radialVelocity) * dt;
  applyCouplingImpulse(a, b, geometry, impulse);
  coupling.accumulatedImpulse += impulse;
  return impulse;
}
export function solveCoupling(a: BodyState, b: BodyState, coupling: CouplingState, dt: number, config: TugConfig,
  impulses: CouplingImpulses = { pull: 0, push: 0 }): void {
  if (!coupling.connected) return;
  if (coupling.type === 'rod') { solveRod(a, b, coupling, dt, config); return; }
  if (coupling.type === 'rope') {
    solveDistance(a, b, coupling, dt, config, coupling.restLength, 'pull', impulses);
  } else {
    solveDistance(a, b, coupling, dt, config, coupling.maxLength, 'pull', impulses);
    if (coupling.minLength > 0) solveDistance(a, b, coupling, dt, config, coupling.minLength, 'push', impulses);
  }
}
