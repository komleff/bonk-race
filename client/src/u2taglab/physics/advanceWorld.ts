import type { AdvanceResult, BodyState, CouplingState, TugConfig, Vec2 } from '../../tuglab/types';
import { driftBody, isValidBody } from '../../tuglab/physics/body';
import { applySpring, couplingGeometry, rodStepLimit, solveCoupling } from '../../tuglab/physics/coupling';
import { couplingAccepted, validCoupling, validNumerics } from '../../tuglab/physics/advance';
import { cloneSpaceWorld, type SpaceWorld } from '../world';
import { firstWorldContact, resolveWorldContact, worldHasPenetration, type NamedBody, type WorldContactEvent } from './worldContacts';

export interface SpaceForceSample {
  id: string; body: Readonly<BodyState>; time: number; subDt: number;
}
export interface SpaceWrench { force: Vec2; torque: number }
// Чистый sampler не меняет мир: неуспешная попытка повторяется с тем же временем.
export type SpaceForceSampler = (sample: SpaceForceSample) => SpaceWrench;
export interface SpaceAdvanceResult extends Omit<AdvanceResult, 'contacts'> { world: SpaceWorld; contacts: WorldContactEvent[] }
const cloneBody = (b: BodyState): BodyState => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } });

function attempt(a: BodyState, b: BodyState, original: CouplingState, world: SpaceWorld, dt: number,
  config: TugConfig, sampler: SpaceForceSampler | undefined, substeps: number): SpaceAdvanceResult | undefined {
  const result: SpaceAdvanceResult = { A: cloneBody(a), B: cloneBody(b), coupling: { ...original, lastNormal: { ...original.lastNormal } },
    world: cloneSpaceWorld(world), contacts: [], diagnostics: { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false, solverSubsteps: substeps } };
  const { A, B, coupling } = result, subDt = dt / substeps;
  const bodies: NamedBody[] = [{ id: 'A', body: A }, { id: 'B', body: B }, ...result.world.asteroids
    .slice().sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0).map(body => ({ id: body.id, body }))];
  const statics = result.world.statics.slice().sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const bounds = { minX: -world.width / 2, maxX: world.width / 2, minY: -world.height / 2, maxY: world.height / 2 };
  for (let step = 0; step < substeps; step++) {
    if (sampler) {
      // Все силы читаются до интеграции любых скоростей на общем подшаге.
      const forces = bodies.map(({ id, body }) => sampler({ id, body: cloneBody(body), time: world.time + step * subDt, subDt }));
      forces.forEach((wrench, i) => {
        if (![wrench.force.x, wrench.force.y, wrench.torque].every(Number.isFinite)) throw new Error('Недопустимая внешняя сила');
        const body = bodies[i].body;
        body.velocity.x += wrench.force.x * subDt / body.mass;
        body.velocity.y += wrench.force.y * subDt / body.mass;
        body.angularVelocity += wrench.torque * subDt / body.inertia;
      });
    }
    if (bodies.some(({ body }) => !isValidBody(body))) return undefined;
    if (subDt > rodStepLimit(A, B, { ...coupling, type: 'rod' }, config)) return undefined;
    if (coupling.connected && coupling.type === 'spring') {
      const inverseMass = couplingGeometry(A, B, coupling).inverseMass;
      if (subDt * Math.max(Math.sqrt(coupling.k * inverseMass), coupling.c * inverseMass) > config.springMaxStep) return undefined;
    }
    coupling.accumulatedImpulse = 0;
    applySpring(A, B, coupling, subDt);
    let remaining = subDt, events = 0;
    while (true) {
      const rawHit = firstWorldContact(bodies, statics, bounds, remaining, config);
      if (rawHit?.time === 0) {
        if (++events > config.maxContactEvents) return undefined;
        result.contacts.push(resolveWorldContact(bodies, rawHit)); continue;
      }
      if (remaining === 0) break;
      let horizon = rawHit ? rawHit.time : remaining;
      while (true) {
        // Пробуем сцепку только до ближайшего контакта; откат не затрагивает астероиды.
        const trialA = cloneBody(A), trialB = cloneBody(B);
        const trialCoupling = { ...coupling, lastNormal: { ...coupling.lastNormal } }, impulses = { pull: 0, push: 0 };
        for (let i = 0; i < config.solverIterations; i++) solveCoupling(trialA, trialB, trialCoupling, horizon, config, impulses);
        if (!isValidBody(trialA) || !isValidBody(trialB)) return undefined;
        const trialBodies = [{ id: 'A', body: trialA }, { id: 'B', body: trialB }, ...bodies.slice(2)];
        const hit = firstWorldContact(trialBodies, statics, bounds, horizon, config);
        if (hit && hit.time < horizon) {
          const distance = couplingGeometry(A, B, coupling).distance;
          const active = coupling.connected && (coupling.type === 'rod' || (coupling.type === 'rope'
            ? distance >= coupling.restLength - config.normalEpsilon
            : distance >= coupling.maxLength - config.normalEpsilon || distance <= coupling.minLength + config.normalEpsilon));
          if (hit.time > 0 || !active) {
            if (++events > config.maxContactEvents) return undefined;
            horizon = hit.time > 0 ? hit.time : horizon / 2;
            if (!(horizon > 0)) return undefined;
            continue;
          }
        }
        Object.assign(A, trialA); Object.assign(B, trialB); Object.assign(coupling, trialCoupling);
        const segment = hit ? hit.time : horizon;
        for (const { body } of bodies) driftBody(body, segment);
        if (!hit && segment < remaining && ++events > config.maxContactEvents) return undefined;
        remaining -= segment;
        if (hit) {
          if (++events > config.maxContactEvents) return undefined;
          result.contacts.push(resolveWorldContact(bodies, hit));
        }
        break;
      }
    }
    result.diagnostics.couplingImpulse += coupling.accumulatedImpulse;
    if (bodies.some(({ body }) => !isValidBody(body)) || !couplingAccepted({ ...result, contacts: [] }, config)
      || worldHasPenetration(bodies, statics, bounds, config.normalEpsilon)) return undefined;
  }
  result.diagnostics.outsideSpeedRange = bodies.some(({ body }) => Math.hypot(body.velocity.x, body.velocity.y) > config.maxValidatedSpeed);
  result.world.time = world.time + dt; result.world.tick = world.tick + 1;
  return result;
}
export function advanceSpaceWorld(a: BodyState, b: BodyState, coupling: CouplingState, world: SpaceWorld,
  dt: number, config: TugConfig, sampler?: SpaceForceSampler): SpaceAdvanceResult {
  const fail = (stopReason: string): SpaceAdvanceResult => ({ A: a, B: b, coupling, world, contacts: [], stopReason,
    diagnostics: { couplingImpulse: 0, rodError: 0, outsideSpeedRange: false, solverSubsteps: 0 } });
  const ids = ['A', 'B', ...world.asteroids.map(o => o.id), ...world.statics.map(o => o.id)];
  if (!isValidBody(a) || !isValidBody(b) || !validCoupling(coupling) || !validNumerics(config) || !Number.isFinite(dt) || dt <= 0
    || ![world.width, world.height, world.time].every(Number.isFinite) || world.time < 0
    || !Number.isSafeInteger(world.tick) || world.tick < 0 || new Set(ids).size !== ids.length
    || ids.some(id => typeof id !== 'string' || !id || id.startsWith('bounds:'))
    || world.asteroids.some(o => !isValidBody(o))
    || world.statics.some(o => ![o.position.x, o.position.y, o.radius].every(Number.isFinite) || o.radius <= 0
      || (o.restitution !== undefined && (!Number.isFinite(o.restitution) || o.restitution < 0 || o.restitution > 1)))
    || [a, b, ...world.asteroids].some(o => world.width < o.radius * 2 || world.height < o.radius * 2)) {
    return fail('Недопустимое состояние или численные настройки мира');
  }
  for (let substeps = config.substeps; substeps <= config.maxAdaptiveSubsteps; substeps *= 2) {
    try {
      const result = attempt(a, b, coupling, world, dt, config, sampler, substeps);
      if (result) return result;
    } catch (error) { return fail(error instanceof Error ? error.message : 'Ошибка внешней силы'); }
  }
  return fail('Исчерпан численный бюджет: допустимое состояние мира, сцепки и контактов не достигнуто');
}
