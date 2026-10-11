const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const make=()=>new BonkLab({}, {towing:true,space:true});
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const run=(lab,n)=>{for(let i=0;i<n;i++)lab.update(1/60);};
const abc=()=>{const lab=make();assert.equal(lab.setTowingComposition('ABC').ok,true);return lab;};
const live=lab=>{lab.start();run(lab,240);};
test('default AB follows the existing exact path, ABC retains seeded obstacles and fields',()=>{
 const a=make(),b=make();assert.equal(a.towingComposition,'AB');live(a);live(b);a.setInput(.5,-1,1);b.setInput(.5,-1,1);run(a,30);run(b,30);assert.deepEqual(a.getState(),b.getState());
 a.pause();const initial=make().getState().spaceWorld;assert.equal(a.setTowingComposition('ABC').ok,true);const s=a.getState();assert.equal(s.towing,undefined);assert.ok(s.train);
 for(const k of ['seed','density','statics','asteroids','fields','width','height','finishPoint'])assert.deepEqual(s.spaceWorld[k],initial[k]);
 assert.equal(s.spaceWorld.time,0);assert.equal(s.train.paused,true);near(s.angle,-Math.PI/2);assert.ok(s.y<s.train.B.position.y&&s.train.B.position.y<s.train.C.position.y);
 for(const l of s.train.connections){assert.equal(l.type,'spring');near(l.length,l.restLength);}
 assert.ok(s.train.C.position.y+s.train.C.radius<=s.spaceWorld.height/2);
});
test('immutable snapshots and failed paused rebuild preserve the entire flight',()=>{
 const lab=abc(),before=lab.getState(),cfg=lab.getTrainConfig();const out=lab.getState();out.train.C.velocity.x=1e6;out.train.connections[0].k=-1;out.train.settings.g=-1;out.train.engineWrenches.C={force:{x:9,y:9},torque:9};
 assert.deepEqual(lab.getState(),before);cfg.ships.C.crewGLimit=-1;assert.equal(lab.setTrainConfig(cfg).ok,false);assert.deepEqual(lab.getState(),before);
 assert.equal(lab.setTrainSettings({delay:NaN}).ok,false);assert.deepEqual(lab.getState(),before);
 live(lab);const running=lab.getState();assert.equal(lab.setTowingComposition('AB').ok,false);assert.equal(lab.selectTrainSize('C','XL').ok,false);assert.deepEqual(lab.getState(),running);
});
test('independent C/links and ten XL A masses rebuild on pause without mutating seeded world',()=>{
 const lab=abc(),world=lab.getState().spaceWorld;assert.equal(lab.selectTrainSize('A','XL').ok,true);assert.equal(lab.selectTrainSize('C','S').ok,true);const cfg=lab.getTrainConfig();cfg.ships.B.mass=cfg.ships.A.mass*10;cfg.links.BC.k=10000;cfg.links.BC.c=20000;
 assert.equal(lab.setTrainConfig(cfg).ok,true);const s=lab.getState();near(s.train.B.mass,64192000);near(s.train.C.mass,100300);near(s.train.connections[1].k,10000);assert.deepEqual(s.spaceWorld.statics,world.statics);
});
test('ABC accepted engine means drive A and rear assistant, pause clears commands and holds',()=>{
 const lab=abc();assert.equal(lab.setTrainSettings({mode:'brake',delay:0}).ok,true);live(lab);lab.setInput(0,-1,1);run(lab,50);const s=lab.getState();assert.ok(Math.hypot(s.vx,s.vy)>1);assert.ok(Math.hypot(s.train.engineWrenches.A.force.x,s.train.engineWrenches.A.force.y)>1);
 lab.setTrainRearBrake(true,'keyboard');lab.setTrainRearBrake(true,'pointer');lab.setTrainRearBrake(false,'keyboard');assert.equal(lab.getState().train.rearBrake,true);run(lab,1);
 lab.pause();const p=lab.getState();assert.equal(p.train.rearBrake,false);assert.deepEqual(p.train.commandC,{forward:0,retro:0,lateral:0,yaw:0});assert.deepEqual(p.train.engineWrenches,{});near(p.inputMagnitude,0);
});
test('detach latch survives pause and g edits, explicit mode releases it',()=>{
 const lab=abc();lab.setTrainSettings({mode:'guard',delay:0});assert.equal(lab.setTrainConnection('AB',false).ok,true);assert.equal(lab.getState().train.assistant.status,'disconnected');assert.equal(lab.setTrainConnection('AB',true).ok,true);lab.pause();
 assert.equal(lab.setTrainSettings({g:.5}).ok,true);assert.equal(lab.getState().train.assistant.status,'disconnected');assert.equal(lab.setTrainSettings({mode:'guard'}).ok,true);assert.notEqual(lab.getState().train.assistant.status,'disconnected');
});
test('ABC Step and restart use one shared tick, clear histories, and return an identical seeded start',()=>{
 const lab=abc(),start=lab.getState();live(lab);lab.pause();const t=lab.getState().spaceWorld.tick;assert.equal(lab.stepOnce(),true);assert.equal(lab.getState().spaceWorld.tick,t+1);assert.equal(lab.getState().train.paused,true);
 lab.reset();assert.deepEqual(lab.getState(),start);assert.equal(lab.setTowingComposition('AB').ok,true);assert.deepEqual(lab.getState(),make().getState());
});
test('finite failure is atomic and requires restart without corrupting three bodies or world',()=>{
 const lab=abc();live(lab);const s=lab.getState();lab.setInput(NaN,0,1);run(lab,1);const out=lab.getState();assert.equal(out.train.needsRestart,true);assert.equal(out.train.paused,true);assert.ok(out.train.reason);
 for(const k of ['B','C','connections'])assert.deepEqual(out.train[k],s.train[k]);assert.deepEqual(out.spaceWorld,s.spaceWorld);lab.resume();assert.equal(lab.isRunning,false);lab.reset();assert.equal(lab.getState().train.needsRestart,false);
});
test('flight has no experiment stop-hold or 60-second braking timeout',()=>{
 const lab=abc();const train=lab.train;train.resume();for(let i=0;i<620;i++){const r=train.advance({x:0,y:0,magnitude:0,brake:true},.1,true);assert.equal(r.accepted,true);}
 assert.ok(train.state.world.time>60);assert.equal(train.snapshot(false).needsRestart,false);
});
test('ABC finish requires every hull to cross the existing route finish line',()=>{
 const lab=abc();live(lab);const s=lab.train.state; s.connections.forEach(c=>c.connected=false);s.world.fields=[];s.world.statics=[];s.world.asteroids=[];
 const y=s.world.finishPoint.y;for(const body of Object.values(s.bodies)){body.velocity={x:0,y:0};body.position.x=0;}s.bodies.A.position.y=y-60;s.bodies.B.position.y=y-5;s.bodies.C.position.y=y+200;run(lab,1);assert.equal(lab.getState().finished,false);assert.equal(lab.getState().train.needsRestart,false);
 lab.train.state.bodies.C.position={x:100,y:y-30};run(lab,1);assert.equal(lab.getState().finished,true);assert.equal(lab.getState().train.needsRestart,false);
});
test('ABC share is distinct, exact, atomic and old AB share restores AB',()=>{
 const {encodeTrainShareFragment,decodeTrainShareFragment}=require('../../.cache/tuglab-tests/client/src/u2taglab/trainShare.js');const lab=abc();lab.selectTrainSize('C','L');lab.setTrainSettings({mode:'guard',delay:.5});lab.setSpaceFA(false);
 const share=lab.exportTrainShareSnapshot(),fragment=encodeTrainShareFragment(share);assert.match(fragment,/^#u2train=/);const other=make();other.applyTrainShareSnapshot(decodeTrainShareFragment(fragment));assert.deepEqual(other.exportTrainShareSnapshot(),share);assert.deepEqual(other.getState(),lab.getState());
 const before=other.getState(),invalid=structuredClone(share);invalid.configuration.ships.C.mass=-1;assert.throws(()=>other.applyTrainShareSnapshot(invalid));assert.deepEqual(other.getState(),before);
 other.applySpaceShareSnapshot(make().exportSpaceShareSnapshot());assert.equal(other.towingComposition,'AB');assert.deepEqual(other.getState(),make().getState());
});
test('ABC A settings dispatch to train, preserve cargo masses and reject live physics edits',()=>{
 const lab=abc(),b=lab.getState().train.B.mass,c=lab.getState().train.C.mass;lab.updateParams('mass',600000);lab.updateParams('space.forwardForce',10000000);lab.updateParams('space.speedLimit',120);
 assert.equal(lab.getTrainConfig().ships.A.mass,600000);assert.equal(lab.params.mass,600000);assert.equal(lab.params['space.forwardForce'],10000000);assert.equal(lab.getTrainConfig().ships.A.speedLimits.forward,120);assert.equal(lab.getState().train.B.mass,b);assert.equal(lab.getState().train.C.mass,c);
 live(lab);const before=lab.getState();lab.updateParams('mass',800000);lab.updateParams('space.fieldPressure',1);assert.deepEqual(lab.getState(),before);
});
test('ABC seed, density and environment rebuild atomically and restart the same changed route',()=>{
 const lab=abc();lab.updateParams('space.fieldsEnabled',true);lab.updateParams('space.fieldPressure',.25);lab.updateParams('space.collisionRestitution',.4);
 assert.equal(lab.params['space.fieldsEnabled'],true);assert.equal(lab.params['space.fieldPressure'],.25);assert.equal(lab.getTrainConfig().numerics.restitution,.4);assert.ok(lab.getState().spaceWorld.fields.length>0);
 lab.regenerateArena(123,7);const changed=lab.getState();assert.equal(changed.spaceWorld.seed,123);assert.equal(changed.spaceWorld.density,7);lab.reset();assert.deepEqual(lab.getState(),changed);
 const snapshot=lab.exportTrainShareSnapshot();assert.equal(snapshot.base.seed,123);assert.equal(snapshot.base.world.fields.fieldPressure,.25);const other=make();other.applyTrainShareSnapshot(snapshot);assert.deepEqual(other.getState(),changed);
 const before=lab.getState();lab.regenerateArena(NaN,5);assert.deepEqual(lab.getState(),before);
});
test('default AB matches direct legacy world integrator with actual control and fields',()=>{
 const {advanceSpaceWorld}=require('../../.cache/tuglab-tests/client/src/u2taglab/world.js');
 const {spaceInputFrame,spaceEngineWrench}=require('../../.cache/tuglab-tests/client/src/u2taglab/physics/flightAssist.js');
 const {sampleSpaceFieldResponse}=require('../../.cache/tuglab-tests/client/src/u2taglab/fields.js');
 const lab=make();live(lab);lab.setInput(.6,-.8,1);const before=lab.getState(),p=lab.space;
 const r=advanceSpaceWorld(lab.towingBodyA(),before.towing.B,before.towing.coupling,before.spaceWorld,1/60,lab.towing.physicsConfig(lab.params['space.collisionRestitution']),({id,body,time,subDt})=>{
  const e=id==='A'?spaceEngineWrench(body,spaceInputFrame(body,.6,-.8,1,p,false),true,p,subDt):{force:{x:0,y:0},torque:0};
  return sampleSpaceFieldResponse(before.spaceWorld,{...body,id},time,subDt,e);
 });assert.equal(r.stopReason,undefined);run(lab,1);const after=lab.getState();
 assert.deepEqual(lab.towingBodyA(),r.A);assert.deepEqual(after.towing.B,r.B);assert.deepEqual(after.towing.coupling,r.coupling);assert.deepEqual(after.spaceWorld,r.world);
});
test('delayed causal assistant and actual accepted C engine remain zero until accepted history exists',()=>{
 const {LabTrain}=require('../../.cache/tuglab-tests/client/src/lab/LabTrain.js');const lab=abc(),cfg=lab.getTrainConfig();cfg.world.fields=[];cfg.world.statics=[];cfg.world.asteroids=[];
 const train=new LabTrain(cfg,{...lab.getTrainSettings(),mode:'guard',delay:.2});train.state.bodies.C.position.y-=20;train.resume();
 for(let i=0;i<12;i++){assert.equal(train.advance({x:0,y:-1,magnitude:1,brake:false},1/60,true).accepted,true);assert.equal(train.commandC.retro,0);assert.equal(train.assistant.status,'waiting');}
 assert.equal(train.advance({x:0,y:-1,magnitude:1,brake:false},1/60,true).accepted,true);assert.notEqual(train.assistant.status,'waiting');assert.ok(train.commandC.retro>0);assert.ok(Math.hypot(train.engineWrenches.C.force.x,train.engineWrenches.C.force.y)>0);
 train.pause();train.resume();assert.equal(train.advance({x:0,y:0,magnitude:0,brake:false},1/60,true).accepted,true);assert.equal(train.assistant.status,'waiting');assert.equal(train.commandC.retro,0);
});
test('ABC uses joint world contacts for rear tug, cargo and asteroids with engine metadata',()=>{
 const {LabTrain}=require('../../.cache/tuglab-tests/client/src/lab/LabTrain.js');const {createAsteroid}=require('../../.cache/tuglab-tests/client/src/u2taglab/world.js');const lab=abc(),cfg=lab.getTrainConfig();cfg.world.fields=[];cfg.world.statics=[];cfg.world.asteroids=[];
 for(const id of ['A','B','C']){const train=new LabTrain(cfg);train.state.connections.forEach(l=>l.connected=false);const body=train.state.bodies[id];
  train.state.world.statics=[{id:'station:test',kind:'station',position:{x:body.position.x+body.radius+25,y:body.position.y},radius:10}];body.velocity.x=100;
  const asteroid={id:'asteroid:test',kind:'asteroid',...createAsteroid(5,{x:body.position.x-200,y:body.position.y},{x:1,y:0},5000)};train.state.world.asteroids=[asteroid];
  train.resume();const r=train.advance({x:0,y:0,magnitude:0,brake:false},.2,false);assert.equal(r.accepted,true,r.reason);assert.ok(r.contacts.some(c=>c.body===id&&c.other==='station:test'));assert.ok(train.state.world.asteroids[0].position.x>asteroid.position.x);assert.ok(train.engineWrenches['asteroid:test']);}
});
test('ABC cannot be exported under the old AB schema and finish exposes a paused cleared flight',()=>{
 const lab=abc();assert.throws(()=>lab.exportSpaceShareSnapshot(),/ABC/);live(lab);const s=lab.train.state;s.connections.forEach(l=>l.connected=false);s.world.fields=[];s.world.statics=[];s.world.asteroids=[];
 const y=s.world.finishPoint.y;for(const [id,b] of Object.entries(s.bodies)){b.position={x:id==='C'?100:0,y:id==='A'?y-60:id==='B'?y-5:y-30};b.velocity={x:0,y:0};}run(lab,1);
 assert.equal(lab.getState().finished,true);assert.equal(lab.getState().train.paused,true);assert.equal(lab.isRunning,false);assert.deepEqual(lab.getState().train.engineWrenches,{});
});
test('accepted ABC world fields remain immutable to shell snapshot consumers',()=>{
 const lab=abc();live(lab);const before=structuredClone(lab.getState()),out=lab.getState();assert.ok(out.spaceWorld.fields.length>0);out.spaceWorld.fields[0].pressure=999;out.spaceWorld.fields[0].center.x=1e9;
 assert.deepEqual(lab.getState(),before);
});
test('live assistant settings preserve accepted trajectory and causal history; same-mode explicitly releases latch',()=>{
 const lab=abc(),config=lab.getTrainConfig();config.links.AB.restLength=270;assert.equal(lab.setTrainConfig(config).ok,true);live(lab);lab.setInput(0,-1,1);run(lab,20);const before=structuredClone(lab.getState());
 assert.equal(lab.setTrainSettings({mode:'guard',g:.7,delay:.2}).ok,true);const after=lab.getState();
 for(const k of ['x','y','vx','vy','angle','angularVelocity','elapsedTime','spaceWorld'])assert.deepEqual(after[k],before[k]);for(const k of ['B','C','connections','diagnostics','engineWrenches'])assert.deepEqual(after.train[k],before.train[k]);
 assert.equal(lab.isRunning,true);const historySize=lab.train.history.length;assert.ok(historySize>0);assert.equal(lab.setTrainSettings({g:0}).ok,true);assert.equal(lab.train.history.length,historySize);assert.deepEqual(lab.getState().train.commandC,{forward:0,retro:0,lateral:0,yaw:0});
 assert.equal(lab.setTrainConnection('AB',false).ok,true);assert.equal(lab.setTrainConnection('AB',true).ok,true);assert.equal(lab.setTrainSettings({g:1,delay:0}).ok,true);assert.equal(lab.getState().train.assistant.status,'disconnected');
 assert.equal(lab.setTrainSettings({mode:'guard'}).ok,true);assert.notEqual(lab.getState().train.assistant.status,'disconnected');assert.equal(lab.getState().spaceWorld.time,before.spaceWorld.time);run(lab,1);assert.ok(lab.getState().spaceWorld.time>before.spaceWorld.time);
});
test('inherited AB capture720 roundtrips in the initial ABC geometry without changing actual length',()=>{
 const lab=make();lab.updateParams('tow.length',720);lab.reset();assert.equal(lab.setTowingComposition('ABC').ok,true);const before=structuredClone(lab.getState());assert.equal(lab.setTrainConnection('AB',false).ok,true);assert.equal(lab.setTrainConnection('AB',true).ok,true);
 const after=lab.getState();near(after.train.connections[0].restLength,720);near(after.train.connections[0].captureMaxLength,720);for(const k of ['B','C'])assert.deepEqual(after.train[k],before.train[k]);assert.deepEqual(after.spaceWorld,before.spaceWorld);
});
test('ABC share byte budget rejects a non-ASCII payload that would encode an unreadable oversized link',()=>{
 const {validateTrainShareSnapshot}=require('../../.cache/tuglab-tests/client/src/u2taglab/trainShare.js');const share=abc().exportTrainShareSnapshot();share.configuration.ships.C.source={...share.configuration.ships.C.source,snapshot:'я'.repeat(25000)};
 assert.ok(JSON.stringify(share).length<64000);assert.ok(Buffer.byteLength(JSON.stringify(share))>64000);
 assert.throws(()=>validateTrainShareSnapshot(share));
});
test('failed external-force attempt returns no accepted engine/history evidence and no physical mutation',()=>{
 const {LabTrain}=require('../../.cache/tuglab-tests/client/src/lab/LabTrain.js');const cfg=abc().getTrainConfig();cfg.ships.A.forwardForce=1e300;cfg.ships.A.crewGLimit=1e300;const train=new LabTrain(cfg);train.resume();const before=structuredClone(train.state);
 const r=train.advance({x:0,y:-1,magnitude:1,brake:false},1/60,false);assert.equal(r.accepted,false);assert.ok(r.reason);assert.equal(train.needsRestart,true);assert.deepEqual(train.state.bodies,before.bodies);assert.deepEqual(train.state.world,before.world);assert.deepEqual(train.engineWrenches,{});assert.deepEqual(train.history,[]);
});
test('ABC reset parameters restores matching effective world and physics defaults on a safe start',()=>{
 const lab=abc();lab.updateParams('space.collisionRestitution',.4);lab.updateParams('space.fieldPressure',.25);lab.selectTrainSize('C','XL');lab.setTrainSettings({mode:'brake',g:.1,delay:1});lab.regenerateArena(123,7);lab.resetSpaceParams();
 assert.equal(lab.towingComposition,'ABC');assert.equal(lab.params['space.collisionRestitution'],.8);assert.equal(lab.getTrainConfig().numerics.restitution,.8);assert.equal(lab.getState().spaceWorld.seed,123);assert.equal(lab.getState().spaceWorld.density,5);assert.equal(lab.getTrainConfig().ships.C.size,'M');assert.equal(lab.getTrainSettings().mode,'coast');assert.equal(lab.getState().spaceWorld.time,0);
});
test('whole train configuration keeps effective collision setting and shared recipe consistent',()=>{
 const lab=abc(),cfg=lab.getTrainConfig();cfg.numerics.restitution=.3;assert.equal(lab.setTrainConfig(cfg).ok,true);assert.equal(lab.params['space.collisionRestitution'],.3);const share=lab.exportTrainShareSnapshot();assert.equal(share.base.params['space.collisionRestitution'],.3);
 const other=make();other.applyTrainShareSnapshot(share);assert.equal(other.params['space.collisionRestitution'],.3);assert.equal(other.getTrainConfig().numerics.restitution,.3);
});
test('ABC share rejects a hidden collision setting inconsistent with the displayed world recipe',()=>{
 const lab=abc(),before=structuredClone(lab.getState()),share=lab.exportTrainShareSnapshot();share.configuration.numerics.restitution=.2;assert.throws(()=>lab.applyTrainShareSnapshot(share));assert.deepEqual(lab.getState(),before);
});

test('live solver rejects the security4096 workload atomically through config, constructor and raw share',()=>{
 const {LabTrain,createVerticalTrain}=require('../../.cache/tuglab-tests/client/src/lab/LabTrain.js');
 const {validateTrainShareSnapshot,decodeTrainShareFragment}=require('../../.cache/tuglab-tests/client/src/u2taglab/trainShare.js');
 const lab=abc(),before=structuredClone(lab.getState()),original=lab.getTrainConfig(),cfg=structuredClone(original);
 cfg.numerics.substeps=cfg.numerics.maxAdaptiveSubsteps=cfg.numerics.solverIterations=4096;
 assert.throws(()=>new LabTrain(cfg),/бюджет/);assert.throws(()=>createVerticalTrain(cfg),/бюджет/);
 const unchanged=structuredClone(cfg),result=lab.setTrainConfig(cfg);assert.equal(result.ok,false);assert.match(result.reason,/бюджет/);
 assert.deepEqual(cfg,unchanged);assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.getTrainConfig(),original);
 const share=lab.exportTrainShareSnapshot();share.base.density=25;share.base.params['arena.objectDensity']=25;share.configuration.numerics=cfg.numerics;
 const fragment='#u2train='+Buffer.from(JSON.stringify(share)).toString('base64url');
 assert.throws(()=>validateTrainShareSnapshot(share));assert.throws(()=>decodeTrainShareFragment(fragment));
 assert.throws(()=>lab.applyTrainShareSnapshot(share));assert.deepEqual(lab.getState(),before);assert.deepEqual(lab.getTrainConfig(),original);
});
test('live solver bounds each workload dimension and accepts the inclusive numerical ceilings',()=>{
 const {LabTrain}=require('../../.cache/tuglab-tests/client/src/lab/LabTrain.js');const cfg=abc().getTrainConfig();
 for(const [key,max] of Object.entries({substeps:128,solverIterations:128,maxAdaptiveSubsteps:4096,maxContactEvents:4096})){
  for(const value of [max+1,0,-1,1.5,NaN,Infinity]){const candidate=structuredClone(cfg);candidate.numerics[key]=value;assert.throws(()=>new LabTrain(candidate),/бюджет/,`${key}=${value}`);}
 }
 const upper=structuredClone(cfg);Object.assign(upper.numerics,{substeps:128,solverIterations:128,maxAdaptiveSubsteps:4096,maxContactEvents:4096});
 const train=new LabTrain(upper);assert.deepEqual(train.config().numerics,upper.numerics);
 const inconsistent=structuredClone(cfg);inconsistent.numerics.substeps=128;inconsistent.numerics.maxAdaptiveSubsteps=64;assert.throws(()=>new LabTrain(inconsistent),/бюджет/);
});
test('live budget preserves the normal4/512/16 solver and accepted dense-world flight',()=>{
 const {LabTrain}=require('../../.cache/tuglab-tests/client/src/lab/LabTrain.js');const lab=abc();lab.regenerateArena(42,25);const cfg=lab.getTrainConfig(),n=cfg.numerics;
 assert.equal(n.substeps,4);assert.equal(n.maxAdaptiveSubsteps,512);assert.equal(n.solverIterations,16);
 const train=new LabTrain(cfg);assert.deepEqual(train.config().numerics,n);train.resume();
 assert.equal(train.advance({x:0,y:-1,magnitude:1,brake:false},1/60,true).accepted,true);assert.ok(train.state.world.time>0);
});
