const {test}=require('node:test'),assert=require('node:assert/strict');
const base=process.env.ASSISTANT_FOLLOW_COMPILED_ROOT||'../../.cache/tuglab2-tests/client/src/';
const {createDefaultTrainConfig}=require(base+'tuglab2/config.js'),{createTrain}=require(base+'tuglab2/train.js');
const {observeAssistant,computeAssistant,commandCWrench,defaultAssistantSettings}=require(base+'tuglab2/assistant.js');
const settings={...defaultAssistantSettings(),mode:'guard',delay:.25};
for(const mirror of[-1,1])test(`cargo common lateral drift is observed and opposed, mirror${mirror}`,()=>{
 const s=createTrain(createDefaultTrainConfig());for(const id of['B','C']){s.bodies[id].position.y+=mirror*100;s.bodies[id].velocity.y=mirror*10;}
 const o=observeAssistant(s,false),r=computeAssistant(o,s,settings),w=commandCWrench(s.bodies.C,r.command,s.config.ships.C,1/60,o.track);
 assert.ok(Math.abs(o.lateralError)>50);assert.ok(w.force.y*mirror<0);assert.ok(Math.abs(w.force.y)>1e5);
});
for(const mirror of[-1,1])test(`cargo follows already travelled tangent behind leader's turn, mirror${mirror}`,()=>{
 const {AssistantPathTracker}=require(base+'tuglab2/assistantPath.js');const s=createTrain(createDefaultTrainConfig()),p=new AssistantPathTracker(s);
 for(let k=1;k<=20;k++){s.bodies.A.position={x:k*10,y:0};s.world.time=k/60;p.accept(s);}
 for(let k=1;k<=20;k++){s.bodies.A.position={x:200,y:mirror*k*10};s.bodies.A.angle=mirror*Math.PI/2;s.world.time=(20+k)/60;p.accept(s);}
 const ref=p.reference(s);assert.ok(ref);assert.ok(ref.tangent.x>.99);assert.ok(Math.abs(ref.tangent.y)<1e-12);
 const o=observeAssistant(s,false,ref);assert.ok(Math.abs(o.angleError)<1e-12);assert.ok(Math.abs(o.angleError-(s.bodies.A.angle-s.bodies.C.angle))>1);
});
test('retro safety uses current C orientation even with an older forward-facing observation',()=>{
 const s=createTrain(createDefaultTrainConfig()),o=observeAssistant(s,true),r=computeAssistant(o,s,{...settings,mode:'brake'});assert.ok(r.command.retro>0);
 s.bodies.C.angle=Math.PI;const w=commandCWrench(s.bodies.C,r.command,s.config.ships.C,1/60,o.track);
 assert.ok(w.force.x<=0,`unsafe forward force ${w.force.x}`);assert.equal(w.force.x,0);
});
test('explicit rear brake requests deceleration from cargo speed when all links move together',()=>{
 const s=createTrain(createDefaultTrainConfig());for(const b of Object.values(s.bodies))b.velocity.x=40;
 const o=observeAssistant(s,true),r=computeAssistant(o,s,{...settings,mode:'brake'});assert.ok(r.command.retro>=.9,`retro ${r.command.retro}`);
 const guard=computeAssistant({...o,brakeRequest:false},s,{...settings,mode:'brake'});assert.ok(guard.command.retro<=.25);assert.ok(r.command.retro>guard.command.retro);
});
test('an explicitly unavailable accepted path never falls back to the current leader heading',()=>{
 const s=createTrain(createDefaultTrainConfig());s.bodies.A.angle=Math.PI/2;
 const o=observeAssistant(s,false,undefined);assert.equal(o.connected,false);assert.equal(o.track,undefined);
 assert.deepEqual(computeAssistant(o,s,settings).command,{forward:0,retro:0,lateral:0,yaw:0});
});

