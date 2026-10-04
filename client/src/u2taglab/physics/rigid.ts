import type { Arena } from '@bonk-race/shared';
import type { BodyState, CouplingState, Vec2 } from '../../tuglab/types';
import { cross, dot, isValidBody } from '../../tuglab/physics/body';
import { circleSweep } from '../../tuglab/physics/contacts';

export const cloneRigidBody = (b: BodyState): BodyState => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } });
export interface RigidAssembly {
  position: Vec2; velocity: Vec2; angle: number; angularVelocity: number; mass: number; inertia: number;
  offsetA: number; offsetB: number; relativeAngle: number;
}
export function rigidAssembly(a: BodyState, b: BodyState, c: CouplingState): RigidAssembly {
  const mass = a.mass + b.mass, separation = a.radius + b.radius, sign = c.attachmentA === 'nose' ? 1 : -1;
  const offsetA = -sign * separation * b.mass / mass, offsetB = sign * separation * a.mass / mass;
  return { position: { x: (a.mass * a.position.x + b.mass * b.position.x) / mass,
    y: (a.mass * a.position.y + b.mass * b.position.y) / mass },
    velocity: { x: (a.mass * a.velocity.x + b.mass * b.velocity.x) / mass,
      y: (a.mass * a.velocity.y + b.mass * b.velocity.y) / mass }, angle: a.angle, angularVelocity: a.angularVelocity,
    mass, inertia: a.inertia + b.inertia + a.mass * offsetA ** 2 + b.mass * offsetB ** 2,
    offsetA, offsetB, relativeAngle: c.attachmentA === c.attachmentB ? Math.PI : 0 };
}
export function rigidPose(r: RigidAssembly, offset: number, time = 0): { position: Vec2; velocity: Vec2; arm: Vec2 } {
  const angle = r.angle + r.angularVelocity * time, arm = { x: offset * Math.cos(angle), y: offset * Math.sin(angle) };
  return { arm, position: { x: r.position.x + r.velocity.x * time + arm.x, y: r.position.y + r.velocity.y * time + arm.y },
    velocity: { x: r.velocity.x - r.angularVelocity * arm.y, y: r.velocity.y + r.angularVelocity * arm.x } };
}
export function syncRigid(r: RigidAssembly, a: BodyState, b: BodyState): void {
  for (const [body, offset, angle] of [[a, r.offsetA, r.angle], [b, r.offsetB, r.angle + r.relativeAngle]] as const) {
    const pose = rigidPose(r, offset); body.position = pose.position; body.velocity = pose.velocity;
    body.angle = angle; body.angularVelocity = r.angularVelocity;
  }
}
export function driftRigid(r: RigidAssembly, dt: number, a: BodyState, b: BodyState): void {
  r.position.x += r.velocity.x * dt; r.position.y += r.velocity.y * dt; r.angle += r.angularVelocity * dt;
  syncRigid(r, a, b);
}
export function validRigidGeometry(a: BodyState, b: BodyState, c: CouplingState, epsilon: number): boolean {
  const r = rigidAssembly(a, b, c), pa = rigidPose(r, r.offsetA), pb = rigidPose(r, r.offsetB);
  return [a, b].every(isValidBody) && [
    a.position.x - pa.position.x, a.position.y - pa.position.y, b.position.x - pb.position.x, b.position.y - pb.position.y,
    a.velocity.x - pa.velocity.x, a.velocity.y - pa.velocity.y, b.velocity.x - pb.velocity.x, b.velocity.y - pb.velocity.y,
    b.angularVelocity - a.angularVelocity, Math.sin(b.angle - a.angle - r.relativeAngle),
    1 - Math.cos(b.angle - a.angle - r.relativeAngle),
  ].every(value => Math.abs(value) <= epsilon);
}
// Круги не меняют занятую область при выравнивании курса: достаточно непрерывно проверить центры.
export function captureRigid(a: BodyState, b: BodyState, c: CouplingState, arena: Arena):
  { A: BodyState; B: BodyState } | { reason: string } {
  if (![a, b].every(isValidBody)) return { reason: 'Захват: недопустимые корпуса' };
  const A = cloneRigidBody(a), B = cloneRigidBody(b), r = rigidAssembly(a, b, c), epsilon = 1e-7;
  const angular = [a, b].reduce((total, body) => {
    const arm = { x: body.position.x - r.position.x, y: body.position.y - r.position.y };
    const relative = { x: body.velocity.x - r.velocity.x, y: body.velocity.y - r.velocity.y };
    return total + body.inertia * body.angularVelocity + body.mass * cross(arm, relative);
  }, 0);
  const internalEnergy = [a, b].reduce((total, body) => total + 0.5 * body.mass
    * ((body.velocity.x - r.velocity.x) ** 2 + (body.velocity.y - r.velocity.y) ** 2)
    + 0.5 * body.inertia * body.angularVelocity ** 2, 0);
  r.angularVelocity = angular / r.inertia;
  if (0.5 * r.inertia * r.angularVelocity ** 2 > internalEnergy + Math.max(1, internalEnergy) * 1e-12) {
    return { reason: 'Снизьте вращение или скорость сближения перед жёсткой сцепкой' };
  }
  syncRigid(r, A, B);
  for (const [before, after] of [[a, A], [b, B]] as const) {
    if (Math.abs(before.position.x) + before.radius > arena.width / 2 + epsilon
      || Math.abs(before.position.y) + before.radius > arena.height / 2 + epsilon
      || Math.abs(after.position.x) + after.radius > arena.width / 2 + epsilon
      || Math.abs(after.position.y) + after.radius > arena.height / 2 + epsilon) return { reason: 'Захват: путь корпуса пересекает границу мира' };
    const swept = { ...before, velocity: { x: after.position.x - before.position.x, y: after.position.y - before.position.y } };
    if (arena.obstacles.some(o => o.alive !== false && !!circleSweep(swept, { x: o.x, y: o.y }, { x: 0, y: 0 }, o.radius, 1, epsilon))) {
      return { reason: 'Захват: путь корпуса пересекает препятствие' };
    }
  }
  const start = { x: b.position.x - a.position.x, y: b.position.y - a.position.y };
  const delta = { x: B.position.x - A.position.x - start.x, y: B.position.y - A.position.y - start.y };
  const squared = dot(delta, delta), t = squared > 0 ? Math.max(0, Math.min(1, -dot(start, delta) / squared)) : 0;
  if (Math.hypot(start.x + t * delta.x, start.y + t * delta.y) < a.radius + b.radius - epsilon) {
    return { reason: 'Захват: корпуса пересекаются на пути стыковки' };
  }
  return { A, B };
}
