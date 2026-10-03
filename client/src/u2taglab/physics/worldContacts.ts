import type { BodyState, Bounds, CircleObstacle, TugConfig, Vec2 } from '../../tuglab/types';
import { dot } from '../../tuglab/physics/body';
import { circleSweep } from '../../tuglab/physics/contacts';

export interface NamedBody { id: string; body: BodyState }
export interface WorldContact {
  time: number; body: string; other: string; normal: Vec2; penetration: number; restitution: number;
}
export interface WorldContactEvent { body: string; other: string; normal: Vec2; impulse: number }

// Порядок ID задаёт воспроизводимый выбор при одновременных контактах.
export function firstWorldContact(bodies: readonly NamedBody[], statics: readonly CircleObstacle[], bounds: Bounds,
  dt: number, config: TugConfig): WorldContact | undefined {
  let first: WorldContact | undefined;
  const accept = (hit: WorldContact): void => { if (!first || hit.time < first.time) first = hit; };
  for (let i = 0; i < bodies.length; i++) {
    const { id, body } = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const other = bodies[j];
      const hit = circleSweep(body, other.body.position, other.body.velocity, other.body.radius, dt, config.normalEpsilon);
      if (hit) accept({ ...hit, body: id, other: other.id, restitution: config.restitution });
    }
    for (const other of statics) {
      const hit = circleSweep(body, other.position, { x: 0, y: 0 }, other.radius, dt, config.normalEpsilon);
      if (hit) accept({ ...hit, body: id, other: other.id, restitution: other.restitution ?? config.restitution });
    }
    const walls = [
      { other: 'bounds:minX', gap: body.position.x - body.radius - bounds.minX, normal: { x: 1, y: 0 } },
      { other: 'bounds:maxX', gap: bounds.maxX - body.position.x - body.radius, normal: { x: -1, y: 0 } },
      { other: 'bounds:minY', gap: body.position.y - body.radius - bounds.minY, normal: { x: 0, y: 1 } },
      { other: 'bounds:maxY', gap: bounds.maxY - body.position.y - body.radius, normal: { x: 0, y: -1 } },
    ];
    for (const wall of walls) {
      const rate = dot(body.velocity, wall.normal);
      const time = wall.gap < -config.normalEpsilon ? 0 : rate < -config.normalEpsilon ? Math.max(0, -wall.gap / rate) : Infinity;
      if (time <= dt) accept({ ...wall, time, body: id, penetration: Math.max(0, -wall.gap), restitution: config.restitution });
    }
  }
  return first;
}
export function resolveWorldContact(bodies: readonly NamedBody[], hit: WorldContact): WorldContactEvent {
  const body = bodies.find(b => b.id === hit.body)!.body, other = bodies.find(b => b.id === hit.other)?.body;
  const inverseMass = 1 / body.mass + (other ? 1 / other.mass : 0);
  const relative = { x: body.velocity.x - (other?.velocity.x ?? 0), y: body.velocity.y - (other?.velocity.y ?? 0) };
  // Нормаль проходит через COM: контакты кругов без трения не меняют omega.
  const impulse = Math.max(0, -(1 + hit.restitution) * dot(relative, hit.normal) / inverseMass);
  for (const [target, sign] of [[body, 1], [other, -1]] as const) {
    if (!target) continue;
    target.velocity.x += sign * hit.normal.x * impulse / target.mass;
    target.velocity.y += sign * hit.normal.y * impulse / target.mass;
    target.position.x += sign * hit.normal.x * hit.penetration / (inverseMass * target.mass);
    target.position.y += sign * hit.normal.y * hit.penetration / (inverseMass * target.mass);
  }
  return { body: hit.body, other: hit.other, impulse, normal: { ...hit.normal } };
}
export function worldHasPenetration(bodies: readonly NamedBody[], statics: readonly CircleObstacle[], bounds: Bounds,
  epsilon: number): boolean {
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i].body;
    if (body.position.x < bounds.minX + body.radius - epsilon || body.position.x > bounds.maxX - body.radius + epsilon
      || body.position.y < bounds.minY + body.radius - epsilon || body.position.y > bounds.maxY - body.radius + epsilon) return true;
    if (statics.some(o => Math.hypot(body.position.x - o.position.x, body.position.y - o.position.y) < body.radius + o.radius - epsilon)) return true;
    if (bodies.slice(i + 1).some(o => Math.hypot(body.position.x - o.body.position.x, body.position.y - o.body.position.y)
      < body.radius + o.body.radius - epsilon)) return true;
  }
  return false;
}
