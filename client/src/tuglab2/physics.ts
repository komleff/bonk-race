import { applyImpulse, cross, driftBody, isValidBody } from '../tuglab/physics/body';
import { attachmentState, solveCoupling } from '../tuglab/physics/coupling';
import { firstWorldContact, resolveWorldContact, worldHasPenetration } from '../u2taglab/physics/worldContacts';
import { advanceSpaceWorld } from '../u2taglab/physics/advanceWorld';
import { cloneTrainState, emptyTrainDiagnostics, trainBounds, trainConnectionGeometry, trainNamedBodies, validTrainState } from './train';
import type { TrainAdvanceResult, TrainBodyId, TrainConnection, TrainForceApplied, TrainForceSampler, TrainState, TrainWrench } from './types';

const orderedConnections = (state: TrainState) => state.connections.filter(c => c.connected).slice().sort((a, b) => a.id < b.id ? -1 : 1);
const zeroWrench = (): TrainWrench => ({ force: { x: 0, y: 0 }, torque: 0 });
export function trainSpringWrenches(state: TrainState): Record<TrainBodyId, TrainWrench> {
  const result = { A: zeroWrench(), B: zeroWrench(), C: zeroWrench() };
  for (const c of orderedConnections(state)) {
    const g = trainConnectionGeometry(state, c), force = c.k * (g.distance - c.restLength) + c.c * g.radialVelocity;
    for (const [id, arm, sign] of [[c.bodyA, g.a.arm, 1], [c.bodyB, g.b.arm, -1]] as const) {
      const f = { x: sign * force * g.normal.x, y: sign * force * g.normal.y };
      result[id].force.x += f.x; result[id].force.y += f.y; result[id].torque += cross(arm, f);
    }
  }
  return result;
}
function springKick(state: TrainState, dt: number): void {
  const contributions = orderedConnections(state).map(c => {
    const g = trainConnectionGeometry(state, c);
    return { c, g, impulse: c.k * (g.distance - c.restLength) * dt };
  });
  for (const { c, g, impulse } of contributions) {
    applyImpulse(state.bodies[c.bodyA]!, { x: g.normal.x * impulse, y: g.normal.y * impulse }, g.a.arm);
    applyImpulse(state.bodies[c.bodyB]!, { x: -g.normal.x * impulse, y: -g.normal.y * impulse }, g.b.arm);
    c.lastNormal = { ...g.normal }; c.accumulatedImpulse += impulse;
  }
}
// Совместная неявная середина для двух демпферов: B входит в одну матрицу эффективной массы.
function dampingKick(state: TrainState, dt: number): void {
  const links = orderedConnections(state).filter(c => c.c > 0), geometries = links.map(c => trainConnectionGeometry(state, c));
  const gradient = (i: number, id: TrainBodyId): TrainWrench => {
    const c = links[i], g = geometries[i];
    const sign = id === c.bodyA ? 1 : id === c.bodyB ? -1 : 0;
    const arm = id === c.bodyA ? g.a.arm : g.b.arm;
    const force = { x: sign * g.normal.x, y: sign * g.normal.y };
    return { force, torque: cross(arm, force) };
  };
  const matrix = links.map((c, i) => [...links.map((_, j) => {
    let inverseMass = 0;
    for (const id of ['A', 'B', 'C'] as const) {
      const body = state.bodies[id]; if (!body) continue;
      const u = gradient(i, id), v = gradient(j, id);
      inverseMass += (u.force.x * v.force.x + u.force.y * v.force.y) / body.mass + u.torque * v.torque / body.inertia;
    }
    return (i === j ? 1 : 0) + .5 * dt * c.c * inverseMass;
  }), dt * c.c * geometries[i].radialVelocity]);
  for (let i = 0; i < matrix.length; i++) {
    const divisor = matrix[i][i];
    for (let j = i; j <= matrix.length; j++) matrix[i][j] /= divisor;
    for (let row = 0; row < matrix.length; row++) if (row !== i) {
      const factor = matrix[row][i];
      for (let j = i; j <= matrix.length; j++) matrix[row][j] -= factor * matrix[i][j];
    }
  }
  links.forEach((c, i) => {
    const g = geometries[i], impulse = matrix[i][matrix.length];
    applyImpulse(state.bodies[c.bodyA]!, { x: g.normal.x * impulse, y: g.normal.y * impulse }, g.a.arm);
    applyImpulse(state.bodies[c.bodyB]!, { x: -g.normal.x * impulse, y: -g.normal.y * impulse }, g.b.arm);
    c.accumulatedImpulse += impulse;
  });
}
function withinLimits(state: TrainState): boolean {
  return orderedConnections(state).every(c => {
    const d = trainConnectionGeometry(state, c).distance, epsilon = state.config.numerics.normalEpsilon;
    return d > epsilon && d >= c.minLength - epsilon && d <= c.maxLength + epsilon;
  });
}
function freeDriftWithinLimits(state: TrainState, dt: number): boolean {
  return orderedConnections(state).every(c => {
    const predict = (id: TrainBodyId, attachment: TrainConnection['attachmentA']) => {
      const body = state.bodies[id]!;
      return attachmentState({ ...body, position: { x: body.position.x + body.velocity.x * dt, y: body.position.y + body.velocity.y * dt },
        angle: body.angle + body.angularVelocity * dt }, attachment).position;
    };
    const a = predict(c.bodyA, c.attachmentA), b = predict(c.bodyB, c.attachmentB), d = Math.hypot(b.x - a.x, b.y - a.y);
    return d >= c.minLength && d <= c.maxLength;
  });
}
function limitTrial(state: TrainState, horizon: number): void {
  const impulses = new Map(state.connections.map(c => [c.id, { pull: 0, push: 0 }]));
  const links = orderedConnections(state);
  for (let i = 0; i < state.config.numerics.solverIterations; i++) for (const c of links) {
    const before = c.accumulatedImpulse;
    solveCoupling(state.bodies[c.bodyA]!, state.bodies[c.bodyB]!, c, horizon, state.config.numerics, impulses.get(c.id)!);
    if (Math.abs(c.accumulatedImpulse - before) > state.config.numerics.normalEpsilon) state.diagnostics.limitActivations[c.id]++;
  }
}
// Прогноз ограничителей и CCD использует копию всей системы, никогда два независимых продвижения B.
function constrainedDrift(state: TrainState, dt: number, contacts: TrainAdvanceResult['contacts']): TrainState | undefined {
  let remaining = dt, events = 0;
  const config = state.config.numerics, statics = state.world.statics.slice().sort((a, b) => a.id < b.id ? -1 : 1);
  const contact = (s: TrainState, horizon: number) => firstWorldContact(trainNamedBodies(s), statics, trainBounds(s), horizon, config);
  while (true) {
    const raw = contact(state, remaining);
    if (raw?.time === 0) {
      if (++events > config.maxContactEvents) return undefined;
      contacts.push(resolveWorldContact(trainNamedBodies(state), raw)); continue;
    }
    if (remaining === 0) return state;
    if (!raw && freeDriftWithinLimits(state, remaining)) {
      for (const { body } of trainNamedBodies(state)) driftBody(body, remaining);
      return state;
    }
    let horizon = raw ? raw.time : remaining;
    while (true) {
      const trial = cloneTrainState(state);
      limitTrial(trial, horizon);
      if (trainNamedBodies(trial).some(({ body }) => !isValidBody(body))) return undefined;
      const hit = contact(trial, horizon);
      if (hit && hit.time < horizon) {
        const active = orderedConnections(state).some(c => {
          const d = trainConnectionGeometry(state, c).distance;
          return d >= c.maxLength - config.normalEpsilon || d <= c.minLength + config.normalEpsilon;
        });
        if (hit.time > 0 || !active) {
          if (++events > config.maxContactEvents) return undefined;
          horizon = hit.time > 0 ? hit.time : horizon / 2;
          if (!(horizon > 0)) return undefined;
          continue;
        }
      }
      state = trial;
      const segment = hit ? hit.time : horizon;
      for (const { body } of trainNamedBodies(state)) driftBody(body, segment);
      if (!hit && segment < remaining && ++events > config.maxContactEvents) return undefined;
      remaining = Math.max(0, remaining - segment);
      if (hit) {
        if (++events > config.maxContactEvents) return undefined;
        contacts.push(resolveWorldContact(trainNamedBodies(state), hit));
      }
      if (!withinLimits(state)) return undefined;
      break;
    }
  }
}
function attempt(original: TrainState, dt: number, substeps: number, sampler?: TrainForceSampler): TrainAdvanceResult | undefined {
  let state = cloneTrainState(original);
  state.diagnostics = emptyTrainDiagnostics(); state.diagnostics.solverSubsteps = substeps;
  const contacts: TrainAdvanceResult['contacts'] = [], forceSamples: TrainForceApplied[] = [], subDt = dt / substeps;
  for (let step = 0; step < substeps; step++) {
    const bodies = trainNamedBodies(state);
    for (const c of state.connections) c.accumulatedImpulse = 0;
    const links = orderedConnections(state), invFrequency = links.reduce((sum, c) => sum + c.k * trainConnectionGeometry(state, c).inverseMass, 0);
    if (subDt * Math.sqrt(invFrequency) > state.config.numerics.springMaxStep) return undefined;
    if (links.some(c => {
      const a = state.bodies[c.bodyA]!, b = state.bodies[c.bodyB]!, d = trainConnectionGeometry(state, c).distance;
      return d <= state.config.numerics.normalEpsilon || subDt * (Math.abs(a.angularVelocity) + Math.abs(b.angularVelocity)) > state.config.numerics.rodMaxSweep;
    })) return undefined;
    if (sampler) {
      const samples = bodies.map(({ id, body }) => sampler({ id, body: structuredClone(body), time: original.world.time + step * subDt, subDt }));
      samples.forEach((w, i) => {
        if (!w || !w.force || ![w.force.x, w.force.y, w.torque].every(Number.isFinite)) throw new Error('Недопустимая внешняя сила');
        forceSamples.push({ id: bodies[i].id, time: original.world.time + step * subDt, subDt,
          wrench: { force: { ...w.force }, torque: w.torque } });
        applyImpulse(bodies[i].body, { x: w.force.x * subDt, y: w.force.y * subDt });
        bodies[i].body.angularVelocity += w.torque * subDt / bodies[i].body.inertia;
      });
    }
    dampingKick(state, subDt / 2); springKick(state, subDt / 2);
    const accepted = constrainedDrift(state, subDt, contacts); if (!accepted) return undefined; state = accepted;
    springKick(state, subDt / 2); dampingKick(state, subDt / 2);
    for (const c of state.connections) state.diagnostics.couplingImpulse[c.id] += c.accumulatedImpulse;
    if (!withinLimits(state) || trainNamedBodies(state).some(({ body }) => !isValidBody(body))
      || worldHasPenetration(trainNamedBodies(state), state.world.statics, trainBounds(state), state.config.numerics.normalEpsilon)) return undefined;
  }
  state.world.time = original.world.time + dt; state.world.tick = original.world.tick + 1;
  for (const c of state.connections) {
    const g = trainConnectionGeometry(state, c); c.length = g.distance; c.lastNormal = { ...g.normal };
  }
  state.diagnostics.outsideSpeedRange = trainNamedBodies(state).some(({ body }) => Math.hypot(body.velocity.x, body.velocity.y) > state.config.numerics.maxValidatedSpeed);
  return { state, contacts, forceSamples, diagnostics: state.diagnostics };
}
export function advanceTrain(state: TrainState, dt: number, forces?: TrainForceSampler): TrainAdvanceResult {
  const fail = (stopReason: string): TrainAdvanceResult => ({ state, contacts: [], forceSamples: [], diagnostics: emptyTrainDiagnostics(), stopReason });
  if (!Number.isFinite(dt) || dt <= 0 || !validTrainState(state) || !Number.isFinite(state.world.time + dt)
    || !Number.isSafeInteger(state.world.tick + 1)) return fail('Недопустимое состояние или численные настройки поезда');
  if (orderedConnections(state).some(c => trainConnectionGeometry(state, c).distance <= state.config.numerics.normalEpsilon)) return fail('Вырожденная геометрия: крепления почти совпадают');
  // Один тягач сохраняет точную численную опору U2TagLab; у поезда всегда общий трёхтелесный решатель.
  if (state.config.composition === 'single') {
    const collected: TrainForceApplied[] = [];
    const sampler: TrainForceSampler | undefined = forces ? sample => {
      const wrench = forces(sample);
      if (!wrench || !wrench.force || ![wrench.force.x, wrench.force.y, wrench.torque].every(Number.isFinite)) throw new Error('Недопустимая внешняя сила');
      collected.push({ id: sample.id, time: sample.time, subDt: sample.subDt, wrench: { force: { ...wrench.force }, torque: wrench.torque } });
      return wrench;
    } : undefined;
    const legacy = advanceSpaceWorld(state.bodies.A, state.bodies.B, state.connections[0], state.world, dt, state.config.numerics, sampler);
    if (legacy.stopReason) return fail(legacy.stopReason);
    const next = cloneTrainState(state), c = next.connections[0];
    next.bodies.A = { ...legacy.A, id: 'A' }; next.bodies.B = { ...legacy.B, id: 'B' };
    next.connections = [{ ...c, ...legacy.coupling }]; next.world = legacy.world; next.diagnostics = emptyTrainDiagnostics();
    next.diagnostics.solverSubsteps = legacy.diagnostics.solverSubsteps ?? 0; next.diagnostics.solverAttempts = 1;
    next.diagnostics.limitCountsExact = false;
    next.diagnostics.couplingImpulse.AB = legacy.diagnostics.couplingImpulse; next.diagnostics.outsideSpeedRange = legacy.diagnostics.outsideSpeedRange;
    // У принятой последней попытки ровно N тел × solverSubsteps вызовов; префикс повторов отбрасываем.
    const count = (legacy.diagnostics.solverSubsteps ?? 0) * (2 + state.world.asteroids.length);
    return { state: next, contacts: legacy.contacts, forceSamples: count > 0 ? collected.slice(-count) : [], diagnostics: next.diagnostics };
  }
  let tries = 0;
  for (let steps = state.config.numerics.substeps; steps <= state.config.numerics.maxAdaptiveSubsteps; steps *= 2) {
    try {
      tries++; const result = attempt(state, dt, steps, forces);
      if (result) { result.diagnostics.solverAttempts = tries; return result; }
    } catch (error) { return fail(error instanceof Error ? error.message : 'Ошибка внешней силы'); }
  }
  return fail('Исчерпан численный бюджет: допустимое состояние сцепок и контактов не достигнуто');
}
