import type { WorldContactEvent } from '../u2taglab/physics/worldContacts';
import type { AssistantResult, CommandC } from './assistant';
import { SESSION_LIMITS } from './assistant';
import { trainConnectionGeometry } from './train';
import { attachmentState } from '../tuglab/physics/coupling';
import type { TrainBodyId, TrainConnectionId, TrainState } from './types';
export interface BodyTelemetry {
  position: {x:number;y:number}; velocity:{x:number;y:number}; angle:number; unwrappedAngle:number; angularVelocity:number; speed:number; mass:number;
}
export interface LinkTelemetry { connected:boolean; distance:number; restLength:number; extension:number; radialVelocity:number; force:number; limitCount:number|null }
export interface TrainTelemetry {
  time:number; bodies:Partial<Record<TrainBodyId,BodyTelemetry>>; links:Partial<Record<TrainConnectionId,LinkTelemetry>>;
  commandC:CommandC; assistant:AssistantResult; contacts:WorldContactEvent[]; pathB:number; maxLateralB:number; maxAngleB:number;
  maxSpringForce:number; maxExtension:number; maxContactImpulse:number; contactCount:number; saturationTime:number;
  stoppedFor:number; outcome:'running'|'stopped'|'timeout'|'numerical-stop'; brakeTime:number|null; brakingDistance:number;
  limitCountsExact:boolean; solverAttempts:number; solverSubsteps:number; stopReason?:string;
  brakePathStart:number|null; linkPeaks:Partial<Record<TrainConnectionId,{force:number;extension:number}>>;
  saturationByChannel:{retro:number;lateral:number;yaw:number}; minClearance:number;
  anchors:Partial<Record<TrainBodyId,{nose:{x:number;y:number};tail:{x:number;y:number}}>>;
  relativeAngleBA:number; relativeAngleBC:number|null; maxAngleBC:number; comSpeed:number;
}
export function sampleTelemetry(state:TrainState, assistant:AssistantResult, contacts:WorldContactEvent[], previous?:TrainTelemetry,
  initial:TrainState=state, dt=0, braking=false):TrainTelemetry {
  const bodies:TrainTelemetry['bodies']={},anchors:TrainTelemetry['anchors']={};
  for(const b of Object.values(state.bodies)) {
    // Общий интегратор уже хранит непрерывный угол; нормализация теряла бы полные обороты.
    bodies[b.id]={position:{...b.position},velocity:{...b.velocity},angle:b.angle,unwrappedAngle:b.angle,
      angularVelocity:b.angularVelocity,speed:Math.hypot(b.velocity.x,b.velocity.y),mass:b.mass};
    anchors[b.id]={nose:attachmentState(b,'nose').position,tail:attachmentState(b,'tail').position};
  }
  const links:TrainTelemetry['links']={},linkPeaks:TrainTelemetry['linkPeaks']={};
  for(const l of state.connections) {
    const g=trainConnectionGeometry(state,l), old=previous?.links[l.id];
    links[l.id]={connected:l.connected,distance:g.distance,restLength:l.restLength,extension:(g.distance-l.restLength)/l.restLength,
      radialVelocity:g.radialVelocity,force:l.connected?l.k*(g.distance-l.restLength)+l.c*g.radialVelocity:0,
      limitCount:state.diagnostics.limitCountsExact?(old?.limitCount??0)+state.diagnostics.limitActivations[l.id]:null};
    linkPeaks[l.id]={force:Math.max(previous?.linkPeaks[l.id]?.force??0,Math.abs(links[l.id]!.force)),
      extension:Math.max(previous?.linkPeaks[l.id]?.extension??0,Math.abs(links[l.id]!.extension))};
  }
  const b=bodies.B!, oldB=previous?.bodies.B, start=initial.bodies.A;
  const pathB=(previous?.pathB??0)+(oldB?Math.hypot(b.position.x-oldB.position.x,b.position.y-oldB.position.y):0);
  const allStopped=Object.values(bodies).every(b=>b.speed<SESSION_LIMITS.stopSpeed&&Math.abs(b.angularVelocity)<SESSION_LIMITS.stopYaw);
  const brakeTime=previous?.brakeTime??(braking?state.world.time-dt:null);
  const stoppedFor=allStopped&&brakeTime!==null?(previous?.stoppedFor??0)+dt:0;
  const brakePathStart=previous?.brakePathStart??(braking?(previous?.pathB??0):null);
  const outcome=stoppedFor+1e-9>=SESSION_LIMITS.stopHold?'stopped':brakeTime!==null&&state.world.time-brakeTime+1e-9>=SESSION_LIMITS.timeout?'timeout':'running';
  const relativeAngleBA=b.unwrappedAngle-bodies.A!.unwrappedAngle,relativeAngleBC=bodies.C?b.unwrappedAngle-bodies.C.unwrappedAngle:null;
  const all=[...Object.values(state.bodies),...state.world.asteroids];let minClearance=previous?.minClearance??Infinity;
  for(let i=0;i<all.length;i++) {
    const a=all[i];for(let j=i+1;j<all.length;j++)minClearance=Math.min(minClearance,Math.hypot(a.position.x-all[j].position.x,a.position.y-all[j].position.y)-a.radius-all[j].radius);
    for(const o of state.world.statics)minClearance=Math.min(minClearance,Math.hypot(a.position.x-o.position.x,a.position.y-o.position.y)-a.radius-o.radius);
    minClearance=Math.min(minClearance,state.world.width/2-Math.abs(a.position.x)-a.radius,state.world.height/2-Math.abs(a.position.y)-a.radius);
  }
  const ships=Object.values(state.bodies),totalMass=ships.reduce((m,b)=>m+b.mass,0);
  const comSpeed=Math.hypot(ships.reduce((p,b)=>p+b.mass*b.velocity.x,0),ships.reduce((p,b)=>p+b.mass*b.velocity.y,0))/totalMass;
  const saturationByChannel={retro:previous?.saturationByChannel.retro??0,lateral:previous?.saturationByChannel.lateral??0,yaw:previous?.saturationByChannel.yaw??0};
  for(const channel of ['retro','lateral','yaw'] as const)if(assistant.saturation[channel])saturationByChannel[channel]+=dt;
  return {time:state.world.time,bodies,links,commandC:{...assistant.command},assistant:structuredClone(assistant),contacts:structuredClone(contacts),pathB,
    maxLateralB:Math.max(previous?.maxLateralB??0,Math.abs(-(b.position.x-start.position.x)*Math.sin(start.angle)+(b.position.y-start.position.y)*Math.cos(start.angle))),
    maxAngleB:Math.max(previous?.maxAngleB??0,Math.abs(b.unwrappedAngle-start.angle)),
    maxSpringForce:Math.max(previous?.maxSpringForce??0,...Object.values(links).map(l=>Math.abs(l.force))),
    maxExtension:Math.max(previous?.maxExtension??0,...Object.values(links).map(l=>Math.abs(l.extension))),
    maxContactImpulse:Math.max(previous?.maxContactImpulse??0,...contacts.map(c=>c.impulse)),contactCount:(previous?.contactCount??0)+contacts.length,
    saturationTime:(previous?.saturationTime??0)+(Object.values(assistant.saturation).some(Boolean)?dt:0),stoppedFor,outcome,
    brakeTime,brakePathStart,brakingDistance:brakePathStart===null?0:pathB-brakePathStart,
    linkPeaks,saturationByChannel,minClearance,anchors,relativeAngleBA,relativeAngleBC,comSpeed,
    maxAngleBC:Math.max(previous?.maxAngleBC??0,Math.abs(relativeAngleBC??0)),
    limitCountsExact:state.diagnostics.limitCountsExact,solverAttempts:state.diagnostics.solverAttempts,solverSubsteps:state.diagnostics.solverSubsteps};
}
