export interface Vec2 { x: number; y: number }
export interface BodyState {
  position: Vec2; velocity: Vec2; angle: number; angularVelocity: number;
  mass: number; radius: number; inertia: number;
}
export interface InputFrame {
  forward: number; lateral: number; yaw: number; brake: boolean;
  action: boolean; toggleFA: boolean;
}
export type CouplingType = 'rod' | 'rope' | 'spring';
export type Attachment = 'nose' | 'tail';
export interface CouplingState {
  type: CouplingType; connected: boolean; attachmentA: Attachment; attachmentB: Attachment;
  length: number; restLength: number; minLength: number; maxLength: number;
  k: number; c: number; lastNormal: Vec2; accumulatedImpulse: number;
}
export interface CircleObstacle { id: string; position: Vec2; radius: number }
export interface Bay { position: Vec2; radius: number; holdTime: number }
export interface Diagnostics {
  couplingImpulse: number; rodError: number; outsideSpeedRange: boolean; solverSubsteps?: number;
}
export interface WorldState {
  A: BodyState; B: BodyState; coupling: CouplingState;
  obstacles: CircleObstacle[]; bay: Bay | null;
  tick: number; time: number; fa: boolean; diagnostics: Diagnostics;
}
export interface ContactEvent { body: 'A' | 'B'; other: 'A' | 'B' | string; impulse: number; normal: Vec2 }
export interface StepResult { world: WorldState; contacts: ContactEvent[]; stopReason?: string }
export interface CaptureResult { ok: boolean; reason?: string; distance: number; relativeSpeed: number }
export interface TugConfig {
  massA: number; radiusA: number; inertiaFactor: number; massRatio: number; radiusB: number;
  forwardForce: number; reverseForce: number; lateralForce: number; yawTorque: number;
  couplingType: CouplingType; attachmentA: Attachment; attachmentB: Attachment; length: number;
  springFrequency: number; springDamping: number; springReferenceMass: number;
  springMinRatio: number; springMaxRatio: number; restitution: number;
  fa: boolean; enginesEnabled: boolean; yawLimit: number; yawDampingTime: number; lateralComfort: number;
  tickRate: number; substeps: number; solverIterations: number; maxPositionBias: number;
  rodRelativeTolerance: number; rodMaxSweep: number; maxAdaptiveSubsteps: number;
  normalEpsilon: number; maxValidatedSpeed: number; maxObstacles: number;
  captureMinLength: number; captureMaxLength: number; captureMaxSpeed: number;
  baySpeed: number; bayAngularSpeed: number; bayHoldTime: number;
  scene: string; seed: number; stickDeadzone: number; stickRadius: number;
}
export type ValidationResult = { ok: true; config: TugConfig } | { ok: false; errors: string[] };
