import { isValidBody } from '../tuglab/physics/body';
import { validNumerics } from '../tuglab/physics/advance';
import { attachmentState, couplingGeometry } from '../tuglab/physics/coupling';
import { hullCircleRadius, hullInertia } from '../u2taglab/profile';
import { SPACE_FIELD_INFO } from '../u2taglab/fields';
import type { SpaceWorld } from '../u2taglab/world';
import { worldHasPenetration } from '../u2taglab/physics/worldContacts';
import { cloneTrainConfig } from './config';
import type { TrainBody, TrainBodyId, TrainConfig, TrainConnection, TrainConnectionId, TrainDiagnostics, TrainShipConfig, TrainState } from './types';

const positive = (values: number[]) => values.every(value => Number.isFinite(value) && value > 0);
const nonnegative = (values: number[]) => values.every(value => Number.isFinite(value) && value >= 0);
function validShipProfile(profile: TrainShipConfig, id: TrainBodyId): boolean {
  if (!profile || !profile.geometry || !profile.speedLimits) return false;
  return (id === 'B' ? ['XS', 'S', 'M', 'L', 'XL', 'XXL'] : ['S', 'M', 'L', 'XL']).includes(profile.size)
    && typeof profile.enginesEnabled === 'boolean'
    && positive([profile.mass, profile.geometry.length, profile.geometry.width, hullCircleRadius(profile.geometry),
      hullInertia(profile.mass, profile.geometry), profile.speedLimit, profile.yawLimit, profile.crewGLimit,
      profile.comfortableBrakingTime, profile.emergencyBrakingTime, profile.yawStopTime,
      profile.speedLimits.forward, profile.speedLimits.reverse, profile.speedLimits.lateral])
    && nonnegative([profile.forwardForce, profile.reverseForce, profile.lateralForce, profile.yawTorque, profile.coastDeadzone, profile.lateralComfort])
    && (id !== 'B' || (!profile.enginesEnabled && [profile.forwardForce, profile.reverseForce, profile.lateralForce, profile.yawTorque].every(value => value === 0)));
}
function validWorldSettings(world: SpaceWorld): boolean {
  if (!world || !world.spawnPoint || !world.finishPoint || !world.fieldShipRadii
    || !Array.isArray(world.fields) || !Array.isArray(world.statics) || !Array.isArray(world.asteroids)) return false;
  if (!Number.isInteger(world.seed) || world.seed < 0 || world.seed > 0xffffffff
    || !positive([world.width, world.height, world.density, world.fieldShipRadii.A, world.fieldShipRadii.B])
    || !nonnegative([world.startClearance, world.time]) || !Number.isSafeInteger(world.tick) || world.tick < 0
    || ![world.spawnPoint.x, world.spawnPoint.y, world.finishPoint.x, world.finishPoint.y].every(Number.isFinite)) return false;
  const fieldIds = new Set<string>();
  return world.fields.every(field => {
    if (!field || !field.center || !field.drift || !field.direction || typeof field.id !== 'string' || !field.id || fieldIds.has(field.id)
      || !Object.hasOwn(SPACE_FIELD_INFO, field.kind) || !['linear', 'vortex'].includes(field.topology)
      || !positive([field.radius]) || !nonnegative([field.pressure, field.resistiveK])
      || ![field.center.x, field.center.y, field.drift.x, field.drift.y, field.direction.x, field.direction.y].every(Number.isFinite)) return false;
    fieldIds.add(field.id); return true;
  });
}
function validProfileConfiguration(config: TrainConfig): boolean {
  return Boolean(config?.ships) && ['A', 'B', 'C'].every(id => validShipProfile(config.ships[id as TrainBodyId], id as TrainBodyId))
    && validWorldSettings(config.world);
}

