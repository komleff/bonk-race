import type { AdvanceResult, ApplyVelocity, BodyState, Bounds, CircleObstacle, CouplingState, TugConfig } from '../types';
import { driftBody, isValidBody } from './body';
import { applySpring, couplingGeometry, rodStepLimit, solveCoupling } from './coupling';
import { firstContact, hasPenetration, resolveContact } from './contacts';

const cloneBody = (body: BodyState): BodyState => ({ ...body, position: { ...body.position }, velocity: { ...body.velocity } });
export function validCoupling(coupling: CouplingState): boolean {
  return ['rod', 'rope', 'spring'].includes(coupling.type) && typeof coupling.connected === 'boolean'
    && ['nose', 'tail'].includes(coupling.attachmentA) && ['nose', 'tail'].includes(coupling.attachmentB)
    && [coupling.length, coupling.restLength, coupling.minLength, coupling.maxLength, coupling.k, coupling.c,
      coupling.lastNormal.x, coupling.lastNormal.y, coupling.accumulatedImpulse].every(Number.isFinite)
    && coupling.restLength > 0 && coupling.minLength >= 0 && coupling.maxLength >= coupling.minLength && coupling.k >= 0 && coupling.c >= 0;
}
export function validNumerics(config: TugConfig): boolean {
  return [config.substeps, config.solverIterations, config.maxAdaptiveSubsteps, config.maxContactEvents]
    .every(value => Number.isInteger(value) && value > 0 && value <= 4096)
    && config.substeps <= config.maxAdaptiveSubsteps
    && [config.normalEpsilon, config.maxPositionBias, config.rodRelativeTolerance, config.rodMaxSweep, config.springMaxStep, config.maxValidatedSpeed]
      .every(value => Number.isFinite(value) && value > 0)
    && config.springMaxStep <= 1
    && Number.isFinite(config.restitution) && config.restitution >= 0 && config.restitution <= 1;
}
function sameStructure(before: BodyState, after: BodyState): boolean {
  return before.position.x === after.position.x && before.position.y === after.position.y && before.angle === after.angle
    && before.mass === after.mass && before.radius === after.radius && before.inertia === after.inertia;
}
export function couplingAccepted(result: AdvanceResult, config: TugConfig): boolean {
  const { A, B, coupling } = result;
  if (!isValidBody(A) || !isValidBody(B) || !validCoupling(coupling)) return false;
  const geometry = couplingGeometry(A, B, coupling);
  if (![geometry.distance, geometry.normal.x, geometry.normal.y].every(Number.isFinite)) return false;
  coupling.length = geometry.distance;
  coupling.lastNormal = geometry.normal;
  result.diagnostics.rodError = coupling.connected && coupling.type === 'rod' ? Math.abs(geometry.distance - coupling.restLength) : 0;
  if (!coupling.connected) return true;
  if (coupling.type === 'rod') return result.diagnostics.rodError <= config.rodRelativeTolerance * coupling.restLength;
  const tolerance = config.normalEpsilon * Math.max(1, coupling.restLength);
  return coupling.type === 'rope' ? geometry.distance <= coupling.restLength + tolerance
    : geometry.distance >= coupling.minLength - tolerance && geometry.distance <= coupling.maxLength + tolerance;
}
function attempt(a: BodyState, b: BodyState, original: CouplingState, dt: number, config: TugConfig,
  obstacles: readonly CircleObstacle[], bounds: Bounds | undefined, applyVelocity: ApplyVelocity | undefined,
  substeps: number): AdvanceResult | undefined {
  const result: AdvanceResult = { A: cloneBody(a), B: cloneBody(b), coupling: { ...original, lastNormal: { ...original.lastNormal } },
    contacts: [], diagnostics: { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false, solverSubsteps: substeps } };
  const { A, B, coupling } = result, subDt = dt / substeps;
  for (let step = 0; step < substeps; step++) {
    if (applyVelocity) {
      const beforeA = cloneBody(A), beforeB = cloneBody(B);
      applyVelocity(A, B, subDt);
      if (!sameStructure(beforeA, A) || !sameStructure(beforeB, B)) throw new Error('Callback должен менять только скорости');
    }
    if (!isValidBody(A) || !isValidBody(B)) return undefined;
    const boundedCoupling = { ...coupling, type: 'rod' as const };
    if (subDt > rodStepLimit(A, B, boundedCoupling, config)) return undefined;
    if (coupling.connected && coupling.type === 'spring') {
      const inverseMass = couplingGeometry(A, B, coupling).inverseMass;
      if (subDt * Math.max(Math.sqrt(coupling.k * inverseMass), coupling.c * inverseMass) > config.springMaxStep) return undefined;
    }
    coupling.accumulatedImpulse = 0;
    applySpring(A, B, coupling, subDt);
    let remaining = subDt, events = 0;
    // Нулевой остаток всё ещё допускает одновременные контакты в конце интервала.
    while (true) {
      const rawHit = firstContact(A, B, obstacles, bounds, remaining, config);
      if (rawHit?.time === 0) {
        if (++events > config.maxContactEvents) return undefined;
        result.contacts.push(resolveContact(A, B, rawHit));
        continue;
      }
      if (remaining === 0) break;
      let horizon = rawHit ? rawHit.time : remaining;
      while (true) {
        // Будущий контакт ограничивает прогноз: сила за его временем ещё не произошла.
        const trialA = cloneBody(A), trialB = cloneBody(B);
        const trialCoupling = { ...coupling, lastNormal: { ...coupling.lastNormal } };
        const impulses = { pull: 0, push: 0 };
        for (let iteration = 0; iteration < config.solverIterations; iteration++) {
          solveCoupling(trialA, trialB, trialCoupling, horizon, config, impulses);
        }
        if (!isValidBody(trialA) || !isValidBody(trialB)) return undefined;
        const hit = firstContact(trialA, trialB, obstacles, bounds, horizon, config);
        if (hit && hit.time < horizon) {
          const distance = couplingGeometry(A, B, coupling).distance;
          const active = coupling.connected && (coupling.type === 'rod'
            || (coupling.type === 'rope' ? distance >= coupling.restLength - config.normalEpsilon
              : distance >= coupling.maxLength - config.normalEpsilon || distance <= coupling.minLength + config.normalEpsilon));
          // Уже активная связь может требовать совместного импульса контакта при t=0.
          // Провисшая связь такого права не имеет: её будущую пробу полностью откатываем.
          if (hit.time > 0 || !active) {
            if (++events > config.maxContactEvents) return undefined;
            horizon = hit.time > 0 ? hit.time : horizon / 2;
            if (!(horizon > 0)) return undefined;
            continue;
          }
        }
        Object.assign(A, trialA); Object.assign(B, trialB); Object.assign(coupling, trialCoupling);
        const segment = hit ? hit.time : horizon;
        driftBody(A, segment); driftBody(B, segment);
        // Принятые укороченные отрезки также расходуют бюджет, исключая бесконечное приближение к контакту.
        if (!hit && segment < remaining && ++events > config.maxContactEvents) return undefined;
        remaining -= segment;
        if (hit) {
          if (++events > config.maxContactEvents) return undefined;
          result.contacts.push(resolveContact(A, B, hit));
        }
        break;
      }
    }
    result.diagnostics.couplingImpulse += coupling.accumulatedImpulse;
    if (!couplingAccepted(result, config) || hasPenetration(A, B, obstacles, bounds, config.normalEpsilon)) return undefined;
  }
  result.diagnostics.outsideSpeedRange = [A, B].some(body => Math.hypot(body.velocity.x, body.velocity.y) > config.maxValidatedSpeed);
  return result;
}
// Callback чист относительно внешнего мира: повтор попытки не откатывает замыкания или историю вызывающего кода.
// Геометрия и массы берутся из тел, а не из фиксированных настроек изолированного стенда.
export function advancePair(a: BodyState, b: BodyState, coupling: CouplingState, dt: number, config: TugConfig,
  obstacles: readonly CircleObstacle[], bounds?: Bounds, applyVelocity?: ApplyVelocity): AdvanceResult {
  const fail = (stopReason: string): AdvanceResult => ({ A: a, B: b, coupling, contacts: [], stopReason,
    diagnostics: { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false, solverSubsteps: 0 } });
  if (!isValidBody(a) || !isValidBody(b) || !validCoupling(coupling) || !validNumerics(config) || !Number.isFinite(dt) || dt <= 0
    || obstacles.some(o => typeof o.id !== 'string' || ![o.position.x, o.position.y, o.radius].every(Number.isFinite)
      || o.radius <= 0 || (o.restitution !== undefined && (!Number.isFinite(o.restitution) || o.restitution < 0)))
    || (bounds && (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite)
      || bounds.maxX - bounds.minX < 2 * Math.max(a.radius, b.radius)
      || bounds.maxY - bounds.minY < 2 * Math.max(a.radius, b.radius)))) return fail('Недопустимое состояние или численные настройки');
  for (let substeps = config.substeps; substeps <= config.maxAdaptiveSubsteps; substeps *= 2) {
    try {
      const result = attempt(a, b, coupling, dt, config, obstacles, bounds, applyVelocity, substeps);
      if (result) return result;
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Ошибка callback скоростей');
    }
  }
  return fail('Исчерпан численный бюджет: допустимое состояние сцепки и контактов не достигнуто');
}
