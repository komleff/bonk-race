const {test}=require('node:test');
const {assert,near}=require('./helpers.cjs');
const {BonkLab}=require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const make=()=>new BonkLab({}, {towing:true,space:true});
const advance=(lab,n=1)=>{for(let i=0;i<n;i++)lab.update(1/60);};
const live=lab=>{lab.start();advance(lab,240);};
test('space starts a free large composition with source geometry and calibrated spring',()=>{
 const lab=make(),s=lab.getState();near(s.mass,300000);near(s.radius,24.879310344827587);near(s.towing.B.mass,680000);
 near(s.towing.B.inertia,791520000);near(s.towing.distance,288);near(s.towing.coupling.k,184904.0171469394);assert.equal(s.towing.reason,undefined);
 assert.equal(s.orbs.length,0);assert.equal(s.arena.zones.length,0);assert.ok(s.arena.width>=6000);
});
test('live FA toggle keeps bodies, seed, timer, angle, input and current coupling',()=>{
 const lab=make();live(lab);lab.setInput(0,-1,1);advance(lab,20);const s=lab.getState(),seed=lab.getScenarioInfo().seed;
 assert.equal(lab.params['space.fa'],true);assert.equal(lab.setSpaceFA(false),true);assert.deepEqual(lab.getState(),s);assert.equal(lab.getScenarioInfo().seed,seed);
 assert.equal(lab.params['space.fa'],false);lab.updateParams('space.fa',true);assert.deepEqual(lab.getState(),s);
});
test('mass edits do not add torque; radius override does not change U2 inertia',()=>{
 const lab=make(),s=lab.getState();lab.updateParams('tow.radiusB',250);near(lab.getState().towing.B.inertia,791520000);
 lab.updateParams('mass',600000);near(lab.getState().towing.B.inertia,1583040000);near(lab.params['space.yawTorque'],45333181.99130072);
 near(lab.getState().x,s.x);near(lab.getState().y,s.y);
});
test('space rope minimum is enforced atomically including type switch',()=>{
 const lab=make();lab.updateParams('tow.type','rope');lab.updateParams('tow.length',287);near(lab.params['tow.length'],288);
 lab.updateParams('tow.type','rod');lab.updateParams('tow.length',20);const before=structuredClone(lab.getState().towing);
 lab.updateParams('tow.type','rope');assert.equal(lab.params['tow.type'],'rod');assert.deepEqual(lab.getState().towing,before);
});
test('long start checks entire composition and coupling clearance',()=>{
 const lab=make();lab.updateParams('tow.length',2000);lab.updateParams('tow.radiusB',250);lab.reset();let s=lab.getState();near(s.towing.distance,2000);assert.equal(s.towing.reason,undefined);
 const a={x:s.x,y:s.y},b=s.towing.B.position;s.arena.obstacles.push({x:(a.x+b.x)/2,y:(a.y+b.y)/2,radius:120,type:'pillar',alive:true});
 lab.reset();s=lab.getState();assert.equal(s.towing.reason,undefined);assert.ok(Math.abs(s.x-a.x)>120 || Math.abs(s.y-a.y)>120);
});
test('space reconnect uses V_FA in either mode and keeps nearest attachments',()=>{
 for(const fa of [true,false]) {const lab=make();lab.setSpaceFA(fa);lab.setTowingConnection(false);lab.towing.B.velocity.x=200;
 assert.equal(lab.setTowingConnection(true).ok,true);lab.setTowingConnection(false);lab.towing.B.velocity.x=251;
 const before=lab.getState().towing.B;assert.equal(lab.setTowingConnection(true).ok,false);assert.deepEqual(lab.getState().towing.B,before);}
});
test('space bypasses legacy FA and ambient drag; B has no damping',()=>{
 const lab=make();live(lab);lab.setTowingConnection(false);lab.updateParams('space.fa',false);
 lab.vx=30;lab.vy=-12;lab.angVel=0;lab.towing.B.velocity={x:20,y:0};lab.towing.B.angularVelocity=10;const s=lab.getState();advance(lab,30);const t=lab.getState();
 near(t.vx,30);near(t.vy,-12);near(t.towing.B.velocity.x,20);near(t.towing.B.angularVelocity,10);near(t.towing.B.position.x,s.towing.B.position.x+10);assert.equal(lab.yawSignHistory.length,0);
});
test('actual space thrust transfers to B and pause/step/restart remain coherent',()=>{
 const lab=make();lab.updateParams('tow.type','rod');lab.reset();live(lab);const s=lab.getState();lab.setInput(0,-1,1);advance(lab,120);let t=lab.getState();
 assert.ok(t.y<s.y-10);assert.ok(t.towing.B.velocity.y<0);assert.equal(t.towing.reason,undefined);near(t.towing.distance,288,2.88);
 lab.pause();t=lab.getState();lab.stepOnce();near(lab.getState().elapsedTime,t.elapsedTime+1/60);assert.deepEqual(lab.getInterpolatedState(0),lab.getState());lab.reset();near(lab.getState().elapsedTime,0);
});
test('space extreme solver stop is atomic, with no partial A/B update',()=>{
 const lab=make();live(lab);lab.towing.B.angularVelocity=1e8;const s=lab.getState();advance(lab);const t=lab.getState();assert.ok(t.towing.needsRestart);assert.equal(lab.isRunning,false);
 near(t.x,s.x);near(t.y,s.y);near(t.vx,s.vx);assert.deepEqual(t.towing.B,s.towing.B);assert.deepEqual(t.towing.coupling,s.towing.coupling);near(t.elapsedTime,s.elapsedTime);
});
test('space rejects legacy share without changing the world',()=>{
 const stock=new BonkLab({}, {towing:true});const lab=make(),s=lab.getState();assert.throws(()=>lab.applyShareSnapshot(stock.exportShareSnapshot()),/U2TagLab/);assert.deepEqual(lab.getState(),s);
});
test('space rope capture keeps configured length and slack without pulling bodies',()=>{
 const lab=make();lab.updateParams('tow.type','rope');lab.updateParams('tow.length',1000);lab.reset();lab.setTowingConnection(false);
 lab.towing.B.position.y-=800;const before=lab.getState();const result=lab.setTowingConnection(true);assert.equal(result.ok,true);
 const after=lab.getState();near(after.towing.coupling.restLength,1000);near(after.towing.distance,200);
 near(after.x,before.x);near(after.y,before.y);near(after.vx,before.vx);near(after.vy,before.vy);assert.deepEqual(after.towing.B,before.towing.B);
});
test('space calibration follows actual reduced mass, and invalid edits are atomic',()=>{
 const lab=make();lab.updateParams('tow.massRatio',1);const c=lab.getState().towing.coupling.c;
 near(c,Math.sqrt(184904.0171469394*150000),1e-6);lab.updateParams('mass',600000);near(lab.getState().towing.coupling.c,c*Math.sqrt(2),1e-6);
 const before=lab.params,s=lab.getState();for(const [key,value] of [['mass',NaN],['mass',1e8],['space.forwardForce',Infinity],['space.yawStopTime',0],['tow.radiusB',251],['tow.massRatio',0.09],['tow.stiffness',1e9]])lab.updateParams(key,value);
 assert.deepEqual(lab.params,before);assert.deepEqual(lab.getState(),s);
});
test('mode-owned settings never reintroduce stock drag, FA or mass torque scaling',()=>{
 const lab=make();lab.setSpaceFA(false);const p=lab.params;
 for(const [key,value] of [['worldPhysics.forwardDragK',1],['worldPhysics.angularDragK',5],['propulsion.turnTorqueNm',1e12],['massScaling.turnTorqueNm.exp',2]])lab.updateParams(key,value);
 assert.deepEqual(lab.params,p);lab.updateParams('tow.type','rod');lab.updateParams('tow.stiffness',1e8);lab.reset();assert.equal(lab.params['space.fa'],false);
 near(lab.params['space.yawTorque'],45333181.99130072);near(lab.params['worldPhysics.forwardDragK'],0);near(lab.params['worldPhysics.angularDragK'],0);
});
for(const type of ['rod','rope','spring'])test(`space ${type} conserves total momentum at SI scale without engines`,()=>{
 const lab=make();lab.updateParams('tow.type',type);lab.updateParams('space.enginesEnabled',false);lab.reset();live(lab);
 lab.vx=20;lab.vy=-40;lab.angVel=0.1;lab.towing.B.velocity={x:-5,y:-20};lab.towing.B.angularVelocity=-0.05;
 const momentum=s=>({x:s.mass*s.vx+s.towing.B.mass*s.towing.B.velocity.x,y:s.mass*s.vy+s.towing.B.mass*s.towing.B.velocity.y,
  angular:s.mass*(s.x*s.vy-s.y*s.vx)+108225000*s.angularVelocity+s.towing.B.mass*(s.towing.B.position.x*s.towing.B.velocity.y-s.towing.B.position.y*s.towing.B.velocity.x)+s.towing.B.inertia*s.towing.B.angularVelocity});
 const before=momentum(lab.getState());advance(lab,120);const s=lab.getState(),after=momentum(s);assert.equal(s.towing.reason,undefined);
 near(after.x,before.x,1e-6);near(after.y,before.y,1e-6);near(after.angular,before.angular,0.002);
});
test('upper stiffness and extreme masses/radii/lengths stay finite or stop the whole pair',()=>{
 for(const mass of [10000,1e7])for(const ratio of [0.1,10])for(const radius of [2,250])for(const length of [20,2000]) {
  const lab=make();lab.updateParams('mass',mass);lab.updateParams('tow.massRatio',ratio);lab.updateParams('tow.radiusB',radius);lab.updateParams('tow.length',length);lab.updateParams('tow.stiffness',1e8);lab.reset();live(lab);
  assert.equal(lab.getState().towing.reason,undefined);lab.setInput(0,-1,1);
  for(let i=0;i<120;i++) {
   const before=lab.getState();advance(lab);const after=lab.getState();
   assert.ok([after.x,after.y,after.vx,after.vy,after.angularVelocity,after.towing.B.velocity.x,after.towing.B.velocity.y,after.towing.B.angularVelocity].every(Number.isFinite));
   if(after.towing.needsRestart) {near(after.x,before.x);near(after.y,before.y);near(after.vx,before.vx);near(after.vy,before.vy);assert.deepEqual(after.towing.B,before.towing.B);assert.deepEqual(after.towing.coupling,before.towing.coupling);near(after.elapsedTime,before.elapsedTime);break;}
  }
 }
});
test('space capture chooses nearest tail/tail pair with perpendicular hull headings',()=>{
 const lab=make();lab.setTowingConnection(false);const s=lab.getState();
 lab.towing.B.position={x:s.x+200,y:s.y+200};lab.towing.B.angle=0;const before=lab.getState();assert.equal(lab.setTowingConnection(true).ok,true);
 const after=lab.getState();assert.equal(after.towing.coupling.attachmentA,'tail');assert.equal(after.towing.coupling.attachmentB,'tail');
 near(after.x,before.x);near(after.y,before.y);near(after.angle,before.angle);assert.deepEqual(after.towing.B,before.towing.B);
});
