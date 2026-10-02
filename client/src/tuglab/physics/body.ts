import defaults from '../config/tuglab_defaults.json';
import type { BodyState, Vec2 } from '../types';
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export function createBody(mass: number, radius: number, position: Vec2 = { x: 0, y: 0 }): BodyState {
  if (!(mass > 0 && radius > 0) || ![mass, radius, position.x, position.y].every(Number.isFinite)) {
    throw new Error('Масса, радиус и координаты тела должны быть допустимыми числами');
  }
  return { mass, radius, position: { ...position }, velocity: { x: 0, y: 0 },
    angle: 0, angularVelocity: 0, inertia: defaults.inertiaFactor * mass * radius * radius };
}
export function applyImpulse(body: BodyState, impulse: Vec2, arm: Vec2 = { x: 0, y: 0 }): void {
  body.velocity.x += impulse.x / body.mass;
  body.velocity.y += impulse.y / body.mass;
  body.angularVelocity += cross(arm, impulse) / body.inertia;
}
export function driftBody(body: BodyState, dt: number): void {
  body.position.x += body.velocity.x * dt;
  body.position.y += body.velocity.y * dt;
  body.angle += body.angularVelocity * dt;
}
export function isValidBody(body: BodyState): boolean {
  return [body.position.x, body.position.y, body.velocity.x, body.velocity.y, body.angle,
    body.angularVelocity, body.mass, body.radius, body.inertia].every(Number.isFinite)
    && body.mass > 0 && body.radius > 0 && body.inertia > 0;
}
