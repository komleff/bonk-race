import { PARAM_GROUPS, TOW_GROUP } from '../lab/ui/paramDefs';
import { PRESETS } from '../lab/ui/presets';

export type LabParams = Record<string, number | boolean | string>;
export const SHARE_SCHEMA = 1;
// Менять маркер при изменении алгоритма генерации или его исходных настроек.
export const SHARE_GENERATOR = 'bonklab-arena-v1';
const MAX_FRAGMENT_LENGTH = 16000;
const MAX_JSON_LENGTH = 12000;
export interface ShareSnapshot {
  schema: typeof SHARE_SCHEMA;
  generator: typeof SHARE_GENERATOR;
  seed: number;
  density: number;
  orbDensityManual: boolean;
  params: LabParams;
}
const hiddenRanges: Record<string, readonly [number, number]> = {
  'geometry.baseMassKg': [10, 1000], 'assist.yawCmdEps': [0, 1],
  'assist.angularDeadzoneRad': [0, Math.PI], 'assist.yawRateGain': [0, 100],
  'massScaling.speedLimitReverseMps.exp': [0, 1],
  'massScaling.speedLimitLateralMps.exp': [0, 1],
  'massScaling.angularSpeedLimitRadps.exp': [0, 1],
  'arena.objectDensity': [0.1, 25],
  // Автоматическая плотность при массе 1000 и радиусе 3 превышает диапазон слайдера.
  'orbs.density': [0.001, 1000 / (Math.PI * 3 * 3)],
};
const integerKeys = new Set(['orbs.count', 'assist.yawOscillationWindowFrames', 'assist.yawOscillationSignFlipsThreshold']);
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every(key => keys.includes(key)
    && !key.split('.').some(part => ['__proto__', 'constructor', 'prototype'].includes(part)));
}
function fail(detail: string): never { throw new Error(`Ссылка TugLab: ${detail}`); }

/** Полная проверка до любых изменений симуляции; возвращаем независимую копию. */
export function validateShareSnapshot(value: unknown, defaults: LabParams): ShareSnapshot {
  if (!record(value) || !exactKeys(value, ['schema', 'generator', 'seed', 'density', 'orbDensityManual', 'params'])) fail('повреждённый формат');
  if (value.schema !== SHARE_SCHEMA) fail('неподдерживаемая версия');
  if (value.generator !== SHARE_GENERATOR) fail('несовместимый генератор карты');
  if (typeof value.seed !== 'number' || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 4294967295) fail('недопустимый seed');
  if (typeof value.density !== 'number' || !Number.isFinite(value.density) || value.density < 0.1 || value.density > 25) fail('недопустимая плотность');
  if (typeof value.orbDensityManual !== 'boolean') fail('недопустимое состояние плотности орбов');
  if (!record(value.params) || !exactKeys(value.params, Object.keys(defaults))) fail('неполный или неизвестный набор параметров');
  const definitions = [...PARAM_GROUPS, TOW_GROUP].flatMap(group => group.params);
  const params: LabParams = {};
  for (const [key, initial] of Object.entries(defaults)) {
    const current = value.params[key];
    if (typeof current !== typeof initial) fail(`${key}: неверный тип`);
    const def = definitions.find(item => item.key === key);
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) fail(`${key}: требуется конечное число`);
      const hidden = hiddenRanges[key];
      if (!hidden && (!def || def.min === undefined || def.max === undefined)) fail(`${key}: нет диапазона схемы`);
      let [min, max] = hidden ?? [def!.min!, def!.max!];
      // Штатные пресеты и базовые значения должны воспроизводиться без округления/clamp.
      for (const candidate of [initial, ...PRESETS.map(preset => preset.values[key])]) {
        if (typeof candidate === 'number') { min = Math.min(min, candidate); max = Math.max(max, candidate); }
      }
      if (current < min || current > max || (integerKeys.has(key) && !Number.isInteger(current))) fail(`${key}: вне допустимого диапазона`);
    } else if (typeof current === 'string') {
      if (def?.isColor ? !/^#[0-9a-fA-F]{6}$/.test(current)
        : !def?.options?.some(option => option.value === current)) fail(`${key}: недопустимое значение`);
    }
    params[key] = current as number | boolean | string;
  }
  if (params['arena.objectDensity'] !== value.density) fail('плотность генератора не соответствует параметрам');
  if (Number(params['orbs.minRadius']) > Number(params['orbs.maxRadius'])
    || Number(params['orbs.minSpeed']) > Number(params['orbs.maxSpeed'])) fail('неверный интервал орбов');
  return { schema: SHARE_SCHEMA, generator: SHARE_GENERATOR, seed: value.seed, density: value.density,
    orbDensityManual: value.orbDensityManual, params };
}
export function encodeShareFragment(snapshot: ShareSnapshot): string {
  const json = JSON.stringify(snapshot);
  if (json.length > MAX_JSON_LENGTH) fail('слишком большой снимок');
  const bytes = new TextEncoder().encode(json);
  const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (encoded.length + 5 > MAX_FRAGMENT_LENGTH) fail('слишком длинная ссылка');
  return `#tug=${encoded}`;
}
export function decodeShareFragment(fragment: string, defaults: LabParams): ShareSnapshot {
  if (fragment.length > MAX_FRAGMENT_LENGTH) fail('слишком длинная ссылка');
  if (!/^#tug=[A-Za-z0-9_-]+$/.test(fragment)) fail('повреждённая ссылка');
  try {
    const encoded = fragment.slice(5);
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    if (binary.length > MAX_JSON_LENGTH) fail('слишком большой снимок');
    const json = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
    return validateShareSnapshot(JSON.parse(json), defaults);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Ссылка TugLab:')) throw error;
    return fail('повреждённый или усечённый снимок');
  }
}
export function createShareUrl(shellUrl: string, snapshot: ShareSnapshot): string {
  const url = new URL(shellUrl);
  url.hash = encodeShareFragment(snapshot);
  return url.href;
}
