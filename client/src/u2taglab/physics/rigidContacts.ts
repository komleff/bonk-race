import type { BodyState, Bounds, CircleObstacle, TugConfig, Vec2 } from '../../tuglab/types';
import { cross, dot } from '../../tuglab/physics/body';
import { circleSweep } from '../../tuglab/physics/contacts';
import { rigidPose, syncRigid, type RigidAssembly } from './rigid';
import type { NamedBody, WorldContact, WorldContactEvent } from './worldContacts';

interface GapSample { gap: number; rate: number; normal: Vec2; curvature?: number; jerkBound?: number }
// Нижняя парабола g+g'·h−a·h²/2 гарантирует свободный от контакта интервал.
// |g''| <= |omega²·r| + |v_relative|max²/R для кругов, <= |omega²·r| для стены.
// Поэтому проверяется вся дуга центра, а не хорда или только конечное положение.
function curvedSweep(sample: (t: number) => GapSample, acceleration: number, dt: number, epsilon: number):
  { time: number; normal: Vec2; penetration: number } | undefined {
  let time = 0;
  for (let iteration = 0; iteration < 4096; iteration++) {
    const s = sample(time);
    if (s.gap < -epsilon || (s.gap <= epsilon && (s.rate < -epsilon || (time > 0 && s.rate < 0)))) {
      return { time, normal: s.normal, penetration: Math.max(0, -s.gap) };
    }
    if (time >= dt) return;
    let safe: number;
    if (acceleration === 0) safe = s.rate < 0 ? Math.max(0, s.gap / -s.rate) : dt - time;
    else if (s.gap <= epsilon) {
      // После e=0 нормальная скорость равна нулю. Локальная кубическая оценка
      // допускает только четверть геометрического epsilon и остаётся непрерывной.
      const negativeCurvature = Math.max(0, -(s.curvature ?? -acceleration)), jerk = s.jerkBound ?? 0;
      const lower = (h: number): number => s.gap + s.rate * h - negativeCurvature * h * h / 2 - jerk * h ** 3 / 6;
      let lo = 0, hi = dt - time;
      if (lower(hi) >= -epsilon / 4) safe = hi;
      else {
        for (let i = 0; i < 64; i++) { const middle = (lo + hi) / 2;
          if (lower(middle) >= -epsilon / 4) lo = middle; else hi = middle;
        }
        safe = lo;
      }
    } else {
      const root = Math.sqrt(s.rate ** 2 + 2 * acceleration * (s.gap - epsilon / 2));
      safe = s.rate < 0 ? 2 * (s.gap - epsilon / 2) / (root - s.rate) : (s.rate + root) / acceleration;
    }
    const next = Math.min(dt, time + safe);
    if (!(next > time)) throw new Error('Жёсткая сцепка: исчерпана точность поиска контакта');
    time = next;
  }
  throw new Error('Жёсткая сцепка: исчерпан бюджет поиска дуги контакта');
}
export function firstRigidContact(r: RigidAssembly, bodies: readonly NamedBody[], statics: readonly CircleObstacle[],
  bounds: Bounds, dt: number, config: TugConfig): WorldContact | undefined {
  let first: WorldContact | undefined;
  const horizon = (): number => first?.time ?? dt;
  const accept = (hit: WorldContact): void => { if (!first || hit.time < first.time) first = hit; };
  const curve = (id: string): boolean => id === 'A' || id === 'B';
  const offset = (id: string): number => id === 'A' ? r.offsetA : r.offsetB;
  for (let i = 0; i < bodies.length; i++) {
    const { id, body } = bodies[i], rigid = curve(id);
    const pose = (t: number) => rigid ? rigidPose(r, offset(id), t) : {
      position: { x: body.position.x + body.velocity.x * t, y: body.position.y + body.velocity.y * t }, velocity: body.velocity, arm: {x:0,y:0} };
    const centrifugal = rigid ? r.angularVelocity ** 2 * Math.abs(offset(id)) : 0;
    const circle = (position: Vec2, velocity: Vec2, radius: number, other: string, restitution: number): void => {
      let hit;
      if (!rigid || r.angularVelocity === 0) hit = circleSweep(body, position, velocity, radius, horizon(), config.normalEpsilon);
      else {
        const radiusSum = body.radius + radius;
        const relativeBound = Math.hypot(r.velocity.x - velocity.x, r.velocity.y - velocity.y) + Math.abs(r.angularVelocity * offset(id));
        hit = curvedSweep(t => {
          const p = pose(t), dx = p.position.x - position.x - velocity.x * t, dy = p.position.y - position.y - velocity.y * t;
          const distance = Math.hypot(dx, dy), normal = distance > 0 ? { x: dx / distance, y: dy / distance } : { x: 1, y: 0 };
          const relative = { x: p.velocity.x - velocity.x, y: p.velocity.y - velocity.y }, rate = dot(relative, normal);
          const acceleration = { x: -(r.angularVelocity ** 2) * p.arm.x, y: -(r.angularVelocity ** 2) * p.arm.y };
          const safeRadius = Math.max(radiusSum - config.normalEpsilon, radiusSum / 2);
          return { gap: distance - radiusSum, normal, rate,
            curvature: dot(acceleration, normal) + (dot(relative, relative) - rate ** 2) / Math.max(distance, safeRadius),
            jerkBound: Math.abs(r.angularVelocity) * centrifugal + 3 * relativeBound * centrifugal / safeRadius
              + 3 * relativeBound ** 3 / safeRadius ** 2 };
        }, centrifugal + relativeBound ** 2 / Math.max(radiusSum - config.normalEpsilon, radiusSum / 2), horizon(), config.normalEpsilon);
      }
      if (hit) accept({ ...hit, body: id, other, restitution });
    };
    for (const other of bodies.slice(i + 1)) {
      if (rigid && curve(other.id)) continue;
      circle(other.body.position, other.body.velocity, other.body.radius, other.id, config.restitution);
    }
    for (const other of statics) circle(other.position, { x: 0, y: 0 }, other.radius, other.id, other.restitution ?? config.restitution);
    const walls = [
      { other: 'bounds:minX', normal: { x: 1, y: 0 }, limit: bounds.minX },
      { other: 'bounds:maxX', normal: { x: -1, y: 0 }, limit: -bounds.maxX },
      { other: 'bounds:minY', normal: { x: 0, y: 1 }, limit: bounds.minY },
      { other: 'bounds:maxY', normal: { x: 0, y: -1 }, limit: -bounds.maxY },
    ];
    for (const wall of walls) {
      const hit = curvedSweep(t => { const p = pose(t); return { gap: dot(p.position, wall.normal) - wall.limit - body.radius,
        rate: dot(p.velocity, wall.normal), normal: wall.normal,
        curvature: rigid ? -(r.angularVelocity ** 2) * dot(rigidPose(r, offset(id), t).arm, wall.normal) : 0,
        jerkBound: Math.abs(r.angularVelocity) * centrifugal }; }, centrifugal, horizon(), config.normalEpsilon);
      if (hit) accept({ ...hit, body: id, other: wall.other, restitution: config.restitution });
    }
  }
  return first;
}
export function resolveRigidContact(r: RigidAssembly, bodies: readonly NamedBody[], hit: WorldContact): WorldContactEvent {
  const entry = bodies.find(b => b.id === hit.body)!, other = bodies.find(b => b.id === hit.other);
  const member = (id: string): boolean => id === 'A' || id === 'B';
  const arm = (body: BodyState): Vec2 => ({ x: body.position.x - r.position.x, y: body.position.y - r.position.y });
  const inverse = (entry: NamedBody | undefined): number => !entry ? 0 : member(entry.id)
    ? 1 / r.mass + cross(arm(entry.body), hit.normal) ** 2 / r.inertia : 1 / entry.body.mass;
  const relative = { x: entry.body.velocity.x - (other?.body.velocity.x ?? 0), y: entry.body.velocity.y - (other?.body.velocity.y ?? 0) };
  const impulse = Math.max(0, -(1 + hit.restitution) * dot(relative, hit.normal) / (inverse(entry) + inverse(other)));
  const inverseTranslation = (member(entry.id) ? 1 / r.mass : 1 / entry.body.mass) + (other ? member(other.id) ? 1 / r.mass : 1 / other.body.mass : 0);
  for (const [target, sign] of [[entry, 1], [other, -1]] as const) {
    if (!target) continue;
    const vector = { x: sign * hit.normal.x * impulse, y: sign * hit.normal.y * impulse };
    if (member(target.id)) {
      r.velocity.x += vector.x / r.mass; r.velocity.y += vector.y / r.mass;
      r.angularVelocity += cross(arm(target.body), vector) / r.inertia;
      r.position.x += sign * hit.normal.x * hit.penetration / (inverseTranslation * r.mass);
      r.position.y += sign * hit.normal.y * hit.penetration / (inverseTranslation * r.mass);
    } else {
      target.body.velocity.x += vector.x / target.body.mass; target.body.velocity.y += vector.y / target.body.mass;
      target.body.position.x += sign * hit.normal.x * hit.penetration / (inverseTranslation * target.body.mass);
      target.body.position.y += sign * hit.normal.y * hit.penetration / (inverseTranslation * target.body.mass);
    }
  }
  syncRigid(r, bodies[0].body, bodies[1].body);
  return { body: hit.body, other: hit.other, normal: { ...hit.normal }, impulse };
}
