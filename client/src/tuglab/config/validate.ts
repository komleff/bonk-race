import defaults from './tuglab_defaults.json';
import type { TugConfig, ValidationResult } from '../types';
export const defaultConfig: Readonly<TugConfig> = Object.freeze(defaults as TugConfig);
export const configRanges = {
  massRatio: [0.1, 10], radiusB: [2, 12], forwardForce: [0, 400000], reverseForce: [0, 200000],
  lateralForce: [0, 160000], yawTorque: [0, 300000], length: [4, 24], springFrequency: [0.2, 3], springStiffness: [0, 2000000],
  springDamping: [0, 1.5], springMinRatio: [0, 0.9], springMaxRatio: [1.1, 2], restitution: [0, 1],
  maxObstacles: [0, 30], stickDeadzone: [0, 0.9], stickRadius: [48, 140], seed: [0, 4294967295],
} as const;
export function validateConfig(value: unknown): ValidationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, errors: ['Ожидается объект настроек'] };
  const candidate = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, initial] of Object.entries(defaultConfig)) {
    const current = candidate[key];
    if (typeof current !== typeof initial || (typeof current === 'number' && !Number.isFinite(current))) {
      errors.push(`${key}: недопустимый тип или нечисловое значение`);
    }
  }
  for (const [key, [min, max]] of Object.entries(configRanges)) {
    const current = candidate[key];
    if (typeof current === 'number' && (current < min || current > max)) errors.push(`${key}: допустимо ${min}–${max}`);
  }
  for (const key of ['massA', 'radiusA', 'inertiaFactor', 'springReferenceMass', 'yawLimit', 'yawDampingTime',
    'lateralComfort', 'maxPositionBias', 'rodRelativeTolerance', 'rodMaxSweep', 'maxAdaptiveSubsteps', 'maxContactEvents', 'springMaxStep', 'normalEpsilon', 'maxValidatedSpeed', 'captureMinLength', 'captureMaxLength',
    'captureMaxSpeed', 'baySpeed', 'bayAngularSpeed', 'bayHoldTime'] as const) {
    if (candidate[key] !== defaultConfig[key]) errors.push(`${key}: фиксировано ${defaultConfig[key]}`);
  }
  for (const [key, allowed] of Object.entries({ tickRate: [30, 60], substeps: [1, 2, 4, 8], solverIterations: [4, 8, 12],
    couplingType: ['rod', 'rope', 'spring'], attachmentA: ['nose', 'tail'], attachmentB: ['nose', 'tail'] })) {
    if (!(allowed as readonly unknown[]).includes(candidate[key])) errors.push(`${key}: недопустимое значение`);
  }
  for (const key of ['seed', 'maxObstacles']) if (!Number.isInteger(candidate[key])) errors.push(`${key}: требуется целое число`);
  if (typeof candidate.scene === 'string' && !candidate.scene.trim()) errors.push('scene: требуется название сцены');
  return errors.length ? { ok: false, errors } : { ok: true, config: { ...candidate } as unknown as TugConfig };
}
