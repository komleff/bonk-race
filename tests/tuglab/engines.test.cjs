const {test}=require('node:test');const {core,near,world,input,assert}=require('./helpers.cjs');
function free(config,changes={}){const w=world(config);w.coupling.connected=false;Object.assign(w.A,changes);return w;}
test('zero authority leaves every velocity unchanged in FA and BRAKE',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  const c={...defaultConfig,forwardForce:0,reverseForce:0,lateralForce:0,yawTorque:0,fa:true};
  const w=free(c,{velocity:{x:4,y:5},angularVelocity:3});w.B.angularVelocity=7;
  const r=stepWorld(w,{...input,brake:true},c).world;near(r.A.velocity.x,4);near(r.A.velocity.y,5);near(r.A.angularVelocity,3);near(r.B.angularVelocity,7);
});
test('both FA modes coast longitudinally; only FA ON damps lateral drift',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  for(const fa of [false,true]){const c={...defaultConfig,fa};const r=stepWorld(free(c,{velocity:{x:10,y:10}}),input,c).world;near(r.A.velocity.x,10);near(r.A.velocity.y,fa?10-4/60:10);}
});
test('starboard thrust is clockwise of nose and overrides lateral assist',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  const c={...defaultConfig,fa:true};const r=stepWorld(free(c,{velocity:{x:0,y:10}}),{...input,lateral:1},c).world;near(r.A.velocity.y,10-8/60);
});
test('yaw stabilization in both FA modes is bounded by physical torque',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  for(const fa of [false,true]){const c={...defaultConfig,fa};const r=stepWorld(free(c,{angularVelocity:3}),input,c).world;near(r.A.angularVelocity,3-150000/180000/60);}
});
test('manual yaw gets full torque below limit but external overspeed is not clamped',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');const c=defaultConfig;
  near(stepWorld(free(c),{...input,yaw:1},c).world.A.angularVelocity,150000/180000/60);
  const r=stepWorld(free(c,{angularVelocity:3}),{...input,yaw:1},c).world;near(r.A.angularVelocity,3-150000/180000/60);
});
test('BRAKE overrides all manual axes and limits final impulse without sign reversal',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');const c=defaultConfig;
  const r=stepWorld(free(c,{velocity:{x:0.001,y:-0.001},angularVelocity:0.001}),{...input,forward:1,lateral:1,yaw:1,brake:true},c).world;
  near(r.A.velocity.x,0);near(r.A.velocity.y,0);near(r.A.angularVelocity,0);
});
test('step rejects invalid input without changing the last valid state',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');const w=world(defaultConfig),snapshot=structuredClone(w);
  const r=stepWorld(w,{...input,yaw:NaN},defaultConfig);assert.ok(r.stopReason);assert.deepEqual(w,snapshot);assert.deepEqual(r.world,snapshot);
});
test('validator accepts zero authority and rejects invalid ranges without mutation',()=>{
  const {defaultConfig,validateConfig}=core('config/validate.js');const c={...defaultConfig,forwardForce:0};
  assert.equal(validateConfig(c).ok,true);for(const changes of [{massRatio:0},{radiusB:13},{forwardForce:NaN},{tickRate:59},{length:3}]) assert.equal(validateConfig({...c,...changes}).ok,false);
});
test('invalid integrator settings return the original world instead of skipping physics',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  const w=free(defaultConfig),r=stepWorld(w,input,{...defaultConfig,substeps:0});assert.ok(r.stopReason);assert.deepEqual(r.world,w);
});
test('FA toggle acts through bounded engines; disabled diagnostic engines preserve spin',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  const c={...defaultConfig,enginesEnabled:false};const w=free(c,{velocity:{x:2,y:3},angularVelocity:4});
  const r=stepWorld(w,{...input,toggleFA:true},c).world;assert.equal(r.fa,true);near(r.A.velocity.y,3);near(r.A.angularVelocity,4);assert.equal(w.fa,false);
});
test('BRAKE uses asymmetric engines and does not brake trailer directly',()=>{
  const {defaultConfig}=core('config/validate.js');const {stepWorld}=core('physics/step.js');
  for(const [speed,want] of [[10,10-10/60],[-10,-10+20/60]]){
    const w=free(defaultConfig,{velocity:{x:speed,y:0}});w.B.velocity.x=8;
    const r=stepWorld(w,{...input,brake:true},defaultConfig).world;near(r.A.velocity.x,want);near(r.B.velocity.x,8);
  }
});
test('manual counter-yaw keeps full authority above the soft limit',()=>{
  const {defaultConfig}=core('config/validate.js');const {engineWrench}=core('physics/engines.js');
  const w=free(defaultConfig,{angularVelocity:defaultConfig.yawLimit+0.00001});
  near(engineWrench(w.A,{...input,yaw:-1},false,defaultConfig,1/240).torque,-150000);
});
