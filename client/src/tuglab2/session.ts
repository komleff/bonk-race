import type { WorldContactEvent } from '../u2taglab/physics/worldContacts';
import { worldHasPenetration } from '../u2taglab/physics/worldContacts';
import { spaceEngineWrench, spaceInputFrame } from '../u2taglab/physics/flightAssist';
import { sampleSpaceFieldResponse } from '../u2taglab/fields';
import { hullCircleRadius, hullInertia } from '../u2taglab/profile';
import { trainSpaceProfile } from './config';
import { advanceTrain } from './physics';
import { cloneTrainState, createTrain, setTrainConnection, trainBounds, trainNamedBodies, validTrainState } from './train';
import { commandCWrench, computeAssistant, defaultAssistantSettings, observeAssistant, SESSION_LIMITS,
  validateAssistantSettings, zeroCommandC, type AssistantMode, type AssistantObservation, type AssistantResult, type AssistantSettings, type CommandC } from './assistant';
import { validCommandC } from './assistant';
import { createScene, defaultScene, type SceneSpec } from './scenes';
import { sampleTelemetry, type TrainTelemetry } from './telemetry';
import type { TrainConfig, TrainConnectionId, TrainState, TrainWrench } from './types';
import type { TrainRecording, RecordingEvent } from './recording';
import { boundedConfig, boundedTree, fitsRecording, MAX_RECORDING_NODES, recordingNodes, RECORDING_REASON, serializedBytes } from './recordingLimits';

