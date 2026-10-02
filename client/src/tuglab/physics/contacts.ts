import type { BodyState, Bounds, CircleObstacle, ContactEvent, TugConfig, Vec2 } from '../types';
import { dot } from './body';

export interface SweptContact {
  time: number; body: 'A' | 'B'; other: string; normal: Vec2;
  penetration: number; restitution: number; pair: boolean;
}
function circleSweep(body: BodyState, position: Vec2, velocity: Vec2, radius: number,
  dt: number, epsilon: number): Pick<SweptContact, 'time' | 'normal' | 'penetration'> | undefined {
  const delta = { x: body.position.x - position.x, y: body.position.y - position.y };
  const relative = { x: body.velocity.x - velocity.x, y: body.velocity.y - velocity.y };
  const distance = Math.hypot(delta.x, delta.y), totalRadius = body.radius + radius;
  const speed = Math.hypot(relative.x, relative.y);
  const normal = distance > epsilon ? { x: delta.x / distance, y: delta.y / distance }
    : speed > epsilon ? { x: -relative.x / speed, y: -relative.y / speed } : { x: 1, y: 0 };
  if (distance < totalRadius - epsilon || (distance <= totalRadius + epsilon && dot(relative, normal) < -epsilon)) {
    return { time: 0, normal, penetration: Math.max(0, totalRadius - distance) };
  }
  if (distance <= totalRadius + epsilon && dot(relative, normal) >= -epsilon) return undefined;
  const b = dot(delta, relative), a = dot(relative, relative);
  if (b >= 0 || a === 0) return undefined;
  const c = dot(delta, delta) - totalRadius * totalRadius;
  const discriminant = b * b - a * c;
  if (discriminant <= 0) return undefined;
  // Устойчивая форма меньшего корня избегает вычитания близких больших чисел.
  const time = c / (-b + Math.sqrt(discriminant));
  if (time < 0 || time > dt) return undefined;
  const hit = { x: delta.x + relative.x * time, y: delta.y + relative.y * time };
  const length = Math.hypot(hit.x, hit.y);
  return { time, normal: { x: hit.x / length, y: hit.y / length }, penetration: 0 };
}
export function firstContact(a: BodyState, b: BodyState, obstacles: readonly CircleObstacle[], bounds: Bounds | undefined,
  dt: number, config: TugConfig): SweptContact | undefined {
  let first: SweptContact | undefined;
  const accept = (contact: SweptContact): void => { if (!first || contact.time < first.time) first = contact; };
  const pair = circleSweep(a, b.position, b.velocity, b.radius, dt, config.normalEpsilon);
  if (pair) accept({ ...pair, body: 'A', other: 'B', pair: true, restitution: config.restitution });
  for (const [id, body] of [['A', a], ['B', b]] as const) {
    for (const obstacle of obstacles) {
      const hit = circleSweep(body, obstacle.position, { x: 0, y: 0 }, obstacle.radius, dt, config.normalEpsilon);
      if (hit) accept({ ...hit, body: id, other: obstacle.id, pair: false,
        restitution: obstacle.restitution ?? config.restitution });
    }
    if (!bounds) continue;
    const walls = [
      { other: 'bounds:minX', gap: body.position.x - body.radius - bounds.minX, normal: { x: 1, y: 0 } },
      { other: 'bounds:maxX', gap: bounds.maxX - body.position.x - body.radius, normal: { x: -1, y: 0 } },
      { other: 'bounds:minY', gap: body.position.y - body.radius - bounds.minY, normal: { x: 0, y: 1 } },
      { other: 'bounds:maxY', gap: bounds.maxY - body.position.y - body.radius, normal: { x: 0, y: -1 } },
    ];
    for (const wall of walls) {
      const rate = dot(body.velocity, wall.normal);
      const time = wall.gap < -config.normalEpsilon ? 0 : rate < -config.normalEpsilon ? Math.max(0, -wall.gap / rate) : Infinity;
      if (time <= dt) accept({ time, body: id, other: wall.other, normal: wall.normal,
        penetration: Math.max(0, -wall.gap), pair: false, restitution: config.restitution });
    }
  }
  return first;
}
export function resolveContact(a: BodyState, b: BodyState, hit: SweptContact): ContactEvent {
  const body = hit.body === 'A' ? a : b;
  const other = hit.pair ? b : undefined;
  const inverseMass = 1 / body.mass + (other ? 1 / other.mass : 0);
  // Круги без трения: нормаль проходит через центры и не создаёт вращательного импульса.
  const relative = { x: body.velocity.x - (other?.velocity.x ?? 0), y: body.velocity.y - (other?.velocity.y ?? 0) };
  const impulse = Math.max(0, -(1 + hit.restitution) * dot(relative, hit.normal) / inverseMass);
  body.velocity.x += hit.normal.x * impulse / body.mass;
  body.velocity.y += hit.normal.y * impulse / body.mass;
  body.position.x += hit.normal.x * hit.penetration / (inverseMass * body.mass);
  body.position.y += hit.normal.y * hit.penetration / (inverseMass * body.mass);
  if (other) {
    other.velocity.x -= hit.normal.x * impulse / other.mass;
    other.velocity.y -= hit.normal.y * impulse / other.mass;
    other.position.x -= hit.normal.x * hit.penetration / (inverseMass * other.mass);
    other.position.y -= hit.normal.y * hit.penetration / (inverseMass * other.mass);
  }
  return { body: hit.body, other: hit.other, impulse, normal: { ...hit.normal } };
}
// Проверяем и последний момент тика: исправление одного перекрытия может создать другое.
export function hasPenetration(a: BodyState, b: BodyState, obstacles: readonly CircleObstacle[], bounds: Bounds | undefined,
  epsilon: number): boolean {
  if (Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < a.radius + b.radius - epsilon) return true;
  for (const body of [a, b]) {
    if (obstacles.some(o => Math.hypot(body.position.x - o.position.x, body.position.y - o.position.y) < body.radius + o.radius - epsilon)) return true;
    if (bounds && (body.position.x < bounds.minX + body.radius - epsilon || body.position.x > bounds.maxX - body.radius + epsilon
      || body.position.y < bounds.minY + body.radius - epsilon || body.position.y > bounds.maxY - body.radius + epsilon)) return true;
  }
  return false;
}
