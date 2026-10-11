import { SESSION_LIMITS } from './assistant';
import type { TrainConfig } from './types';
export const MAX_RECORDING_NODES = 5000000;
export const RECORDING_REASON = 'Достигнут предел записи';
export const RECORDING_RESERVE_BYTES = 8192;
export function serializedBytes(value:unknown):number {return new TextEncoder().encode(JSON.stringify(value)).byteLength;}
export function boundedTree(value:unknown,depth=0,budget={nodes:0}):void {
  if(depth>20||++budget.nodes>MAX_RECORDING_NODES)throw new Error('Превышен размер дерева записи');
  if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>1e16))throw new Error('Недопустимое число в записи');
  if(typeof value==='string'&&value.length>4096)throw new Error('Превышена длина строки записи');
  if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){
    if(['__proto__','prototype','constructor'].includes(key))throw new Error('Недопустимый ключ записи');boundedTree(child,depth+1,budget);
  }
}
export function fitsRecording(bytes:number):boolean {return bytes<=SESSION_LIMITS.maxImportBytes-RECORDING_RESERVE_BYTES;}
export function recordingNodes(value:unknown):number {const budget={nodes:0};boundedTree(value,0,budget);return budget.nodes;}
export function boundedConfig(config:TrainConfig):void {
  boundedTree(config);const n=config.numerics,w=config.world;
  if(!n||n.substeps>128||n.maxAdaptiveSubsteps>4096||n.solverIterations>128||n.maxContactEvents>4096||n.maxObstacles>SESSION_LIMITS.maxObjects
    ||!w||!Array.isArray(w.statics)||!Array.isArray(w.asteroids)||!Array.isArray(w.fields)
    ||w.statics.length+w.asteroids.length+w.fields.length>SESSION_LIMITS.maxObjects)throw new Error('Превышен бюджет конфигурации записи');
  for(const item of [...w.statics,...w.asteroids,...w.fields])if(['__proto__','prototype','constructor'].includes(item.id))throw new Error('Недопустимый идентификатор объекта записи');
}
