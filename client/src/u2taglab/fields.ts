import { Rng } from '@bonk-race/shared';
import type { BodyState, Vec2 } from '../tuglab/types';
import type { SpaceWorld } from './world';
import type { SpaceWrench } from './physics/advanceWorld';
import defaults from './config/field_defaults.json';

export type SpaceFieldKind = 'plasma' | 'resistive' | 'thermalHot' | 'thermalCold' | 'dust' | 'emStorm';
export interface SpaceField {
  readonly id: string; readonly kind: SpaceFieldKind; readonly center: Readonly<Vec2>; readonly radius: number;
  readonly drift: Readonly<Vec2>; readonly pressure: number; readonly resistiveK: number;
  readonly topology: 'linear' | 'vortex'; readonly direction: Readonly<Vec2>;
}
export interface SpaceFieldSettings { fieldsEnabled: boolean; fieldPressure: number; resistiveK: number }
export type SpaceFieldBody = Readonly<BodyState> & { readonly id: string };
export const SPACE_FIELD_DEFAULTS = defaults;
export const SPACE_FIELD_INFO: Record<SpaceFieldKind, { label: string; color: string; description: string }> = {
  plasma: { label: 'Плазменный поток', color: '#42d4ca', description: 'LAB: F=w·p·πr²·n, p в Па. Поток или касательный вихрь, сила через центр масс; момент 0. В центре вихря сила 0. Единицы давления и площадь круга — лабораторное замыкание, не измеренные ТТХ космической погоды U2.' },
  resistive: { label: 'Сопротивляющаяся среда', color: '#ba986d', description: 'U2: F=−w·k_R·A_eff·v, k_R в Н·с/м³. Скорость в системе сектора; дрейф области не является движением материала. LAB: A_eff=πr². Линейное сопротивление не создаёт угловое торможение.' },
  thermalHot: { label: 'Горячая область', color: '#f38661', description: 'Визуальная область U2 ThermalHot. Здесь нет расчёта температуры, перегрева, энергии или повреждений; тяга не меняется.' },
  thermalCold: { label: 'Холодная область', color: '#77b6ef', description: 'Визуальная область U2 ThermalCold. Температура и охлаждение кораблей в этой лаборатории не моделируются; тяга не меняется.' },
  dust: { label: 'Пылевое облако', color: '#b5a0c1', description: 'Визуальная область U2 Dust. Пыль, датчики и видимость не моделируются; это не сопротивляющаяся среда и силы здесь нет.' },
  emStorm: { label: 'Электромагнитная буря', color: '#cc84e5', description: 'Визуальная область U2 EMstorm. Электроника, датчики и энергия не моделируются; двигатели и FA продолжают работать независимо.' },
};

