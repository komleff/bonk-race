const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultTrainConfig, fitTrainShip, fitTrainLink } = require('../../.cache/tuglab2-tests/client/src/tuglab2/config.js');
const { createTrain, cloneTrainState, setTrainConnection, trainConnectionGeometry, validTrainState } = require('../../.cache/tuglab2-tests/client/src/tuglab2/train.js');
const { advanceTrain, trainSpringWrenches } = require('../../.cache/tuglab2-tests/client/src/tuglab2/physics.js');
const near = (actual, expected, eps = 1e-8) => assert.ok(Math.abs(actual - expected) <= eps, `${actual} != ${expected} (eps ${eps})`);
function empty() { const config = createDefaultTrainConfig(); config.world.width = config.world.height = 1e8; return createTrain(config); }
function step(s, dt, forces) { const r = advanceTrain(s, dt, forces); assert.equal(r.stopReason, undefined); return r.state; }
function invariants(s) {
  let px = 0, py = 0, angular = 0, kinetic = 0;
  for (const b of [...Object.values(s.bodies), ...s.world.asteroids]) {
    px += b.mass * b.velocity.x; py += b.mass * b.velocity.y;
    angular += b.mass * (b.position.x * b.velocity.y - b.position.y * b.velocity.x) + b.inertia * b.angularVelocity;
    kinetic += .5 * b.mass * (b.velocity.x ** 2 + b.velocity.y ** 2) + .5 * b.inertia * b.angularVelocity ** 2;
  }
  for (const c of s.connections) if (c.connected) kinetic += .5 * c.k * (trainConnectionGeometry(s, c).distance - c.restLength) ** 2;
  return { px, py, angular, energy: kinetic };
}

