const {test} = require('node:test');
const {assert, near} = require('./helpers.cjs');
const {BonkLab} = require('../../.cache/tuglab-tests/client/src/lab/BonkLab.js');
const make = towing => new BonkLab({}, {towing});
const advance = (lab,n=1) => { for(let i=0;i<n;i++) lab.update(1/60); };
const live = lab => { lab.start(); advance(lab,240); };
const free = (b,arena) => {
 assert.ok(b.position.x-b.radius>=-arena.width/2 && b.position.x+b.radius<=arena.width/2);
 assert.ok(b.position.y-b.radius>=-arena.height/2 && b.position.y+b.radius<=arena.height/2);
 for(const o of arena.obstacles) assert.ok(Math.hypot(b.position.x-o.x,b.position.y-o.y)>=b.radius+o.radius-1e-6);
};
test('opt-in starts both disks free and keeps stock arena',()=>{
 const stock=make(false),lab=make(true),s=lab.getState();
 assert.ok(s.towing); assert.deepEqual(s.arena,stock.getState().arena);
 free({position:{x:s.x,y:s.y},radius:s.radius},s.arena);free(s.towing.B,s.arena);
 near(s.towing.distance,8); assert.ok(!Object.keys(stock.params).some(k=>k.startsWith('tow.')));
});
test('trailer edits preserve map and positions; restart creates feasible composition',()=>{
 const lab=make(true),s=lab.getState(),map=JSON.stringify(s.arena);
 lab.updateParams('tow.radiusB',60);lab.updateParams('tow.massRatio',10);
 let t=lab.getState(); assert.equal(JSON.stringify(t.arena),map); near(t.x,s.x);near(t.y,s.y);
 assert.deepEqual(t.towing.B.position,s.towing.B.position);near(t.towing.B.mass,10*s.mass);
 assert.ok(t.towing.paused);assert.match(t.towing.reason,/Restart/);
 lab.reset();t=lab.getState();free(t.towing.B,t.arena);near(t.towing.distance,8);
 assert.equal(JSON.stringify(t.arena),map); assert.equal(t.towing.reason,undefined);
});
test('invalid tow edits are rejected without changing values or map',()=>{
 const lab=make(true),p={...lab.params},s=lab.getState();
 for(const [k,v] of [['tow.massRatio',NaN],['tow.radiusB',''],['tow.length',101],['tow.stiffness',Infinity],['tow.type','bad']]) lab.updateParams(k,v);
 assert.deepEqual(lab.params,p); assert.strictEqual(lab.getState().arena,s.arena);
});
test('impossible composition fails visibly on the existing map',()=>{
 const lab=make(true); lab.updateParams('worldPhysics.widthM',30);
 const s=lab.getState(); assert.ok(s.towing.paused); assert.match(s.towing.reason,/старт|Restart/);
 assert.equal(s.arena.width,30);assert.ok(Number.isFinite(s.x+s.y));
});
test('external stock thrust on A transfers force to passive B through rod',()=>{
 const lab=make(true);lab.updateParams('tow.type','rod');lab.reset();live(lab);
 const s=lab.getState();lab.setInput(0,-1,1);advance(lab,120);const t=lab.getState();
 assert.ok(t.y<s.y);assert.ok(t.towing.B.velocity.y<0);assert.ok(t.towing.B.position.y<s.towing.B.position.y);
 near(t.towing.distance,8,0.08); assert.equal(t.towing.reason,undefined);
});
test('pause resume preserves countdown; step advances once with synchronized interpolation',()=>{
 const lab=make(true);live(lab);lab.setInput(0,-1,1);advance(lab,10);lab.pause();
 let s=lab.getState();lab.resume();near(lab.getState().startCountdown,0);lab.pause();
 lab.stepOnce();const t=lab.getState();near(t.elapsedTime,s.elapsedTime+1/60);
 assert.deepEqual(lab.getInterpolatedState(0),t);assert.ok(!lab.isRunning);
});
test('large elapsed interval pauses and clears input until explicit resume',()=>{
 const lab=make(true);live(lab);lab.setInput(1,0,1);const time=lab.getState().elapsedTime;
 lab.update(0.251);assert.ok(!lab.isRunning);near(lab.getState().inputMagnitude,0);near(lab.getState().elapsedTime,time);
 advance(lab,10);near(lab.getState().elapsedTime,time);lab.resume();advance(lab);assert.ok(lab.getState().elapsedTime>time);
});
test('disconnect preserves velocities and capture rejects excess attachment speed',()=>{
 const lab=make(true);live(lab);lab.setInput(0,-1,1);advance(lab,20);
 const s=lab.getState();assert.ok(lab.setTowingConnection(false).ok);const t=lab.getState();
 near(t.vx,s.vx);near(t.vy,s.vy);assert.deepEqual(t.towing.B.velocity,s.towing.B.velocity);
 lab.setInput(1,0,1);advance(lab,60);const result=lab.setTowingConnection(true);
 assert.equal(result.ok,false);assert.equal(lab.getState().towing.coupling.connected,false);assert.ok(lab.getState().towing.reason);
});
test('spring damping reference remains fixed across mass edits until restart',()=>{
 const lab=make(true),s=lab.getState();lab.updateParams('tow.massRatio',5);near(lab.getState().towing.coupling.c,s.towing.coupling.c);
 lab.updateParams('mass',s.mass*2);near(lab.getState().towing.coupling.c,s.towing.coupling.c);
 lab.reset();near(lab.getState().towing.coupling.c,s.towing.coupling.c*Math.sqrt(2));
});
test('rod with B-orb contact transfers impulse without stretching or pausing',()=>{
 const lab=make(true);lab.updateParams('tow.type','rod');lab.reset();live(lab);
 lab.updateParams('worldPhysics.forwardDragK',0);lab.updateParams('worldPhysics.angularDragK',0);
 const s=lab.getState(),b=s.towing.B;
 s.orbs.length=0;s.orbs.push({x:b.position.x+24,y:b.position.y,vx:-10,vy:0,radius:5,mass:b.mass,alive:true,deathProgress:-1});
 advance(lab);const t=lab.getState();assert.ok(t.towing.B.velocity.x<0);assert.ok(t.orbs[0].vx>-10);
 near(t.orbs[0].vx+t.towing.B.velocity.x,-10,1e-6);near(t.towing.distance,8,0.08);
 advance(lab,30);assert.equal(lab.getState().towing.reason,undefined);assert.ok(lab.isRunning);
});
test('orbs drift once per main tick with both disks present',()=>{
 const lab=make(true);live(lab);lab.updateParams('worldPhysics.forwardDragK',0);
 const s=lab.getState();s.orbs.length=0;s.orbs.push({x:200,y:5000,vx:10,vy:0,radius:2,mass:1,alive:true,deathProgress:-1});
 advance(lab);near(lab.getState().orbs[0].x,200+10/60);
});
test('B spike death freezes and respawns both disks as feasible composition',()=>{
 const lab=make(true);live(lab);lab.updateParams('spike.killOnHit',true);
 const s=lab.getState(),b=s.towing.B;s.orbs.length=0;
 s.arena.obstacles.push({x:b.position.x+b.radius+1,y:b.position.y,radius:2,type:'spike',alive:true});
 advance(lab);let t=lab.getState();assert.ok(t.deathTimer>0);near(t.vx,0);near(t.towing.B.velocity.x,0);
 // Шип fixture убираем из стартовой зоны, чтобы проверять именно штатный респаун.
 s.arena.obstacles.pop();while(lab.getState().deathTimer>0) advance(lab);t=lab.getState();near(t.deathTimer,0);near(t.towing.distance,8);
 free(t.towing.B,t.arena);near(t.elapsedTime,0);near(t.inputMagnitude,0);
 assert.deepEqual(lab.getInterpolatedState(0),t);
});
test('blur and hidden remain paused until explicit resume',()=>{
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;global.window=win;global.document=doc;
 try {
  const lab=make(true);live(lab);lab.setInput(1,0,1);win.dispatchEvent(new Event('blur'));
  assert.ok(!lab.isRunning);near(lab.getState().inputMagnitude,0);advance(lab);assert.ok(!lab.isRunning);
  lab.resume();doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.ok(!lab.isRunning);
  doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.ok(!lab.isRunning);
  lab.resume();assert.ok(lab.isRunning);lab.stop();
 } finally {delete global.window;delete global.document;}
});
test('actual A radius and inertia edits preserve positions and fail visibly when overlapping',()=>{
 const lab=make(true),s=lab.getState();lab.updateParams('geometry.baseRadiusM',60);
 const t=lab.getState();near(t.x,s.x);near(t.y,s.y);assert.deepEqual(t.towing.B.position,s.towing.B.position);
 assert.ok(t.towing.needsRestart);assert.ok(t.towing.paused);lab.reset();free(lab.getState().towing.B,t.arena);
});
test('stock FA yaw history is updated once for all adaptive substeps',()=>{
 const lab=make(true);live(lab);lab.setInput(1,0,1);const n=lab.yawSignHistory.length;advance(lab);
 assert.equal(lab.yawSignHistory.length,n+1);assert.ok(lab.getState().towing.diagnostics.solverSubsteps>=4);
});
test('stock opt-out follows original physics and countdown after stop/start',()=>{
 const lab=make(false);live(lab);lab.setInput(0,-1,1);advance(lab,20);const s=lab.getState();
 assert.ok(s.vy<0);assert.equal(s.towing,undefined);lab.stop();lab.start();assert.ok(lab.getState().startCountdown>0);
});
test('numeric failure preserves the last valid bodies and visibly pauses',()=>{
 const lab=make(true);live(lab);const s=lab.getState();lab.updateParams('worldPhysics.restitution',1.5);
 const t=lab.getState();assert.ok(t.towing.needsRestart);assert.match(t.towing.reason,/restitution/);assert.ok(!lab.isRunning);
 advance(lab);near(lab.getState().x,s.x);assert.deepEqual(lab.getState().towing.B.position,s.towing.B.position);
});
test('numeric budget failure preserves both body states and exposes failed diagnostics',()=>{
 const lab=make(true);live(lab);lab.towing.B.angularVelocity=1e5;const s=lab.getState();
 advance(lab);const t=lab.getState();
 assert.ok(t.towing.needsRestart);assert.ok(!lab.isRunning);assert.ok(t.towing.reason);
 near(t.x,s.x);near(t.y,s.y);near(t.vx,s.vx);near(t.vy,s.vy);
 assert.deepEqual(t.towing.B,s.towing.B);assert.equal(t.towing.diagnostics.solverSubsteps,0);
});
test('capture checks angular attachment speed and reconnects without velocity jump',()=>{
 const lab=make(true);lab.setTowingConnection(false);
 assert.equal(lab.setTowingConnection(true).ok,true);lab.setTowingConnection(false);
 lab.towing.B.angularVelocity=0.2;const s=lab.getState();const result=lab.setTowingConnection(true);
 assert.equal(result.ok,false);near(result.relativeSpeed,4);assert.deepEqual(lab.getState().towing.B,s.towing.B);
 lab.towing.B.angularVelocity=0;assert.equal(lab.setTowingConnection(true).ok,true);near(lab.getState().towing.coupling.restLength,8);
});
test('passive B drifts exactly once and keeps angular velocity beyond player limit',()=>{
 const lab=make(true);live(lab);lab.setTowingConnection(false);
 lab.updateParams('worldPhysics.forwardDragK',0);lab.updateParams('worldPhysics.angularDragK',0);
 lab.towing.B.velocity.x=20;lab.towing.B.angularVelocity=10;
 const s=lab.getState();advance(lab);const t=lab.getState();
 near(t.towing.B.position.x,s.towing.B.position.x+20/60);near(t.towing.B.angularVelocity,10);
 near(t.towing.B.angle,s.towing.B.angle+10/60);
});
for (const type of ['rod','rope','spring']) {
 for (const [key,value] of [['tow.massRatio',2],['tow.stiffness',2500],['tow.dampingRatio',0.75]]) {
  test(`captured ${type} target survives independent ${key} edit`,()=>{
   const lab=make(true);lab.updateParams('tow.type',type);lab.reset();lab.setTowingConnection(false);
   lab.towing.B.position.y-=2;assert.equal(lab.setTowingConnection(true).ok,true);
   const s=lab.getState();near(s.towing.coupling.restLength,6);
   lab.updateParams(key,value);const t=lab.getState();
   near(t.towing.coupling.restLength,6);near(t.towing.coupling.minLength,3);near(t.towing.coupling.maxLength,9);
   assert.equal(t.towing.needsRestart,false);assert.equal(t.towing.reason,undefined);
   assert.deepEqual(t.towing.B.position,s.towing.B.position);assert.deepEqual(t.towing.B.velocity,s.towing.B.velocity);
   near(t.towing.coupling.k,key==='tow.stiffness'?2500:1250);
   near(t.towing.coupling.c,2*(key==='tow.dampingRatio'?0.75:0.5)*Math.sqrt((key==='tow.stiffness'?2500:1250)*50));
   lab.reset();near(lab.getState().towing.coupling.restLength,8);
  });
 }
}
test('explicit length or type edit replaces captured target with configured target',()=>{
 for(const [key,value,want] of [['tow.length',10,10],['tow.type','spring',8]]) {
  const lab=make(true);lab.updateParams('tow.type','rod');lab.reset();lab.setTowingConnection(false);
  lab.towing.B.position.y-=2;assert.equal(lab.setTowingConnection(true).ok,true);
  lab.updateParams(key,value);near(lab.getState().towing.coupling.restLength,want);
 }
});
for (const event of ['blur','visibilitychange']) {
 test(`paused runtime clears newly supplied input on ${event} before Step`,()=>{
  const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;global.window=win;global.document=doc;
  let lab;
  try {
   lab=make(true);live(lab);lab.pause();const s=lab.getState();lab.setInput(0,-1,1);
   if(event==='blur') win.dispatchEvent(new Event(event));
   else {doc.hidden=true;doc.dispatchEvent(new Event(event));}
   near(lab.getState().inputMagnitude,0);assert.ok(!lab.isRunning);
   doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));assert.ok(!lab.isRunning);
   assert.equal(lab.stepOnce(),true);const t=lab.getState();near(t.vy,0);near(t.y,s.y);near(t.towing.B.velocity.y,0);
   assert.ok(t.towing.paused);assert.deepEqual(lab.getInterpolatedState(0),t);
  } finally {lab?.stop();delete global.window;delete global.document;}
 });
}
test('terminal stop detaches focus listeners even while runtime is paused',()=>{
 const win=new EventTarget(),doc=new EventTarget();doc.hidden=false;global.window=win;global.document=doc;
 let lab;
 try {
  lab=make(true);live(lab);lab.pause();lab.stop();lab.setInput(0,-1,1);
  win.dispatchEvent(new Event('blur'));doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));
  near(lab.getState().inputMagnitude,1);assert.ok(!lab.isRunning);
  lab.resume();lab.pause();win.dispatchEvent(new Event('blur'));near(lab.getState().inputMagnitude,0);
 } finally {lab?.stop();delete global.window;delete global.document;}
});
for (const type of ['rod','rope','spring']) {
 test(`${type} captures nearest nose pair at 40 and 100 m without moving bodies`,()=>{
  for(const gap of [40,100]) {
   const lab=make(true);lab.updateParams('tow.type',type);lab.updateParams('tow.length',100);lab.reset();
   lab.setTowingConnection(false);lab.x=0;lab.y=0;lab.angle=0;
   lab.towing.B.position={x:40+gap,y:0};lab.towing.B.angle=Math.PI;
   const before=lab.getState(),result=lab.setTowingConnection(true),after=lab.getState();
   assert.equal(result.ok,true);near(result.distance,gap);
   assert.equal(after.towing.coupling.attachmentA,'nose');assert.equal(after.towing.coupling.attachmentB,'nose');
   near(after.towing.coupling.restLength,gap);assert.equal(lab.params['tow.length'],100);
   assert.deepEqual(after.towing.B,before.towing.B);near(after.x,before.x);near(after.y,before.y);near(after.vx,before.vx);near(after.vy,before.vy);
  }
 });
 test(`${type} failed nearest capture leaves coupling and bodies intact`,()=>{
  for(const [gap,speed,want] of [[1,0,'расстояние'],[9,0,'расстояние'],[8,2.01,'скорость']]) {
   const lab=make(true);lab.updateParams('tow.type',type);lab.reset();lab.setTowingConnection(false);
   lab.x=0;lab.y=0;lab.angle=0;lab.towing.B.position={x:40+gap,y:0};lab.towing.B.angle=Math.PI;lab.towing.B.velocity.x=speed;
   const before=lab.getState(),result=lab.setTowingConnection(true),after=lab.getState();
   assert.equal(result.ok,false);assert.match(result.reason,new RegExp(want));
   assert.deepEqual(after.towing.coupling,before.towing.coupling);assert.deepEqual(after.towing.B,before.towing.B);near(after.x,before.x);near(after.vx,before.vx);
  }
 });
 test(`${type} capture includes 2 m and 2 m/s boundaries and deterministic ties`,()=>{
  const lab=make(true);lab.updateParams('tow.type',type);lab.reset();lab.setTowingConnection(false);
  lab.x=0;lab.y=0;lab.angle=0;lab.towing.B.position={x:42,y:0};lab.towing.B.angle=Math.PI;lab.towing.B.velocity.x=2;
  assert.equal(lab.setTowingConnection(true).ok,true);near(lab.getState().towing.coupling.restLength,2);
  lab.setTowingConnection(false);lab.updateParams('tow.length',100);lab.reset();lab.setTowingConnection(false);
  lab.x=0;lab.y=0;lab.angle=0;lab.towing.B.position={x:0,y:40};lab.towing.B.angle=0;
  assert.equal(lab.setTowingConnection(true).ok,true);assert.equal(lab.getState().towing.coupling.attachmentA,'nose');assert.equal(lab.getState().towing.coupling.attachmentB,'nose');
 });
}
test('configured tow length permits 100 and rejects values outside 4–100',()=>{
 const lab=make(true);lab.updateParams('tow.length',100);assert.equal(lab.params['tow.length'],100);lab.reset();near(lab.getState().towing.distance,100);
 for(const v of [3.99,100.01]) {lab.updateParams('tow.length',v);assert.equal(lab.params['tow.length'],100);}
});

for(const type of ['rod','rope','spring']) test(`${type} selects each of the four nearest attachment pairs`,()=>{
 for(const [x,angle,wantA,wantB] of [[80,Math.PI,'nose','nose'],[80,0,'nose','tail'],[-80,0,'tail','nose'],[-80,Math.PI,'tail','tail']]) {
  const lab=make(true);lab.updateParams('tow.type',type);lab.updateParams('tow.length',100);lab.reset();lab.setTowingConnection(false);
  lab.x=0;lab.y=0;lab.angle=0;lab.towing.B.position={x,y:0};lab.towing.B.angle=angle;
  const before=lab.getState();assert.equal(lab.setTowingConnection(true).ok,true);const after=lab.getState();
  assert.equal(after.towing.coupling.attachmentA,wantA);assert.equal(after.towing.coupling.attachmentB,wantB);near(after.towing.coupling.restLength,40);
  assert.deepEqual(after.towing.B,before.towing.B);lab.updateParams('tow.massRatio',2);
  assert.equal(lab.getState().towing.coupling.attachmentA,wantA);assert.equal(lab.getState().towing.coupling.attachmentB,wantB);
 }
});