export function validSpaceFieldSettings(value: SpaceFieldSettings): boolean {
  return typeof value.fieldsEnabled === 'boolean' && Number.isFinite(value.fieldPressure) && value.fieldPressure >= 0
    && value.fieldPressure <= defaults.maxPressure && Number.isFinite(value.resistiveK) && value.resistiveK >= 0
    && value.resistiveK <= defaults.maxResistiveK;
}
export function createSpaceFields(world: Pick<SpaceWorld, 'seed' | 'density' | 'width' | 'height' | 'spawnPoint'>,
  settings: SpaceFieldSettings): readonly SpaceField[] {
  if (!validSpaceFieldSettings(settings)) throw new Error('Недопустимые настройки полей');
  if (!settings.fieldsEnabled) return Object.freeze([]);
  // Отдельный поток seed сохраняет существующую раскладку твёрдых объектов.
  const rng = new Rng((world.seed ^ 0x5f13a289) >>> 0);
  const kinds: SpaceFieldKind[] = ['plasma', 'plasma', 'resistive', 'resistive', 'thermalHot', 'thermalCold', 'dust', 'emStorm'];
  const fields: SpaceField[] = [];
  for (let i = 0; i < Math.max(kinds.length, Math.round(world.density * defaults.fieldsPerDensity)); i++) {
    const radius = rng.range(defaults.minRadius, defaults.maxRadius), angle = rng.range(0, 2 * Math.PI);
    const center = { x: rng.range(-world.width / 2 + radius, world.width / 2 - radius),
      y: rng.range(-world.height / 2 + radius, world.spawnPoint.y - defaults.startVacuumLength - radius) };
    const driftAngle = rng.range(0, 2 * Math.PI);
    fields.push(Object.freeze({ id: `field:${i}`, kind: kinds[i % kinds.length], center: Object.freeze(center), radius,
      drift: Object.freeze({ x: defaults.driftSpeed * Math.cos(driftAngle), y: defaults.driftSpeed * Math.sin(driftAngle) }),
      pressure: settings.fieldPressure, resistiveK: settings.resistiveK,
      topology: i % kinds.length === 1 ? 'vortex' : 'linear', direction: Object.freeze({ x: Math.cos(angle), y: Math.sin(angle) }) }));
  }
  return Object.freeze(fields);
}
export function spaceFieldCenter(field: SpaceField, simulationTime: number): Vec2 {
  return { x: field.center.x + field.drift.x * simulationTime, y: field.center.y + field.drift.y * simulationTime };
}
export function spaceFieldWeight(field: SpaceField, position: Readonly<Vec2>, simulationTime: number): number {
  const center = spaceFieldCenter(field, simulationTime);
  const t = Math.max(0, Math.min(1, 1 - Math.hypot(position.x - center.x, position.y - center.y) / field.radius));
  return t * t * (3 - 2 * t);
}
function fieldCoefficients(world: SpaceWorld, body: SpaceFieldBody, simulationTime: number): { wind: Vec2; drag: number } {
  const radius = body.id === 'A' || body.id === 'B' ? world.fieldShipRadii[body.id] : body.radius;
  if (!Number.isFinite(simulationTime) || simulationTime < 0 || !Number.isFinite(radius) || radius <= 0) {
    throw new Error('Недопустимое состояние для семплирования поля');
  }
  const area = Math.PI * radius ** 2, wind = { x: 0, y: 0 }; let drag = 0;
  const fields = world.fields.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ids = new Set<string>();
  for (const field of fields) {
    if (!field.id || ids.has(field.id) || !Object.hasOwn(SPACE_FIELD_INFO, field.kind)
      || ![field.radius, field.center.x, field.center.y, field.drift.x, field.drift.y, field.pressure,
        field.resistiveK, field.direction.x, field.direction.y].every(Number.isFinite)
      || field.radius <= 0 || field.pressure < 0 || field.resistiveK < 0
      || (field.topology !== 'linear' && field.topology !== 'vortex')) throw new Error('Недопустимое определение поля');
    ids.add(field.id);
    const weight = spaceFieldWeight(field, body.position, simulationTime);
    if (field.kind === 'resistive') drag += weight * field.resistiveK * area;
    else if (field.kind === 'plasma') {
      const center = spaceFieldCenter(field, simulationTime);
      const direction = field.topology === 'vortex'
        ? { x: -(body.position.y - center.y), y: body.position.x - center.x } : field.direction;
      const norm = Math.hypot(direction.x, direction.y);
      if (norm > 0) { wind.x += weight * field.pressure * area * direction.x / norm; wind.y += weight * field.pressure * area * direction.y / norm; }
    }
  }
  return { wind, drag };
}
// Мгновенный закон среды независим от интегратора, двигателей и FA.
export function sampleSpaceFields(world: SpaceWorld, body: SpaceFieldBody, simulationTime: number): SpaceWrench {
  const { wind, drag } = fieldCoefficients(world, body, simulationTime);
  return { force: { x: wind.x - drag * body.velocity.x, y: wind.y - drag * body.velocity.y }, torque: 0 };
}
// Замороженные на подшаге коэффициенты: аналитически объединяем тягу, давление и drag.
export function sampleSpaceFieldResponse(world: SpaceWorld, body: SpaceFieldBody, simulationTime: number, subDt: number,
  engine: SpaceWrench = { force: { x: 0, y: 0 }, torque: 0 }): SpaceWrench {
  if (!Number.isFinite(subDt) || subDt <= 0) throw new Error('Недопустимый интервал поля');
  const { wind, drag } = fieldCoefficients(world, body, simulationTime);
  const drive = { x: engine.force.x + wind.x, y: engine.force.y + wind.y };
  if (drag === 0) return { force: drive, torque: engine.torque };
  const x = drag * subDt / body.mass;
  // expm1 сохраняет точность слабого сопротивления; при сильном нет эйлерова overshoot.
  const response = -Math.expm1(-x) / x;
  return { force: { x: (drive.x - drag * body.velocity.x) * response,
    y: (drive.y - drag * body.velocity.y) * response }, torque: engine.torque };
}
