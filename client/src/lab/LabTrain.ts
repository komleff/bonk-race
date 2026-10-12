import { attachmentState } from '../tuglab/physics/coupling';
import { cloneSpaceWorld } from '../u2taglab/world';
import { worldHasPenetration, type WorldContactEvent } from '../u2taglab/physics/worldContacts';
import { spaceEngineWrench, spaceInputFrame } from '../u2taglab/physics/flightAssist';
import { sampleSpaceFieldResponse } from '../u2taglab/fields';
import { trainSpaceProfile } from '../tuglab2/config';
import { AssistantPathTracker } from '../tuglab2/assistantPath';
import { advanceTrain } from '../tuglab2/physics';
import { createTrain, setTrainConnection, trainBounds, trainNamedBodies, validTrainState } from '../tuglab2/train';
import { commandCWrench, computeAssistant, defaultAssistantSettings, observeAssistant, validateAssistantSettings, zeroCommandC,
  type AssistantObservation, type AssistantResult, type AssistantSettings, type CommandC } from '../tuglab2/assistant';
import type { TrainConfig, TrainConnectionId, TrainState, TrainWrench } from '../tuglab2/types';
import type { LabTrainSnapshot } from './labTypes';
export interface LabTrainInput { x:number; y:number; magnitude:number; brake:boolean }
export interface LabTrainStep { accepted:boolean; contacts:WorldContactEvent[]; reason?:string }

// Те же численные потолки, что у boundedConfig, без зависимости от журнала эксперимента.
// Они ограничивают первоначальный проход 128×128, сохраняя штатные 4/512/16.
function validateLiveSolverBudget(config:TrainConfig):void {
  const n=config?.numerics;
  if(!n||!Number.isInteger(n.substeps)||n.substeps<1||n.substeps>128
    ||!Number.isInteger(n.solverIterations)||n.solverIterations<1||n.solverIterations>128
    ||!Number.isInteger(n.maxAdaptiveSubsteps)||n.maxAdaptiveSubsteps<1||n.maxAdaptiveSubsteps>4096
    ||!Number.isInteger(n.maxContactEvents)||n.maxContactEvents<1||n.maxContactEvents>4096
    ||n.substeps>n.maxAdaptiveSubsteps)throw new Error('Превышен или некорректен численный бюджет игрового ABC (подшаги ≤128, итерации ≤128, адаптивные подшаги и контакты ≤4096)');
}

// Ищем весь вертикальный состав в исходной карте, не удаляя препятствия и поля.
export function createVerticalTrain(config:TrainConfig):TrainState {
  validateLiveSolverBudget(config);
  if(config.composition!=='train')throw new Error('ABC поддерживает только трёхкорпусный состав с пружинами');
  const original=structuredClone(config), world=cloneSpaceWorld(original.world);
  world.time=0;world.tick=0;
  const template=createTrain({...original,world:{...world,width:1e9,height:1e9,spawnPoint:{x:0,y:0},statics:[],asteroids:[]}});
  template.config=original;template.world=world;
  template.world.fieldShipRadii={A:template.bodies.A.radius,B:template.bodies.B.radius};
  template.config.world=cloneSpaceWorld(template.world);
  const offsets=Object.fromEntries(Object.values(template.bodies).map(b=>[b.id,-b.position.x]));
  const obstacles=[...world.statics,...world.asteroids];
  const clearLinks=(state:TrainState)=>state.connections.every(l=>{
    const a=attachmentState(state.bodies[l.bodyA]!,'tail').position,b=attachmentState(state.bodies[l.bodyB]!,'nose').position;
    const dx=b.x-a.x,dy=b.y-a.y,square=dx*dx+dy*dy;
    return obstacles.every(o=>{const t=Math.max(0,Math.min(1,((o.position.x-a.x)*dx+(o.position.y-a.y)*dy)/Math.max(square,1e-12)));
      return Math.hypot(o.position.x-a.x-t*dx,o.position.y-a.y-t*dy)>=o.radius+1;});
  });
  for(let lateral=0;lateral<=2500;lateral+=100)for(const sign of lateral===0?[1]:[1,-1])for(let depth=0;depth<=2500;depth+=100){
    for(const b of Object.values(template.bodies)){b.position={x:world.spawnPoint.x+sign*lateral,y:world.spawnPoint.y-depth+offsets[b.id]};b.angle=-Math.PI/2;}
    for(const l of template.connections)l.lastNormal={x:0,y:1};
    if(validTrainState(template)&&!worldHasPenetration(trainNamedBodies(template),world.statics,trainBounds(template),config.numerics.normalEpsilon)&&clearLinks(template))return template;
  }
  throw new Error('ABC не помещается в стартовой области карты: измените корпуса, длины или seed');
}

