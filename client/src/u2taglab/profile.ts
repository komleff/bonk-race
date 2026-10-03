import type { BodyState } from '../tuglab/types';
import type { TowingProfile } from '../tuglab/labTowing';

export interface HullGeometry { length: number; width: number }
export interface SpaceProfile {
  geometryA: HullGeometry; geometryB: HullGeometry;
  massA: number; massB: number; radiusA: number; radiusB: number;
  forwardForce: number; reverseForce: number; lateralForce: number; yawTorque: number;
  speedLimit: number; crewGLimit: number; coastDeadzone: number;
  comfortableBrakingTime: number; emergencyBrakingTime: number; lateralComfort: number;
  yawLimit: number; yawStopTime: number; enginesEnabled: boolean;
  source: Readonly<Record<string, string>>;
}

export const SPACE_SOURCE = {
  snapshot: 'U2 0fe06927ab496918b3547f43412134c100a6e0b4 (локальный снимок)',
  geometry: 'Размерная сетка v1.2: Титан M 60×27 м; Караван L 108×48 м.',
  mass: 'Force grid v0.1-r13: A оболочка 140000 + двигательный пакет 160000 кг, неполная сборка; B голая оболочка 680000 кг.',
  force: 'Neutral Industrial M: 16228800 / 6955200 / 4173120 Н. Без незамкнутого национального множителя.',
  inertia: 'U2: I=m(L²+W²)/12; круг R=(L²+W²)/(2(L+W)) — лабораторное допущение.',
  yaw: 'Размерная M-кривая: 24°/с; расчётная alpha 24°/с². Момент от сухой массы A, без роста при изменении массы.',
  fa: 'Лабораторная адаптация: один V_FA=250 м/с, crew-g=4.5. Coast 1.5 м/с, comfort 3.5 с, emergency 0.2 с, lateral 20 м/с², yaw stop 1 с — опора U2 Стриж.',
  coupling: 'LAB-калибровка для A300 т/B680 т: общая рекомендуемая начальная длина 288 м для троса, штанги и пружины; допустимо 20–2000 м. Только пружина: f=0.20 Гц, ζ=1; k=μ(2πf)²=328718.253 Н/м, c=2ζ√(kμ). При изменении массы k сохраняется, c пересчитывается по текущей μ; длина сама не меняет k/c/f. Рекомендация не гарантирует безопасность любых манёвров или препятствий.',
} as const;
export const hullInertia = (mass: number, geometry: HullGeometry): number => mass * (geometry.length ** 2 + geometry.width ** 2) / 12;
export const hullCircleRadius = (geometry: HullGeometry): number => (geometry.length ** 2 + geometry.width ** 2) / (2 * (geometry.length + geometry.width));
export function createSpaceProfile(): SpaceProfile {
  const geometryA = { length: 60, width: 27 }, geometryB = { length: 108, width: 48 };
  return { geometryA, geometryB, massA: 300000, massB: 680000,
    radiusA: hullCircleRadius(geometryA), radiusB: hullCircleRadius(geometryB),
    forwardForce: 16228800, reverseForce: 6955200, lateralForce: 4173120,
    yawTorque: 45333181.99130072, speedLimit: 250, crewGLimit: 4.5, coastDeadzone: 1.5,
    comfortableBrakingTime: 3.5, emergencyBrakingTime: 0.2, lateralComfort: 20,
    yawLimit: 24 * Math.PI / 180, yawStopTime: 1, enginesEnabled: true, source: SPACE_SOURCE };
}
export function createSpaceBody(profile: SpaceProfile, id: 'A' | 'B', radius?: number): BodyState {
  const mass = id === 'A' ? profile.massA : profile.massB, geometry = id === 'A' ? profile.geometryA : profile.geometryB;
  return { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, angle: 0, angularVelocity: 0,
    mass, radius: radius ?? (id === 'A' ? profile.radiusA : profile.radiusB), inertia: hullInertia(mass, geometry) };
}
export const SPACE_RANGES: Record<string, readonly [number, number]> = {
  mass: [10000, 1e7], 'space.forwardForce': [0, 1e8], 'space.reverseForce': [0, 1e8],
  'space.lateralForce': [0, 1e8], 'space.yawTorque': [0, 1e9], 'space.speedLimit': [1, 1000],
  'space.crewGLimit': [0.1, 20], 'space.coastDeadzone': [0, 10], 'space.comfortableBrakingTime': [0.01, 30],
  'space.emergencyBrakingTime': [0.01, 10], 'space.lateralComfort': [0, 100],
  'space.yawLimit': [0.01, Math.PI], 'space.yawStopTime': [0.01, 10],
  'tow.massRatio': [0.1, 10], 'tow.radiusB': [2, 250], 'tow.length': [20, 2000],
  'tow.stiffness': [0, 1e8], 'tow.dampingRatio': [0, 1.5],
};
export function spaceParams(profile: SpaceProfile): Record<string, number | boolean | string> {
  return { mass: profile.massA, 'space.fa': true, 'space.enginesEnabled': profile.enginesEnabled,
    ...Object.fromEntries(Object.keys(SPACE_RANGES).filter(k => k.startsWith('space.')).map(k =>
      [k, profile[k.slice(6) as keyof SpaceProfile] as number])) };
}
export function spaceTowingProfile(profile: SpaceProfile): TowingProfile {
  const reducedMass = profile.massA * profile.massB / (profile.massA + profile.massB);
  return { defaults: { 'tow.massRatio': profile.massB / profile.massA, 'tow.radiusB': profile.radiusB,
    'tow.length': 288, 'tow.type': 'spring', 'tow.stiffness': reducedMass * (2 * Math.PI * 0.20) ** 2, 'tow.dampingRatio': 1 },
    ranges: SPACE_RANGES, inertiaB: mass => hullInertia(mass, profile.geometryB), reducedMass: true,
    ropeMinLength: 20, captureMinLength: 2, clearCoupling: true, spawnSearch: { depth: 2500, step: 100, lateral: 2500 },
    maxValidatedSpeed: 1000 };
}
