import { Rng } from '@bonk-race/shared';
import { worldHasPenetration } from '../u2taglab/physics/worldContacts';
import { cloneTrainConfig } from './config';
import { createTrain, trainBounds, trainNamedBodies, validTrainState } from './train';
import type { TrainConfig, TrainState } from './types';
export type SceneId = 'empty'|'braking'|'turn'|'passage'|'failure'|'disconnect';
export interface SceneSpec { id: SceneId; seed: number; mirror: 1|-1; speed: 0|40|80; variant?: '45'|'90'|'180'|'arc'|'g0'|'delay2'|'lateral0'|'retro0'|'AB'|'BC' }
export const defaultScene = (): SceneSpec => ({id:'empty',seed:1,mirror:1,speed:0});
export function validateScene(s: SceneSpec): void {
  if (!s || !['empty','braking','turn','passage','failure','disconnect'].includes(s.id)
    || !Number.isInteger(s.seed) || s.seed<0 || s.seed>0xffffffff || ![1,-1].includes(s.mirror) || ![0,40,80].includes(s.speed) || (s.id==='braking'&&s.speed===0)
    || (s.variant!==undefined && !['45','90','180','arc','g0','delay2','lateral0','retro0','AB','BC'].includes(s.variant))) throw new Error('Недопустимая сцена');
}
export function createScene(original: TrainConfig, scene: SceneSpec): TrainState {
  validateScene(scene); const config=cloneTrainConfig(original);config.world.seed=scene.seed;
  // Препятствия этой сцены восстанавливаются по seed, в том числе из уже инициализированной ссылки.
  config.world.statics=config.world.statics.filter(o=>!/^passage:\d+:(-1|1)$/.test(o.id));
  if(scene.id==='failure' && scene.variant==='lateral0')config.ships.C.lateralForce=0;
  if(scene.id==='failure' && scene.variant==='retro0')config.ships.C.reverseForce=0;
  if(scene.id==='passage') {
    const rng=new Rng(scene.seed), gap=3*Math.max(...Object.values(config.ships).map(p=>p.geometry.width));
    for(let i=0;i<5;i++)for(const sign of [-1,1])config.world.statics.push({id:`passage:${i}:${sign}`,kind:'station',
      position:{x:config.world.spawnPoint.x+600+i*260,y:sign*(gap+30+rng.range(0,20))},radius:60});
  }
  const state=createTrain(config);
  for(const b of Object.values(state.bodies))b.velocity.x=scene.speed;
  if(scene.id==='braking') {
    state.bodies.B.position.y+=scene.mirror*.1*state.bodies.B.radius;
    state.bodies.B.angle=scene.mirror*5*Math.PI/180; state.bodies.B.velocity.y=scene.mirror*2;
  }
  if(!validTrainState(state) || worldHasPenetration(trainNamedBodies(state),state.world.statics,trainBounds(state),config.numerics.normalEpsilon))throw new Error('Возмущённая сцена не помещается');
  return state;
}
