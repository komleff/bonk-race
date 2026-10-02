import type { InputFrame, StepResult, TugConfig, WorldState } from '../types';
import { driftBody, isValidBody } from './body';
import { validateConfig } from '../config/validate';
import { applyEngines } from './engines';
import { couplingGeometry, solveRod } from './coupling';
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
export function stepWorld(world: WorldState, input: InputFrame, config: TugConfig): StepResult {
  const validation = validateConfig(config);
  if (!validation.ok) return { world, contacts: [], stopReason: validation.errors.join('; ') };
  if (!validInput(input) || !validWorld(world)) return { world, contacts: [], stopReason: 'Недопустимое состояние или ввод' };
  const next: WorldState = { ...world, A: { ...world.A, position: { ...world.A.position }, velocity: { ...world.A.velocity } },
    B: { ...world.B, position: { ...world.B.position }, velocity: { ...world.B.velocity } },
    coupling: { ...world.coupling, lastNormal: { ...world.coupling.lastNormal } }, diagnostics: { ...world.diagnostics } };
  if (input.toggleFA) next.fa = !next.fa;
  const dt = 1 / config.tickRate / config.substeps;
  next.diagnostics.couplingImpulse = 0;
  for (let step = 0; step < config.substeps; step++) {
    applyEngines(next.A, input, next.fa, config, dt);
    next.coupling.accumulatedImpulse = 0;
    for (let iteration = 0; iteration < config.solverIterations; iteration++) {
      solveRod(next.A, next.B, next.coupling, dt, config);
    }
    next.diagnostics.couplingImpulse += next.coupling.accumulatedImpulse;
    driftBody(next.A, dt); driftBody(next.B, dt);
  }
  const geometry = couplingGeometry(next.A, next.B, next.coupling);
  next.coupling.length = geometry.distance;
  next.coupling.lastNormal = geometry.normal;
  next.diagnostics.rodError = next.coupling.connected && next.coupling.type === 'rod'
    ? Math.abs(geometry.distance - next.coupling.restLength) : 0;
  next.diagnostics.outsideSpeedRange = [next.A, next.B].some(b => Math.hypot(b.velocity.x, b.velocity.y) > config.maxValidatedSpeed);
  next.tick++; next.time = next.tick / config.tickRate;
  if (!validWorld(next)) return { world, contacts: [], stopReason: 'Численный расчёт не дал допустимого состояния' };
  return { world: next, contacts: [] };
}