export function emptyTrainDiagnostics(): TrainDiagnostics {
  return { solverSubsteps: 0, solverAttempts: 0, outsideSpeedRange: false, limitCountsExact: true, limitActivations: { AB: 0, BC: 0 }, couplingImpulse: { AB: 0, BC: 0 } };
}
export function cloneTrainState(state: TrainState): TrainState { return structuredClone(state); }
export function trainConnectionGeometry(state: TrainState, connection: TrainConnection) {
  const a = state.bodies[connection.bodyA], b = state.bodies[connection.bodyB];
  if (!a || !b) throw new Error('В составе отсутствует тело сцепки');
  const g = couplingGeometry(a, b, connection);
  const dx = g.b.velocity.x - g.a.velocity.x, dy = g.b.velocity.y - g.a.velocity.y;
  return { ...g, radialVelocity: dx * g.normal.x + dy * g.normal.y, relativeSpeed: Math.hypot(dx, dy) };
}
export function trainNamedBodies(state: TrainState) {
  return [...Object.values(state.bodies).map(body => ({ id: body.id, body })),
    ...state.world.asteroids.map(body => ({ id: body.id, body }))].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function trainBounds(state: TrainState) {
  return { minX: -state.world.width / 2, maxX: state.world.width / 2, minY: -state.world.height / 2, maxY: state.world.height / 2 };
}
export function validTrainState(state: TrainState): boolean {
  const { world, config } = state;
  if (!validProfileConfiguration(config) || !validWorldSettings(world)) return false;
  const bodies = trainNamedBodies(state), ids = [...bodies.map(b => b.id), ...world.statics.map(b => b.id)];
  const numeric = config.numerics;
  if (!['train', 'single'].includes(config.composition) || !state.bodies.A || !state.bodies.B
    || (config.composition === 'train') !== Boolean(state.bodies.C)
    || Object.entries(state.bodies).some(([id, body]) => !['A', 'B', 'C'].includes(id) || body.id !== id)
    || bodies.some(({ body }) => !isValidBody(body)) || !validNumerics(numeric)
    || ![world.width, world.height].every(v => Number.isFinite(v) && v > 0)
    || !Number.isFinite(world.time) || !Number.isSafeInteger(world.tick) || world.tick < 0 || world.time < 0
    || new Set(ids).size !== ids.length || ids.some(id => !id || id.startsWith('bounds:'))
    || world.statics.some(s => ![s.position.x, s.position.y, s.radius].every(Number.isFinite) || s.radius <= 0
      || (s.restitution !== undefined && (!Number.isFinite(s.restitution) || s.restitution < 0 || s.restitution > 1)))) return false;
  const occupied = new Set<string>(), connections = new Set<string>();
  for (const c of state.connections) {
    if (!['AB', 'BC'].includes(c.id) || connections.has(c.id) || c.type !== 'spring' || typeof c.connected !== 'boolean'
      || !state.bodies[c.bodyA] || !state.bodies[c.bodyB] || c.bodyA === c.bodyB
      || (c.id === 'AB' ? c.bodyA !== 'A' || c.bodyB !== 'B' : c.bodyA !== 'B' || c.bodyB !== 'C')
      || c.attachmentA !== 'tail' || c.attachmentB !== 'nose'
      || ![c.restLength, c.minLength, c.maxLength, c.captureMaxLength].every(v => Number.isFinite(v) && v > 0)
      || ![c.k, c.c].every(v => Number.isFinite(v) && v >= 0)
      || c.minLength !== .5 * c.restLength || c.maxLength !== 1.5 * c.restLength
      || ![c.length, c.lastNormal.x, c.lastNormal.y, c.accumulatedImpulse].every(Number.isFinite)) return false;
    connections.add(c.id);
    if (c.connected) for (const port of [`${c.bodyA}:${c.attachmentA}`, `${c.bodyB}:${c.attachmentB}`]) {
      if (occupied.has(port)) return false; occupied.add(port);
    }
  }
  return connections.size === (state.bodies.C ? 2 : 1) && connections.has('AB') && (!state.bodies.C || connections.has('BC'));
}
export function createTrain(original: TrainConfig): TrainState {
  const config = cloneTrainConfig(original), bodies = {} as TrainState['bodies'];
  if (!validProfileConfiguration(config)) throw new Error('Недопустимые физические профили, настройки FA или мира');
  const ids: TrainBodyId[] = config.composition === 'single' ? ['A', 'B'] : ['A', 'B', 'C'];
  for (const id of ids) {
    const p = config.ships[id], radius = hullCircleRadius(p.geometry);
    const body: TrainBody = { id, mass: p.mass, radius, inertia: hullInertia(p.mass, p.geometry), position: { ...config.world.spawnPoint },
      velocity: { x: 0, y: 0 }, angle: 0, angularVelocity: 0 };
    if (id !== 'A') {
      const previous = bodies[id === 'B' ? 'A' : 'B'];
      body.position.x = previous.position.x - previous.radius - radius - config.links[id === 'B' ? 'AB' : 'BC'].restLength;
    }
    bodies[id] = body;
  }
  const connections: TrainConnection[] = (config.composition === 'single' ? ['AB'] : ['AB', 'BC']).map(key => {
    const id = key as TrainConnectionId, link = config.links[id];
    return { ...link, id, bodyA: id === 'AB' ? 'A' : 'B', bodyB: id === 'AB' ? 'B' : 'C',
      type: 'spring', connected: true, attachmentA: 'tail', attachmentB: 'nose', length: link.restLength,
      minLength: .5 * link.restLength, maxLength: 1.5 * link.restLength, lastNormal: { x: -1, y: 0 }, accumulatedImpulse: 0 };
  });
  const state: TrainState = { config, bodies, connections, world: structuredClone(config.world), paused: true, diagnostics: emptyTrainDiagnostics() };
  state.world.time = 0; state.world.tick = 0;
  if (!validTrainState(state) || worldHasPenetration(trainNamedBodies(state), state.world.statics, trainBounds(state), config.numerics.normalEpsilon)) {
    throw new Error('Состав не помещается: проверьте профиль, длины, старт и препятствия');
  }
  return state;
}
export function setTrainConnection(state: TrainState, id: TrainConnectionId, connected: boolean): { state: TrainState; reason?: string } {
  const c = state.connections.find(c => c.id === id), reject = (reason: string) => ({ state, reason });
  if (!c) return reject('Сцепка отсутствует в выбранном составе');
  if (c.connected === connected) return { state };
  if (!connected) {
    const result = cloneTrainState(state), link = result.connections.find(c => c.id === id)!;
    link.connected = false; link.accumulatedImpulse = 0; return { state: result };
  }
  if (c.bodyA !== (id === 'AB' ? 'A' : 'B') || c.bodyB !== (id === 'AB' ? 'B' : 'C') || c.attachmentA !== 'tail' || c.attachmentB !== 'nose') return reject('Разрешены только штатные крепления поезда');
  for (const other of state.connections.filter(other => other.connected && other.id !== id)) {
    const ports = [`${other.bodyA}:${other.attachmentA}`, `${other.bodyB}:${other.attachmentB}`];
    if (ports.includes(`${c.bodyA}:${c.attachmentA}`) || ports.includes(`${c.bodyB}:${c.attachmentB}`)) return reject('Крепление занято другой сцепкой');
  }
  const a = state.bodies[c.bodyA], b = state.bodies[c.bodyB];
  if (!a || !b || !isValidBody(a) || !isValidBody(b)) return reject('Недопустимое состояние тел');
  const pa = attachmentState(a, c.attachmentA), pb = attachmentState(b, c.attachmentB);
  const distance = Math.hypot(pb.position.x - pa.position.x, pb.position.y - pa.position.y);
  const speed = Math.hypot(pb.velocity.x - pa.velocity.x, pb.velocity.y - pa.velocity.y);
  const limits = state.config.ships[id === 'AB' ? 'A' : 'C'].speedLimits;
  const maxSpeed = Math.min(limits.forward, limits.reverse, limits.lateral);
  if (![limits.forward, limits.reverse, limits.lateral].every(v => Number.isFinite(v) && v > 0)) return reject('Некорректные линейные лимиты тягача');
  // Включительные границы используют тот же масштабированный epsilon, что и ограничения длины; l0 не округляется.
  const epsilon = state.config.numerics.normalEpsilon;
  if (!Number.isFinite(c.captureMaxLength) || !Number.isFinite(epsilon) || epsilon <= 0
    || distance < 2 - epsilon * 2 || distance > c.captureMaxLength + epsilon * Math.max(1, c.captureMaxLength)) {
    return reject('Крепления вне диапазона захвата от 2 м до LAB-предела модуля');
  }
  if (speed > maxSpeed) return reject('Скорость креплений превышает минимум линейных лимитов тягача');
  if (worldHasPenetration(trainNamedBodies(state), state.world.statics, trainBounds(state), state.config.numerics.normalEpsilon)) return reject('Захват при пересечении тел или препятствий запрещён');
  const result = cloneTrainState(state), link = result.connections.find(c => c.id === id)!;
  link.connected = true; link.restLength = distance; link.length = distance; link.minLength = .5 * distance; link.maxLength = 1.5 * distance;
  link.lastNormal = { x: (pb.position.x - pa.position.x) / distance, y: (pb.position.y - pa.position.y) / distance }; link.accumulatedImpulse = 0;
  if (!validTrainState(result)) return reject('Некорректное состояние состава или сцепки');
  return { state: result };
}
