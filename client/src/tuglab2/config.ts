import defaults from '../tuglab/config/tuglab_defaults.json';
import type { TugConfig } from '../tuglab/types';
import { createSpaceProfile, fittedTug, HULL_CATALOG, hullCircleRadius, type HullSize, type SpaceProfile, type TUG_SIZES } from '../u2taglab/profile';
import { SPRING_MODULES } from '../u2taglab/profile';
import type { TrainConfig, TrainModule, TrainShipConfig, TrainLinkConfig, TrainBodyId } from './types';

export function fitTrainShip(size: HullSize, passive = false): TrainShipConfig {
  const base = createSpaceProfile(), hull = HULL_CATALOG[size];
  const tug = passive ? undefined : fittedTug(size as typeof TUG_SIZES[number]);
  if (!passive && !['S', 'M', 'L', 'XL'].includes(size)) throw new Error('Недопустимый размер тягача');
  const { geometryA: _ga, geometryB: _gb, massA: _ma, massB: _mb, radiusA: _ra, radiusB: _rb, ...fa } = base;
  const speedLimit = tug?.speedLimit ?? base.speedLimit;
  return { ...fa, size, geometry: { length: hull.length, width: hull.width }, mass: tug?.mass ?? hull.mass,
    forwardForce: tug?.forwardForce ?? 0, reverseForce: tug?.reverseForce ?? 0,
    lateralForce: tug?.lateralForce ?? 0, yawTorque: tug?.yawTorque ?? 0,
    yawLimit: tug?.yawLimit ?? base.yawLimit, speedLimit,
    speedLimits: { forward: speedLimit, reverse: speedLimit, lateral: speedLimit }, enginesEnabled: !passive };
}
export function fitTrainLink(module: Exclude<TrainModule, 'custom'>, restLength?: number): TrainLinkConfig {
  const limits = { S: 180, M: 360, L: 720, XL: 1440 };
  return { module, restLength: restLength ?? limits[module], ...SPRING_MODULES[module], captureMaxLength: limits[module] };
}
export function cloneTrainConfig(config: TrainConfig): TrainConfig { return structuredClone(config); }
export function createDefaultTrainConfig(): TrainConfig {
  const ships = { A: fitTrainShip('M'), B: fitTrainShip('L', true), C: fitTrainShip('M') };
  return { composition: 'train', ships, links: { AB: fitTrainLink('M'), BC: fitTrainLink('M') },
    numerics: { ...defaults as TugConfig, maxValidatedSpeed: 1000, springMaxStep: .1, substeps: 4, maxAdaptiveSubsteps: 512, solverIterations: 16 },
    world: { seed: 1, density: .1, width: 20000, height: 20000, spawnPoint: { x: 600, y: 0 }, finishPoint: { x: 9000, y: 0 },
      startClearance: 200, statics: [], asteroids: [], time: 0, tick: 0, fields: [],
      fieldShipRadii: { A: hullCircleRadius(ships.A.geometry), B: hullCircleRadius(ships.B.geometry) } } };
}
export const DEFAULT_TRAIN_CONFIG = createDefaultTrainConfig();
export function trainSpaceProfile(config: TrainConfig, id: TrainBodyId): SpaceProfile {
  const p = config.ships[id], cargo = config.ships.B;
  return { ...p, geometryA: { ...p.geometry }, geometryB: { ...cargo.geometry }, massA: p.mass, massB: cargo.mass,
    radiusA: hullCircleRadius(p.geometry), radiusB: hullCircleRadius(cargo.geometry) };
}
