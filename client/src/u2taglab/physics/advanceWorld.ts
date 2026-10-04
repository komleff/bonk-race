import type { AdvanceResult, BodyState, CouplingState, TugConfig, Vec2 } from '../../tuglab/types';
import { driftBody, isValidBody, cross } from '../../tuglab/physics/body';
import { applySpring, couplingGeometry, rodStepLimit } from '../../tuglab/physics/coupling';
import { couplingAccepted, validCoupling, validNumerics } from '../../tuglab/physics/advance';
import { advanceCoupledInterval } from '../../tuglab/physics/coupledAdvance';
import { cloneSpaceWorld, type SpaceWorld } from '../world';
import { firstWorldContact, resolveWorldContact, worldHasPenetration, type NamedBody, type WorldContactEvent } from './worldContacts';

import { rigidAssembly, rigidPose, syncRigid, driftRigid, validRigidGeometry } from './rigid';
import { firstRigidContact, resolveRigidContact } from './rigidContacts';

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
  const rigid = coupling.connected && coupling.type === 'rigid' ? rigidAssembly(A, B, coupling) : undefined;
  if (rigid && !validRigidGeometry(A, B, coupling, config.normalEpsilon)) return undefined;
  for (let step = 0; step < substeps; step++) {
    if (sampler) {
      // Все силы читаются до интеграции любых скоростей на общем подшаге.
      const forces = bodies.map(({ id, body }) => sampler({ id, body: cloneBody(body), time: world.time + step * subDt, subDt }));
      forces.forEach((wrench, i) => {
        if (![wrench.force.x, wrench.force.y, wrench.torque].every(Number.isFinite)) throw new Error('Недопустимая внешняя сила');
        const body = bodies[i].body;
        if (rigid && i < 2) {
          const arm = rigidPose(rigid, i === 0 ? rigid.offsetA : rigid.offsetB).arm;
          rigid.velocity.x += wrench.force.x * subDt / rigid.mass; rigid.velocity.y += wrench.force.y * subDt / rigid.mass;
          rigid.angularVelocity += (wrench.torque + cross(arm, wrench.force)) * subDt / rigid.inertia;
          return;
        }
        body.velocity.x += wrench.force.x * subDt / body.mass;
        body.velocity.y += wrench.force.y * subDt / body.mass;
        body.angularVelocity += wrench.torque * subDt / body.inertia;
      });
    }
    if (rigid) syncRigid(rigid, A, B);
    if (bodies.some(({ body }) => !isValidBody(body))) return undefined;
    if (!rigid && subDt > rodStepLimit(A, B, { ...coupling, type: 'rod' }, config)) return undefined;
    if (coupling.connected && coupling.type === 'spring') {
      const inverseMass = couplingGeometry(A, B, coupling).inverseMass;
      if (subDt * Math.max(Math.sqrt(coupling.k * inverseMass), coupling.c * inverseMass) > config.springMaxStep) return undefined;
    }
    coupling.accumulatedImpulse = 0;
    applySpring(A, B, coupling, subDt);
    if (rigid) {
      let remaining = subDt, events = 0;
      while (true) {
        const hit = firstRigidContact(rigid, bodies, statics, bounds, remaining, config);
        const segment = hit ? hit.time : remaining;
        driftRigid(rigid, segment, A, B);
        for (const { body } of bodies.slice(2)) driftBody(body, segment);
        remaining = Math.max(0, remaining - segment);
        if (!hit) break;
        if (++events > config.maxContactEvents) return undefined;
        result.contacts.push(resolveRigidContact(rigid, bodies, hit));
      }
    } else if (!advanceCoupledInterval(A, B, coupling, subDt, config, {
      findContact: (trialA, trialB, horizon) => firstWorldContact(
        [{ id: 'A', body: trialA }, { id: 'B', body: trialB }, ...bodies.slice(2)], statics, bounds, horizon, config),
      advanceBodies: segment => { for (const { body } of bodies) driftBody(body, segment); },
      resolveContact: hit => { result.contacts.push(resolveWorldContact(bodies, hit)); },
    })) return undefined;
    result.diagnostics.couplingImpulse += coupling.accumulatedImpulse;
    if (bodies.some(({ body }) => !isValidBody(body)) || !(rigid ? validRigidGeometry(A, B, coupling, config.normalEpsilon) : couplingAccepted({ ...result, contacts: [] }, config))
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
