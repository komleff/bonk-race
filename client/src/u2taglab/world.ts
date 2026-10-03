import { Rng, type Arena } from '@bonk-race/shared';
import type { BodyState, CircleObstacle, Vec2 } from '../tuglab/types';
import { hullCircleRadius, type SpaceProfile } from './profile';
import { createSpaceFields, SPACE_FIELD_DEFAULTS, type SpaceField, type SpaceFieldSettings } from './fields';
import defaults from './config/world_defaults.json';
export { advanceSpaceWorld, type SpaceForceSampler, type SpaceAdvanceResult } from './physics/advanceWorld';

export interface SpaceStatic extends CircleObstacle { kind: 'station' | 'derelict' }
export interface SpaceAsteroid extends BodyState { id: string; kind: 'asteroid' }
export interface SpaceWorld {
  seed: number; density: number; width: number; height: number; spawnPoint: Vec2; finishPoint: Vec2;
  startClearance: number; statics: SpaceStatic[]; asteroids: SpaceAsteroid[]; time: number; tick: number;
  fields: readonly SpaceField[]; fieldShipRadii: Readonly<Record<'A' | 'B', number>>;
}
export interface SpaceWorldOptions { couplingLength?: number; asteroidMaxSpeed?: number; fields?: SpaceFieldSettings }
export const SPACE_WORLD_DEFAULTS = defaults;

export function createAsteroid(radius: number, position: Vec2, velocity: Vec2): BodyState {
  if (![radius, position.x, position.y, velocity.x, velocity.y].every(Number.isFinite) || radius <= 0) {
    throw new Error('Недопустимое состояние астероида');
  }
  const mass = 4 * Math.PI * radius ** 3 * defaults.asteroidDensity / 3;
  return { position: { ...position }, velocity: { ...velocity }, radius, mass, inertia: 2 * mass * radius ** 2 / 5,
    angle: 0, angularVelocity: 0 };
}
export function cloneSpaceWorld(world: SpaceWorld): SpaceWorld {
  return { ...world, spawnPoint: { ...world.spawnPoint }, finishPoint: { ...world.finishPoint },
    statics: world.statics.map(o => ({ ...o, position: { ...o.position } })),
    asteroids: world.asteroids.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })) };
}
// Старая арена служит только адаптером общей оболочки; семантика и динамика остаются в SpaceWorld.
export function spaceWorldArena(world: SpaceWorld): Arena {
  return { width: world.width, height: world.height, spawnPoint: { ...world.spawnPoint }, finishPoint: { ...world.finishPoint },
    walls: [], zones: [], orbs: [], obstacles: world.statics.map(o => ({ type: 'pillar', x: o.position.x,
      y: o.position.y, radius: o.radius, alive: true })) };
}
export function createSpaceWorld(profile: SpaceProfile, seed: number, density: number, options: SpaceWorldOptions = {}): SpaceWorld {
  const length = options.couplingLength ?? defaults.couplingLength;
  const maxSpeed = options.asteroidMaxSpeed ?? defaults.asteroidMaxSpeed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff || !Number.isFinite(density) || density < 0.1 || density > 25
    || !Number.isFinite(length) || length < 20 || length > 2000
    || !Number.isFinite(maxSpeed) || maxSpeed < 0 || maxSpeed > defaults.validatedAsteroidMaxSpeed
    || ![profile.radiusA, profile.radiusB].every(r => Number.isFinite(r) && r > 0)) throw new Error('Недопустимые параметры космического мира');
  const separation = profile.radiusA + profile.radiusB + length;
  const world: SpaceWorld = { seed, density, width: defaults.width, height: defaults.height,
    spawnPoint: { x: 0, y: defaults.height / 2 - separation - profile.radiusB - defaults.startMargin },
    finishPoint: { x: 0, y: -defaults.height / 2 + defaults.startMargin },
    startClearance: Math.max(defaults.startClearance, profile.radiusB + defaults.bodyClearance),
    statics: [], asteroids: [], time: 0, tick: 0, fields: [],
    fieldShipRadii: Object.freeze({ A: hullCircleRadius(profile.geometryA), B: hullCircleRadius(profile.geometryB) }) };
  world.fields = createSpaceFields(world, options.fields ?? SPACE_FIELD_DEFAULTS);
  const rng = new Rng(seed), placed: { position: Vec2; radius: number }[] = [];
  const low = world.spawnPoint.y - Math.max(defaults.startCorridor, length), high = world.spawnPoint.y + separation;
  const free = (position: Vec2, radius: number): boolean => {
    const closestY = Math.max(low, Math.min(high, position.y));
    return Math.abs(position.x) + radius <= world.width / 2 && Math.abs(position.y) + radius <= world.height / 2
      && Math.hypot(position.x, position.y - closestY) >= radius + world.startClearance
      && placed.every(o => Math.hypot(position.x - o.position.x, position.y - o.position.y) >= radius + o.radius + defaults.objectGap);
  };
  const place = (radius: number, nearStart: boolean): Vec2 | undefined => {
    for (let attempt = 0; attempt < defaults.maxPlacementAttempts; attempt++) {
      const position = nearStart && attempt < defaults.maxPlacementAttempts / 2
        ? { x: (rng.next() < 0.5 ? -1 : 1) * rng.range(world.startClearance + radius, Math.min(world.width / 2 - radius, world.startClearance + radius + 700)),
          y: world.spawnPoint.y - rng.range(200, 750) }
        : { x: rng.range(-world.width / 2 + radius, world.width / 2 - radius),
          y: rng.range(-world.height / 2 + radius, world.height / 2 - radius) };
      if (free(position, radius)) { placed.push({ position, radius }); return position; }
    }
    return undefined;
  };
  for (const kind of ['station', 'derelict'] as const) {
    const radius = kind === 'station' ? Math.hypot(defaults.stationLength, defaults.stationWidth) / 2
      : Math.hypot(defaults.derelictLength, defaults.derelictWidth) / 2;
    const count = Math.max(1, Math.round(density * (kind === 'station' ? defaults.stationsPerDensity : defaults.derelictsPerDensity)));
    for (let i = 0; i < count; i++) {
      const position = place(radius, i === 0);
      if (position) world.statics.push({ id: `${kind}:${i}`, kind, position, radius });
    }
  }
  for (let i = 0; i < Math.max(1, Math.round(density * defaults.asteroidsPerDensity)); i++) {
    const radius = rng.range(defaults.asteroidMinRadius, defaults.asteroidMaxRadius), position = place(radius, i < 6);
    if (!position) continue;
    const speed = rng.range(0, maxSpeed), angle = rng.range(0, 2 * Math.PI);
    world.asteroids.push({ id: `asteroid:${i}`, kind: 'asteroid', ...createAsteroid(radius, position,
      { x: speed * Math.cos(angle), y: speed * Math.sin(angle) }) });
  }
  return world;
}
