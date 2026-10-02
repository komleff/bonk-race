const {test}=require('node:test');const {core,near,world,input,momentum,energy,assert}=require('./helpers.cjs');
for(const ratio of [0.1,0.25,0.5,1,2,5,10]) {
  test(`rod pulls and pushes mass ratio ${ratio} with correct COM acceleration`,()=>{
    const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
    for(const forward of [-1,1]) {const c={...defaultConfig,massRatio:ratio,couplingType:'rod'};let w=world(c);
      for(let i=0;i<120;i++) {const r=stepWorld(w,{...input,forward},c);assert.equal(r.stopReason,undefined);w=r.world;}
      const expected=2*(forward>0?200000:-100000)/(10000*(1+ratio));
      near(momentum(w).x/(10000*(1+ratio)),expected,Math.abs(expected)*0.01);
      assert.ok(w.diagnostics.rodError<=0.01*c.length);
    }
  });
  test(`60 seconds preserve linear and total angular momentum for mass ratio ${ratio}`,()=>{
    const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
    const c={...defaultConfig,massRatio:ratio,couplingType:'rod',enginesEnabled:false};let w=world(c);
    w.A.velocity={x:3,y:2};w.B.velocity={x:3,y:-1};w.A.angularVelocity=0.3;w.B.angularVelocity=-0.2;
    const p=momentum(w),e=energy(w);let maxError=0;
    for(let i=0;i<3600;i++){const r=stepWorld(w,input,c);assert.equal(r.stopReason,undefined);w=r.world;maxError=Math.max(maxError,w.diagnostics.rodError);}
    const end=momentum(w);near(end.x,p.x,Math.max(1,Math.abs(p.x))*1e-5);near(end.y,p.y,Math.max(1,Math.abs(p.y))*1e-5);near(end.angular,p.angular,Math.max(1,Math.abs(p.angular))*1e-5);
    assert.ok(maxError<=c.length*0.01,`rod error ${maxError}`);assert.ok(energy(w)<=e*1.001,`energy ${energy(w)/e}`);
  });
}
test('rod permits relative body rotation and transfers an external trailer impulse',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  const c={...defaultConfig,couplingType:'rod',enginesEnabled:false,massRatio:2};let w=world(c);w.B.velocity.y=10;
  for(let i=0;i<60;i++)w=stepWorld(w,input,c).world;
  assert.ok(Math.abs(w.A.angularVelocity)>0.01);assert.ok(Math.abs(w.A.angle-w.B.angle)>0.01);
});

for(const tickRate of [30,60]) for(const length of [4,8]) for(const massRatio of [0.1,0.25,0.5,1,2,5,10]) for(const speed of [50,100]) {
  test(`rod accepts transverse ±${speed} m/s, ${tickRate} Hz, L=${length}, B/A=${massRatio} for three seconds`,()=>{
    const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
    const c={...defaultConfig,tickRate,length,massRatio,couplingType:'rod',enginesEnabled:false};let w=world(c);
    w.A.velocity.y=speed;w.B.velocity.y=-speed;
    const initial=momentum(w),initialEnergy=energy(w);
    for(let tick=0;tick<3*tickRate;tick++) {
      const result=stepWorld(w,input,c);
      assert.equal(result.stopReason,undefined,`tick ${tick}: ${result.stopReason}`);
      w=result.world;
      assert.ok(energy(w)<=initialEnergy*1.01,`tick ${tick}: energy ratio ${energy(w)/initialEnergy}`);
      assert.ok(w.diagnostics.rodError<=0.01*length,`tick ${tick}: error ${w.diagnostics.rodError} > ${0.01*length}`);
      const current=momentum(w);
      near(current.x,initial.x,1e-5*Math.max(1,Math.abs(initial.x)));
      near(current.y,initial.y,1e-5*Math.max(1,Math.abs(initial.y)));
      near(current.angular,initial.angular,1e-5*Math.max(1,Math.abs(initial.angular)));
    }
  });
}
test('standalone rod solver accounts for transverse drift before bodies move',()=>{
  const {defaultConfig}=core('config/validate.js');const {solveRod,couplingGeometry}=core('physics/coupling.js');const {driftBody}=core('physics/body.js');
  const c={...defaultConfig,tickRate:30,length:4,couplingType:'rod',enginesEnabled:false},w=world(c),h=1/120;
  w.A.velocity.y=100;w.B.velocity.y=-100;const initial=momentum(w);
  for(let i=0;i<c.solverIterations;i++)solveRod(w.A,w.B,w.coupling,h,c);
  driftBody(w.A,h);driftBody(w.B,h);
  assert.ok(Math.abs(couplingGeometry(w.A,w.B,w.coupling).distance-4)<=0.04);
  near(momentum(w).angular,initial.angular,1e-5*Math.abs(initial.angular));
});
test('unsolved rod step reports a stop and keeps the original world atomically',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  const c={...defaultConfig,couplingType:'rod',enginesEnabled:false};const w=world(c);
  w.A.velocity.y=1e12;w.B.velocity.y=-1e12;
  const snapshot=structuredClone(w), result=stepWorld(w,{...input,toggleFA:true},c);
  assert.ok(result.stopReason);assert.strictEqual(result.world,w);assert.deepEqual(w,snapshot);
});
