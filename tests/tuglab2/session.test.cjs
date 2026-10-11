const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = '../../.cache/tuglab2-tests/client/src/tuglab2/';
const { createDefaultTrainConfig } = require(path + 'config.js');
const { TrainSession } = require(path + 'session.js');
const { defaultAssistantSettings, observeAssistant, computeAssistant, commandCWrench } = require(path + 'assistant.js');
const { createScene } = require(path + 'scenes.js');
const { exportRecording, importRecording, replayRecording, compareRecording, exportCSV, encodeShare, decodeShare } = require(path + 'recording.js');
const idle = { x: 0, y: 0, magnitude: 0, brake: false };
const build = { appVersion: '0.1.0', sourceSHA: 'a'.repeat(40) };
const near = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);
function session(settings = {}, scene = { id:'braking',seed:1,mirror:1,speed:40 }) {
  return new TrainSession(createDefaultTrainConfig(), { ...build, settings:{...defaultAssistantSettings(),...settings}, scene });
}
test('coast and g0 preserve C mass with exactly zero every channel and yaw wrench', () => {
  for (const settings of [{mode:'coast'},{mode:'guard',g:0}]) {
    const s=session(settings); s.state.bodies.C.angularVelocity=.3; s.resume();
    assert.equal(s.step(idle).accepted,true);
    assert.deepEqual(s.commandC,{forward:0,retro:0,lateral:0,yaw:0});
    assert.equal(s.recording.ticks[0].wrenches.C.torque,0); assert.ok(s.state.bodies.C);
  }
});
test('controller limits guard and requested brake and protects current overstretch', () => {
  const s=session({delay:0}); const o=observeAssistant(s.state,true); o.distance=0; o.radialVelocity=-100;
  o.lateralError=1000; o.lateralVelocity=100; o.angleError=2; o.angularVelocity=-10;
  const guard=computeAssistant(o,s.state,{...defaultAssistantSettings(),mode:'guard'});
  near(guard.command.retro,.25); near(Math.abs(guard.command.lateral),.5); near(Math.abs(guard.command.yaw),.5);
  const brake=computeAssistant(o,s.state,{...defaultAssistantSettings(),mode:'brake'}); near(brake.command.retro,1);
  o.brakeRequest=false; near(computeAssistant(o,s.state,{...defaultAssistantSettings(),mode:'brake'}).command.retro,.25);
  s.state.bodies.C.position.x-=500;
  assert.equal(computeAssistant(o,s.state,{...defaultAssistantSettings(),mode:'brake'}).command.retro,0);
});
test('reaction uses accepted simulation time and delayed brake release; pause clears pending request', () => {
  const s=session({mode:'brake',delay:.05}); s.resume();
  for(let i=0;i<3;i++) { s.step(idle,true); assert.equal(s.commandC.retro,0); }
  s.step(idle,false); assert.ok(s.commandC.retro>0); assert.equal(s.recording.ticks[3].observation.brakeRequest,true);
  for(let i=0;i<3;i++)s.step(idle,false);
  assert.equal(s.recording.ticks.at(-1).observation.brakeRequest,false);
  const before=s.state.world.time; s.pause(); assert.deepEqual(s.commandC,{forward:0,retro:0,lateral:0,yaw:0});
  assert.equal(s.step(idle,true).accepted,false); near(s.state.world.time,before);
  s.resume(); s.step(idle,false); assert.equal(s.commandC.retro,0);
});
test('disconnect latches engine off across recapture until explicit mode choice', () => {
  const s=session({mode:'guard',delay:0},{id:'empty',seed:1,mirror:1,speed:40});
  assert.equal(s.setConnection('AB',false).ok,true); assert.equal(s.setConnection('AB',true).ok,true);
  s.resume(); s.step(idle); assert.equal(s.commandC.retro,0); assert.equal(s.assistantStatus,'disconnected');
  s.setMode('guard'); s.step(idle); assert.ok(s.commandC.retro>0);
});
test('rejected solver tick preserves history/time/record ticks and immediately pauses', () => {
  const s=session({mode:'guard',delay:0}); s.state.config.numerics.maxAdaptiveSubsteps=1;
  s.state.bodies.A.velocity.x=1e9; s.resume(); const before=structuredClone(s.recording);
  assert.equal(s.step(idle).accepted,false); assert.equal(s.state.world.time,0);
  assert.deepEqual(s.recording.ticks,before.ticks); assert.equal(s.state.paused,true); assert.ok(s.stoppedReason);
});
test('same-build JSON replays trajectory and exact contacts without bot; causal recompute matches recorded C', () => {
  const s=session({mode:'brake',delay:.05}); s.resume();
  for(let i=0;i<40;i++) { if(i===20)s.setAssistantSettings({g:.5}); s.step({...idle,brake:true},i<25); }
  const r=importRecording(exportRecording(s.recording),build); const replay=replayRecording(r);
  assert.deepEqual(replay.state.bodies,s.state.bodies); assert.deepEqual(replay.recording.ticks.map(t=>t.contacts),r.ticks.map(t=>t.contacts));
  const causal=compareRecording(r,'brake'); assert.deepEqual(causal.recording.ticks.map(t=>t.commandC),r.ticks.map(t=>t.commandC));
  const coast=compareRecording(r,'coast'); assert.deepEqual(coast.recording.ticks.map(t=>t.inputA),r.ticks.map(t=>t.inputA));
});
test('contact replay preserves pair and impulse', () => {
  const config=createDefaultTrainConfig(); config.world.statics=[{id:'rock',kind:'station',position:{x:680,y:0},radius:20}];
  const s=new TrainSession(config,{...build,scene:{id:'empty',seed:1,mirror:1,speed:40}});s.resume();
  for(let i=0;i<100&&!s.stoppedReason;i++)s.step(idle);
  assert.ok(s.recording.ticks.some(t=>t.contacts.length));
  assert.deepEqual(replayRecording(s.recording).recording.ticks.map(t=>t.contacts),s.recording.ticks.map(t=>t.contacts));
});
test('strict imports reject other app/build, oversized/invalid shapes and commands without mutating live run', () => {
  const s=session();s.resume();s.step(idle);const base=JSON.parse(exportRecording(s.recording));
  for(const mutate of [r=>r.app='u2taglab',r=>r.sourceSHA='b'.repeat(40),r=>r.config.ships.C.mass=-1,r=>r.ticks[0].commandC.forward=1,r=>r.ticks[0].commandC.retro=2,r=>r.ticks[0].inputA.x=null,r=>r.initialState.bodies.C.angle=null,r=>r.events=[{tick:999,type:'mode',value:'guard'}],r=>r.dt=0]) {
    const r=structuredClone(base);mutate(r);assert.throws(()=>importRecording(JSON.stringify(r),build));
  }
  assert.throws(()=>importRecording(' '.repeat(32*1024*1024),build)); assert.equal(s.recording.ticks.length,1);
  assert.throws(()=>s.setAssistantSettings({Td:.1})); assert.throws(()=>s.step({...idle,x:NaN}));
});
test('scenes are seeded, braking mirror preserves l0, and share creates paused initial experience', () => {
  const c=createDefaultTrainConfig();const plus=createScene(c,{id:'braking',seed:3,mirror:1,speed:80});
  const minus=createScene(c,{id:'braking',seed:3,mirror:-1,speed:80});
  near(plus.bodies.B.position.y,-minus.bodies.B.position.y);near(plus.bodies.B.angle,-minus.bodies.B.angle);
  near(plus.bodies.A.velocity.x,80);near(plus.connections[0].restLength,360);
  const scene={id:'passage',seed:4,mirror:1,speed:40};assert.deepEqual(createScene(c,scene),createScene(c,scene));
  const shared=decodeShare(encodeShare({config:c,settings:defaultAssistantSettings(),scene,fa:true}));
  assert.equal(createScene(shared.config,shared.scene).paused,true);assert.ok(exportCSV(session().recording).includes('time_s'));
});
test('stop requires all three bodies continuously below speed/yaw thresholds for two seconds', () => {
  const s=session({mode:'coast'},{id:'empty',seed:1,mirror:1,speed:40});
  for(const b of Object.values(s.state.bodies))b.velocity.x=0;s.resume();
  for(let i=0;i<119;i++)s.step({...idle,brake:true});assert.equal(s.stoppedReason,undefined);
  s.step({...idle,brake:true});assert.equal(s.telemetry.outcome,'stopped'); assert.equal(s.state.paused,true);
});
test('default experience is paused and resting; comparison keeps its selected mode through original mode events', () => {
  const s=new TrainSession(createDefaultTrainConfig(),build);
  assert.equal(s.state.paused,true);for(const b of Object.values(s.state.bodies))assert.deepEqual(b.velocity,{x:0,y:0});
  s.resume();s.setMode('guard');for(let i=0;i<5;i++)s.step(idle);s.setMode('brake');s.step({...idle,brake:true});
  const coast=compareRecording(s.recording,'coast');assert.ok(coast.recording.ticks.every(t=>t.commandC.retro===0&&t.commandC.yaw===0&&t.commandC.lateral===0));
  assert.deepEqual(coast.recording.ticks.map(t=>t.inputA),s.recording.ticks.map(t=>t.inputA));
});
test('braking metrics begin at first request after prior travel, with per-link/channel data and actual accepted force average', () => {
  const s=session({mode:'guard',delay:0});s.resume();for(let i=0;i<120;i++)s.step(idle);
  const before=s.telemetry.pathB;s.step({...idle,brake:true});
  near(s.telemetry.brakeTime,2);assert.ok(s.telemetry.brakingDistance<s.telemetry.pathB-before+1e-8);
  assert.ok(s.telemetry.linkPeaks.AB&&s.telemetry.linkPeaks.BC);
  assert.equal(typeof s.telemetry.saturationByChannel.yaw,'number');assert.ok(Number.isFinite(s.telemetry.minClearance));
  assert.ok(Number.isFinite(s.telemetry.relativeAngleBA));assert.ok(s.telemetry.anchors.B.tail);
  near(s.telemetry.maxAngleB,Math.max(Math.abs(s.recording.initialState.bodies.B.angle-s.recording.initialState.bodies.A.angle),
    ...s.recording.ticks.map(t=>Math.abs(t.telemetry.bodies.B.unwrappedAngle-s.recording.initialState.bodies.A.angle))));
});
test('automatic stop clears live C commands while preserving accepted final command evidence', () => {
  const s=new TrainSession(createDefaultTrainConfig(),{...build,settings:{mode:'guard',g:.001,delay:0}});s.resume();
  for(let i=0;i<200&&!s.state.paused;i++)s.step({...idle,brake:true});
  assert.equal(s.telemetry.outcome,'stopped');assert.deepEqual(s.commandC,{forward:0,retro:0,lateral:0,yaw:0});
  assert.ok(s.recording.ticks.at(-1).commandC.retro>0);
});
test('manual idle remains live without a brake request, and timeout uses the first brake simulation time', () => {
  const s=new TrainSession(createDefaultTrainConfig(),build);s.resume();for(let i=0;i<180;i++)s.step(idle);
  assert.equal(s.state.paused,false);assert.equal(s.telemetry.outcome,'running');
  const { sampleTelemetry }=require(path+'telemetry.js');const running=session({mode:'coast'});let previous=running.telemetry;
  running.state.world.time=2+running.dt;previous=sampleTelemetry(running.state,previous.assistant,[],previous,running.recording.initialState,running.dt,true);
  near(previous.brakeTime,2);running.state.world.time=61.99;previous=sampleTelemetry(running.state,previous.assistant,[],previous,running.recording.initialState,running.dt);
  assert.equal(previous.outcome,'running');running.state.world.time=62;
  assert.equal(sampleTelemetry(running.state,previous.assistant,[],previous,running.recording.initialState,running.dt).outcome,'timeout');
});
test('accepted retry records one tick and the same delayed observations as a clean final-resolution run', () => {
  const { createTrain }=require(path+'train.js');const c=createDefaultTrainConfig();c.world.width=3000;c.numerics.restitution=1;
  c.numerics.substeps=1;c.numerics.maxContactEvents=1;c.numerics.maxAdaptiveSubsteps=32;const initial=createTrain(c);
  initial.connections.forEach(l=>l.connected=false);initial.bodies.A.velocity.x=300000;
  const options={...build,initialState:initial,settings:{mode:'brake',delay:1/30},dt:1/30,fa:false};
  const s=new TrainSession(c,options);s.resume();assert.equal(s.step(idle,true).accepted,true);
  assert.ok(s.state.diagnostics.solverAttempts>1);assert.equal(s.recording.ticks.length,1);assert.equal(s.recording.ticks[0].observation,undefined);
  assert.ok(s.recording.ticks[0].contacts.length>c.numerics.maxContactEvents);
  assert.equal(importRecording(exportRecording(s.recording),build).ticks.length,1);
  const clean=structuredClone(initial);clean.config.numerics.substeps=s.state.diagnostics.solverSubsteps;
  const other=new TrainSession(clean.config,{...options,initialState:clean});other.resume();other.step(idle,true);
  assert.deepEqual(s.state.bodies,other.state.bodies);s.step(idle,false);other.step(idle,false);
  assert.deepEqual(s.recording.ticks[1].observation,other.recording.ticks[1].observation);assert.equal(s.recording.ticks[1].observation.brakeRequest,true);
});
test('causal recomputation reproduces runtime mode changes, pause history resets and detach events', () => {
  const { recomputeRecording }=require(path+'recording.js');const s=session({delay:0});s.resume();s.setMode('guard');s.step(idle);
  s.pause();s.resume();s.setMode('brake');s.step({...idle,brake:true});s.setConnection('AB',false);s.step(idle);
  const causal=recomputeRecording(s.recording);assert.deepEqual(causal.recording.ticks.map(t=>t.commandC),s.recording.ticks.map(t=>t.commandC));
  assert.deepEqual(causal.recording.ticks.map(t=>t.observation),s.recording.ticks.map(t=>t.observation));
});
test('imports enforce bounded solver work and validate all detailed metrics and safe initial geometry', () => {
  const s=session();s.resume();s.step(idle);const base=JSON.parse(exportRecording(s.recording));
  for(const mutate of [r=>{r.config.numerics.maxAdaptiveSubsteps=1e9;r.initialState.config.numerics.maxAdaptiveSubsteps=1e9;},
    r=>r.ticks[0].telemetry.saturationByChannel.yaw=null,r=>r.ticks[0].telemetry.anchors.B.tail.x=null,
    r=>r.initialState.bodies.C.position=structuredClone(r.initialState.bodies.B.position)]) {
    const r=structuredClone(base);mutate(r);assert.throws(()=>importRecording(JSON.stringify(r),build));
  }
});
test('accepted engine evidence is distinct from field forces and CSV preserves detailed SI telemetry', () => {
  const c=createDefaultTrainConfig();c.world.fields=[{id:'wind',kind:'plasma',center:{x:0,y:0},radius:2000,
    drift:{x:0,y:0},pressure:2,resistiveK:0,topology:'linear',direction:{x:1,y:0}}];
  const s=new TrainSession(c,build);s.resume();s.step(idle);const t=s.recording.ticks[0];
  assert.ok(t.wrenches.C.force.x>0);assert.deepEqual(t.engineWrenches.C,{force:{x:0,y:0},torque:0});
  const r=importRecording(exportRecording(s.recording),build);assert.deepEqual(replayRecording(r).state.bodies,s.state.bodies);
  const csv=exportCSV(r);for(const name of ['C_engine_Fx_N','C_external_Fx_N','B_nose_x_m','relative_angle_BA_rad','retro_saturation_s','min_clearance_m','contact_pairs'])assert.ok(csv.includes(name),name);
});
test('import rejects mode, g, detach and delayed-request command contradictions before replay', () => {
  for(const settings of [{mode:'coast',delay:0},{mode:'guard',delay:0},{mode:'brake',delay:0},{mode:'brake',delay:0,g:0}]) {
    const s=session(settings);s.resume();s.step(idle);const r=JSON.parse(exportRecording(s.recording));r.ticks[0].commandC.retro=1;r.ticks[0].telemetry.commandC.retro=1;
    assert.throws(()=>importRecording(JSON.stringify(r),build),JSON.stringify(settings));
  }
  const s=session({mode:'brake',delay:.05});s.resume();for(let i=0;i<4;i++)s.step(idle,true);
  const r=JSON.parse(exportRecording(s.recording));r.ticks[3].observation.time=3*s.dt;
  assert.throws(()=>importRecording(JSON.stringify(r),build));
  assert.throws(()=>s.stepRecorded(idle,false,{forward:1,retro:0,lateral:0,yaw:0},s.telemetry.assistant));
});
test('short comparison reports its finite input window and single composition ignores absent BC actions', () => {
  const s=session({mode:'coast'});s.resume();s.step({...idle,brake:true});s.setConnection('BC',false);s.step({...idle,brake:true});
  const variant=compareRecording(s.recording,'guard',{composition:'single'});
  assert.equal(variant.comparison.completeInput,true);assert.equal(variant.comparison.compositionChanged,true);
  assert.equal(variant.telemetry.outcome,'running');assert.equal(variant.state.bodies.C,undefined);
  assert.deepEqual(variant.recording.ticks.map(t=>t.inputA),s.recording.ticks.map(t=>t.inputA));
});
test('a full 60 second 120 Hz accepted recording imports within declared bounds', () => {
  const s=new TrainSession(createDefaultTrainConfig(),{...build,dt:1/120});s.resume();for(let i=0;i<7200;i++)s.step(idle);
  const text=exportRecording(s.recording);const imported=importRecording(text,build);
  assert.equal(imported.ticks.length,7200);near(imported.ticks.at(-1).time,60,1e-8);
});
test('unwrapped angles retain more than one turn in a tick; dt and seed are canonical in shared starts', () => {
  const c=createDefaultTrainConfig();c.world.seed=23;const s=new TrainSession(c,{...build,dt:1/30});
  s.setConnection('AB',false);s.setConnection('BC',false);s.state.bodies.B.angularVelocity=300;s.resume();s.step(idle);
  near(s.telemetry.bodies.B.unwrappedAngle,s.state.bodies.B.angle);assert.ok(s.telemetry.bodies.B.unwrappedAngle>2*Math.PI);
  assert.equal(s.recording.config.numerics.tickRate,30);assert.equal(s.recording.scene.seed,23);
});
test('initial-state entry rejects ship mass/radius/inertia inconsistent with its configured U2 hull', () => {
  const s=session();s.resume();s.step(idle);const base=JSON.parse(exportRecording(s.recording));
  for(const property of ['mass','radius','inertia']) {
    const r=structuredClone(base);r.initialState.bodies.C[property]=1;assert.throws(()=>importRecording(JSON.stringify(r),build),property);
    assert.throws(()=>new TrainSession(r.config,{...build,initialState:r.initialState}),property);
  }
});
test('serialized recording budget rejects a provisional tick atomically and preserves an importable accepted prefix', () => {
  const { SESSION_LIMITS }=require(path+'assistant.js');const old=SESSION_LIMITS.maxImportBytes;SESSION_LIMITS.maxImportBytes=65536;
  try {
    const s=session({mode:'coast'});s.resume();let rejected=false;
    for(let i=0;i<100;i++){const before=s.state.world.time,count=s.recording.ticks.length;const r=s.step(idle);if(!r.accepted){
      rejected=true;near(s.state.world.time,before);assert.equal(s.recording.ticks.length,count);break;}}
    assert.equal(rejected,true);assert.ok(s.stoppedReason.includes('записи'));assert.equal(s.state.paused,true);
    const text=exportRecording(s.recording);assert.ok(Buffer.byteLength(text)<=65536);assert.equal(importRecording(text,build).ticks.length,s.recording.ticks.length);
  }finally{SESSION_LIMITS.maxImportBytes=old;}
});
test('primary B angular deviation uses the initial train heading even when A rotates together with B', () => {
  const { sampleTelemetry }=require(path+'telemetry.js');const s=session({mode:'coast'});
  near(s.telemetry.maxAngleB,5*Math.PI/180);s.state.bodies.A.angle=s.state.bodies.B.angle=30*Math.PI/180;
  const t=sampleTelemetry(s.state,s.telemetry.assistant,[],s.telemetry,s.recording.initialState,s.dt);
  near(t.relativeAngleBA,0);near(t.maxAngleB,30*Math.PI/180);
});
test('prototype-like asteroid IDs are handled safely or rejected atomically before simulation', () => {
  const asteroid=id=>({id,kind:'asteroid',position:{x:3000,y:0},velocity:{x:0,y:0},angle:0,angularVelocity:0,mass:1000,radius:10,inertia:50000});
  for(const id of ['constructor','prototype','__proto__']){const c=createDefaultTrainConfig();c.world.asteroids=[asteroid(id)];assert.throws(()=>new TrainSession(c,build),id);}
});
test('inherited object method names remain valid safe asteroid IDs', () => {
  const asteroid=id=>({id,kind:'asteroid',position:{x:3000,y:0},velocity:{x:0,y:0},angle:0,angularVelocity:0,mass:1000,radius:10,inertia:50000});
  for(const id of ['toString','hasOwnProperty']){const c=createDefaultTrainConfig();c.world.asteroids=[asteroid(id)];const s=new TrainSession(c,build);s.resume();
    assert.equal(s.step(idle).accepted,true,id);assert.equal(Object.hasOwn(s.recording.ticks[0].wrenches,id),true);
    assert.equal(importRecording(exportRecording(s.recording),build).ticks.length,1);}
});
test('sharing an initialized passage is idempotent and share budgets count UTF-8 bytes', () => {
  const scene={id:'passage',seed:9,mirror:1,speed:40};const state=createScene(createDefaultTrainConfig(),scene);
  const shared=decodeShare(encodeShare({config:state.config,scene,settings:defaultAssistantSettings(),fa:true}));
  assert.deepEqual(createScene(shared.config,shared.scene).world.statics,state.world.statics);
  const c=createDefaultTrainConfig();for(let i=0;i<20;i++)c.world.statics.push({id:'字'.repeat(3000)+i,kind:'station',radius:10,position:{x:3000+40*i,y:0}});
  assert.throws(()=>encodeShare({config:c,scene:{id:'empty',seed:1,mirror:1,speed:0},settings:defaultAssistantSettings(),fa:true}));
});
