import defaults from './config/assistant_defaults.json';
import { attachmentState } from '../tuglab/physics/coupling';
import type { BodyState } from '../tuglab/types';
import type { TrainShipConfig, TrainState, TrainWrench } from './types';
import { trainConnectionGeometry } from './train';

export type AssistantMode = 'coast' | 'guard' | 'brake';
export interface AssistantSettings {
  mode: AssistantMode; g: number; delay: number; Td: number; Tv: number; Tlat: number; Tyaw: number; epsilon: number; yawDamping: number;
}
export interface CommandC { forward: 0; retro: number; lateral: number; yaw: number }
export type AssistantStatus = 'coast' | 'waiting' | 'guarding' | 'braking' | 'saturated' | 'disconnected';
export interface AssistantObservation {
  time: number; brakeRequest: boolean; connected: boolean; distance: number; restLength: number; radialVelocity: number;
  lateralError: number; lateralVelocity: number; lateralProjection: number; angleError: number; angularVelocity: number;
}
export interface AssistantResult {
  command: CommandC; status: AssistantStatus; saturation: { retro: boolean; lateral: boolean; yaw: boolean };
  retroBlocked: boolean; requested: { retro: number; lateral: number; yaw: number };
}
export const SESSION_LIMITS = defaults;
export const zeroCommandC = (): CommandC => ({ forward: 0, retro: 0, lateral: 0, yaw: 0 });
export function defaultAssistantSettings(): AssistantSettings {
  const { mode, g, delay, Td, Tv, Tlat, Tyaw, epsilon, yawDamping } = defaults;
  return { mode: mode as AssistantMode, g, delay, Td, Tv, Tlat, Tyaw, epsilon, yawDamping };
}
export function validateAssistantSettings(s: AssistantSettings): void {
  if (!s || !['coast', 'guard', 'brake'].includes(s.mode) || !Number.isFinite(s.g) || s.g < 0 || s.g > 1
    || !Number.isFinite(s.delay) || s.delay < 0 || s.delay > 2 || !Number.isFinite(s.epsilon) || s.epsilon < 0 || s.epsilon > .1
    || ![s.Td,s.Tv,s.Tlat,s.Tyaw].every(v => Number.isFinite(v) && v >= .25 && v <= 10)
    || !Number.isFinite(s.yawDamping) || s.yawDamping < 0 || s.yawDamping > 10) throw new Error('Недопустимые настройки ассистента');
}
export function validCommandC(c: CommandC): boolean {
  return Boolean(c) && c.forward === 0 && Number.isFinite(c.retro) && c.retro >= 0 && c.retro <= 1
    && Number.isFinite(c.lateral) && Math.abs(c.lateral) <= 1 && Number.isFinite(c.yaw) && Math.abs(c.yaw) <= 1;
}
export function observeAssistant(state: TrainState, brakeRequest: boolean): AssistantObservation {
  const c = state.bodies.C, b = state.bodies.B, link = state.connections.find(l => l.id === 'BC');
  const empty: AssistantObservation = { time: state.world.time, brakeRequest, connected: false, distance: 0,
    restLength: 0, radialVelocity: 0, lateralError: 0, lateralVelocity: 0, lateralProjection: 0, angleError: 0, angularVelocity: 0 };
  if (!c || !link) return empty;
  const pc = attachmentState(c,'nose'), pb = attachmentState(b,'tail');
  const dx = pb.position.x-pc.position.x, dy = pb.position.y-pc.position.y, d = Math.hypot(dx,dy);
  const tx = -Math.sin(b.angle), ty = Math.cos(b.angle);
  const vcx = pc.velocity.x-pb.velocity.x, vcy = pc.velocity.y-pb.velocity.y;
  const error = Math.atan2(dy,dx)-c.angle;
  return { time: state.world.time, brakeRequest, connected: state.connections.every(l => l.connected), distance: d,
    restLength: link.restLength, radialVelocity: d > 0 ? (-vcx*dx-vcy*dy)/d : 0,
    lateralError: -dx*tx-dy*ty, lateralVelocity: vcx*tx+vcy*ty,
    lateralProjection: tx*Math.sin(c.angle)-ty*Math.cos(c.angle),
    angleError: Math.atan2(Math.sin(error),Math.cos(error)), angularVelocity: c.angularVelocity };
}
export function computeAssistant(o: AssistantObservation | undefined, state: TrainState, s: AssistantSettings, disabled = false): AssistantResult {
  validateAssistantSettings(s);
  const result: AssistantResult = { command:zeroCommandC(), status:'waiting', saturation:{retro:false,lateral:false,yaw:false},
    retroBlocked:false, requested:{retro:0,lateral:0,yaw:0} };
  if (disabled || !state.bodies.C || state.connections.some(l => !l.connected)) { result.status='disconnected'; return result; }
  if (s.mode === 'coast' || s.g === 0) { result.status='coast'; return result; }
  if (!o || !o.connected) return result;
  const c = state.bodies.C, p=state.config.ships.C;
  if (!p.enginesEnabled) { result.status='disconnected'; return result; }
  const r=result.requested;
  r.retro=c.mass*Math.max(0,(o.restLength*(1+s.epsilon)-o.distance)/(s.Td*s.Td)-o.radialVelocity/s.Tv);
  r.lateral=c.mass*(-o.lateralError/(s.Tlat*s.Tlat)-o.lateralVelocity/s.Tlat)*o.lateralProjection;
  r.yaw=c.inertia*(o.angleError/(s.Tyaw*s.Tyaw)-s.yawDamping*o.angularVelocity/s.Tyaw);
  const brake=s.mode==='brake' && o.brakeRequest;
  const retroMax=p.reverseForce*(brake?defaults.brakeRetroLimit:defaults.guardRetroLimit)*s.g;
  const lateralMax=p.lateralForce*defaults.lateralLimit*s.g, yawMax=p.yawTorque*defaults.yawLimit*s.g;
  const clamp=(v:number,m:number)=>Math.max(-m,Math.min(m,v));
  result.command={forward:0,retro:p.reverseForce>0?Math.min(r.retro,retroMax)/p.reverseForce:0,
    lateral:p.lateralForce>0?clamp(r.lateral,lateralMax)/p.lateralForce:0,yaw:p.yawTorque>0?clamp(r.yaw,yawMax)/p.yawTorque:0};
  result.saturation={retro:r.retro>retroMax,lateral:Math.abs(r.lateral)>lateralMax,yaw:Math.abs(r.yaw)>yawMax};
  const link=state.connections.find(l=>l.id==='BC')!;
  result.retroBlocked=trainConnectionGeometry(state,link).distance>=link.maxLength;
  if(result.retroBlocked)result.command.retro=0;
  result.status=Object.values(result.saturation).some(Boolean)?'saturated':brake?'braking':'guarding';
  return result;
}
// Команда уже ограничена режимом; преобразователь не умножает g повторно и не включает второй FA.
export function commandCWrench(body: Readonly<BodyState>, command: CommandC, p: TrainShipConfig, dt: number): TrainWrench {
  if (!validCommandC(command) || !Number.isFinite(dt) || dt <= 0) throw new Error('Недопустимая команда C');
  if (!p.enginesEnabled) return {force:{x:0,y:0},torque:0};
  const forward=-command.retro*p.reverseForce, lateral=command.lateral*p.lateralForce;
  let torque=command.yaw*p.yawTorque;
  // Обычный ограничитель момента не меняет omega и при yaw=0 не создаёт торможения.
  if(torque*body.angularVelocity>0)torque=Math.sign(torque)*Math.min(Math.abs(torque),body.inertia*Math.max(0,p.yawLimit-Math.abs(body.angularVelocity))/dt);
  return {force:{x:Math.cos(body.angle)*forward+Math.sin(body.angle)*lateral,
    y:Math.sin(body.angle)*forward-Math.cos(body.angle)*lateral},torque};
}
