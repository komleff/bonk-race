import { LabTrain } from '../lab/LabTrain';
import { defaultAssistantSettings, validateAssistantSettings, type AssistantSettings } from '../tuglab2/assistant';
import type { TrainConfig } from '../tuglab2/types';
import { spaceProfileFromParams, validateSpaceShareSnapshot, type SpaceShareSnapshot } from './share';
import { createSpaceWorld } from './world';
export interface TrainShareSnapshot {
  schema:1; model:'u2taglab-abc-springs-v1'; base:SpaceShareSnapshot;
  configuration:Omit<TrainConfig,'composition'|'world'>; settings:AssistantSettings; fa:boolean;
}
const MAX_JSON=64000, MAX_FRAGMENT=88000;
function fail():never{throw new Error('Ссылка ABC: повреждённый или несовместимый формат');}
function exact(value:unknown,keys:string[]):value is Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const actual=Object.keys(value);return actual.length===keys.length&&actual.every(k=>keys.includes(k));
}
export function trainConfigFromShare(snapshot:TrainShareSnapshot):TrainConfig {
  const base=snapshot.base,p=spaceProfileFromParams(base.params,base.schema===1?{A:{length:60,width:27},B:{length:108,width:48}}:base.geometry);
  const world=createSpaceWorld({...p,radiusA:base.world.radiusA??p.radiusA,radiusB:base.world.radiusB},base.seed,base.density,base.world);
  return {...structuredClone(snapshot.configuration),composition:'train',world};
}
export function validateTrainShareSnapshot(value:unknown):TrainShareSnapshot {
  if(!exact(value,['schema','model','base','configuration','settings','fa'])||value.schema!==1||value.model!=='u2taglab-abc-springs-v1'
    ||typeof value.fa!=='boolean'||!exact(value.configuration,['ships','links','numerics'])
    ||!exact(value.settings,Object.keys(defaultAssistantSettings())))fail();
  try{
    const snapshot={schema:1,model:'u2taglab-abc-springs-v1',base:validateSpaceShareSnapshot(value.base),
      configuration:structuredClone(value.configuration),settings:structuredClone(value.settings),fa:value.fa} as unknown as TrainShareSnapshot;
    if(new TextEncoder().encode(JSON.stringify(snapshot)).byteLength>MAX_JSON)fail();validateAssistantSettings(snapshot.settings);
    if(snapshot.configuration.numerics.restitution!==snapshot.base.params['space.collisionRestitution'])fail();
    new LabTrain(trainConfigFromShare(snapshot),snapshot.settings);
    return snapshot;
  }catch{ return fail(); }
}
export function encodeTrainShareFragment(snapshot:TrainShareSnapshot):string {
  const json=JSON.stringify(validateTrainShareSnapshot(snapshot)),bytes=new TextEncoder().encode(json);
  return '#u2train='+btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export function decodeTrainShareFragment(fragment:string):TrainShareSnapshot {
  if(fragment.length>MAX_FRAGMENT||!/^#u2train=[A-Za-z0-9_-]+$/.test(fragment))fail();
  try{const binary=atob(fragment.slice(9).replace(/-/g,'+').replace(/_/g,'/'));if(binary.length>MAX_JSON)fail();
    const json=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)));if(json.length>MAX_JSON)fail();
    return validateTrainShareSnapshot(JSON.parse(json));}catch{return fail();}
}
export function createTrainShareUrl(shellUrl:string,snapshot:TrainShareSnapshot):string {const url=new URL(shellUrl);url.hash=encodeTrainShareFragment(snapshot);return url.href;}
