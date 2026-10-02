import type { InputFrame, StepResult, TugConfig, WorldState } from '../types';
import { validateConfig } from '../config/validate';
import { applyEngines } from './engines';
import { advancePair } from './advance';
function validInput(input: InputFrame): boolean {
  return [input.forward, input.lateral, input.yaw].every(v => Number.isFinite(v) && Math.abs(v) <= 1)
    && [input.brake, input.action, input.toggleFA].every(v => typeof v === 'boolean');
}
export function stepWorld(world: WorldState, input: InputFrame, config: TugConfig): StepResult {
  const validation = validateConfig(config);
  if (!validation.ok) return { world, contacts: [], stopReason: validation.errors.join('; ') };
  if (!validInput(input) || !Number.isFinite(world.time) || !Number.isInteger(world.tick)) {
    return { world, contacts: [], stopReason: 'Недопустимое состояние или ввод' };
  }
  const fa = input.toggleFA ? !world.fa : world.fa;
  const result = advancePair(world.A, world.B, world.coupling, 1 / config.tickRate, config, world.obstacles, undefined,
    (a, _b, dt) => applyEngines(a, input, fa, config, dt));
  if (result.stopReason) return { world, contacts: [], stopReason: result.stopReason };
  return { world: { ...world, A: result.A, B: result.B, coupling: result.coupling, diagnostics: result.diagnostics,
    fa, tick: world.tick + 1, time: (world.tick + 1) / config.tickRate }, contacts: result.contacts };
}