declare const __TUGLAB2_SOURCE_SHA__: string;
declare const __TUGLAB2_APP_VERSION__: string;
export interface InputA { x:number; y:number; magnitude:number; brake:boolean }
export interface SessionOptions { settings?:Partial<AssistantSettings>; scene?:SceneSpec; appVersion?:string; sourceSHA?:string; fa?:boolean; initialState?:TrainState; dt?:number }
export interface SessionStep { accepted:boolean; state:TrainState; commandC:CommandC; contacts:WorldContactEvent[]; stopReason?:string }
export function validInputA(i:InputA):boolean {
  return Boolean(i) && [i.x,i.y,i.magnitude].every(Number.isFinite) && Math.abs(i.x)<=1 && Math.abs(i.y)<=1
    && i.magnitude>=0 && i.magnitude<=1 && typeof i.brake==='boolean';
}
export function buildIdentity() {
  return {appVersion:typeof __TUGLAB2_APP_VERSION__==='string'?__TUGLAB2_APP_VERSION__:'0.1.0',
    sourceSHA:typeof __TUGLAB2_SOURCE_SHA__==='string'?__TUGLAB2_SOURCE_SHA__:'development'};
}
export class TrainSession {
  state:TrainState;
  settings:AssistantSettings;
  commandC:CommandC=zeroCommandC();
  telemetry:TrainTelemetry;
  recording:TrainRecording;
  stoppedReason?:string;
  comparison?:{compositionChanged:boolean;completeInput:boolean;measurementComplete:boolean;sourceTicks:number;acceptedTicks:number;windowSeconds:number};
  readonly dt:number;
  fa:boolean;
  private initialState:TrainState;
  private initialSettings:AssistantSettings;
  private initialFA:boolean;
  private history:AssistantObservation[]=[];
  private disabled=false;
  private assistant:AssistantResult;
  private recordingBytes=0;
  private recordingNodeCount=0;
  private recordingLimited=false;
  get assistantStatus(){return this.assistant.status;}
  constructor(config:TrainConfig, options:SessionOptions={}) {
    boundedConfig(config);if(options.initialState){boundedTree(options.initialState);boundedConfig(options.initialState.config);
      boundedConfig({...options.initialState.config,world:options.initialState.world});}
    this.settings={...defaultAssistantSettings(),...options.settings};validateAssistantSettings(this.settings);
    this.dt=options.dt??1/config.numerics.tickRate;
    if(![1/30,1/60,1/120].includes(this.dt))throw new Error('Физический шаг должен быть 30, 60 или 120 Гц');
    this.fa=options.fa??true;
    if(typeof this.fa!=='boolean')throw new Error('Недопустимое состояние FA');
    const scene=options.scene??{...defaultScene(),seed:config.world.seed};
    if(scene.id==='failure'&&scene.variant==='g0')this.settings.g=0;
    if(scene.id==='failure'&&scene.variant==='delay2')this.settings.delay=2;
    this.state=options.initialState?cloneTrainState(options.initialState):options.scene?createScene(config,scene):createTrain(config);
    if(!validTrainState(this.state)||this.state.world.time!==0||this.state.world.tick!==0
      ||worldHasPenetration(trainNamedBodies(this.state),this.state.world.statics,trainBounds(this.state),this.state.config.numerics.normalEpsilon))throw new Error('Запись начинается только с допустимого начального мира');
    const same=(a:number,b:number)=>Math.abs(a-b)<=1e-12*Math.max(1,Math.abs(a),Math.abs(b));
    for(const body of Object.values(this.state.bodies)) {
      const profile=this.state.config.ships[body.id];
      if(!same(body.mass,profile.mass)||!same(body.radius,hullCircleRadius(profile.geometry))||!same(body.inertia,hullInertia(profile.mass,profile.geometry)))
        throw new Error('Начальная масса, радиус или инерция не соответствуют профилю корпуса');
    }
    this.state.config.numerics.tickRate=1/this.dt;
    this.state.paused=true;this.initialState=cloneTrainState(this.state);this.initialSettings={...this.settings};this.initialFA=this.fa;
    this.assistant=computeAssistant(undefined,this.state,this.settings);this.telemetry=sampleTelemetry(this.state,this.assistant,[]);
    this.recording={schema:1,app:'tuglab2',...buildIdentity(),...pickIdentity(options),dt:this.dt,config:structuredClone(this.state.config),
      initialState:cloneTrainState(this.initialState),settings:{...this.settings},scene:structuredClone(scene),fa:this.fa,events:[],ticks:[]};
    this.recordingNodeCount=recordingNodes(this.recording);this.recordingBytes=serializedBytes(this.recording);
    if(!fitsRecording(this.recordingBytes)||this.recordingNodeCount>MAX_RECORDING_NODES-16)throw new Error(RECORDING_REASON);
  }
  private stopRecording(){this.state.paused=true;this.clearCommands();this.recordingLimited=true;this.stoppedReason=RECORDING_REASON;this.recording.stopReason=RECORDING_REASON;}
  private event(type:RecordingEvent['type'],value:RecordingEvent['value']){
    const e={tick:this.recording.ticks.length,type,value:structuredClone(value)} as RecordingEvent;
    const nodes=recordingNodes(e),size=serializedBytes(e)+(this.recording.events.length?1:0);
    if(this.recordingLimited||this.recording.events.length>=SESSION_LIMITS.maxRecordingTicks||!fitsRecording(this.recordingBytes+size)||this.recordingNodeCount+nodes>MAX_RECORDING_NODES-16){this.stopRecording();throw new Error(RECORDING_REASON);}
    this.recording.events.push(e);this.recordingBytes+=size;this.recordingNodeCount+=nodes;
  }
  resume(){this.event('resume',true);this.state.paused=false;}
  private clearCommands(){this.history=[];this.commandC=zeroCommandC();this.assistant={...this.assistant,command:this.commandC};}
  pause(){this.state.paused=true;this.clearCommands();try{this.event('pause',true);}catch(error){if(!this.recordingLimited)throw error;}}
  restart(){
    this.state=cloneTrainState(this.initialState);this.settings={...this.initialSettings};this.fa=this.initialFA;this.history=[];this.disabled=false;
    this.commandC=zeroCommandC();this.stoppedReason=undefined;this.comparison=undefined;this.assistant=computeAssistant(undefined,this.state,this.settings);
    this.telemetry=sampleTelemetry(this.state,this.assistant,[]);this.recording.events=[];this.recording.ticks=[];delete this.recording.stopReason;
    this.recordingLimited=false;this.recordingBytes=serializedBytes(this.recording);this.recordingNodeCount=recordingNodes(this.recording);
  }
  setMode(mode:AssistantMode){validateAssistantSettings({...this.settings,mode});this.event('mode',mode);this.settings={...this.settings,mode};this.disabled=false;
    if(mode==='coast'){this.commandC=zeroCommandC();this.history=[];}this.assistant=computeAssistant(undefined,this.state,this.settings,this.disabled);}
  setAssistantSettings(patch:Partial<AssistantSettings>){const s={...this.settings,...patch};validateAssistantSettings(s);
    if(Object.keys(patch).some(k=>!Object.hasOwn(defaultAssistantSettings(),k)))throw new Error('Неизвестная настройка ассистента');
    this.event('settings',patch);if(patch.mode!==undefined){this.disabled=false;if(s.mode==='coast')this.history=[];}this.settings=s;
    if(s.g===0||s.mode==='coast'){this.commandC=zeroCommandC();}this.assistant=computeAssistant(undefined,this.state,this.settings,this.disabled);}
  setFA(fa:boolean){if(typeof fa!=='boolean')throw new Error('Недопустимое состояние FA');this.event('fa',fa);this.fa=fa;}
  setConnection(id:TrainConnectionId,connected:boolean){
    if(!['AB','BC'].includes(id)||typeof connected!=='boolean')return {ok:false,reason:'Недопустимая сцепка'};
    const result=setTrainConnection(this.state,id,connected);if(result.reason)return {ok:false,reason:result.reason};
    this.event('connection',{id,connected});this.state=result.state;if(!connected){this.disabled=true;this.history=[];this.commandC=zeroCommandC();this.assistant=computeAssistant(undefined,this.state,this.settings,true);}
    return {ok:true};
  }
  setConfig(config:TrainConfig){
    if(!this.state.paused)throw new Error('Профили меняются только на паузе');
    const replacement=new TrainSession(config,{settings:this.settings,fa:this.fa,scene:{...this.recording.scene,seed:config.world.seed},dt:this.dt,
      appVersion:this.recording.appVersion,sourceSHA:this.recording.sourceSHA});
    Object.assign(this,replacement);
  }
  step(inputA:InputA,rearBrake=false):SessionStep{return this.advance(inputA,rearBrake);}
  // Воспроизведение вводит готовую команду; наблюдения и регулятор не пересчитываются.
  stepRecorded(inputA:InputA,rearBrake:boolean,command:CommandC,assistant:AssistantResult,observation?:AssistantObservation):SessionStep {
    if(!validCommandC(command))throw new Error('Недопустимая записанная команда C');
    return this.advance(inputA,rearBrake,{command,assistant,observation});
  }
  private advance(inputA:InputA,rearBrake:boolean,replay?:{command:CommandC;assistant:AssistantResult;observation?:AssistantObservation}):SessionStep {
    if(!validInputA(inputA)||typeof rearBrake!=='boolean')throw new Error('Недопустимый ввод A');
    if(this.state.paused)return {accepted:false,state:this.state,commandC:this.commandC,contacts:[],stopReason:this.stoppedReason};
    if(this.recording.ticks.length>=SESSION_LIMITS.maxRecordingTicks){this.stopRecording();return {accepted:false,state:this.state,commandC:this.commandC,contacts:[],stopReason:this.stoppedReason};}
    const now=observeAssistant(this.state,inputA.brake||rearBrake), history=[...this.history,now];
    const effectiveDelay=Math.ceil(this.settings.delay/this.dt-1e-10)*this.dt;
    let observation:AssistantObservation|undefined;
    for(let i=history.length-1;i>=0;i--)if(history[i].time<=now.time-effectiveDelay+1e-10){observation=history[i];break;}
    const assistant=replay?structuredClone(replay.assistant):computeAssistant(observation,this.state,this.settings,this.disabled);
    const command=replay?{...replay.command}:assistant.command, world=this.state.world, fa=this.fa, p=trainSpaceProfile(this.state.config,'A');
    const result=advanceTrain(this.state,this.dt,sample=>{
      let engine:TrainWrench={force:{x:0,y:0},torque:0};
      if(sample.id==='A')engine=spaceEngineWrench(sample.body,spaceInputFrame(sample.body,inputA.x,inputA.y,inputA.magnitude,p,inputA.brake),fa,p,sample.subDt);
      if(sample.id==='C')engine=commandCWrench(sample.body,command,this.state.config.ships.C,sample.subDt);
      return {...sampleSpaceFieldResponse(world,{...sample.body,id:sample.id},sample.time,sample.subDt,engine),engineWrench:engine};
    });
    if(result.stopReason){this.state.paused=true;this.clearCommands();this.stoppedReason=result.stopReason;this.recording.stopReason=result.stopReason;
      this.telemetry={...this.telemetry,outcome:'numerical-stop',stopReason:result.stopReason};return {accepted:false,state:this.state,commandC:this.commandC,contacts:[],stopReason:result.stopReason};}
    const telemetry=sampleTelemetry(result.state,assistant,result.contacts,this.telemetry,this.initialState,this.dt,inputA.brake||rearBrake);
    const wrenches:Record<string,TrainWrench>=Object.create(null), engineWrenches:Record<string,TrainWrench>=Object.create(null), durations:Record<string,number>=Object.create(null);
    for(const sample of result.forceSamples){const w=wrenches[sample.id]??={force:{x:0,y:0},torque:0};durations[sample.id]=(durations[sample.id]??0)+sample.subDt;
      w.force.x+=sample.wrench.force.x*sample.subDt;w.force.y+=sample.wrench.force.y*sample.subDt;w.torque+=sample.wrench.torque*sample.subDt;
      if(!sample.engineWrench)throw new Error('В принятом шаге отсутствует журнал двигателей');
      const e=engineWrenches[sample.id]??={force:{x:0,y:0},torque:0};e.force.x+=sample.engineWrench.force.x*sample.subDt;
      e.force.y+=sample.engineWrench.force.y*sample.subDt;e.torque+=sample.engineWrench.torque*sample.subDt;}
    for(const mean of [wrenches,engineWrenches])for(const [id,w] of Object.entries(mean)){w.force.x/=durations[id];w.force.y/=durations[id];w.torque/=durations[id];}
    const tick={time:result.state.world.time,inputA:{...inputA},rearBrake,observation:replay?structuredClone(replay.observation):observation,
      commandC:{...command},wrenches,engineWrenches,telemetry:structuredClone(telemetry),contacts:structuredClone(result.contacts)};
    let size:number,nodes:number;
    try{nodes=recordingNodes(tick);size=serializedBytes(tick)+(this.recording.ticks.length?1:0);}catch{this.stopRecording();return {accepted:false,state:this.state,commandC:this.commandC,contacts:[],stopReason:this.stoppedReason};}
    if(!fitsRecording(this.recordingBytes+size)||this.recordingNodeCount+nodes>MAX_RECORDING_NODES-16){this.stopRecording();return {accepted:false,state:this.state,commandC:this.commandC,contacts:[],stopReason:this.stoppedReason};}
    this.state=result.state;this.commandC={...command};this.assistant=assistant;this.telemetry=telemetry;
    if(!replay)this.history=history.filter(o=>o.time>=now.time-2-this.dt);
    this.recording.ticks.push(tick);this.recordingBytes+=size;this.recordingNodeCount+=nodes;
    if(this.telemetry.outcome!=='running'){this.state.paused=true;this.clearCommands();}
    return {accepted:true,state:this.state,commandC:this.commandC,contacts:result.contacts};
  }
}
function pickIdentity(o:SessionOptions){const r:Partial<{appVersion:string;sourceSHA:string}>={};if(o.appVersion!==undefined)r.appVersion=o.appVersion;if(o.sourceSHA!==undefined)r.sourceSHA=o.sourceSHA;return r;}