for(const mirror of[-1,1])test(`actual rear-only braking slows cargo with compressed BC and no A brake, mirror${mirror}`,()=>{
 const {LabTrain}=require(base+'lab/LabTrain.js');const cfg=createDefaultTrainConfig();cfg.world.fields=[];cfg.world.statics=[];cfg.world.asteroids=[];
 function run(mode){const t=new LabTrain(cfg,{...settings,mode});for(const b of Object.values(t.state.bodies))b.velocity.y=-40;
  t.state.bodies.B.position.x+=mirror*10;t.state.bodies.C.position.x+=mirror*10;t.state.bodies.C.position.y-=60;t.resume();t.setRearBrake(true);let contacts=0,path=0,old={...t.state.bodies.B.position};
  for(let k=0;k<900;k++){const r=t.advance({x:0,y:0,magnitude:0,brake:false},1/60,false);assert.equal(r.accepted,true,r.reason);contacts+=r.contacts.length;const b=t.state.bodies.B;path+=Math.hypot(b.position.x-old.x,b.position.y-old.y);old={...b.position};assert.equal(t.engineWrenches.A.force.x,0);assert.equal(t.engineWrenches.A.force.y,0);}
  const b=t.state.bodies.B;return {speed:Math.hypot(b.velocity.x,b.velocity.y),path,contacts};}
 const coast=run('coast'),brake=run('brake');assert.ok(brake.speed<=.8*coast.speed,JSON.stringify({coast,brake}));assert.ok(brake.path<coast.path);assert.ok(brake.contacts<=coast.contacts);
});
for(const mirror of[-1,1])test(`standard40 actual cargo braking reduces both residual and skid with no added contacts, mirror${mirror}`,()=>{
 const {TrainSession}=require(base+'tuglab2/session.js');function run(mode){const s=new TrainSession(createDefaultTrainConfig(),{appVersion:'0.1.0',sourceSHA:'a'.repeat(40),settings:{...settings,mode},scene:{id:'braking',seed:20261011,mirror,speed:40}});s.resume();
  for(let k=0;k<3600;k++){if(!s.step({x:0,y:0,magnitude:0,brake:true}).accepted)break;}return s.telemetry;}
 const coast=run('coast'),brake=run('brake');assert.ok(brake.bodies.B.speed<=.8*coast.bodies.B.speed,JSON.stringify({coast:coast.bodies.B.speed,brake:brake.bodies.B.speed}));
 assert.ok(brake.maxLateralB<=.8*coast.maxLateralB);assert.ok(brake.maxAngleB<=.8*coast.maxAngleB);assert.ok(brake.contactCount<=coast.contactCount);
});
for(const mirror of[-1,1])test(`cargo-only drift requests a corrective C force even when C is already on track, mirror${mirror}`,()=>{
 const s=createTrain(createDefaultTrainConfig());s.bodies.B.position.y+=mirror*100;s.bodies.B.velocity.y=mirror*10;
 const o=observeAssistant(s,false),r=computeAssistant(o,s,settings),w=commandCWrench(s.bodies.C,r.command,s.config.ships.C,1/60,o.track);
 assert.ok(Math.abs(o.lateralError)>50);assert.ok(w.force.y*mirror<0);
});
test('accepted path is ordered at crossings, bounded to8km and has an explicit unavailable fallback',()=>{
 const {AssistantPathTracker}=require(base+'tuglab2/assistantPath.js');const s=createTrain(createDefaultTrainConfig()),tracker=new AssistantPathTracker(s),initial=tracker.reference(s),origin={...s.bodies.A.position};
 for(const position of [{x:origin.x+100,y:100},{...s.bodies.B.position},{x:origin.x+100,y:-100},origin]){s.bodies.A.position=position;tracker.accept(s);}
 assert.equal(tracker.reference(s).progress,initial.progress);assert.ok(tracker.reference(s).tangent.x>.99);
 for(let k=1;k<=5000;k++){s.bodies.A.position={x:origin.x+k*2,y:0};tracker.accept(s);}
 assert.ok(tracker.pointCount<=4002);assert.equal(tracker.reference(s),undefined);assert.equal(observeAssistant(s,false,tracker.reference(s)).connected,false);
});
test('session pause and live mode preserve traveled geometry; rejected steps never append it and restart resets',()=>{
 const {TrainSession}=require(base+'tuglab2/session.js');const s=new TrainSession(createDefaultTrainConfig(),{appVersion:'0.1.0',sourceSHA:'a'.repeat(40),settings,scene:{id:'empty',seed:1,mirror:1,speed:40}});s.resume();
 for(let k=0;k<90;k++)assert.equal(s.step({x:1,y:0,magnitude:.1,brake:false}).accepted,true);const ref=s.pathTracker.reference(s.state),count=s.pathTracker.pointCount;assert.ok(count>2);
 s.pause();s.setMode('brake');assert.deepEqual(s.pathTracker.reference(s.state),ref);assert.equal(s.pathTracker.pointCount,count);
 s.resume();s.state.bodies.A.velocity.x=1e9;assert.equal(s.step({x:0,y:0,magnitude:0,brake:false}).accepted,false);assert.equal(s.pathTracker.pointCount,count);assert.deepEqual(s.pathTracker.reference(s.state),ref);
 s.restart();assert.equal(s.pathTracker.pointCount,2);
});
test('recorded track group is strict finite and same-build raw replay and causal recompute remain exact',()=>{
 const {TrainSession}=require(base+'tuglab2/session.js');const {exportRecording,importRecording,replayRecording,recomputeRecording}=require(base+'tuglab2/recording.js');const identity={appVersion:'0.1.0',sourceSHA:'a'.repeat(40)};
 const s=new TrainSession(createDefaultTrainConfig(),{...identity,settings:{...settings,mode:'brake',delay:0},scene:{id:'braking',seed:1,mirror:1,speed:40}});s.resume();for(let k=0;k<60;k++)assert.equal(s.step({x:0,y:0,magnitude:0,brake:false},true).accepted,true);
 const recording=importRecording(exportRecording(s.recording),identity);assert.ok(recording.ticks[0].observation.track);
 assert.deepEqual(replayRecording(recording,{identity}).state.bodies,s.state.bodies);assert.deepEqual(recomputeRecording(recording,{identity}).state.bodies,s.state.bodies);
 for(const mutate of [t=>t.tangentX=NaN,t=>t.tangentX=2,t=>t.unexpected=1,t=>delete t.crossTrackB]){const invalid=structuredClone(recording);mutate(invalid.ticks[0].observation.track);assert.throws(()=>importRecording(JSON.stringify(invalid),identity));}
});
test('guard continues braking an overtaking C instead of reversing its radial feedback sign',()=>{
 const s=createTrain(createDefaultTrainConfig());s.bodies.C.position.x=s.bodies.B.position.x+100;s.bodies.C.velocity.x=100;
 const o=observeAssistant(s,false),r=computeAssistant(o,s,settings);assert.ok(r.command.retro>0,JSON.stringify({observation:o,command:r.command}));
 const w=commandCWrench(s.bodies.C,r.command,s.config.ships.C,1/60,o.track);assert.ok(w.force.x<0);
});
for(const mirror of[-1,1])test(`actual moderate45 curve follows the leader's accepted past trajectory, mirror${mirror}`,()=>{
 const {TrainSession}=require(base+'tuglab2/session.js'),{AssistantPathTracker}=require(base+'tuglab2/assistantPath.js');
 function run(mode){const s=new TrainSession(createDefaultTrainConfig(),{appVersion:'0.1.0',sourceSHA:'a'.repeat(40),settings:{...settings,mode},scene:{id:'braking',seed:20261011,mirror,speed:40}}),measurement=new AssistantPathTracker(s.state);s.resume();let cross=0,ahead=0,pastTurn=false;
  for(let k=0;k<2400;k++){const t=k/60,theta=mirror*Math.PI/4*Math.min(1,Math.max(0,(t-5)/15)),input=t<20?{x:Math.cos(theta),y:Math.sin(theta),magnitude:.1,brake:false}:{x:0,y:0,magnitude:0,brake:true};
   const r=s.step(input);assert.equal(r.accepted,true,r.stopReason);measurement.accept(s.state);const ref=measurement.reference(s.state);assert.ok(ref);const b=s.state.bodies.B,c=s.state.bodies.C;
   cross=Math.max(cross,Math.abs((b.position.x-ref.point.x)*-ref.tangent.y+(b.position.y-ref.point.y)*ref.tangent.x));if((c.position.x-b.position.x)*ref.tangent.x+(c.position.y-b.position.y)*ref.tangent.y>0)ahead++;
   const observed=s.recording.ticks.at(-1).observation?.track;if(observed&&t>5&&t<20&&Math.abs(s.state.bodies.A.angle-Math.atan2(observed.tangentY,observed.tangentX))>.2)pastTurn=true;
  }return {cross,ahead,pastTurn,telemetry:s.telemetry};}
 const coast=run('coast'),brake=run('brake');assert.ok(brake.cross<=.8*coast.cross,JSON.stringify({coast:coast.cross,brake:brake.cross}));assert.ok(brake.telemetry.maxAngleB<=.8*coast.telemetry.maxAngleB);
 assert.ok(brake.telemetry.contactCount<=coast.telemetry.contactCount);assert.ok(brake.telemetry.pathB<coast.telemetry.pathB);assert.ok(brake.telemetry.bodies.B.speed<coast.telemetry.bodies.B.speed);assert.equal(brake.ahead,0);assert.equal(brake.pastTurn,true);
});
for(const mirror of[-1,1])test(`actual cargo-only skid is returned toward the accepted route using C engines, mirror${mirror}`,()=>{
 const {TrainSession}=require(base+'tuglab2/session.js'),{createScene}=require(base+'tuglab2/scenes.js'),{AssistantPathTracker}=require(base+'tuglab2/assistantPath.js');
 function run(mode){const cfg=createDefaultTrainConfig(),scene={id:'empty',seed:20261011,mirror,speed:40},initial=createScene(cfg,scene);initial.bodies.B.position.y+=mirror*100;initial.bodies.B.velocity.y=mirror*10;
  const s=new TrainSession(cfg,{appVersion:'0.1.0',sourceSHA:'a'.repeat(40),initialState:initial,scene,settings:{...settings,mode}}),measurement=new AssistantPathTracker(s.state);s.resume();let cross=0;
  for(let k=0;k<1800;k++){const r=s.step({x:0,y:0,magnitude:0,brake:false});assert.equal(r.accepted,true,r.stopReason);measurement.accept(s.state);const ref=measurement.reference(s.state);assert.ok(ref);const b=s.state.bodies.B;cross=Math.max(cross,Math.abs((b.position.x-ref.point.x)*-ref.tangent.y+(b.position.y-ref.point.y)*ref.tangent.x));}
  return {cross,telemetry:s.telemetry};}
 const coast=run('coast'),guard=run('guard');assert.ok(guard.cross<=.8*coast.cross,JSON.stringify({coast:coast.cross,guard:guard.cross}));assert.ok(guard.telemetry.bodies.B.speed<=.8*coast.telemetry.bodies.B.speed);assert.ok(guard.telemetry.pathB<coast.telemetry.pathB);assert.ok(guard.telemetry.contactCount<=coast.telemetry.contactCount);
});
