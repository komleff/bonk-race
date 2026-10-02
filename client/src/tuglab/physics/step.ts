import type { InputFrame, StepResult, TugConfig, WorldState } from '../types';
import { driftBody, isValidBody } from './body';
import { validateConfig } from '../config/validate';
import { applyEngines } from './engines';
import { couplingGeometry, rodStepLimit, solveRod } from './coupling';
function validInput(input: InputFrame): boolean {
  return [input.forward, input.lateral, input.yaw].every(v => Number.isFinite(v) && Math.abs(v) <= 1)
    && [input.brake, input.action, input.toggleFA].every(v => typeof v === 'boolean');
}
function validWorld(world: WorldState): boolean {
  return isValidBody(world.A) && isValidBody(world.B) && Number.isFinite(world.time) && Number.isInteger(world.tick)
    && [world.coupling.restLength, world.coupling.minLength, world.coupling.maxLength,
      world.coupling.k, world.coupling.c, world.coupling.lastNormal.x, world.coupling.lastNormal.y].every(Number.isFinite)
    && world.coupling.restLength > 0;
}
function attemptStep(world: WorldState, input: InputFrame, config: TugConfig, substeps: number): WorldState | undefined {
  const next: WorldState = { ...world, A: { ...world.A, position: { ...world.A.position }, velocity: { ...world.A.velocity } },
    B: { ...world.B, position: { ...world.B.position }, velocity: { ...world.B.velocity } },
    coupling: { ...world.coupling, lastNormal: { ...world.coupling.lastNormal } }, diagnostics: { ...world.diagnostics } };
  if (input.toggleFA) next.fa = !next.fa;
  const dt = 1 / config.tickRate / substeps;
  next.diagnostics.couplingImpulse = 0;
  next.diagnostics.solverSubsteps = substeps;
  for (let step = 0; step < substeps; step++) {
    applyEngines(next.A, input, next.fa, config, dt);
    if (dt > rodStepLimit(next.A, next.B, next.coupling, config)) return undefined;
    next.coupling.accumulatedImpulse = 0;
    for (let iteration = 0; iteration < config.solverIterations; iteration++) {
      solveRod(next.A, next.B, next.coupling, dt, config);
    }
    next.diagnostics.couplingImpulse += next.coupling.accumulatedImpulse;
    driftBody(next.A, dt); driftBody(next.B, dt);
    if (!validWorld(next)) return undefined;
    const geometry = couplingGeometry(next.A, next.B, next.coupling);
    next.coupling.length = geometry.distance;
    next.coupling.lastNormal = geometry.normal;
    next.diagnostics.rodError = next.coupling.connected && next.coupling.type === 'rod'
      ? Math.abs(geometry.distance - next.coupling.restLength) : 0;
    // Не принимаем даже промежуточный подшаг с нарушением допуска длины.
    if (next.diagnostics.rodError > config.rodRelativeTolerance * next.coupling.restLength) return undefined;
  }
  next.diagnostics.outsideSpeedRange = [next.A, next.B].some(b => Math.hypot(b.velocity.x, b.velocity.y) > config.maxValidatedSpeed);
  next.tick++; next.time = next.tick / config.tickRate;
  return next;
}
export function stepWorld(world: WorldState, input: InputFrame, config: TugConfig): StepResult {
  const validation = validateConfig(config);
  if (!validation.ok) return { world, contacts: [], stopReason: validation.errors.join('; ') };
  if (!validInput(input) || !validWorld(world)) return { world, contacts: [], stopReason: 'Недопустимое состояние или ввод' };
  // Повторяем весь тик от исходного состояния, не оставляя импульсов неудачной попытки.
  for (let substeps = config.substeps; substeps <= config.maxAdaptiveSubsteps; substeps *= 2) {
    const next = attemptStep(world, input, config, substeps);
    if (next) return { world: next, contacts: [] };
  }
  return { world, contacts: [], stopReason: 'Исчерпан численный бюджет: допустимое состояние сцепки не достигнуто' };
}
