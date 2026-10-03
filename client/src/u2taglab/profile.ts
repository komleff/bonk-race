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
  snapshot: 'U2 252d17f7423a7805e732e499cd8e754e21f3b323; релевантные файлы совпадают с локальным 0fe06927.',
  geometry: 'Industrial: Титан M 60×27 м; оснащённый L 120×54 м. Старые ссылки сохраняют Караван 108×48 м.',
  mass: 'Инженерный Industrial reference, не полный production/тепловой расчёт: S оболочка35000 + двигательный пакет40000 + аккумулятор8000 + дизель2350 + бак300 + сканер600 + радар800 + CivilG0 радиатор750 =87800 кг. LAB оценки встроенного трюма9000 и служебных систем500 дают обычную сухую97300; модуль пружины3000 даёт буксир100300. ×4 на размер: A M401200 кг, B оснащённый L1556800 кг без буксировочного модуля, двигатели OFF. Груз не добавлен. Топливо отдельно S6000/M24000/L96000/XL384000 кг; A M с полным баком425200. Swappable S12SCU8.945 т из нового cargo GDD не равен встроенному трюму: его масса неизвестна,9 т — собственная консервативная оценка. Старый CSV12SCU1.2 т устарел.',
  force: 'Neutral Industrial M: 16228800 / 6955200 / 4173120 Н. Без незамкнутого национального множителя.',
  inertia: 'U2: I=m(L²+W²)/12; круг R=(L²+W²)/(2(L+W)) — лабораторное допущение.',
  yaw: 'Размерная M-кривая: предел24°/с. Сохранённый LAB момент45.333 МН·м: при оснащённом A401200 кг/I144732900 кг·м² alpha≈17.946°/с² (прежние24°/с² относились к неполным300 т). Момент не растёт при изменении массы.',
  fa: 'Лабораторная адаптация: один V_FA=250 м/с, crew-g=4.5. Coast 1.5 м/с, comfort 3.5 с, emergency 0.2 с, lateral 20 м/с², yaw stop 1 с — опора U2 Стриж.',
  coupling: 'Фиксированные физические модули S k240000/c290000, M360000/710000, L540000/1740000, XL810000/4260000 (Н/м и Н·с/м). Модуль обозначает размер буксира S/M/L/XL, не переключает корабли. Рекомендации длины для груза −1/своего/+1 размера: S90/120/180, M180/240/360, L360/480/720, XL720/960/1440 м. Расчёт по верхнему Industrial размеру с полными баками: steady extension≈10% максимальной рекомендованной длины, c немного выше2√(kμmax). XXL только резерв. Это инженерная опора, не рейтинг безопасной массы произвольного груза/корабля и не гарантия прочности материала. Выбор модуля меняет только k/c, сохраняя корабли, заданную и фактическую длину захвата. c фиксирован при изменениях массы, радиуса и длины. Старый автоматический режим ζ пересчитывает c=2ζ√(kμ).',
} as const;
export const hullInertia = (mass: number, geometry: HullGeometry): number => mass * (geometry.length ** 2 + geometry.width ** 2) / 12;
export const hullCircleRadius = (geometry: HullGeometry): number => (geometry.length ** 2 + geometry.width ** 2) / (2 * (geometry.length + geometry.width));
export function createSpaceProfile(): SpaceProfile {
  const geometryA = { length: 60, width: 27 }, geometryB = { length: 120, width: 54 };
  return { geometryA, geometryB, massA: 401200, massB: 1556800,
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
  'tow.stiffness': [0, 1e8], 'tow.dampingRatio': [0, 1.5], 'tow.dampingCoefficient': [0, 1e8],
};
export function spaceParams(profile: SpaceProfile): Record<string, number | boolean | string> {
  return { mass: profile.massA, 'space.fa': true, 'space.enginesEnabled': profile.enginesEnabled,
    ...Object.fromEntries(Object.keys(SPACE_RANGES).filter(k => k.startsWith('space.')).map(k =>
      [k, profile[k.slice(6) as keyof SpaceProfile] as number])) };
}
export const SPRING_MODULES = { S: { k: 240000, c: 290000 }, M: { k: 360000, c: 710000 },
  L: { k: 540000, c: 1740000 }, XL: { k: 810000, c: 4260000 } } as const;
export function spaceTowingProfile(profile: SpaceProfile): TowingProfile {
  return { defaults: { 'tow.massRatio': profile.massB / profile.massA, 'tow.radiusB': profile.radiusB,
    'tow.length': 360, 'tow.type': 'spring', 'tow.stiffness': 360000, 'tow.dampingRatio': 1,
    'tow.dampingMode': 'fixed', 'tow.dampingCoefficient': 710000, 'tow.module': 'M' },
    springModules: SPRING_MODULES, ranges: SPACE_RANGES, inertiaB: mass => hullInertia(mass, profile.geometryB), reducedMass: true,
    ropeMinLength: 20, captureMinLength: 2, clearCoupling: true, spawnSearch: { depth: 2500, step: 100, lateral: 2500 },
    maxValidatedSpeed: 1000 };
}