// Игровой адаптер не владеет журналом, секундомером финиша и лимитами эксперимента.
export class LabTrain {
  state:TrainState;
  readonly settings:AssistantSettings;
  commandC:CommandC=zeroCommandC();
  assistant:AssistantResult;
  engineWrenches:Record<string,TrainWrench>={};
  reason?:string;
  needsRestart=false;
  private history:AssistantObservation[]=[];
  private pathTracker:AssistantPathTracker;
  private disabled:boolean;
  private rearPointer=false;
  private rearKeyboard=false;
  constructor(config:TrainConfig,settings:AssistantSettings=defaultAssistantSettings(),disabled=false){
    validateAssistantSettings(settings);this.settings={...settings};this.state=createVerticalTrain(config);this.disabled=disabled;this.pathTracker=new AssistantPathTracker(this.state);
    this.assistant=computeAssistant(undefined,this.state,this.settings,this.disabled);
  }
  get rearBrake(){return this.rearPointer||this.rearKeyboard;}
  get latched(){return this.disabled;}
  setSettings(patch:Partial<AssistantSettings>):{ok:boolean;reason?:string}{
    try {
      if(!patch||Object.keys(patch).some(k=>!Object.hasOwn(this.settings,k)))throw new Error('Неизвестная настройка ассистента');
      const candidate={...this.settings,...patch};validateAssistantSettings(candidate);
      const disabled=patch.mode===undefined&&this.disabled;
      const assistant=computeAssistant(undefined,this.state,candidate,disabled);
      Object.assign(this.settings,candidate);this.disabled=disabled;
      // Изменение настроек не создаёт наблюдение и не меняет принятую физику.
      if(candidate.mode==='coast'||candidate.g===0||disabled||patch.mode!==undefined){this.commandC=zeroCommandC();this.assistant=assistant;}
      return {ok:true};
    }catch(error){return {ok:false,reason:error instanceof Error?error.message:'Настройки не приняты'};}
  }
  setRearBrake(enabled:boolean,source:'pointer'|'keyboard'='pointer'){
    if(typeof enabled!=='boolean'||!['pointer','keyboard'].includes(source))return;
    if(source==='keyboard')this.rearKeyboard=enabled;else this.rearPointer=enabled;
  }
  private clear(){this.history=[];this.commandC=zeroCommandC();this.engineWrenches={};this.rearPointer=this.rearKeyboard=false;
    this.assistant=computeAssistant(undefined,this.state,this.settings,this.disabled);}
  pause(reason?:string){this.state.paused=true;this.clear();if(reason&&!this.needsRestart)this.reason=reason;}
  resume(){if(this.needsRestart)return;this.reason=undefined;this.state.paused=false;}
  fail(reason:string){this.needsRestart=true;this.reason=reason;this.pause();}
  setConnection(id:TrainConnectionId,connected:boolean):{ok:boolean;reason?:string}{
    if(!['AB','BC'].includes(id)||typeof connected!=='boolean')return {ok:false,reason:'Недопустимая сцепка'};
    const r=setTrainConnection(this.state,id,connected);if(r.reason)return {ok:false,reason:r.reason};this.state=r.state;
    if(!connected){this.disabled=true;this.clear();}return {ok:true};
  }
  snapshot(paused:boolean):LabTrainSnapshot {
    return structuredClone({B:this.state.bodies.B,C:this.state.bodies.C!,connections:this.state.connections,diagnostics:this.state.diagnostics,
      commandC:this.commandC,assistant:this.assistant,settings:this.settings,engineWrenches:this.engineWrenches,paused,reason:this.reason,needsRestart:this.needsRestart,rearBrake:this.rearBrake});
  }
  advance(input:LabTrainInput,dt:number,fa:boolean):LabTrainStep {
    if(this.needsRestart||this.state.paused)return {accepted:false,contacts:[],reason:this.reason};
    if(!input||![input.x,input.y,input.magnitude,dt].every(Number.isFinite)||Math.abs(input.x)>1||Math.abs(input.y)>1
      ||input.magnitude<0||input.magnitude>1||dt<=0||dt>.25||typeof input.brake!=='boolean'||typeof fa!=='boolean'){
      this.fail('Недопустимый конечный ввод или шаг ABC');return {accepted:false,contacts:[],reason:this.reason};}
    const now=observeAssistant(this.state,input.brake||this.rearBrake,this.pathTracker.reference(this.state)),history=[...this.history,now];
    const delay=Math.ceil(this.settings.delay/dt-1e-10)*dt;
    let observation:AssistantObservation|undefined;
    for(let i=history.length-1;i>=0;i--)if(history[i].time<=now.time-delay+1e-10){observation=history[i];break;}
    const assistant=computeAssistant(observation,this.state,this.settings,this.disabled),command=assistant.command;
    const world=this.state.world,p=trainSpaceProfile(this.state.config,'A');
    const r=advanceTrain(this.state,dt,sample=>{
      let engine:TrainWrench={force:{x:0,y:0},torque:0};
      if(sample.id==='A')engine=spaceEngineWrench(sample.body,spaceInputFrame(sample.body,input.x,input.y,input.magnitude,p,input.brake),fa,p,sample.subDt);
      if(sample.id==='C')engine=commandCWrench(sample.body,command,this.state.config.ships.C,sample.subDt,observation?.track);
      return {...sampleSpaceFieldResponse(world,{...sample.body,id:sample.id},sample.time,sample.subDt,engine),engineWrench:engine};
    });
    if(r.stopReason){this.fail(r.stopReason);return {accepted:false,contacts:[],reason:r.stopReason};}
    const means:Record<string,TrainWrench>={},durations:Record<string,number>={};
    for(const sample of r.forceSamples){const e=sample.engineWrench!;const w=means[sample.id]??={force:{x:0,y:0},torque:0};
      durations[sample.id]=(durations[sample.id]??0)+sample.subDt;w.force.x+=e.force.x*sample.subDt;w.force.y+=e.force.y*sample.subDt;w.torque+=e.torque*sample.subDt;}
    for(const [id,w] of Object.entries(means)){w.force.x/=durations[id];w.force.y/=durations[id];w.torque/=durations[id];}
    this.state=r.state;this.pathTracker.accept(this.state);this.commandC={...command};this.assistant=structuredClone(assistant);this.engineWrenches=means;
    this.history=history.filter(o=>o.time>=now.time-2-dt);
    return {accepted:true,contacts:r.contacts};
  }
  config():TrainConfig{return structuredClone(this.state.config);}
}
