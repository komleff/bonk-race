const {test}=require('node:test');
const {existsSync}=require('node:fs');
const {assert,near,core}=require('./helpers.cjs');
const {createSpaceProfile,createSpaceBody}=require('../../.cache/tuglab-tests/client/src/u2taglab/profile.js');
const {createSpaceWorld,cloneSpaceWorld,advanceSpaceWorld}=require('../../.cache/tuglab-tests/client/src/u2taglab/world.js');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const defaults=require('../../client/src/tuglab/config/tuglab_defaults.json');
const api=()=>{
 const path=require('node:path').resolve(__dirname,'../../.cache/tuglab-tests/client/src/u2taglab/fields.js');
 assert.ok(existsSync(path),'механический sampler полей должен существовать');return require(path);
};
const field=(id,kind,extra={})=>({id,kind,center:{x:0,y:0},radius:100,drift:{x:0,y:0},pressure:50,resistiveK:0.5,
 topology:'linear',direction:{x:1,y:0},...extra});
const world=()=>{const w=createSpaceWorld(createSpaceProfile(),42,5);w.statics=[];w.asteroids=[];w.fields=[];return w;};
const body=(id='asteroid:test',extra={})=>({id,position:{x:0,y:0},velocity:{x:4,y:-3},mass:1000,inertia:2000,
 radius:2,angle:0,angularVelocity:0.7,...extra});
const wrench=(w,b,t=0)=>api().sampleSpaceFields(w,b,t);
const config={...defaults,maxValidatedSpeed:1000};
const disconnected=()=>{const c=core('physics/coupling.js').createCoupling(defaults);c.connected=false;return c;};

