import { createSpaceProfile, SPACE_RANGES, spaceParams, spaceTowingProfile, SPRING_MODULES, hullCircleRadius, type HullGeometry, type SpaceProfile } from './profile';
import { SPACE_WORLD_DEFAULTS } from './world';
import { SPACE_FIELD_DEFAULTS, type SpaceFieldSettings } from './fields';

export type SpaceParams = Record<string, number | boolean | string>;
export interface SpaceWorldRecipe {
  radiusB: number; couplingLength: number; asteroidMaxSpeed: number; fields: SpaceFieldSettings;
}
export const SPACE_SHARE_SCHEMA = 2;
export const SPACE_SHARE_MODEL = 'u2-space-circles-fixed-v3';
export const LEGACY_SPACE_SHARE_MODEL = 'u2-space-circles-disk-v2';
// Версия включает геометрию объектов, движения, поля и правила резервирования старта.
export const SPACE_SHARE_GENERATOR = 'u2-space-world-area-catalog-v3';
const MAX_FRAGMENT_LENGTH = 16000, MAX_JSON_LENGTH = 12000;
export interface SpaceShareSnapshot {
  schema: 1 | typeof SPACE_SHARE_SCHEMA; model: typeof LEGACY_SPACE_SHARE_MODEL | typeof SPACE_SHARE_MODEL; geometry?: { A: HullGeometry; B: HullGeometry }; generator: typeof SPACE_SHARE_GENERATOR;
  seed: number; density: number; params: SpaceParams; world: SpaceWorldRecipe;
}
export const SPACE_SHARE_DEFAULTS: SpaceParams = {
  ...spaceParams(createSpaceProfile()), ...spaceTowingProfile(createSpaceProfile()).defaults,
  'arena.objectDensity': 5, 'space.asteroidMaxSpeed': SPACE_WORLD_DEFAULTS.asteroidMaxSpeed,
  'space.collisionRestitution': SPACE_WORLD_DEFAULTS.restitution,
  'space.fieldsEnabled': SPACE_FIELD_DEFAULTS.fieldsEnabled, 'space.fieldPressure': SPACE_FIELD_DEFAULTS.fieldPressure,
  'space.resistiveK': SPACE_FIELD_DEFAULTS.resistiveK,
  'trail.enabled': true, 'trail.maxAge': 1, 'trail.baseAlpha': 0.6, 'trail.pattern': 'drift',
  'trail.primaryColor': '#44aaff', 'trail.driftColor': '#ffff00', 'trail.rainbowPeriodSec': 2,
};
export const LEGACY_SPACE_SHARE_KEYS = Object.keys(SPACE_SHARE_DEFAULTS).filter(key => !['tow.dampingMode', 'tow.dampingCoefficient', 'tow.module'].includes(key));
const ranges: Record<string, readonly [number, number]> = {
  ...SPACE_RANGES, 'arena.objectDensity': [0.1, 25],
  'space.asteroidMaxSpeed': [0, SPACE_WORLD_DEFAULTS.validatedAsteroidMaxSpeed], 'space.collisionRestitution': [0, 1],
  'space.fieldPressure': [0, SPACE_FIELD_DEFAULTS.maxPressure], 'space.resistiveK': [0, SPACE_FIELD_DEFAULTS.maxResistiveK],
  'trail.maxAge': [0.1, 5], 'trail.baseAlpha': [0.1, 1], 'trail.rainbowPeriodSec': [0.5, 10],
};
function fail(detail: string): never { throw new Error(`Ссылка U2TagLab: ${detail}`); }
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key)
    && !key.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part)));
}
function numeric(value: unknown, min: number, max: number, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${key}: вне допустимого диапазона`);
  return value;
}
export function spaceProfileFromParams(params: SpaceParams, geometry?: { A: HullGeometry; B: HullGeometry }): SpaceProfile {
  const profile = createSpaceProfile();
  if (geometry) { profile.geometryA = { ...geometry.A }; profile.geometryB = { ...geometry.B };
    profile.radiusA = hullCircleRadius(profile.geometryA); profile.radiusB = hullCircleRadius(profile.geometryB); }
  for (const key of Object.keys(SPACE_RANGES).filter(key => key.startsWith('space.'))) {
    (profile as unknown as Record<string, unknown>)[key.slice(6)] = params[key];
  }
  profile.massA = Number(params.mass); profile.massB = profile.massA * Number(params['tow.massRatio']);
  profile.enginesEnabled = Boolean(params['space.enginesEnabled']);
  return profile;
}
/** Проверяем весь контракт без доступа к изменяемому миру; результат не содержит ссылок на вход. */
export function validateSpaceShareSnapshot(value: unknown): SpaceShareSnapshot {
  const legacy = !!value && typeof value === 'object' && (value as Record<string, unknown>).schema === 1;
  if (!exact(value, ['schema', 'model', 'generator', 'seed', 'density', 'params', 'world', ...(legacy ? [] : ['geometry'])])) fail('повреждённый формат');
  if (value.schema !== (legacy ? 1 : SPACE_SHARE_SCHEMA)) fail('неподдерживаемая версия');
  if (value.model !== (legacy ? LEGACY_SPACE_SHARE_MODEL : SPACE_SHARE_MODEL)) fail('несовместимая физическая модель');
  let geometry: SpaceShareSnapshot['geometry'];
  if (!legacy) {
    if (!exact(value.geometry, ['A', 'B'])) fail('неполная геометрия');
    const hull = (entry: unknown): HullGeometry => {
      if (!exact(entry, ['length', 'width'])) fail('повреждённая геометрия корпуса');
      return { length: numeric(entry.length, 1, 2000, 'length'), width: numeric(entry.width, 1, 2000, 'width') };
    };
    geometry = { A: hull(value.geometry.A), B: hull(value.geometry.B) };
    // Поддерживаем только два проверенных профиля; произвольного редактора геометрии нет.
    if (geometry.A.length !== 60 || geometry.A.width !== 27
      || !((geometry.B.length === 120 && geometry.B.width === 54) || (geometry.B.length === 108 && geometry.B.width === 48))) fail('неподдерживаемая геометрия');
  }
  if (value.generator !== SPACE_SHARE_GENERATOR) fail('несовместимый генератор мира');
  const seed = numeric(value.seed, 0, 0xffffffff, 'seed'); if (!Number.isInteger(seed)) fail('seed должен быть целым');
  const density = numeric(value.density, 0.1, 25, 'density');
  const keys = legacy ? LEGACY_SPACE_SHARE_KEYS : Object.keys(SPACE_SHARE_DEFAULTS);
  if (!exact(value.params, keys)) fail('неполный или неизвестный набор параметров');
  const params: SpaceParams = {};
  for (const key of keys) {
    const initial = SPACE_SHARE_DEFAULTS[key];
    const current = value.params[key];
    if (typeof current !== typeof initial) fail(`${key}: неверный тип`);
    if (typeof current === 'number') {
      const range = ranges[key]; if (!range) fail(`${key}: нет диапазона схемы`);
      numeric(current, range[0], range[1], key);
    } else if (typeof current === 'string') {
      const valid = key === 'tow.module' ? ['S', 'M', 'L', 'XL', 'custom'].includes(current)
        : key === 'tow.dampingMode' ? ['fixed', 'legacy'].includes(current)
        : key === 'tow.type' ? ['rod', 'rope', 'spring'].includes(current)
        : key === 'trail.pattern' ? ['off', 'drift', 'rainbow'].includes(current) : /^#[0-9a-fA-F]{6}$/.test(current);
      if (!valid) fail(`${key}: недопустимое значение`);
    }
    params[key] = current as number | boolean | string;
  }
  if (!legacy && params['tow.module'] !== 'custom') {
    const module = SPRING_MODULES[params['tow.module'] as keyof typeof SPRING_MODULES];
    if (params['tow.dampingMode'] !== 'fixed' || params['tow.stiffness'] !== module.k || params['tow.dampingCoefficient'] !== module.c) fail('коэффициенты не соответствуют модулю');
  }
  if (params['arena.objectDensity'] !== density) fail('плотность генератора не соответствует параметрам');
  if (!exact(value.world, ['radiusB', 'couplingLength', 'asteroidMaxSpeed', 'fields'])
    || !exact(value.world.fields, ['fieldsEnabled', 'fieldPressure', 'resistiveK'])) fail('неполная конфигурация исходного мира');
  const fields = value.world.fields;
  if (typeof fields.fieldsEnabled !== 'boolean') fail('fieldsEnabled: неверный тип');
  const world: SpaceWorldRecipe = {
    radiusB: numeric(value.world.radiusB, 2, 250, 'world.radiusB'),
    couplingLength: numeric(value.world.couplingLength, 20, 2000, 'world.couplingLength'),
    asteroidMaxSpeed: numeric(value.world.asteroidMaxSpeed, 0, SPACE_WORLD_DEFAULTS.validatedAsteroidMaxSpeed, 'world.asteroidMaxSpeed'),
    fields: { fieldsEnabled: fields.fieldsEnabled,
      fieldPressure: numeric(fields.fieldPressure, 0, SPACE_FIELD_DEFAULTS.maxPressure, 'world.fieldPressure'),
      resistiveK: numeric(fields.resistiveK, 0, SPACE_FIELD_DEFAULTS.maxResistiveK, 'world.resistiveK') },
  };
  if (world.asteroidMaxSpeed !== params['space.asteroidMaxSpeed']
    || Object.entries(world.fields).some(([key, current]) => current !== params[`space.${key}`])) fail('настройки движений или полей не соответствуют исходному миру');
  // Живые radiusB/length намеренно отделены от входов исходного генератора.
  return { schema: legacy ? 1 : SPACE_SHARE_SCHEMA, model: legacy ? LEGACY_SPACE_SHARE_MODEL : SPACE_SHARE_MODEL, ...(geometry ? { geometry } : {}), generator: SPACE_SHARE_GENERATOR, seed, density, params, world };
}
export function encodeSpaceShareFragment(snapshot: SpaceShareSnapshot): string {
  const json = JSON.stringify(validateSpaceShareSnapshot(snapshot));
  if (json.length > MAX_JSON_LENGTH) fail('слишком большой снимок');
  const bytes = new TextEncoder().encode(json);
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (encoded.length + 7 > MAX_FRAGMENT_LENGTH) fail('слишком длинная ссылка');
  return `#u2tag=${encoded}`;
}
export function decodeSpaceShareFragment(fragment: string): SpaceShareSnapshot {
  if (fragment.length > MAX_FRAGMENT_LENGTH) fail('слишком длинная ссылка');
  if (!/^#u2tag=[A-Za-z0-9_-]+$/.test(fragment)) fail('повреждённая или несовместимая ссылка');
  try {
    const binary = atob(fragment.slice(7).replace(/-/g, '+').replace(/_/g, '/'));
    if (binary.length > MAX_JSON_LENGTH) fail('слишком большой снимок');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    return validateSpaceShareSnapshot(JSON.parse(json));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Ссылка U2TagLab:')) throw error;
    return fail('повреждённый или усечённый снимок');
  }
}
export function createSpaceShareUrl(shellUrl: string, snapshot: SpaceShareSnapshot): string {
  const url = new URL(shellUrl); url.hash = encodeSpaceShareFragment(snapshot); return url.href;
}
