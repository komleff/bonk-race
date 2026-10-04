// Проверяем независимую схему, исходный генератор и атомарный импорт реальной лаборатории.
const {test}=require('node:test');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {assert,near}=require('./helpers.cjs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const make=()=>new BonkLab({}, {towing:true,space:true});
const api=()=>{const path='../../.cache/tuglab-tests/client/src/u2taglab/share.js';assert.ok(existsSync(resolve(__dirname,path)),'должна существовать независимая схема U2TagLab');return require(path);};
const exported=lab=>{assert.equal(typeof lab.exportSpaceShareSnapshot,'function','экспорт должен учитывать исходный генератор');return lab.exportSpaceShareSnapshot();};
const imported=(lab,value)=>{assert.equal(typeof lab.applySpaceShareSnapshot,'function','импорт должен быть атомарным');return lab.applySpaceShareSnapshot(value);};
test('all coupling types start at the common360m recommendation with matching world reservation',()=>{
 const lab=make(),s=lab.getState();near(s.towing.distance,360);near(s.towing.coupling.restLength,360);near(s.towing.coupling.k,360000);near(lab.params['tow.dampingRatio'],1);near(s.towing.coupling.c,710000);
 near(s.y,9000-24.879310344827587-2*49.75862068965517-360-500);near(s.distanceM,0);
 for(const type of ['rope','rod','spring']){lab.updateParams('tow.type',type);assert.equal(lab.params['tow.type'],type);near(lab.params['tow.length'],360);lab.reset();near(lab.getState().towing.distance,360);}
});
test('space schema round trips full effective profile and current FA with bounded links',()=>{
 const lab=make();lab.updateParams('mass',456789);lab.setSpaceFA(false);lab.updateParams('space.fieldPressure',321);
 const a=api(),s=exported(lab),fragment=a.encodeSpaceShareFragment(s);assert.match(fragment,/^#u2tag=/);assert.ok(fragment.length<16000);
 assert.deepEqual(a.decodeSpaceShareFragment(fragment),s);assert.equal(s.params.mass,456789);assert.equal(s.params['space.fa'],false);
 const url=a.createSpaceShareUrl('https://example.com/bonk-race/u2taglab/?a=1',s);assert.ok(url.startsWith('https://example.com/bonk-race/u2taglab/?a=1#u2tag='));
 const target=make();imported(target,a.decodeSpaceShareFragment(fragment));for(const [key,value] of Object.entries(s.params))assert.equal(target.params[key],value);
 assert.equal(target.isRunning,false);assert.equal(target.hasStarted,false);near(target.getState().elapsedTime,0);
});
test('live length/radius overrides never replace the actual seeded course on share or Restart',()=>{
 const source=make(),initial=structuredClone(source.getState().spaceWorld);source.updateParams('tow.length',1000);source.updateParams('tow.radiusB',100);
 source.start();for(let i=0;i<250;i++)source.update(1/60);source.pause();const s=exported(source);
 const targets=[make(),make()];for(const target of targets) {imported(target,s);assert.deepEqual(target.getState().spaceWorld,initial);assert.equal(target.params['tow.length'],1000);assert.equal(target.params['tow.radiusB'],100);assert.equal(target.getState().towing.needsRestart,false);near(target.getState().distanceM,0);near(target.getState().progressPct,0);}
 assert.deepEqual(targets[0].getState(),targets[1].getState());targets[0].reset();assert.deepEqual(targets[0].getState(),targets[1].getState());
 const changed=make();changed.updateParams('tow.length',1000);changed.updateParams('tow.radiusB',100);changed.reset();assert.notDeepEqual(changed.getState().spaceWorld,initial);
});
test('validation rejects unknown/missing keys, incompatibility, nonfinite values and invalid ranges atomically',()=>{
 const lab=make(),a=api(),s=exported(lab);lab.start();lab.setInput(1,0,1);const before=lab.getState(),params=lab.params;
 const cases=[v=>v.extra=1,v=>delete v.params['space.fa'],v=>v.params.extra=1,v=>v.schema=9,v=>v.model='arcade',v=>v.generator='u2-space-world-fields-v1',v=>v.seed=-1,v=>v.seed=1.5,v=>v.density=26,v=>v.params.mass=NaN,v=>v.params['space.forwardForce']=Infinity,v=>v.params['space.fa']='true',v=>v.params['tow.radiusB']=251,v=>{v.params['tow.type']='rope';v.params['tow.length']=19;},v=>v.world.couplingLength=2001,v=>v.world.radiusB=0,v=>v.world.fields.extra=1,v=>v.world.fields.fieldPressure=Infinity,v=>v.world.asteroidMaxSpeed=101];
 for(const mutate of cases){const v=structuredClone(s);mutate(v);assert.throws(()=>a.validateSpaceShareSnapshot(v),/U2TagLab/);assert.throws(()=>imported(lab,v),/U2TagLab/);assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.params,params);assert.equal(lab.isRunning,true);}
 assert.throws(()=>a.decodeSpaceShareFragment('#tug=abc'),/U2TagLab/);assert.throws(()=>a.decodeSpaceShareFragment('#u2tag='+ 'a'.repeat(16000)),/U2TagLab/);assert.throws(()=>a.decodeSpaceShareFragment('#u2tag=e30'),/U2TagLab/);
 const old=new BonkLab({}, {towing:true});assert.throws(()=>imported(lab,old.exportShareSnapshot()),/U2TagLab/);assert.throws(()=>old.applyShareSnapshot(s),/TugLab/);
});
test('unsafe generated starting pair is rejected before params or running state change',()=>{
 const lab=make(),s=exported(lab);lab.start();const before=lab.getState(),params=lab.params;
 s.params['tow.radiusB']=250;s.params['tow.length']=2000;s.world.radiusB=2;s.world.couplingLength=20;s.density=25;s.params['arena.objectDensity']=25;
 // Подменяем только фабрику поиска в тестовой границе, чтобы проверить поздний отказ до commit.
 const {LabTowing}=require('../../.cache/tuglab-tests/client/src/tuglab/labTowing.js'),original=LabTowing.prototype.reset;
 LabTowing.prototype.reset=function(){this.fail('Невозможный старт');return undefined;};
 try{assert.throws(()=>imported(lab,s),/U2TagLab.*старт/);assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.params,params);assert.equal(lab.isRunning,true);}finally{LabTowing.prototype.reset=original;}
});
test('shared launch checks moving asteroids as well as statics when reserving the chosen pair',()=>{
 const {createSpaceWorld}=require('../../.cache/tuglab-tests/client/src/u2taglab/world.js');
 const {createSpaceProfile}=require('../../.cache/tuglab-tests/client/src/u2taglab/profile.js');
 let hits=0;
 for(const seed of [0,1,2,3,4,5,6,7,8,9,10,11,42,99,123,987]) {
  const target=make(),snapshot=exported(target);snapshot.seed=seed;snapshot.density=25;snapshot.params['arena.objectDensity']=25;
  snapshot.world.couplingLength=20;snapshot.world.radiusB=2;snapshot.params['tow.length']=2000;snapshot.params['tow.radiusB']=250;
  const world=createSpaceWorld({...createSpaceProfile(),radiusB:2},seed,25,snapshot.world);imported(target,snapshot);const state=target.getState();
  for(const body of [{position:{x:state.x,y:state.y},radius:state.radius},state.towing.B]) {
   for(const asteroid of world.asteroids) {const gap=Math.hypot(body.position.x-asteroid.position.x,body.position.y-asteroid.position.y)-body.radius-asteroid.radius;if(gap<0)hits++;assert.ok(gap>=-1e-7,`seed ${seed}: состав пересекает подвижный астероид`);}
  }
 }
 assert.equal(hits,0);
});
test('live tug mass overrides never alter the global seeded asteroid population through share or Restart',()=>{
 const source=make(),initial=source.getState().spaceWorld;
 source.updateParams('mass',600000);assert.deepEqual(source.getState().spaceWorld,initial);const snapshot=exported(source);assert.equal(Object.hasOwn(snapshot.world,'asteroidMassReference'),false);
 const target=make();imported(target,snapshot);assert.equal(target.params.mass,600000);assert.deepEqual(target.getState().spaceWorld,initial);target.reset();assert.deepEqual(target.getState().spaceWorld,initial);source.reset();assert.deepEqual(source.getState().spaceWorld,initial);
 const other=make();other.updateParams('mass',10000);other.reset();assert.deepEqual(other.getState().spaceWorld.asteroids,initial.asteroids);
 const before=target.getState(),bad=structuredClone(snapshot);bad.world.asteroidMassReference=300000;assert.throws(()=>imported(target,bad),/U2TagLab/);assert.deepEqual(target.getState(),before);
});
test('short rope and rod links retain full hidden spring settings on import and switchback',()=>{
 for(const type of ['rope','rod'])for(const length of [20,270]){
  const snapshot=exported(make());snapshot.params['tow.type']=type;snapshot.params['tow.length']=length;snapshot.params['tow.module']='custom';snapshot.params['tow.stiffness']=123456;snapshot.params['tow.dampingRatio']=0.75;
  const target=make();imported(target,api().decodeSpaceShareFragment(api().encodeSpaceShareFragment(snapshot)));
  assert.deepEqual(exported(target),snapshot);near(target.getState().towing.coupling.restLength,length);target.updateParams('tow.type','spring');
  near(target.params['tow.length'],length);near(target.params['tow.stiffness'],123456);near(target.params['tow.dampingRatio'],0.75);
 }
});
test('actual former270m legacy snapshot retains exact coefficients, geometry and recipe',()=>{
 const snapshot=require('./fixtures/u2-space-v2.json'),target=make();assert.equal(snapshot.model,'u2-space-circles-disk-v2');
 imported(target,api().decodeSpaceShareFragment(api().encodeSpaceShareFragment(snapshot)));
 assert.deepEqual(exported(target),snapshot);near(target.getState().towing.coupling.c,196189.25550989318);const before=target.getState();target.reset();assert.deepEqual(target.getState(),before);
});
