const {test}=require('node:test');
const {existsSync}=require('node:fs');
const {assert,near,core}=require('./helpers.cjs');
const {createSpaceProfile,createSpaceBody}=require('../../.cache/tuglab-tests/client/src/u2taglab/profile.js');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const defaults=require('../../client/src/tuglab/config/tuglab_defaults.json');
const api=()=>{
 const path='../../.cache/tuglab-tests/client/src/u2taglab/world.js';
 assert.ok(existsSync(require('node:path').resolve(__dirname,path)),'космический генератор и общий шаг должны существовать');
 return require(path);
};
const clone=x=>structuredClone(x);
const empty=()=>{const w=api().createSpaceWorld(createSpaceProfile(),42,5);w.statics=[];w.asteroids=[];return w;};
const setup=()=>{
 const p=createSpaceProfile(),A=createSpaceBody(p,'A'),B=createSpaceBody(p,'B');
 B.position={x:0,y:1500};const c=core('physics/coupling.js').createCoupling(defaults);c.connected=false;
 return {A,B,c,w:empty(),config:{...defaults,restitution:0.8,maxValidatedSpeed:1000}};
};
const run=(s,dt=1/60,force)=>api().advanceSpaceWorld(s.A,s.B,s.c,s.w,dt,s.config,force);
const asteroid=(id,r,x,y,vx=0,vy=0)=>({id,kind:'asteroid',...api().createAsteroid(r,{x,y},{x:vx,y:vy})});
const momentum=bodies=>bodies.reduce((s,b)=>({x:s.x+b.mass*b.velocity.x,y:s.y+b.mass*b.velocity.y}),{x:0,y:0});
test('seed reproduces semantic world, source geometry, ids and velocities',()=>{
 const p=createSpaceProfile(),a=api().createSpaceWorld(p,42,5),b=api().createSpaceWorld(p,42,5);
 assert.deepEqual(a,b);assert.notDeepEqual(a,api().createSpaceWorld(p,43,5));
 assert.ok(a.statics.some(o=>o.kind==='station'));assert.ok(a.statics.some(o=>o.kind==='derelict'));
 near(a.statics.find(o=>o.kind==='station').radius,Math.hypot(100,100)/2);
 near(a.statics.find(o=>o.kind==='derelict').radius,Math.hypot(1000,1000)/2);
 assert.ok(a.asteroids.length>0);assert.equal(new Set([...a.statics,...a.asteroids].map(o=>o.id)).size,a.statics.length+a.asteroids.length);
 for(const b of a.asteroids){assert.ok(b.radius>=0.5641895835477563&&b.radius<=252.313252202016);assert.ok(Math.hypot(b.velocity.x,b.velocity.y)<=5);near(b.angularVelocity,0);}
});
test('selected long composition, line and initial maneuver corridor are reserved',()=>{
 for(const length of [20,288,2000])for(const radiusB of [2,250])for(const seed of [1,42,2147483647]) {
  const p=createSpaceProfile();p.radiusB=radiusB;const w=api().createSpaceWorld(p,seed,25,{couplingLength:length});
  const low=w.spawnPoint.y-Math.max(2000,length),high=w.spawnPoint.y+p.radiusA+radiusB+length;
  for(const o of [...w.statics,...w.asteroids]) {
   const closestY=Math.max(low,Math.min(high,o.position.y));
   assert.ok(Math.hypot(o.position.x,o.position.y-closestY)>=o.radius+w.startClearance-1e-6);
   assert.ok(Math.abs(o.position.x)+o.radius<=w.width/2);assert.ok(Math.abs(o.position.y)+o.radius<=w.height/2);
  }
  assert.ok(high+radiusB<w.height/2);assert.ok(w.width>=6000&&w.height>=18000);
 }
});
test('2D asteroid factory uses areal mass and disk inertia while vacuum preserves motion',()=>{
 const b=api().createAsteroid(5,{x:200,y:0},{x:20,y:-8});near(b.mass,78539.81633974483);near(b.inertia,981747.7042468103);
 const s=setup();s.w.asteroids=[{id:'asteroid:0',kind:'asteroid',...b,angularVelocity:0.7}];const r=run(s,0.2);
 assert.equal(r.stopReason,undefined);near(r.world.asteroids[0].position.x,204);near(r.world.asteroids[0].position.y,-1.6);
 near(r.world.asteroids[0].velocity.x,20);near(r.world.asteroids[0].angularVelocity,0.7);near(r.world.asteroids[0].angle,0.14);
});
for(const target of ['A','B','asteroid'])test(`mass-aware swept asteroid/${target} contact preserves impulse at 100 m/s`,()=>{
 const s=setup(),a=asteroid('asteroid:0',5,-25,0,100,0);let body=s.A;
 if(target==='B'){s.A.position.y=1500;s.B.position={x:0,y:0};body=s.B;}
 if(target==='asteroid'){s.A.position.y=1500;s.B.position.y=2000;body=asteroid('asteroid:1',7,0,0);s.w.asteroids.push(body);}
 a.position.x=-body.radius-a.radius-0.1;s.w.asteroids.unshift(a);
 const before=momentum([s.A,s.B,...s.w.asteroids]),r=run(s),after=momentum([r.A,r.B,...r.world.asteroids]);
 assert.equal(r.stopReason,undefined);assert.ok(r.contacts.length>0);near(after.x,before.x,1e-5);near(after.y,before.y,1e-5);
 const hit=target==='A'?r.A:target==='B'?r.B:r.world.asteroids[1];assert.ok(hit.velocity.x>0);
 const incoming=r.world.asteroids[0];near(incoming.velocity.x,(a.mass-0.8*body.mass)*100/(a.mass+body.mass),1e-8);
 near(hit.velocity.x,1.8*a.mass*100/(a.mass+body.mass),1e-8);near(hit.angularVelocity,0);
});
test('swept CCD resolves small asteroids across a whole frame and keeps static station immobile',()=>{
 const s=setup();s.A.position.y=1500;s.B.position.y=2000;s.w.statics=[{id:'station:0',kind:'station',position:{x:0,y:0},radius:Math.hypot(100,100)/2}];
 s.w.asteroids=[asteroid('asteroid:0',5,-80,0,100,0)];const statics=clone(s.w.statics),r=run(s,1);
 assert.equal(r.stopReason,undefined);assert.ok(r.world.asteroids[0].position.x<-75);near(r.world.asteroids[0].velocity.x,-80);assert.deepEqual(r.world.statics,statics);
 s.w.statics=[];s.w.asteroids=[asteroid('asteroid:0',5,-40,0,100,0),asteroid('asteroid:1',5,0,0)];const pair=run(s,1);
 assert.equal(pair.stopReason,undefined);near(pair.world.asteroids[0].velocity.x,10);near(pair.world.asteroids[1].velocity.x,90);
});
test('wall CCD applies to moving asteroids on the common clock',()=>{
 const s=setup();s.w.asteroids=[asteroid('asteroid:0',5,s.w.width/2-6,500,100,0)];const r=run(s,0.2);
 assert.equal(r.stopReason,undefined);near(r.world.asteroids[0].velocity.x,-80);assert.ok(r.world.asteroids[0].position.x<s.w.width/2-5);
 near(r.world.time,0.2);assert.equal(r.world.tick,1);
});
for(const type of ['rod','rope','spring'])test(`asteroid impulse and ${type} coupling share one conservative transaction`,()=>{
 let s=setup();const {createCoupling}=core('physics/coupling.js'),p=createSpaceProfile();
 s.A.angle=s.B.angle=-Math.PI/2;s.B.position={x:0,y:s.A.radius+s.B.radius+288};
 s.c=createCoupling({...defaults,length:288,couplingType:type,springReferenceMass:p.massA*p.massB/(p.massA+p.massB)});
 s.w.asteroids=[asteroid('asteroid:0',5,-s.A.radius-5-0.1,0,100,0)];
 const all=s=>[s.A,s.B,...s.w.asteroids],before=momentum(all(s));
 const angular=bodies=>bodies.reduce((sum,b)=>sum+b.mass*(b.position.x*b.velocity.y-b.position.y*b.velocity.x)+b.inertia*b.angularVelocity,0);
 const beforeAngular=angular(all(s));let contacts=0;
 for(let i=0;i<30;i++) {const r=run(s);assert.equal(r.stopReason,undefined);contacts+=r.contacts.length;s={...s,A:r.A,B:r.B,c:r.coupling,w:r.world};}
 assert.ok(contacts>0);const after=momentum(all(s));near(after.x,before.x,0.0001);near(after.y,before.y,0.0001);near(angular(all(s)),beforeAngular,0.1);
 near(s.w.time,0.5,1e-12);assert.equal(s.w.tick,30);assert.ok(Math.hypot(s.B.velocity.x,s.B.velocity.y)>0);
});
test('simultaneous contacts use canonical ids and conserve total impulse',()=>{
 const s=setup();s.A.position.y=1500;s.B.position.y=2000;
 s.w.asteroids=[asteroid('asteroid:z',5,-10,0,100),asteroid('asteroid:a',5,0,0),asteroid('asteroid:m',5,10,0,-100)];
 const before=momentum(s.w.asteroids),r=run(s);assert.equal(r.stopReason,undefined);const after=momentum(r.world.asteroids);
 near(after.x,before.x,1e-5);near(after.y,before.y,1e-5);assert.ok(r.contacts.length>=2);
 const other=clone(s);other.w.asteroids.reverse();const reversed=run(other);
 assert.equal(reversed.stopReason,undefined);const normalized=r=>r.world.asteroids.slice().sort((a,b)=>a.id<b.id?-1:1);
 assert.deepEqual(normalized(r),normalized(reversed));assert.deepEqual(r.contacts,reversed.contacts);
});
test('contact budget exhaustion rolls back already drifting asteroids and pair',()=>{
 const s=setup();s.A.position.y=1500;s.B.position.y=2000;s.config.maxContactEvents=1;s.config.maxAdaptiveSubsteps=4;
 s.w.asteroids=[asteroid('asteroid:0',5,-10,0,100),asteroid('asteroid:1',5,0,0),asteroid('asteroid:2',5,10,0,-100)];
 const before=clone(s),r=run(s);assert.ok(r.stopReason);assert.deepEqual(s,before);assert.deepEqual(r.world,s.w);assert.deepEqual(r.A,s.A);
});
test('external force hook samples every dynamic body at the shared substep time',()=>{
 const s=setup();s.w.asteroids=[asteroid('asteroid:0',5,500,0)];const before=clone(s);
 const r=run(s,0.2,({id,body,time})=>({force:{x:body.mass*(id==='A'?2:id==='B'?3:4),y:0},torque:body.inertia*0.1}));
 assert.equal(r.stopReason,undefined);near(r.A.velocity.x,0.4);near(r.B.velocity.x,0.6);near(r.world.asteroids[0].velocity.x,0.8);
 for(const b of [r.A,r.B,...r.world.asteroids])near(b.angularVelocity,0.02);assert.deepEqual(s,before);
 const timeRun=run(setup(),0.2,({body,time})=>({force:{x:body.mass*time,y:0},torque:0}));near(timeRun.A.velocity.x,0.015);
});
test('a late force or numerical failure rolls back A/B/asteroids/coupling/time atomically',()=>{
 const s=setup();s.w.asteroids=[asteroid('asteroid:0',5,500,0,10)];const before=clone(s);
 const r=run(s,0.2,({body,time})=>({force:{x:time>0.1?NaN:body.mass,y:0},torque:0}));
 assert.ok(r.stopReason);assert.deepEqual(s,before);assert.deepEqual(r.A,s.A);assert.deepEqual(r.B,s.B);assert.deepEqual(r.coupling,s.c);assert.deepEqual(r.world,s.w);
 s.w.asteroids[0].angularVelocity=Infinity;const bad=run(s);assert.ok(bad.stopReason);assert.equal(bad.world,s.w);
});
test('real Lab starts at zero progress, steps and pauses all objects and seeded Restart restores them',()=>{
 const lab=new BonkLab({}, {towing:true,space:true});let initial=lab.getState();assert.ok(initial.spaceWorld);
 near(initial.x,initial.arena.spawnPoint.x);near(initial.y,initial.arena.spawnPoint.y);near(initial.elapsedTime,0);near(initial.distanceM,0);near(initial.progressPct,0);
 lab.start();for(let i=0;i<240;i++)lab.update(1/60);lab.pause();const before=lab.getState();for(let i=0;i<60;i++)lab.update(1/60);assert.deepEqual(lab.getState(),before);
 lab.stepOnce();const stepped=lab.getState();near(stepped.elapsedTime,before.elapsedTime+1/60);near(stepped.spaceWorld.time,stepped.elapsedTime);
 const moving=before.spaceWorld.asteroids.find(b=>Math.hypot(b.velocity.x,b.velocity.y)>0);const after=stepped.spaceWorld.asteroids.find(b=>b.id===moving.id);
 near(after.position.x,moving.position.x+moving.velocity.x/60);assert.deepEqual(lab.getInterpolatedState(0),stepped);
 lab.reset();assert.deepEqual(lab.getState().spaceWorld,initial.spaceWorld);near(lab.getState().distanceM,0);
 lab.updateParams('tow.length',2000);lab.updateParams('tow.radiusB',250);lab.reset();initial=lab.getState();near(initial.y,initial.arena.spawnPoint.y);near(initial.progressPct,0);near(initial.towing.distance,2000);
});
test('real Lab world failure leaves every dynamic object and timer at the pre-tick state',()=>{
 const lab=new BonkLab({}, {towing:true,space:true});lab.start();for(let i=0;i<240;i++)lab.update(1/60);
 assert.ok(lab.spaceWorld,'общий космический мир должен существовать');lab.spaceWorld.asteroids[0].velocity.x=NaN;const before=lab.getState();lab.update(1/60);const after=lab.getState();
 assert.equal(lab.isRunning,false);assert.ok(after.towing.needsRestart);near(after.elapsedTime,before.elapsedTime);near(after.x,before.x);near(after.y,before.y);
 assert.deepEqual(after.towing.B,before.towing.B);assert.deepEqual(after.spaceWorld,before.spaceWorld);
});
test('world speed and restitution settings validate atomically and preserve seeded Restart',()=>{
 const lab=new BonkLab({}, {towing:true,space:true});const initial=lab.getState(),params=lab.params;
 near(params['space.collisionRestitution'],0.8);near(params['space.asteroidMaxSpeed'],5);
 for(const [key,value] of [['space.collisionRestitution',1.1],['space.collisionRestitution',-1],['space.asteroidMaxSpeed',101],['space.asteroidMaxSpeed',NaN]])lab.updateParams(key,value);
 assert.deepEqual(lab.getState(),initial);assert.deepEqual(lab.params,params);
 lab.updateParams('space.collisionRestitution',0.95);assert.deepEqual(lab.getState(),initial);
 lab.updateParams('space.asteroidMaxSpeed',100);const fast=lab.getState();assert.ok(fast.spaceWorld.asteroids.some(b=>Math.hypot(b.velocity.x,b.velocity.y)>5));
 assert.ok(fast.spaceWorld.asteroids.every(b=>Math.hypot(b.velocity.x,b.velocity.y)<=100));near(fast.elapsedTime,0);near(fast.distanceM,0);
 lab.reset();assert.deepEqual(lab.getState().spaceWorld,fast.spaceWorld);near(lab.params['space.collisionRestitution'],0.95);
});
for(const type of ['rod','rope','spring'])for(const gap of [0,0.005])test(`world and original pair keep identical ${type} contact horizons with gap ${gap}`,()=>{
 const {world}=require('./helpers.cjs'),{defaultConfig}=core('config/validate.js'),{advancePair}=core('physics/advance.js');
 const config={...defaultConfig,couplingType:type,substeps:1,restitution:1},s=world(config);
 if(type==='rope'){s.B.position.x=-19.7;s.B.velocity.x=-100;}
 else{s.A.velocity.x=s.B.velocity.x=-100;}
 const obstacle={id:'blockingA',position:{x:-8-gap,y:0},radius:2};
 const initialWorld=empty();initialWorld.statics=[{...obstacle,kind:'station'}];
 const bounds={minX:-initialWorld.width/2,maxX:initialWorld.width/2,minY:-initialWorld.height/2,maxY:initialWorld.height/2};
 const pair=advancePair(s.A,s.B,s.coupling,1/60,config,[obstacle],bounds);
 const all=api().advanceSpaceWorld(s.A,s.B,s.coupling,initialWorld,1/60,config);
 assert.equal(pair.stopReason,undefined);assert.equal(all.stopReason,undefined);assert.deepEqual(all.A,pair.A);assert.deepEqual(all.B,pair.B);
 assert.deepEqual(all.coupling,pair.coupling);assert.deepEqual(all.contacts,pair.contacts);assert.deepEqual(all.diagnostics,pair.diagnostics);
});
test('global asteroid catalog uses deterministic 1–200000t masses and fixed 2D area density independent of the tug',()=>{
 const profile=createSpaceProfile();
 for(const seed of [1,42,99]) {
  const a=api().createSpaceWorld(profile,seed,25,{couplingLength:270});
  assert.deepEqual(a,api().createSpaceWorld(profile,seed,25,{couplingLength:270}));
  assert.ok(a.asteroids.some(b=>b.mass<10000));assert.ok(a.asteroids.some(b=>b.mass>20000000));
  for(const b of a.asteroids){assert.ok(b.mass>=1000&&b.mass<=200000000);near(b.mass,1000*Math.PI*b.radius*b.radius,Math.max(1e-6,b.mass*1e-12));near(b.inertia,0.5*b.mass*b.radius*b.radius,Math.max(1e-9,b.inertia*1e-12));assert.ok(b.radius>=0.5641895835477563&&b.radius<=252.313252202016);}
 }
});
test('2D asteroid factory quadruples mass when radius doubles and uses homogeneous disk inertia',()=>{
 const a=api().createAsteroid(2,{x:0,y:0},{x:0,y:0}),b=api().createAsteroid(4,{x:0,y:0},{x:0,y:0});
 near(a.mass,12566.370614359172);near(b.mass,50265.48245743669);near(b.mass/a.mass,4);near(a.inertia,25132.741228718345);near(b.inertia,402123.85965949355);
});
test('a ship imparts reciprocal momentum to a comparable moving asteroid with actual mass inertia',()=>{
 const s=setup();s.A.position={x:0,y:0};s.A.velocity={x:100,y:0};s.A.angularVelocity=0;
 const b=api().createAsteroid(5,{x:s.A.radius+5+0.1,y:0},{x:0,y:0},300000);assert.equal(b.mass,300000);near(b.inertia,3750000);
 s.w.asteroids=[{id:'asteroid:equal',kind:'asteroid',...b}];s.w.fields=[];s.w.statics=[];
 const before=momentum([s.A,s.B,...s.w.asteroids]),r=run(s),after=momentum([r.A,r.B,...r.world.asteroids]);
 assert.equal(r.stopReason,undefined);assert.ok(r.contacts.length>0);near(r.A.velocity.x,10,1e-7);near(r.world.asteroids[0].velocity.x,90,1e-7);near(after.x,before.x,1e-5);near(after.y,before.y,1e-5);assert.ok(r.world.asteroids[0].position.x>b.position.x);
});
test('one shared asteroid population is independent of the selected tug mass for a fixed seed and world settings',()=>{
 const profile=createSpaceProfile(),world=api().createSpaceWorld(profile,42,5,{couplingLength:270});
 for(const massA of [10000,1e7]){
  const other=api().createSpaceWorld({...profile,massA},42,5,{couplingLength:270});
  assert.deepEqual(other.asteroids,world.asteroids,'мировой диапазон не должен пересчитываться под выбранный корабль');
 }
});
for(const mass of [1000,200000000])for(const target of ['A','B','asteroid'])test(`global endpoint ${mass}kg at 100m/s has reciprocal swept ${target} contact`,()=>{
 const s=setup(),radius=Math.sqrt(mass/(1000*Math.PI));let body=s.A;
 if(target==='B'){s.A.position.y=1500;s.B.position={x:0,y:0};body=s.B;}
 if(target==='asteroid'){s.A.position.y=1500;s.B.position.y=2000;body=asteroid('asteroid:target',radius,0,0);s.w.asteroids.push(body);}
 const incoming=asteroid('asteroid:incoming',radius,-body.radius-radius-0.1,0,100,0);s.w.asteroids.unshift(incoming);
 const before=momentum([s.A,s.B,...s.w.asteroids]),r=run(s),after=momentum([r.A,r.B,...r.world.asteroids]);
 assert.equal(r.stopReason,undefined);assert.ok(r.contacts.length>0);near(incoming.mass,mass,mass*1e-12);
 near(after.x,before.x,0.001);near(after.y,before.y,0.001);
 const hit=target==='A'?r.A:target==='B'?r.B:r.world.asteroids[1];
 near(r.world.asteroids[0].velocity.x,(mass-0.8*body.mass)*100/(mass+body.mass),1e-7);
 near(hit.velocity.x,1.8*mass*100/(mass+body.mass),1e-7);assert.ok(hit.position.x>body.position.x);
});
test('minimum 0.564m asteroid cannot tunnel through another small body during a 100m/s whole-frame sweep',()=>{
 const s=setup(),radius=0.5641895835477563;s.A.position.y=1500;s.B.position.y=2000;
 s.w.asteroids=[asteroid('asteroid:incoming',radius,-50,0,100,0),asteroid('asteroid:target',radius,0,0)];
 const r=run(s,1);assert.equal(r.stopReason,undefined);assert.ok(r.contacts.length>0);
 near(r.world.asteroids[0].velocity.x,10,1e-7);near(r.world.asteroids[1].velocity.x,90,1e-7);
 assert.ok(r.world.asteroids[1].position.x-r.world.asteroids[0].position.x>=2*radius-1e-7);
});
