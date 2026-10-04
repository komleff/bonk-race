import type { BodyState, CouplingState, TugConfig } from '../types';
import { isValidBody } from './body';
import { couplingGeometry, solveCoupling } from './coupling';

interface CoupledAdvanceAdapter<Contact extends { time: number }> {
  findContact: (a: BodyState, b: BodyState, dt: number) => Contact | undefined;
  advanceBodies: (dt: number) => void;
  resolveContact: (contact: Contact) => void;
}
const cloneBody = (body: BodyState): BodyState => ({ ...body, position: { ...body.position }, velocity: { ...body.velocity } });

// Вызывающий код владеет копиями всей транзакции; здесь согласуются сцепка и время контактов.
export function advanceCoupledInterval<Contact extends { time: number }>(A: BodyState, B: BodyState,
  coupling: CouplingState, dt: number, config: TugConfig, adapter: CoupledAdvanceAdapter<Contact>): boolean {
  let remaining = dt, events = 0;
  // Нулевой остаток всё ещё допускает одновременные контакты в конце интервала.
  while (true) {
    const rawHit = adapter.findContact(A, B, remaining);
    if (rawHit?.time === 0) {
      if (++events > config.maxContactEvents) return false;
      adapter.resolveContact(rawHit); continue;
    }
    if (remaining === 0) return true;
    let horizon = rawHit ? rawHit.time : remaining;
    while (true) {
      // Будущий контакт ограничивает прогноз: сила за его временем ещё не произошла.
      const trialA = cloneBody(A), trialB = cloneBody(B);
      const trialCoupling = { ...coupling, lastNormal: { ...coupling.lastNormal } }, impulses = { pull: 0, push: 0 };
      for (let iteration = 0; iteration < config.solverIterations; iteration++) {
        solveCoupling(trialA, trialB, trialCoupling, horizon, config, impulses);
      }
      if (!isValidBody(trialA) || !isValidBody(trialB)) return false;
      const hit = adapter.findContact(trialA, trialB, horizon);
      if (hit && hit.time < horizon) {
        const distance = couplingGeometry(A, B, coupling).distance;
        const active = coupling.connected && (coupling.type === 'rod'
          || (coupling.type === 'rope' ? distance >= coupling.restLength - config.normalEpsilon
            : distance >= coupling.maxLength - config.normalEpsilon || distance <= coupling.minLength + config.normalEpsilon));
        // Уже активная связь может требовать совместного импульса контакта при t=0.
        // Провисшая связь такого права не имеет: её будущую пробу полностью откатываем.
        if (hit.time > 0 || !active) {
          if (++events > config.maxContactEvents) return false;
          horizon = hit.time > 0 ? hit.time : horizon / 2;
          if (!(horizon > 0)) return false;
          continue;
        }
      }
      Object.assign(A, trialA); Object.assign(B, trialB); Object.assign(coupling, trialCoupling);
      const segment = hit ? hit.time : horizon;
      adapter.advanceBodies(segment);
      // Укороченные отрезки расходуют бюджет, исключая бесконечное приближение к контакту.
      if (!hit && segment < remaining && ++events > config.maxContactEvents) return false;
      remaining -= segment;
      if (hit) {
        if (++events > config.maxContactEvents) return false;
        adapter.resolveContact(hit);
      }
      break;
    }
  }
}
