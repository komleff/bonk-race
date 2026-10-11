import type { WorldContactEvent } from '../u2taglab/physics/worldContacts';
import { SESSION_LIMITS, validateAssistantSettings, validCommandC, type AssistantMode, type AssistantObservation, type AssistantSettings, type CommandC } from './assistant';
import { validateScene, type SceneSpec } from './scenes';
import { buildIdentity, TrainSession, validInputA, type InputA } from './session';
import { validTrainState } from './train';
import type { TrainTelemetry } from './telemetry';
import type { TrainComposition, TrainConfig, TrainConnectionId, TrainState, TrainWrench } from './types';
import { boundedConfig, boundedTree, serializedBytes } from './recordingLimits';
export type RecordingEvent = {tick:number;type:'mode';value:AssistantMode} | {tick:number;type:'settings';value:Partial<AssistantSettings>}
  | {tick:number;type:'fa'|'pause'|'resume';value:boolean} | {tick:number;type:'connection';value:{id:TrainConnectionId;connected:boolean}};
export interface RecordedTick {time:number;inputA:InputA;rearBrake:boolean;observation?:AssistantObservation;commandC:CommandC;
  wrenches:Record<string,TrainWrench>;engineWrenches:Record<string,TrainWrench>;telemetry:TrainTelemetry;contacts:WorldContactEvent[]}