test('M–L–M starts paused, with relaxed correct ports and rectangular inertia', () => {
  const s = empty(); assert.equal(s.paused, true); assert.deepEqual(Object.keys(s.bodies), ['A', 'B', 'C']);
  near(s.bodies.A.mass, 401200); near(s.bodies.B.mass, 1556800); near(s.bodies.C.mass, 401200);
  near(s.bodies.A.radius, 24.879310344827587); near(s.bodies.A.inertia, 144732900);
  near(s.bodies.B.inertia, 2246462400);
  assert.ok(s.bodies.A.position.x > s.bodies.B.position.x && s.bodies.B.position.x > s.bodies.C.position.x);
  for (const c of s.connections) { near(trainConnectionGeometry(s, c).distance, 360); assert.equal(c.attachmentA, 'tail'); assert.equal(c.attachmentB, 'nose'); }
});
test('independent sizes/modules and ten XL masses preserve engines and k/c', () => {
  const cfg = createDefaultTrainConfig(); cfg.ships.A = fitTrainShip('XL'); cfg.ships.C = fitTrainShip('S');
  cfg.ships.B.mass = cfg.ships.A.mass * 10; cfg.links.AB = fitTrainLink('XL', 1440); cfg.links.BC = fitTrainLink('S', 180);
  const s = createTrain(cfg); near(s.bodies.B.mass, 64192000); near(s.config.ships.C.forwardForce, 5428000);
  near(s.config.ships.A.forwardForce, 146096000); near(s.connections[0].c, 4260000); near(s.connections[1].c, 290000);
});
test('single composition removes C and BC physically', () => {
  const cfg = createDefaultTrainConfig(); cfg.composition = 'single'; const s = createTrain(cfg);
  assert.deepEqual(Object.keys(s.bodies), ['A', 'B']); assert.deepEqual(s.connections.map(c => c.id), ['AB']);
});
test('spring forces are reciprocal and sum both contributions on B before kick', () => {
  const s = empty(); s.bodies.B.position.y += 20; s.bodies.A.angle = .2; s.bodies.B.angularVelocity = .03;
  const w = trainSpringWrenches(s); near(w.A.force.x + w.B.force.x + w.C.force.x, 0, 1e-6);
  near(w.A.force.y + w.B.force.y + w.C.force.y, 0, 1e-6);
  let moment = 0;
  for (const [id, b] of Object.entries(s.bodies)) moment += b.position.x * w[id].force.y - b.position.y * w[id].force.x + w[id].torque;
  near(moment, 0, 1e-5); assert.ok(Math.abs(w.A.torque) > 1); assert.ok(Math.abs(w.B.torque) > 1); assert.ok(Math.abs(w.C.torque) > 1);
});
test('damping uses attachment velocities including omega, with correct q sign', () => {
  const s = empty(); s.bodies.B.position.y += 20; s.bodies.B.angularVelocity = .1;
  const c = s.connections[0], g = trainConnectionGeometry(s, c);
  const expected = ((s.bodies.B.velocity.x - .1 * g.b.arm.y - g.a.velocity.x) * g.normal.x
    + (s.bodies.B.velocity.y + .1 * g.b.arm.x - g.a.velocity.y) * g.normal.y);
  near(g.radialVelocity, expected); assert.notEqual(g.radialVelocity, 0);
});
test('disconnected B drifts once per tick while simultaneous external forces read frozen bodies', () => {
  const s = empty(); s.connections.forEach(c => c.connected = false); s.bodies.B.velocity = { x: 3, y: -4 };
  const initial = { ...s.bodies.B.position }; const before = structuredClone(s);
  const out = step(s, .1, ({ id }) => ({ force: { x: id === 'B' ? 0 : 1000, y: 0 }, torque: 0 }));
  near(out.bodies.B.position.x - initial.x, .3); near(out.bodies.B.position.y - initial.y, -.4);
  assert.deepEqual(s, before); near(out.world.time, .1); assert.equal(out.world.tick, 1);
});
test('detach preserves all velocities and the other link; successful recapture adopts actual distance', () => {
  const s = empty(); s.bodies.B.angularVelocity = .02;
  const detached = setTrainConnection(s, 'AB', false); assert.equal(detached.reason, undefined);
  assert.deepEqual(detached.state.bodies, s.bodies); assert.equal(detached.state.connections[1].connected, true);
  detached.state.bodies.A.position.x -= 80;
  const recapture = setTrainConnection(detached.state, 'AB', true); assert.equal(recapture.reason, undefined);
  near(recapture.state.connections[0].restLength, 280); near(recapture.state.connections[0].minLength, 140); near(recapture.state.connections[0].maxLength, 420);
});
test('capture limits belong to its tug, include attachment speed, and fail atomically', () => {
  let s = setTrainConnection(empty(), 'BC', false).state;
  s.config.ships.C.speedLimits = { forward: 90, reverse: 80, lateral: 70 };
  s.bodies.C.velocity.x = -80;
  let r = setTrainConnection(s, 'BC', true); assert.equal(r.state, s); assert.ok(r.reason);
  s.bodies.C.velocity.x = -70; r = setTrainConnection(s, 'BC', true); assert.equal(r.reason, undefined);
  s.bodies.C.velocity.x = 0; s.bodies.C.angularVelocity = 4;
  r = setTrainConnection(s, 'BC', true); assert.equal(r.state, s); assert.ok(r.reason);
});
test('zero/short/occupied-port/oversized captures are atomic without changing anchors', () => {
  const s = setTrainConnection(empty(), 'AB', false).state;
  s.connections[1].bodyA = 'A'; s.connections[1].attachmentA = 'tail';
  assert.equal(setTrainConnection(s, 'AB', true).state, s);
  s.connections[1].connected = false;
  const b = s.bodies.B, a = s.bodies.A;
  a.position.x = b.position.x + b.radius + a.radius + 1;
  assert.equal(setTrainConnection(s, 'AB', true).state, s);
  a.position.x += 500; assert.equal(setTrainConnection(s, 'AB', true).state, s);
});
test('unsafe start is rejected without silently shifting the train or changing profiles', () => {
  const cfg = createDefaultTrainConfig(); cfg.world.width = 100; assert.throws(() => createTrain(cfg));
  cfg.world.width = 20000; cfg.world.statics.push({ id: 'station', kind: 'station', position: { ...cfg.world.spawnPoint }, radius: 10 });
  assert.throws(() => createTrain(cfg));
});
test('budget exhaustion and invalid force preserve the last accepted finite world', () => {
  const s = empty(); s.config.numerics.substeps = s.config.numerics.maxAdaptiveSubsteps = 1;
  s.connections[0].k = 1e15;
  let r = advanceTrain(s, .1); assert.ok(r.stopReason); assert.equal(r.state, s); assert.equal(r.state.world.tick, 0);
  s.connections[0].k = 360000;
  r = advanceTrain(s, .01, () => ({ force: { x: NaN, y: 0 }, torque: 0 })); assert.ok(r.stopReason); assert.equal(r.state, s);
});
test('both length limits constrain stretching and compression independently', () => {
  let s = empty(); s.connections.forEach(c => { c.k = 0; c.c = 0; }); s.bodies.A.velocity.x = 500; s.bodies.C.velocity.x = 500;
  let activations = 0;
  for (let i = 0; i < 180; i++) { s = step(s, 1 / 60); activations += s.diagnostics.limitActivations.AB + s.diagnostics.limitActivations.BC;
    for (const c of s.connections) { const d = trainConnectionGeometry(s, c).distance; assert.ok(d >= c.minLength - .01 && d <= c.maxLength + .01); }
  }
  assert.ok(activations > 0);
});
test('single physical composition matches the read-only legacy control-force trajectory exactly', () => {
  const { advanceSpaceWorld } = require('../../.cache/tuglab2-tests/client/src/u2taglab/physics/advanceWorld.js');
  const cfg = createDefaultTrainConfig(); cfg.composition = 'single'; cfg.world.width = cfg.world.height = 1e8;
  let s = createTrain(cfg), a = structuredClone(s.bodies.A), b = structuredClone(s.bodies.B), c = structuredClone(s.connections[0]), world = structuredClone(s.world);
  s.bodies.B.position.y += 3; b.position.y += 3;
  const force = ({id,body,time}) => ({ force: { x: id === 'A' ? Math.cos(body.angle) * (time < 3 ? 1e6 : -3e5) : 0,
    y: id === 'A' ? Math.sin(body.angle) * 1e6 : 0 }, torque: id === 'A' ? (time < 1 ? 1e6 : 0) : 0 });
  for (let i = 0; i < 600; i++) {
    const legacy = advanceSpaceWorld(a,b,c,world,1/60,cfg.numerics,force); assert.equal(legacy.stopReason,undefined);
    s = step(s,1/60,force); a=legacy.A; b=legacy.B; c=legacy.coupling; world=legacy.world;
    for (const [actual,expected] of [[s.bodies.A,a],[s.bodies.B,b]]) { near(actual.position.x,expected.position.x,1e-10); near(actual.position.y,expected.position.y,1e-10); near(actual.angle,expected.angle,1e-12); }
  }
});
test('CCD includes A-C and every ship versus dynamic asteroids with reciprocal impulse', () => {
  let s = empty(); s.connections.forEach(c => c.connected = false);
  s.bodies.B.position.y = 5000; s.bodies.A.position = { x: -200, y: 0 }; s.bodies.C.position = { x: 200, y: 0 };
  s.bodies.A.velocity.x = 10000; s.bodies.C.velocity.x = -10000;
  let r = advanceTrain(s, .04); assert.equal(r.stopReason, undefined); assert.ok(r.contacts.some(c => c.body === 'A' && c.other === 'C'));
  s = empty(); s.connections.forEach(c => c.connected = false); s.bodies.A.position = { x: -200, y: 2000 }; s.bodies.A.velocity.x = 10000;
  s.world.asteroids.push({ id: 'rock', kind: 'asteroid', mass: 401200, radius: 10, inertia: 20060000, position: { x: 0, y: 2000 }, velocity: { x: 0, y: 0 }, angle: 0, angularVelocity: 0 });
  const p = invariants(s); r = advanceTrain(s, .04); assert.equal(r.stopReason, undefined);
  assert.ok(r.contacts.some(c => c.other === 'rock')); assert.ok(r.state.world.asteroids[0].velocity.x > 0); near(invariants(r.state).px, p.px, 1e-5);
});
test('CCD catches static stations and world bounds without penetration', () => {
  let s = empty(); s.connections.forEach(c => c.connected = false); s.bodies.A.position = { x: -200, y: 2000 }; s.bodies.A.velocity.x = 10000;
  s.world.statics.push({ id: 'station', kind: 'station', radius: 10, position: { x: 0, y: 2000 } });
  let r = advanceTrain(s, .04); assert.equal(r.stopReason, undefined); assert.ok(r.contacts.some(c => c.other === 'station'));
  s = empty(); s.connections.forEach(c => c.connected = false); s.world.width = 3000; s.bodies.A.position.x = 1400; s.bodies.A.velocity.x = 10000;
  r = advanceTrain(s, .04); assert.equal(r.stopReason, undefined); assert.ok(r.contacts.some(c => c.other === 'bounds:maxX'));
});
test('60s free conservative springs preserve SI momenta and energy; dampers never create energy', () => {
  for (const damping of [0, 710000]) {
    let s = empty(); s.connections.forEach(c => c.c = damping); s.bodies.B.position.y += 5; s.bodies.B.angle = .05;
    s.bodies.A.velocity = { x: 12, y: 2 }; s.bodies.B.velocity = { x: 10, y: -1 }; s.bodies.C.velocity = { x: 11, y: 3 };
    s.bodies.B.angularVelocity = .005;
    const initial = invariants(s), pScale = Object.values(s.bodies).reduce((sum,b) => sum + b.mass * 15, 0);
    const lScale = Object.values(s.bodies).reduce((sum,b) => sum + b.mass * Math.hypot(b.position.x,b.position.y) * 15 + b.inertia * .01, 0);
    let maxEnergyError = 0;
    for (let i = 0; i < 3600; i++) { s = step(s, 1 / 60); const q = invariants(s);
      assert.ok(Math.hypot(q.px-initial.px,q.py-initial.py)/pScale <= 1e-5); assert.ok(Math.abs(q.angular-initial.angular)/lScale <= 1e-5);
      maxEnergyError = Math.max(maxEnergyError, damping ? (q.energy-initial.energy)/initial.energy : Math.abs(q.energy-initial.energy)/initial.energy);
      assert.equal(s.diagnostics.limitActivations.AB + s.diagnostics.limitActivations.BC, 0);
    }
    assert.ok(maxEnergyError <= .005, `energy drift ${maxEnergyError}`);
  }
});
test('zero initial momentum has small absolute drift and reversed link order is identical after 10s', () => {
  let a = empty(); a.bodies.B.position.y += 5; a.bodies.B.angle = .05; a.connections.forEach(c => c.c = 0);
  let b = cloneTrainState(a); b.connections.reverse();
  for (let i = 0; i < 600; i++) { a = step(a, 1/60); b = step(b, 1/60); }
  const q = invariants(a); near(q.px, 0, 1e-5); near(q.py, 0, 1e-5); near(q.angular, 0, 1e-3);
  for (const id of ['A','B','C']) { near(a.bodies[id].position.x,b.bodies[id].position.x, .036); near(a.bodies[id].position.y,b.bodies[id].position.y, .036); near(a.bodies[id].angle,b.bodies[id].angle,1e-4); }
});
test('accepted links expose live length, including disconnected links, without moving anchors', () => {
  let s = empty(); s.connections.forEach(c => c.connected = false); s.bodies.B.velocity.y = 20;
  s = step(s,.1);
  for (const c of s.connections) { near(c.length, trainConnectionGeometry(s,c).distance); assert.equal(c.attachmentA,'tail'); assert.equal(c.attachmentB,'nose'); }
});
test('malformed numerical controls and mismatched body IDs stop atomically', () => {
  for (const key of ['rodMaxSweep','springMaxStep','normalEpsilon','maxAdaptiveSubsteps']) {
    const s = empty(); s.config.numerics[key] = NaN; const r = advanceTrain(s,.01); assert.ok(r.stopReason); assert.equal(r.state,s);
  }
  const s = empty(); s.bodies.B.id = 'C'; const r = advanceTrain(s,.01); assert.ok(r.stopReason); assert.equal(r.state,s);
});
test('cargo engine activation is rejected at construction', () => {
  const cfg=createDefaultTrainConfig(); cfg.ships.B.forwardForce=1; assert.throws(()=>createTrain(cfg));
});
test('capture accepts the actual two metre minimum and rejects a degenerate connected spring', () => {
  const s=setTrainConnection(empty(),'AB',false).state;
  s.bodies.A.position.x=s.bodies.B.position.x+s.bodies.A.radius+s.bodies.B.radius+2;
  const r=setTrainConnection(s,'AB',true); assert.equal(r.reason,undefined); near(r.state.connections[0].restLength,2);
  s.connections[0].connected=true; s.bodies.A.position.x-=2;
  const out=advanceTrain(s,.01); assert.ok(out.stopReason); assert.equal(out.state,s);
});
test('failed coarse attempts do not advance sampler simulation time or mutate input state', () => {
  const original=empty(); original.bodies.B.angularVelocity=50;
  const before=structuredClone(original), r=advanceTrain(original,.01,({body})=>{
    body.position.x=1e20;
    return {force:{x:0,y:0},torque:0};
  });
  assert.equal(r.stopReason,undefined); assert.ok(r.diagnostics.solverAttempts>1); assert.deepEqual(original,before);
  near(r.state.world.time,.01); assert.equal(r.state.world.tick,1);
});
test('all ship profiles reject invalid FA and physical fields before construction and before any force sampling', () => {
  const positive = ['mass', 'speedLimit', 'yawLimit', 'crewGLimit', 'comfortableBrakingTime', 'emergencyBrakingTime', 'yawStopTime'];
  const nonnegative = ['forwardForce', 'reverseForce', 'lateralForce', 'yawTorque', 'coastDeadzone', 'lateralComfort'];
  const variants = [...positive.flatMap(key => [-1, 0, NaN, Infinity].map(value => [key,value])),
    ...nonnegative.flatMap(key => [-1, NaN, Infinity].map(value => [key,value])), ['enginesEnabled', 'yes']];
  const base = empty();
  for (const id of ['A','B','C']) for (const [key,value] of variants) {
    const cfg=createDefaultTrainConfig(); cfg.ships[id][key]=value;
    assert.throws(()=>createTrain(cfg), `${id}.${key}=${value} must fail before creating a world`);
    const s=cloneTrainState(base); s.config.ships[id][key]=value;
    assert.equal(validTrainState(s),false,`${id}.${key} must invalidate a live profile`);
    const r=advanceTrain(s,1/60,()=>{ assert.fail('invalid profiles must never reach force sampling'); });
    assert.ok(r.stopReason); assert.equal(r.state,s);
  }
  for (const id of ['A','B','C']) for (const component of ['length','width']) {
    const cfg=createDefaultTrainConfig(); cfg.ships[id].geometry[component]=NaN; assert.throws(()=>createTrain(cfg));
  }
  const cfg=createDefaultTrainConfig(); cfg.composition='single'; cfg.ships.C.yawLimit=NaN; assert.throws(()=>createTrain(cfg));
});
test('disabled tug engines and zero nonnegative FA settings remain valid without hidden thrust', () => {
  const { trainSpaceProfile }=require('../../.cache/tuglab2-tests/client/src/tuglab2/config.js');
  const { spaceEngineWrench }=require('../../.cache/tuglab2-tests/client/src/u2taglab/physics/flightAssist.js');
  const cfg=createDefaultTrainConfig(); cfg.ships.C.enginesEnabled=false;
  for (const key of ['forwardForce','reverseForce','lateralForce','yawTorque','coastDeadzone','lateralComfort']) cfg.ships.C[key]=0;
  const s=createTrain(cfg), input={forward:1,lateral:1,yaw:1,brake:false,action:false,toggleFA:false};
  const w=spaceEngineWrench(s.bodies.C,input,true,trainSpaceProfile(s.config,'C'),1/60);
  near(w.force.x,0); near(w.force.y,0); near(w.torque,0); assert.equal(validTrainState(s),true);
});
test('world settings and field coefficients are validated before accepting a profile configuration', () => {
  const mutations=[w=>w.seed=-1,w=>w.seed=NaN,w=>w.density=-1,w=>w.density=Infinity,w=>w.spawnPoint.x=NaN,
    w=>w.finishPoint.y=Infinity,w=>w.startClearance=-1,w=>w.time=NaN,w=>w.fieldShipRadii.A=0];
  const base=empty();
  for (const mutate of mutations) {
    const cfg=createDefaultTrainConfig(); mutate(cfg.world); assert.throws(()=>createTrain(cfg));
    const s=cloneTrainState(base); mutate(s.world); const r=advanceTrain(s,1/60); assert.ok(r.stopReason); assert.equal(r.state,s);
  }
  const field={id:'field',kind:'plasma',center:{x:0,y:0},radius:100,drift:{x:0,y:0},pressure:1,resistiveK:0,topology:'linear',direction:{x:1,y:0}};
  for (const mutate of [f=>f.pressure=-1,f=>f.resistiveK=-1,f=>f.radius=0,f=>f.drift.x=NaN]) {
    const cfg=createDefaultTrainConfig(); cfg.world.fields=[structuredClone(field)]; mutate(cfg.world.fields[0]); assert.throws(()=>createTrain(cfg));
  }
});
test('paused default AB and BC recapture inclusively at their real maximum without snapping l0 or velocities', () => {
  const initial=createTrain(createDefaultTrainConfig());
  for (const id of ['AB','BC']) {
    const s=setTrainConnection(initial,id,false).state;
    const actual=trainConnectionGeometry(s,s.connections.find(c=>c.id===id)).distance;
    assert.ok(Math.abs(actual-360)<1e-10);
    const r=setTrainConnection(s,id,true); assert.equal(r.reason,undefined); near(r.state.connections.find(c=>c.id===id).restLength,actual,0);
    assert.deepEqual(r.state.bodies,s.bodies); assert.equal(r.state.world.time,0); assert.equal(r.state.paused,true);
    s.bodies[id==='AB'?'A':'C'].position.x += id==='AB'?1e-3:-1e-3;
    const rejected=setTrainConnection(s,id,true); assert.ok(rejected.reason); assert.equal(rejected.state,s);
  }
});
test('accepted wrench evidence exactly represents applied forces for every body and substep', () => {
  const s=empty(); s.connections.forEach(c=>c.connected=false); const dt=.1;
  const force=({id,time})=>({force:{x:id==='B'?2000+time*100:0,y:id==='A'?3000:0},torque:id==='C'?4000:0});
  const before=structuredClone(s), r=advanceTrain(s,dt,force); assert.equal(r.stopReason,undefined);
  assert.ok(Array.isArray(r.forceSamples)); assert.equal(r.forceSamples.length, r.diagnostics.solverSubsteps*3);
  const impulses={A:{x:0,y:0,torque:0},B:{x:0,y:0,torque:0},C:{x:0,y:0,torque:0}};
  for (let i=0;i<r.forceSamples.length;i++) {
    const applied=r.forceSamples[i], expectedTime=s.world.time+Math.floor(i/3)*dt/r.diagnostics.solverSubsteps;
    assert.equal(applied.id,['A','B','C'][i%3]); near(applied.time,expectedTime,0); near(applied.subDt,dt/r.diagnostics.solverSubsteps,0);
    assert.deepEqual(applied.wrench,force({id:applied.id,time:applied.time}));
    impulses[applied.id].x+=applied.wrench.force.x*applied.subDt; impulses[applied.id].y+=applied.wrench.force.y*applied.subDt;
    impulses[applied.id].torque+=applied.wrench.torque*applied.subDt;
  }
  for (const id of ['A','B','C']) {
    near(r.state.bodies[id].velocity.x,impulses[id].x/s.bodies[id].mass); near(r.state.bodies[id].velocity.y,impulses[id].y/s.bodies[id].mass);
    near(r.state.bodies[id].angularVelocity,impulses[id].torque/s.bodies[id].inertia);
  }
  assert.deepEqual(s,before);
});
test('accepted force evidence excludes sampled rejected attempts in train and single and all evidence on failure', () => {
  for (const composition of ['train','single']) {
    const cfg=createDefaultTrainConfig(); cfg.composition=composition; cfg.world.width=3000; cfg.numerics.restitution=1;
    cfg.numerics.substeps=1; cfg.numerics.maxContactEvents=1; cfg.numerics.maxAdaptiveSubsteps=32;
    const s=createTrain(cfg); s.connections.forEach(c=>c.connected=false); s.bodies.A.velocity.x=100000;
    const calls=[];
    const pureForce=({id,time,subDt})=>{
      calls.push({id,time,subDt}); return {force:{x:id==='A'?1000:0,y:0},torque:0};
    };
    const r=advanceTrain(s,.1,pureForce); assert.equal(r.stopReason,undefined); assert.ok(r.diagnostics.solverSubsteps>1);
    const count=Object.keys(s.bodies).length;
    assert.ok(calls.length>count*r.diagnostics.solverSubsteps,'fixture must sample a failed attempt before accepted retry');
    assert.ok(Array.isArray(r.forceSamples)); assert.equal(r.forceSamples.length,count*r.diagnostics.solverSubsteps);
    for (let i=0;i<r.forceSamples.length;i++) {
      const applied=r.forceSamples[i]; near(applied.subDt,.1/r.diagnostics.solverSubsteps,0);
      near(applied.time,s.world.time+Math.floor(i/count)*applied.subDt,0);
    }
    const reference=cloneTrainState(s); reference.config.numerics.substeps=r.diagnostics.solverSubsteps;
    const clean=advanceTrain(reference,.1,({id})=>({force:{x:id==='A'?1000:0,y:0},torque:0}));
    assert.deepEqual(r.forceSamples,clean.forceSamples); assert.deepEqual(r.state.bodies,clean.state.bodies); assert.deepEqual(r.contacts,clean.contacts);
    s.config.numerics.maxAdaptiveSubsteps=1;
    const fail=advanceTrain(s,.1,pureForce); assert.ok(fail.stopReason); assert.deepEqual(fail.forceSamples,[]); assert.equal(fail.state,s);
  }
});
test('invalid sampler forces and force-free accepted steps expose no wrench evidence', () => {
  const s=empty(); let r=advanceTrain(s,.01); assert.equal(r.stopReason,undefined); assert.deepEqual(r.forceSamples,[]);
  r=advanceTrain(s,.01,()=>({force:{x:NaN,y:0},torque:0})); assert.ok(r.stopReason); assert.deepEqual(r.forceSamples,[]);
});