test('vacuum and locations beyond field edge exert exactly zero force and torque',()=>{
 const w=world(),b=body();assert.deepEqual(wrench(w,b),{force:{x:0,y:0},torque:0});
 w.fields=[field('r','resistive'),field('p','plasma')];b.position.x=100;
 assert.deepEqual(wrench(w,b),{force:{x:0,y:0},torque:0});b.position.x=101;
 assert.deepEqual(wrench(w,b),{force:{x:0,y:0},torque:0});
});
test('resistive law uses disk area and applies smoothstep weight once in sector frame',()=>{
 const w=world(),b=body();w.fields=[field('r','resistive',{resistiveK:2,drift:{x:90,y:-40}})];
 b.position.x=50;const r=wrench(w,b);near(r.force.x,-16*Math.PI);near(r.force.y,12*Math.PI);near(r.torque,0);
 const still=body('asteroid:test',{velocity:{x:0,y:0},position:{x:90,y:-40}});
 assert.deepEqual(wrench(w,still,1),{force:{x:0,y:0},torque:0});
});
test('LAB pressure wind is through COM, uses one falloff and tangent vortex has zero center',()=>{
 const w=world(),b=body();w.fields=[field('p','plasma',{pressure:2})];b.position.x=50;
 const linear=wrench(w,b);near(linear.force.x,4*Math.PI);near(linear.force.y,0);near(linear.torque,0);
 w.fields=[field('p','plasma',{pressure:2,topology:'vortex'})];
 near(wrench(w,b).force.y,4*Math.PI);near(wrench(w,b).force.x,0);b.position.x=0;
 assert.deepEqual(wrench(w,b),{force:{x:0,y:0},torque:0});
});
test('ship force area comes from L/W and ignores collision radius overrides',()=>{
 const p=createSpaceProfile(),w=world();w.fields=[field('p','plasma',{pressure:1})];
 for(const id of ['A','B']) {
  const b={id,...createSpaceBody(p,id,250)};
  near(wrench(w,b).force.x,id==='A'?1944.5832822071027:Math.PI*createSpaceProfile().radiusB**2,1e-6);
  b.radius=2;near(wrench(w,b).force.x,id==='A'?1944.5832822071027:Math.PI*createSpaceProfile().radiusB**2,1e-6);
 }
});
test('overlaps sum by stable ids regardless of storage order, opposite winds cancel',()=>{
 const w=world(),b=body();w.fields=[field('z','plasma',{pressure:1e15}),field('m','plasma',{pressure:1}),
 field('a','plasma',{pressure:1e15,direction:{x:-1,y:0}}),field('d','resistive',{resistiveK:2}),field('c','resistive',{resistiveK:3})];
 const first=wrench(w,b);w.fields.reverse();assert.deepEqual(wrench(w,b),first);
 w.fields=[field('a','plasma',{direction:{x:-1,y:0}}),field('b','plasma')];
 assert.deepEqual(wrench(w,b),{force:{x:0,y:0},torque:0});
});
test('thermal hot/cold, dust and EM areas have no mechanical force or angular drag',()=>{
 const w=world();w.fields=['thermalHot','thermalCold','dust','emStorm'].map((kind,i)=>field(String(i),kind));
 assert.deepEqual(wrench(w,body()),{force:{x:0,y:0},torque:0});
});
test('seeded field definitions and drift share simulation time and immutable clone semantics',()=>{
 const a=createSpaceWorld(createSpaceProfile(),42,5),b=createSpaceWorld(createSpaceProfile(),42,5);
 assert.ok(a.fields?.length>=6);assert.deepEqual(a.fields,b.fields);assert.notDeepEqual(a.fields,createSpaceWorld(createSpaceProfile(),43,5).fields);
 assert.ok(a.fields.every(f=>Object.isFrozen(f)&&Object.isFrozen(f.center)&&Object.isFrozen(f.drift)));
 const copy=cloneSpaceWorld(a);assert.deepEqual(copy.fields,a.fields);
 const f=a.fields.find(f=>Math.hypot(f.drift.x,f.drift.y)>0),p=api().spaceFieldCenter(f,2);
 near(p.x,f.center.x+2*f.drift.x);near(p.y,f.center.y+2*f.drift.y);
 assert.deepEqual(api().spaceFieldCenter(f,2),p);assert.deepEqual(a.fields,b.fields);
});
test('pure resistance cannot reverse velocity or add energy at all declared mass/drag extremes',()=>{
 for(const mass of [1000,10000,1e8])for(const k of [0,0.5,100])for(const dt of [1/60,0.2]) {
  const w=world(),A=body('A',{position:{x:0,y:1000},velocity:{x:0,y:0}}),B=body('B',{mass,velocity:{x:100,y:-75}});
  w.fields=[field('r','resistive',{radius:1e20,resistiveK:k})];const c=disconnected();
  const before=structuredClone({A,B,w,c});
  const r=advanceSpaceWorld(A,B,c,w,dt,config,({id,body,time,subDt})=>api().sampleSpaceFieldResponse(w,{...body,id},time,subDt));
  assert.equal(r.stopReason,undefined);assert.ok(r.B.velocity.x>=-1e-12&&r.B.velocity.y<=1e-12);
  assert.ok(r.B.velocity.x**2+r.B.velocity.y**2<=15625+1e-9);near(r.B.angularVelocity,0.7);
  near(r.B.velocity.x,100*Math.exp(-k*Math.PI*createSpaceProfile().radiusB**2*dt/mass),1e-8);
  assert.deepEqual({A,B,w,c},before);
 }
});
test('constant combined drive, wind and drag approach Fdrive/K independent of frame dt',()=>{
 const integrate=dt=>{
  let w=world(),A=body('A',{position:{x:0,y:1000},velocity:{x:0,y:0}}),B=body('asteroid:test',{mass:Math.PI,radius:1,velocity:{x:0,y:0}}),c=disconnected();
  w.fields=[field('r','resistive',{radius:1e20,resistiveK:1}),field('p','plasma',{radius:1e20,pressure:2})];
  for(let i=0;i<Math.round(2/dt);i++) {
   const r=advanceSpaceWorld(A,B,c,w,dt,config,({id,body,time,subDt})=>api().sampleSpaceFieldResponse(w,
    {...body,id:id==='B'?'asteroid:test':id},time,subDt,{force:{x:8*Math.PI,y:0},torque:7}));
   assert.equal(r.stopReason,undefined);assert.ok(r.B.velocity.x>=0&&r.B.velocity.x<=10);({A,B,coupling:c,world:w}=r);
  }return B;
 };
 const a=integrate(0.2),b=integrate(0.05);near(a.velocity.x,8.646647167633873,1e-10);near(b.velocity.x,a.velocity.x,1e-10);
 near(a.angularVelocity,0.707,1e-10);
});
test('zero resistance branch preserves engine plus pressure and torque without hidden modifiers',()=>{
 const w=world();w.fields=[field('p','plasma',{pressure:2}),field('r','resistive',{resistiveK:0})];
 const r=api().sampleSpaceFieldResponse(w,body(),0,0.2,{force:{x:17,y:-23},torque:31});
 near(r.force.x,17+8*Math.PI);near(r.force.y,-23);near(r.torque,31);
});
test('real Lab samples separate A/B/asteroids, leaves statics fixed and Pause/Step/Restart coherent',()=>{
 const lab=new BonkLab({}, {towing:true,space:true});lab.updateParams('space.enginesEnabled',false);lab.setTowingConnection(false);
 lab.start();for(let i=0;i<240;i++)lab.update(1/60);lab.pause();
 lab.spaceWorld.statics=[];lab.spaceWorld.asteroids=[{...body('asteroid:test',{position:{x:700,y:lab.y},velocity:{x:0,y:0}}),kind:'asteroid'}];
 lab.spaceWorld.fields=[field('p','plasma',{center:{x:lab.x,y:lab.y},radius:100,pressure:2,drift:{x:5,y:0}})];
 lab.vx=lab.vy=0;lab.towing.B.velocity={x:0,y:0};const before=lab.getState();
 for(let i=0;i<30;i++)lab.update(1/60);assert.deepEqual(lab.getState(),before);lab.stepOnce();const after=lab.getState();
 assert.ok(after.vx>0);near(after.towing.B.velocity.x,0);near(after.spaceWorld.asteroids[0].velocity.x,0);
 near(after.spaceWorld.time,before.spaceWorld.time+1/60);assert.deepEqual(after.spaceWorld.statics,before.spaceWorld.statics);
 lab.reset();assert.deepEqual(lab.getState().spaceWorld,createSpaceWorld(createSpaceProfile(),42,5,{couplingLength:360}));
});
test('real Lab combines A engine with resistive response rather than adding a separate Euler drag',()=>{
 const lab=new BonkLab({}, {towing:true,space:true});lab.setSpaceFA(false);lab.setTowingConnection(false);
 lab.start();for(let i=0;i<240;i++)lab.update(1/60);lab.pause();lab.spaceWorld.statics=[];lab.spaceWorld.asteroids=[];
 lab.spaceWorld.fields=[field('r','resistive',{radius:1e20,resistiveK:100}),field('p','plasma',{radius:1e20,pressure:50})];
 lab.vx=100;lab.vy=0;lab.setInput(0,-1,1);lab.stepOnce();const s=lab.getState();
 const K=100*1944.5832822071027,gamma=K/s.mass,decay=Math.exp(-gamma/60);
 near(s.vx,100*decay+50*1944.5832822071027/K*(1-decay),1e-9);
 near(s.vy,-16228800/K*(1-decay),1e-9);assert.equal(s.towing.reason,undefined);
});
test('real Lab applies pressure to A, passive B and asteroids using their own effective areas',()=>{
 const lab=new BonkLab({}, {towing:true,space:true});lab.updateParams('space.enginesEnabled',false);lab.setTowingConnection(false);
 lab.start();for(let i=0;i<240;i++)lab.update(1/60);lab.pause();
 lab.spaceWorld.statics=[{id:'station:test',kind:'station',position:{x:-1000,y:lab.y},radius:70}];
 lab.spaceWorld.asteroids=[{...body('asteroid:test',{position:{x:700,y:lab.y},velocity:{x:0,y:0}}),kind:'asteroid'}];
 lab.spaceWorld.fields=[field('p','plasma',{radius:1e20,pressure:2})];lab.vx=lab.vy=0;lab.towing.B.velocity={x:0,y:0};
 const statics=structuredClone(lab.spaceWorld.statics);lab.stepOnce();const s=lab.getState();
 near(s.vx,2*1944.5832822071027/s.mass/60);near(s.towing.B.velocity.x,2*Math.PI*((120**2+54**2)/(2*(120+54)))**2/s.towing.B.mass/60);
 near(s.spaceWorld.asteroids[0].velocity.x,8*Math.PI/1000/60);assert.deepEqual(s.spaceWorld.statics,statics);
});
test('field settings reject invalid input atomically and seeded regeneration resets the shared clock',()=>{
 const lab=new BonkLab({}, {towing:true,space:true}),before=lab.getState(),params=lab.params;
 for(const [key,value] of [['space.fieldPressure',1001],['space.fieldPressure',NaN],['space.resistiveK',-1],['space.resistiveK',101],['space.fieldsEnabled',1]])lab.updateParams(key,value);
 assert.deepEqual(lab.params,params);assert.deepEqual(lab.getState(),before);
 lab.updateParams('space.fieldPressure',1000);assert.equal(lab.params['space.fieldPressure'],1000);near(lab.getState().spaceWorld.time,0);
 assert.ok(lab.getState().spaceWorld.fields.filter(f=>f.kind==='plasma').every(f=>f.pressure===1000));
 lab.updateParams('space.resistiveK',100);assert.ok(lab.getState().spaceWorld.fields.filter(f=>f.kind==='resistive').every(f=>f.resistiveK===100));
 lab.updateParams('space.fieldsEnabled',false);assert.equal(lab.getState().spaceWorld.fields.length,0);
 lab.resetSpaceParams();assert.ok(lab.getState().spaceWorld.fields.length>0);near(lab.params['space.fieldPressure'],50);near(lab.params['space.resistiveK'],0.5);
});
test('malformed field coefficients cause an atomic solver stop rather than corrupting the world',()=>{
 api();const w=world(),A=body('A'),B=body('B',{position:{x:0,y:1500}}),c=disconnected();w.fields=[field('r','resistive',{resistiveK:NaN})];
 const before=structuredClone({A,B,w,c});
 const r=advanceSpaceWorld(A,B,c,w,1/60,config,({id,body,time,subDt})=>api().sampleSpaceFieldResponse(w,{...body,id},time,subDt));
 assert.ok(r.stopReason);assert.equal(r.world,w);assert.deepEqual({A,B,w,c},before);
});
