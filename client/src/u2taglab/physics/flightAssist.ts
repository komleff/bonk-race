import type { BodyState, InputFrame } from '../../tuglab/types';
import type { EngineWrench } from '../../tuglab/physics/engines';
import type { SpaceProfile } from '../profile';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
function stopForce(speed: number, available: number, mass: number, dt: number, time = dt): number {
  return -Math.sign(speed) * Math.min(available, mass * Math.abs(speed) / Math.max(dt, time));
}
function yawTorque(body: BodyState, input: InputFrame, p: SpaceProfile, dt: number): number {
  const omega = body.angularVelocity, command = clamp(input.yaw, -1, 1);
  if (input.brake) return stopForce(omega, p.yawTorque, body.inertia, dt);
  if (!command) return stopForce(omega, p.yawTorque, body.inertia, dt, p.yawStopTime);
  if (command * omega > 0 && Math.abs(omega) > p.yawLimit) {
    return -Math.sign(omega) * Math.min(p.yawTorque, body.inertia * (Math.abs(omega) - p.yawLimit) / Math.max(dt, p.yawStopTime));
  }
  let torque = command * p.yawTorque;
  if (torque * omega >= 0) torque = Math.sign(torque) * Math.min(Math.abs(torque), body.inertia * Math.max(0, p.yawLimit - Math.abs(omega)) / dt);
  return torque;
}

// Переписывает только команды двигателей A. Скорость меняет общий интегратор, среды здесь нет.
export function spaceEngineWrench(body: BodyState, input: InputFrame, fa: boolean, p: SpaceProfile, dt: number): EngineWrench {
  if (!p.enginesEnabled || !(dt > 0) || !Number.isFinite(dt)) return { force: { x: 0, y: 0 }, torque: 0, forward: 0, lateral: 0 };
  const nx = Math.cos(body.angle), ny = Math.sin(body.angle), rx = ny, ry = -nx;
  const vf = body.velocity.x * nx + body.velocity.y * ny, vl = body.velocity.x * rx + body.velocity.y * ry;
  let forward = clamp(input.forward, -1, 1) * (input.forward >= 0 ? p.forwardForce : p.reverseForce);
  let lateral = clamp(input.lateral, -1, 1) * p.lateralForce;
  if (input.brake) {
    forward = stopForce(vf, vf > 0 ? p.reverseForce : p.forwardForce, body.mass, dt, p.emergencyBrakingTime);
    lateral = stopForce(vl, p.lateralForce, body.mass, dt);
  } else if (fa) {
    if (Math.abs(input.forward) <= 0.01) forward = Math.abs(vf) <= p.coastDeadzone
      ? stopForce(vf, vf > 0 ? p.reverseForce : p.forwardForce, body.mass, dt, p.comfortableBrakingTime * 0.5) : 0;
    if (Math.abs(input.lateral) <= 0.01) lateral = stopForce(vl,
      Math.min(p.lateralForce, body.mass * p.lateralComfort), body.mass, dt);
    const speed = Math.hypot(vf, vl);
    if (speed > p.speedLimit) {
      // Мягкий общий governor после внешнего импульса; ограничены обе реальные оси двигателя.
      const accel = (speed - p.speedLimit) / Math.max(dt, p.comfortableBrakingTime);
      forward = clamp(-body.mass * vf / speed * accel, -p.reverseForce, p.forwardForce);
      lateral = clamp(-body.mass * vl / speed * accel, -p.lateralForce, p.lateralForce);
    }
    const force = Math.hypot(forward, lateral), budget = body.mass * p.crewGLimit * 9.81;
    if (force > budget) { forward *= budget / force; lateral *= budget / force; }
    if (speed <= p.speedLimit) {
      // Ограничение команды по конечному |v|: квадратное уравнение для доли доступной силы.
      // Это не обрезание скорости; внешний импульс сцепки/контакта остаётся физическим.
      const df = forward * dt / body.mass, dl = lateral * dt / body.mass;
      const aa = df * df + dl * dl, bb = vf * df + vl * dl;
      if (aa > 0 && Math.hypot(vf + df, vl + dl) > p.speedLimit) {
        const lambda = clamp((-bb + Math.sqrt(Math.max(0, bb * bb + aa * (p.speedLimit ** 2 - speed ** 2)))) / aa, 0, 1);
        forward *= lambda; lateral *= lambda;
      }
    }
  }
  return { force: { x: nx * forward + rx * lateral, y: ny * forward + ry * lateral },
    torque: yawTorque(body, input, p, dt), forward, lateral };
}

// Штатный ввод BonkLab задаёт мировой вектор: сохраняем его смысл для мыши, тача и WASD.
export function spaceInputFrame(body: BodyState, x: number, y: number, magnitude: number, profile: SpaceProfile, brake = false): InputFrame {
  const active = Number.isFinite(magnitude) && magnitude > 0.05 && Number.isFinite(x) && Number.isFinite(y);
  const nx = Math.cos(body.angle), ny = Math.sin(body.angle);
  let yaw = 0;
  if (active) {
    const error = Math.atan2(Math.sin(Math.atan2(y, x) - body.angle), Math.cos(Math.atan2(y, x) - body.angle));
    // Тормозной путь поворота даёт плавный захват курса без аркадного присваивания угла.
    const alpha = profile.yawTorque / body.inertia;
    const targetOmega = Math.sign(error) * Math.min(profile.yawLimit, Math.sqrt(2 * alpha * Math.abs(error)));
    yaw = clamp((targetOmega - body.angularVelocity) / Math.max(alpha * 0.25, 1e-9), -1, 1);
  }
  return { forward: active ? clamp((x * nx + y * ny) * magnitude, -1, 1) : 0,
    lateral: active ? clamp((x * ny - y * nx) * magnitude, -1, 1) : 0,
    yaw, brake, action: false, toggleFA: false };
}
