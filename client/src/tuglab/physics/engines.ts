import type { BodyState, InputFrame, TugConfig, Vec2 } from '../types';
import { dot } from './body';
export interface EngineWrench { force: Vec2; torque: number; forward: number; lateral: number }
function brakingForce(speed: number, available: number, mass: number, dt: number): number {
  return -Math.sign(speed) * Math.min(available, mass * Math.abs(speed) / dt);
}
export function engineWrench(body: BodyState, input: InputFrame, fa: boolean, config: TugConfig, dt: number): EngineWrench {
  if (!config.enginesEnabled) return { force: { x: 0, y: 0 }, torque: 0, forward: 0, lateral: 0 };
  const nose = { x: Math.cos(body.angle), y: Math.sin(body.angle) };
  const right = { x: nose.y, y: -nose.x };
  const forwardSpeed = dot(body.velocity, nose), lateralSpeed = dot(body.velocity, right);
  let forward: number, lateral: number, torque: number;
  if (input.brake) {
    forward = brakingForce(forwardSpeed, forwardSpeed > 0 ? config.reverseForce : config.forwardForce, body.mass, dt);
    lateral = brakingForce(lateralSpeed, config.lateralForce, body.mass, dt);
    torque = brakingForce(body.angularVelocity, config.yawTorque, body.inertia, dt);
  } else {
    forward = input.forward * (input.forward >= 0 ? config.forwardForce : config.reverseForce);
    lateral = input.lateral !== 0 ? input.lateral * config.lateralForce
      : fa ? brakingForce(lateralSpeed, Math.min(config.lateralForce, body.mass * config.lateralComfort), body.mass, dt) : 0;
    if (input.yaw === 0) {
      torque = brakingForce(body.angularVelocity, Math.min(config.yawTorque,
        body.inertia * Math.abs(body.angularVelocity) / config.yawDampingTime), body.inertia, dt);
    } else if (Math.abs(body.angularVelocity) > config.yawLimit && input.yaw * body.angularVelocity > 0) {
      // Превышение от внешнего импульса устраняется двигателем, без обрезания скорости.
      torque = -Math.sign(body.angularVelocity) * Math.min(config.yawTorque,
        body.inertia * (Math.abs(body.angularVelocity) - config.yawLimit) / dt);
    } else {
      torque = input.yaw * config.yawTorque;
      if (torque * body.angularVelocity >= 0) {
        torque = Math.sign(torque) * Math.min(Math.abs(torque),
          body.inertia * (config.yawLimit - Math.abs(body.angularVelocity)) / dt);
      }
    }
  }
  return { force: { x: nose.x * forward + right.x * lateral, y: nose.y * forward + right.y * lateral },
    torque, forward, lateral };
}
export function applyEngines(body: BodyState, input: InputFrame, fa: boolean, config: TugConfig, dt: number): EngineWrench {
  const wrench = engineWrench(body, input, fa, config, dt);
  body.velocity.x += wrench.force.x * dt / body.mass;
  body.velocity.y += wrench.force.y * dt / body.mass;
  body.angularVelocity += wrench.torque * dt / body.inertia;
  return wrench;
}
