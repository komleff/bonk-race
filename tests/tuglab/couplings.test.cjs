const {test}=require('node:test');
const {core,near,world,input,momentum,assert}=require('./helpers.cjs');
const {defaultConfig,validateConfig}=core('config/validate.js');
const {createCoupling,couplingGeometry}=core('physics/coupling.js');
const {stepWorld}=core('physics/step.js');

test('spring uses direct stiffness, allows zero, and holds damping reference independent of trailer mass',()=>{
  for(const massRatio of [0.1,0.25,0.5,1,2,5,10]) {
    const c={...defaultConfig,massRatio,springStiffness:20000,springDamping:0.5};
    const spring=createCoupling(c);near(spring.k,20000);near(spring.c,10000);
    assert.equal(validateConfig(c).ok,true);
    const zero=createCoupling({...c,springStiffness:0});near(zero.k,0);near(zero.c,0);
  }
  for(const springStiffness of [-1,2000001,Infinity,NaN]) assert.equal(validateConfig({...defaultConfig,springStiffness}).ok,false);
});
test('coupling radial velocity includes off-axis attachment spin',()=>{
  const w=world(defaultConfig);w.B.position.y=8;w.A.angularVelocity=2;
  near(couplingGeometry(w.A,w.B,w.coupling).radialVelocity,12/Math.sqrt(2));
});
for(const massRatio of [0.1,0.25,0.5,1,2,5,10]) {
  test(`rope is slack without force and arrests a taut jerk for mass ratio ${massRatio}`,()=>{
    const c={...defaultConfig,couplingType:'rope',enginesEnabled:false,massRatio};
    const slack=world(c);slack.B.position.x+=2;slack.B.velocity.x=1;
    const quiet=stepWorld(slack,input,c);assert.equal(quiet.stopReason,undefined);
    near(quiet.world.A.velocity.x,0);near(quiet.world.B.velocity.x,1);
    const taut=world(c);taut.B.velocity.x=-10;
    const r=stepWorld(taut,input,c);assert.equal(r.stopReason,undefined);
    near(r.world.A.velocity.x,-10*massRatio/(1+massRatio),1e-7);
    near(r.world.B.velocity.x,r.world.A.velocity.x,1e-7);
    assert.ok(r.world.coupling.length<=8.00001);
  });
}
test('taut off-axis rope transfers torque and preserves total P/L',()=>{
  const c={...defaultConfig,couplingType:'rope',enginesEnabled:false};const w=world(c);
  w.B.position={x:-16.8,y:6.4};w.B.velocity.y=10;
  const p=momentum(w),r=stepWorld(w,input,c);assert.equal(r.stopReason,undefined);
  assert.ok(Math.abs(r.world.A.angularVelocity)>0.01);const q=momentum(r.world);
  near(p.x,q.x,1e-7);near(p.y,q.y,1e-7);near(p.angular,q.angular,1e-6);
});
for(const displacement of [-1,1]) test(`spring restores displacement ${displacement} once per substep regardless of iterations`,()=>{
  const c={...defaultConfig,couplingType:'spring',enginesEnabled:false,springStiffness:20000,springDamping:0,substeps:1};
  const w=world(c);w.B.position.x-=displacement;
  for(const solverIterations of [4,8,12]) {
    const r=stepWorld(w,input,{...c,solverIterations});assert.equal(r.stopReason,undefined);
    near(r.world.A.velocity.x,-displacement/30,1e-10);near(r.world.B.velocity.x,displacement/30,1e-10);
  }
});
test('zero stiffness spring coasts within limits and stops at both hard limits',()=>{
  const c={...defaultConfig,couplingType:'spring',enginesEnabled:false,springStiffness:0};
  const w=world(c);w.B.velocity.x=1;const r=stepWorld(w,input,c);
  assert.equal(r.stopReason,undefined);near(r.world.A.velocity.x,0);near(r.world.B.velocity.x,1);
  for(const speed of [-100,100]) {let w=world(c);w.B.velocity.x=speed;
    for(let i=0;i<20;i++){const r=stepWorld(w,input,c);assert.equal(r.stopReason,undefined);w=r.world;
      assert.ok(w.coupling.length>=4-1e-5&&w.coupling.length<=12+1e-5,`${w.coupling.length}`);}
  }
});
test('spring damps radial oscillation without increasing stiffness with mass ratio',()=>{
  const c={...defaultConfig,couplingType:'spring',enginesEnabled:false,springStiffness:20000,springDamping:1};let w=world(c);w.B.position.x-=2;
  for(let i=0;i<600;i++){const r=stepWorld(w,input,c);assert.equal(r.stopReason,undefined);w=r.world;}
  near(w.coupling.length,8,0.001);near(w.A.velocity.x,0,0.001);
});
test('off-axis rope jerk uses both disk inertias in effective mass',()=>{
  const {solveCoupling}=core('physics/coupling.js');const c={...defaultConfig,couplingType:'rope'};const w=world(c);
  w.B.position={x:-16.8,y:6.4};w.B.velocity.y=10;
  solveCoupling(w.A,w.B,w.coupling,1e-8,c);
  near(w.coupling.accumulatedImpulse,17543.859649122805,0.01);
  near(w.A.angularVelocity,-0.4678362573099415,1e-6);near(w.B.angularVelocity,-0.4678362573099415,1e-6);
});
for(const massRatio of [0.1,0.25,0.5,1,2,5,10]) test(`spring stays finite at maximum stiffness/damping for mass ratio ${massRatio} at 30 Hz`,()=>{
  const c={...defaultConfig,couplingType:'spring',enginesEnabled:false,springStiffness:2000000,springDamping:1.5,massRatio,tickRate:30};
  let w=world(c);w.B.position.x-=1;w.A.velocity.y=100;w.B.velocity.y=-100;
  for(let i=0;i<90;i++){const r=stepWorld(w,input,c);assert.equal(r.stopReason,undefined,`tick ${i}`);w=r.world;
    assert.ok(w.coupling.length>=4-1e-5&&w.coupling.length<=12+1e-5);for(const b of [w.A,w.B])assert.ok(Number.isFinite(b.angularVelocity));}
});
test('rope iteration can remove its speculative tension but cannot accumulate a pushing impulse',()=>{
  const {solveCoupling}=core('physics/coupling.js');const c={...defaultConfig,couplingType:'rope'};const w=world(c);
  const impulses={pull:0,push:0};w.B.velocity.x=-100;
  solveCoupling(w.A,w.B,w.coupling,1/240,c,impulses);near(w.A.velocity.x,-50,1e-8);
  w.B.velocity.x+=100;
  solveCoupling(w.A,w.B,w.coupling,1/240,c,impulses);
  near(w.A.velocity.x,0,1e-8);near(w.B.velocity.x,0,1e-8);near(impulses.pull,0,1e-6);
  w.B.velocity.x=10;solveCoupling(w.A,w.B,w.coupling,1/240,c,impulses);
  near(w.A.velocity.x,0,1e-8);near(w.B.velocity.x,10,1e-8);near(impulses.pull,0,1e-6);
});
