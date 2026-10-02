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