export interface TrainRecording {
  schema:1;app:'tuglab2';appVersion:string;sourceSHA:string;dt:number;config:TrainConfig;initialState:TrainState;
  settings:AssistantSettings;scene:SceneSpec;fa:boolean;events:RecordingEvent[];ticks:RecordedTick[];stopReason?:string;
}
export interface BuildIdentity {appVersion:string;sourceSHA:string}
export interface ShareParameters {config:TrainConfig;settings:AssistantSettings;scene:SceneSpec;fa:boolean}
function fail():never{throw new Error('Недопустимый или несовместимый формат TugLab-2');}
function object(v:unknown):v is Record<string,unknown>{return Boolean(v)&&typeof v==='object'&&!Array.isArray(v);}
function keys(v:unknown,allowed:string[],required=allowed):void{if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(v,k)))fail();}
function validateInitial(r:Pick<TrainRecording,'config'|'initialState'|'settings'|'scene'|'fa'|'dt'>):void {
  validateAssistantSettings(r.settings);validateScene(r.scene);
  if(![1/30,1/60,1/120].includes(r.dt)||typeof r.fa!=='boolean'||!r.config||!r.initialState)fail();
  boundedConfig(r.config);
  for(const world of [r.config.world,r.initialState.world])if(!world||!Array.isArray(world.statics)||!Array.isArray(world.asteroids)||!Array.isArray(world.fields)
    ||world.statics.length+world.asteroids.length+world.fields.length>SESSION_LIMITS.maxObjects)fail();
  if(!validTrainState(r.initialState)||r.initialState.world.time!==0||r.initialState.world.tick!==0||r.initialState.paused!==true)fail();
  // Оба представления конфигурации обязаны описывать один и тот же начальный мир.
  if(JSON.stringify(r.initialState.config)!==JSON.stringify(r.config))fail();
  new TrainSession(r.config,{settings:r.settings,scene:r.scene,fa:r.fa,dt:r.dt,initialState:r.initialState});
}
function validateEvent(e:RecordingEvent,r:TrainRecording):void {
  keys(e,['tick','type','value']);if(!Number.isSafeInteger(e.tick)||e.tick<0||e.tick>r.ticks.length)fail();
  if(e.type==='mode'){if(!['coast','guard','brake'].includes(e.value))fail();}
  else if(e.type==='settings'){keys(e.value,['mode','g','delay','Td','Tv','Tlat','Tyaw','epsilon','yawDamping'],[]);validateAssistantSettings({...r.settings,...e.value});}
  else if(e.type==='fa'||e.type==='pause'||e.type==='resume'){if(typeof e.value!=='boolean')fail();}
  else if(e.type==='connection'){keys(e.value,['id','connected']);if(!['AB','BC'].includes(e.value.id)||typeof e.value.connected!=='boolean')fail();}
  else fail();
}
function validateTelemetry(t:TrainTelemetry,time:number,command:CommandC):void {
  if(!object(t)||t.time!==time||!object(t.bodies)||!object(t.links)||!object(t.assistant)
    ||!Array.isArray(t.contacts)||!validCommandC(t.commandC)||JSON.stringify(t.commandC)!==JSON.stringify(command)
    ||!['running','stopped','timeout','numerical-stop'].includes(t.outcome))fail();
  for(const [id,b] of Object.entries(t.bodies)){if(!['A','B','C'].includes(id)||!object(b)||!object(b.position)||!object(b.velocity)
    ||![b.position.x,b.position.y,b.velocity.x,b.velocity.y,b.angle,b.unwrappedAngle,b.angularVelocity,b.speed,b.mass].every(Number.isFinite)||b.mass<=0)fail();}
  if(!t.bodies.A||!t.bodies.B)fail();
  for(const l of Object.values(t.links))if(!l||![l.distance,l.restLength,l.extension,l.radialVelocity,l.force].every(Number.isFinite)||l.restLength<=0
    ||typeof l.connected!=='boolean'||(l.limitCount!==null&&(!Number.isSafeInteger(l.limitCount)||l.limitCount<0)))fail();
  if(![t.pathB,t.maxLateralB,t.maxAngleB,t.maxSpringForce,t.maxExtension,t.maxContactImpulse,t.contactCount,t.saturationTime,t.stoppedFor,t.brakingDistance].every(v=>Number.isFinite(v)&&v>=0))fail();
  const a=t.assistant;if(!object(a.saturation)||!object(a.requested)||!validCommandC(a.command)
    ||typeof a.retroBlocked!=='boolean'||!['coast','waiting','guarding','braking','saturated','disconnected'].includes(a.status)
    ||!Object.values(a.saturation).every(v=>typeof v==='boolean')||!Object.values(a.requested).every(Number.isFinite))fail();
  if(!object(t.saturationByChannel)||!['retro','lateral','yaw'].every(k=>typeof t.saturationByChannel[k as 'retro']==='number'&&t.saturationByChannel[k as 'retro']>=0)
    ||!object(t.linkPeaks)||!object(t.anchors)||![t.minClearance,t.relativeAngleBA,t.maxAngleBC,t.comSpeed].every(Number.isFinite)
    ||(t.relativeAngleBC!==null&&!Number.isFinite(t.relativeAngleBC))||t.comSpeed<0
    ||(t.brakeTime!==null&&(!Number.isFinite(t.brakeTime)||t.brakeTime<0))
    ||(t.brakePathStart!==null&&(!Number.isFinite(t.brakePathStart)||t.brakePathStart<0)))fail();
  for(const peak of Object.values(t.linkPeaks))if(!peak||![peak.force,peak.extension].every(v=>Number.isFinite(v)&&v>=0))fail();
  for(const anchor of Object.values(t.anchors))if(!anchor||!anchor.nose||!anchor.tail||![anchor.nose.x,anchor.nose.y,anchor.tail.x,anchor.tail.y].every(Number.isFinite))fail();
}
export function validateRecording(r:TrainRecording,identity:BuildIdentity=buildIdentity()):void {
  keys(r,['schema','app','appVersion','sourceSHA','dt','config','initialState','settings','scene','fa','events','ticks','stopReason'],
    ['schema','app','appVersion','sourceSHA','dt','config','initialState','settings','scene','fa','events','ticks']);boundedTree(r);
  if(r.schema!==1||r.app!=='tuglab2'||r.appVersion!==identity.appVersion||r.sourceSHA!==identity.sourceSHA
    ||!Array.isArray(r.ticks)||r.ticks.length>SESSION_LIMITS.maxRecordingTicks||!Array.isArray(r.events)||r.events.length>SESSION_LIMITS.maxRecordingTicks
    ||(r.stopReason!==undefined&&typeof r.stopReason!=='string'))fail();
  validateInitial(r);let prior=0;
  for(const e of r.events){validateEvent(e,r);if(e.tick<prior)fail();prior=e.tick;}
  let settings={...r.settings},eventIndex=0,disabled=false,historyStart=0;
  const connected=Object.fromEntries(r.initialState.connections.map(l=>[l.id,l.connected]));
  for(let i=0;i<r.ticks.length;i++) {
    while(eventIndex<r.events.length&&r.events[eventIndex].tick===i) {
      const e=r.events[eventIndex++];
      if(e.type==='mode'){settings.mode=e.value;disabled=false;if(e.value==='coast')historyStart=i;}
      if(e.type==='settings'){settings={...settings,...e.value};if(e.value.mode!==undefined){disabled=false;if(e.value.mode==='coast')historyStart=i;}}
      if(e.type==='pause')historyStart=i;
      if(e.type==='connection'){if(!Object.hasOwn(connected,e.value.id))fail();connected[e.value.id]=e.value.connected;if(!e.value.connected){disabled=true;historyStart=i;}}
    }
    const t=r.ticks[i];keys(t,['time','inputA','rearBrake','observation','commandC','wrenches','engineWrenches','telemetry','contacts'],['time','inputA','rearBrake','commandC','wrenches','engineWrenches','telemetry','contacts']);
    if(!validInputA(t.inputA)||typeof t.rearBrake!=='boolean'||!validCommandC(t.commandC)||Math.abs(t.commandC.lateral)>.5||Math.abs(t.commandC.yaw)>.5
      ||!Number.isFinite(t.time)||Math.abs(t.time-(i+1)*r.dt)>1e-7||!object(t.wrenches)||!Array.isArray(t.contacts)
      ||t.contacts.length>r.config.numerics.maxContactEvents*t.telemetry.solverSubsteps)fail();
    if(t.observation!==undefined) {
      keys(t.observation,['time','brakeRequest','connected','distance','restLength','radialVelocity','lateralError','lateralVelocity','lateralProjection','angleError','angularVelocity']);
      if(typeof t.observation.brakeRequest!=='boolean'||typeof t.observation.connected!=='boolean'
        ||!Object.entries(t.observation).filter(([k])=>!['brakeRequest','connected'].includes(k)).every(([,v])=>typeof v==='number'&&Number.isFinite(v))
        ||t.observation.time>t.time-r.dt+1e-8||t.observation.time<0)fail();
      const observedTick=Math.round(t.observation.time/r.dt),delayTicks=Math.ceil(settings.delay/r.dt-1e-10);
      if(Math.abs(t.observation.time-observedTick*r.dt)>1e-7||observedTick<historyStart||observedTick>i-delayTicks
        ||t.observation.brakeRequest!==(r.ticks[observedTick].inputA.brake||r.ticks[observedTick].rearBrake))fail();
    }
    const off=settings.mode==='coast'||settings.g===0||disabled||!r.initialState.bodies.C||!r.config.ships.C.enginesEnabled||Object.values(connected).some(v=>!v);
    const retroLimit=(settings.mode==='brake'&&t.observation?.brakeRequest?SESSION_LIMITS.brakeRetroLimit:SESSION_LIMITS.guardRetroLimit)*settings.g;
    if(t.commandC.retro>(off?0:retroLimit)+1e-12||Math.abs(t.commandC.lateral)>(off?0:SESSION_LIMITS.lateralLimit*settings.g)+1e-12
      ||Math.abs(t.commandC.yaw)>(off?0:SESSION_LIMITS.yawLimit*settings.g)+1e-12||(!t.observation&&!off&&Object.values(t.commandC).some(v=>v!==0)))fail();
    const bodyIds=[...Object.keys(r.initialState.bodies),...r.initialState.world.asteroids.map(b=>b.id)];
    for(const means of [t.wrenches,t.engineWrenches]){keys(means,bodyIds);for(const w of Object.values(means))if(!object(w)||!object(w.force)||![w.force.x,w.force.y,w.torque].every(Number.isFinite))fail();}
    for(const c of t.contacts)if(!object(c)||typeof c.body!=='string'||typeof c.other!=='string'||!object(c.normal)
      ||![c.normal.x,c.normal.y,c.impulse].every(Number.isFinite)||c.impulse<0)fail();
    validateTelemetry(t.telemetry,t.time,t.commandC);
    if(!Number.isSafeInteger(t.telemetry.solverSubsteps)||t.telemetry.solverSubsteps<1||t.telemetry.solverSubsteps>r.config.numerics.maxAdaptiveSubsteps
      ||!Number.isSafeInteger(t.telemetry.solverAttempts)||t.telemetry.solverAttempts<1||t.telemetry.solverAttempts>64)fail();
    if(t.telemetry.outcome!=='running')historyStart=i+1;
  }
}
export function exportRecording(r:TrainRecording):string {return JSON.stringify(r);}
export function importRecording(text:string,identity:BuildIdentity=buildIdentity()):TrainRecording {
  if(typeof text!=='string'||text.length>SESSION_LIMITS.maxImportBytes||new TextEncoder().encode(text).byteLength>SESSION_LIMITS.maxImportBytes)fail();
  try{const r=JSON.parse(text) as TrainRecording;validateRecording(r,identity);return r;}catch{fail();}
}
function applyEvent(s:TrainSession,e:RecordingEvent,modeOverride?:AssistantMode):void {
  if(e.type==='mode')s.setMode(modeOverride??e.value);
  if(e.type==='settings')s.setAssistantSettings(modeOverride?{...e.value,mode:modeOverride}:e.value);
  if(e.type==='fa')s.setFA(e.value);
  if(e.type==='pause')s.pause();if(e.type==='resume')s.resume();
  if(e.type==='connection'){
    if(modeOverride&&s.state.config.composition==='single'&&e.value.id==='BC')return;
    const r=s.setConnection(e.value.id,e.value.connected);if(!r.ok)throw new Error(`Событие сцепки не воспроизвелось: ${r.reason}`);
  }
}
function runRecording(r:TrainRecording,mode?:AssistantMode,composition?:TrainComposition,recompute=false):TrainSession {
  validateRecording(r,{appVersion:r.appVersion,sourceSHA:r.sourceSHA});
  const initial=structuredClone(r.initialState), config=structuredClone(r.config);
  if(composition&&composition!==config.composition){
    if(composition!=='single')throw new Error('Добавление C требует нового безопасного начального состава');
    config.composition='single';initial.config=structuredClone(config);delete initial.bodies.C;initial.connections=initial.connections.filter(l=>l.id==='AB');
  }
  const s=new TrainSession(config,{appVersion:r.appVersion,sourceSHA:r.sourceSHA,settings:{...r.settings,...(mode?{mode}: {})},
    scene:r.scene,fa:r.fa,dt:r.dt,initialState:initial});
  let event=0;
  for(let i=0;i<=r.ticks.length;i++) {
    while(event<r.events.length&&r.events[event].tick===i)applyEvent(s,r.events[event++],mode);
    if(i===r.ticks.length)break;
    const t=r.ticks[i];if(s.state.paused)s.resume();
    const result=mode||recompute?s.step(t.inputA,t.rearBrake):s.stepRecorded(t.inputA,t.rearBrake,t.commandC,t.telemetry.assistant,t.observation);
    if(!result.accepted){if(mode)break;throw new Error(`Воспроизведение остановилось: ${result.stopReason}`);}
  }
  if(r.stopReason&&!mode){s.stoppedReason=r.stopReason;s.recording.stopReason=r.stopReason;s.state.paused=true;}
  if(mode)s.comparison={compositionChanged:config.composition!==r.config.composition,completeInput:s.recording.ticks.length===r.ticks.length,
    measurementComplete:s.telemetry.outcome!=='running',sourceTicks:r.ticks.length,acceptedTicks:s.recording.ticks.length,windowSeconds:s.recording.ticks.length*r.dt};
  return s;
}
export function replayRecording(r:TrainRecording):TrainSession{return runRecording(r);}
export function recomputeRecording(r:TrainRecording):TrainSession{return runRecording(r,undefined,undefined,true);}
export function compareRecording(r:TrainRecording,mode:AssistantMode,options:{composition?:TrainComposition}={}):TrainSession {
  if(!['coast','guard','brake'].includes(mode))fail();return runRecording(r,mode,options.composition);
}
export function encodeShare(parameters:ShareParameters):string {
  const value={schema:1,app:'tuglab2-share',...parameters};const text=JSON.stringify(value);
  if(serializedBytes(value)>SESSION_LIMITS.maxShareBytes)fail();return encodeURIComponent(text);
}
export function decodeShare(text:string):ShareParameters {
  if(text.length>SESSION_LIMITS.maxShareBytes*3)fail();
  try{const decoded=decodeURIComponent(text);if(new TextEncoder().encode(decoded).byteLength>SESSION_LIMITS.maxShareBytes)fail();
    const r=JSON.parse(decoded);keys(r,['schema','app','config','settings','scene','fa']);boundedTree(r);
    if(r.schema!==1||r.app!=='tuglab2-share')fail();validateAssistantSettings(r.settings);validateScene(r.scene);
    new TrainSession(r.config,{settings:r.settings,scene:r.scene,fa:r.fa});return {config:r.config,settings:r.settings,scene:r.scene,fa:r.fa};
  }catch{fail();}
}
export function exportCSV(r:TrainRecording):string {
  const columns=['time_s'];
  for(const id of ['A','B','C'])columns.push(`${id}_x_m`,`${id}_y_m`,`${id}_vx_m_s`,`${id}_vy_m_s`,`${id}_angle_rad`,`${id}_unwrapped_rad`,`${id}_omega_rad_s`,`${id}_speed_m_s`,`${id}_mass_kg`,
    `${id}_nose_x_m`,`${id}_nose_y_m`,`${id}_tail_x_m`,`${id}_tail_y_m`);
  for(const id of ['AB','BC'])columns.push(`${id}_connected`,`${id}_distance_m`,`${id}_l0_m`,`${id}_extension_fraction`,`${id}_radial_m_s`,`${id}_force_N`,`${id}_limit_count`,`${id}_peak_force_N`,`${id}_peak_extension_fraction`);
  const forceIds=[...Object.keys(r.initialState.bodies),...r.initialState.world.asteroids.map(b=>b.id)];
  for(const id of forceIds)for(const kind of ['engine','external'])columns.push(`${id}_${kind}_Fx_N`,`${id}_${kind}_Fy_N`,`${id}_${kind}_torque_N_m`);
  columns.push('C_retro_fraction','C_lateral_fraction','C_yaw_fraction','retro_request_N','lateral_request_N','yaw_request_N_m',
    'retro_saturated','lateral_saturated','yaw_saturated','retro_blocked','retro_saturation_s','lateral_saturation_s','yaw_saturation_s',
    'contact_count','contact_impulse_N_s','contact_pairs','path_B_m','brake_time_s','braking_distance_m','stopped_for_s',
    'max_lateral_B_m','max_angle_B_initial_heading_rad','max_angle_BC_rad','min_clearance_m','relative_angle_BA_rad','relative_angle_BC_rad','com_speed_m_s',
    'solver_attempts','solver_substeps','limit_counts_exact','outcome','stop_reason');
  const rows=[columns.join(',')];
  for(const t of r.ticks){
    const row:(number|string)[]=[t.time],m=t.telemetry;
    for(const id of ['A','B','C'] as const){const b=m.bodies[id],a=m.anchors[id];row.push(...(b&&a?[b.position.x,b.position.y,b.velocity.x,b.velocity.y,b.angle,b.unwrappedAngle,b.angularVelocity,b.speed,b.mass,
      a.nose.x,a.nose.y,a.tail.x,a.tail.y]:Array(13).fill('')));}
    for(const id of ['AB','BC'] as const){const l=m.links[id],p=m.linkPeaks[id];row.push(...(l?[Number(l.connected),l.distance,l.restLength,l.extension,l.radialVelocity,l.force,l.limitCount??'н/д',p?.force??0,p?.extension??0]:Array(9).fill('')));}
    for(const id of forceIds)for(const means of [t.engineWrenches,t.wrenches]){const w=means[id];row.push(w?.force.x??0,w?.force.y??0,w?.torque??0);}
    const a=m.assistant;
    row.push(t.commandC.retro,t.commandC.lateral,t.commandC.yaw,a.requested.retro,a.requested.lateral,a.requested.yaw,
      Number(a.saturation.retro),Number(a.saturation.lateral),Number(a.saturation.yaw),Number(a.retroBlocked),
      m.saturationByChannel.retro,m.saturationByChannel.lateral,m.saturationByChannel.yaw,
      t.contacts.length,t.contacts.reduce((sum,c)=>sum+c.impulse,0),JSON.stringify(t.contacts),m.pathB,m.brakeTime??'',m.brakingDistance,m.stoppedFor,
      m.maxLateralB,m.maxAngleB,m.maxAngleBC,m.minClearance,m.relativeAngleBA,m.relativeAngleBC??'',m.comSpeed,
      m.solverAttempts,m.solverSubsteps,Number(m.limitCountsExact),m.outcome,m.stopReason??r.stopReason??'');
    rows.push(row.map(value=>typeof value==='string'?`"${value.replaceAll('"','""')}"`:String(value)).join(','));
  }
  return rows.join('\n');
}
