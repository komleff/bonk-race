import type { Attachment, BodyState, CouplingState, TugConfig, Vec2 } from '../tuglab/types';
import type { HullGeometry, HullSize, SpaceProfile } from '../u2taglab/profile';
import type { SpaceWorld } from '../u2taglab/world';
import type { WorldContactEvent } from '../u2taglab/physics/worldContacts';

export type TrainBodyId = 'A' | 'B' | 'C';
export type TrainConnectionId = 'AB' | 'BC';
export type TrainComposition = 'train' | 'single';
export type TrainModule = 'S' | 'M' | 'L' | 'XL' | 'custom';
export interface TrainShipConfig extends Omit<SpaceProfile, 'geometryA' | 'geometryB' | 'massA' | 'massB' | 'radiusA' | 'radiusB'> {
  size: HullSize; geometry: HullGeometry; mass: number;
  speedLimits: { forward: number; reverse: number; lateral: number };
}
export interface TrainLinkConfig {
  module: TrainModule; restLength: number; k: number; c: number; captureMaxLength: number;
}
export interface TrainConfig {
  composition: TrainComposition; ships: Record<TrainBodyId, TrainShipConfig>;
  links: Record<TrainConnectionId, TrainLinkConfig>; numerics: TugConfig; world: SpaceWorld;
}
export interface TrainBody extends BodyState { id: TrainBodyId }
export interface TrainConnection extends CouplingState {
  id: TrainConnectionId; bodyA: TrainBodyId; bodyB: TrainBodyId; module: TrainModule; captureMaxLength: number;
  attachmentA: Attachment; attachmentB: Attachment;
}
export interface TrainDiagnostics {
  solverSubsteps: number; solverAttempts: number; outsideSpeedRange: boolean;
  limitCountsExact: boolean;
  limitActivations: Record<TrainConnectionId, number>;
  couplingImpulse: Record<TrainConnectionId, number>;
}
export interface TrainState {
  config: TrainConfig; bodies: { A: TrainBody; B: TrainBody; C?: TrainBody };
  connections: TrainConnection[]; world: SpaceWorld; paused: boolean; diagnostics: TrainDiagnostics;
}
export interface TrainForceSample { id: string; body: Readonly<BodyState>; time: number; subDt: number }
export interface TrainWrench { force: Vec2; torque: number }
export interface TrainForceApplied { id: string; time: number; subDt: number; wrench: TrainWrench }
// Самплер чистый: время/история команд изменяются только после принятия общего тика.
export type TrainForceSampler = (sample: TrainForceSample) => TrainWrench;
export interface TrainAdvanceResult {
  state: TrainState; contacts: WorldContactEvent[]; forceSamples: TrainForceApplied[]; diagnostics: TrainDiagnostics; stopReason?: string;
}
