const { test } = require('node:test');
const { assert, near } = require('./helpers.cjs');
const { advancePair } = require('../../.cache/tuglab-tests/client/src/tuglab/physics/advance.js');
const defaults = require('../../.cache/tuglab-tests/client/src/tuglab/config/tuglab_defaults.json');
const api = () => ({ ...require('../../.cache/tuglab-tests/client/src/u2taglab/profile.js'),
  ...require('../../.cache/tuglab-tests/client/src/u2taglab/physics/flightAssist.js') });
const idle = { forward: 0, lateral: 0, yaw: 0, brake: false, action: false, toggleFA: false };
function kick(b, w, dt) { b.velocity.x += w.force.x*dt/b.mass; b.velocity.y += w.force.y*dt/b.mass; b.angularVelocity += w.torque*dt/b.inertia; }

test('space SI authoring masses, geometry inertia and honest fixed torque', () => {
 const { createSpaceProfile, createSpaceBody, spaceEngineWrench } = api(), p=createSpaceProfile();
 const a=createSpaceBody(p,'A'), b=createSpaceBody(p,'B');
 near(a.mass,401200); near(b.mass,1556800); near(a.radius,24.879310344827587); near(b.radius,49.75862068965517);
 near(a.inertia,144732900); near(b.inertia,2246462400); near(p.yawTorque,45333181.99130072);
 let w=spaceEngineWrench(a,{...idle,forward:1,yaw:1},false,p,1/60);
 near(w.force.x,16228800); near(w.torque,45333181.99130072); kick(a,w,1/60);
 near(a.velocity.x,p.forwardForce/a.mass/60); near(a.angularVelocity,p.yawTorque/a.inertia/60);
 const heavy={...a,mass:600000,inertia:216450000,angularVelocity:0};
 near(spaceEngineWrench(heavy,{...idle,yaw:1},false,p,1/60).torque,45333181.99130072);
 near(createSpaceBody(p,'B',250).inertia,2246462400);
});
test('vacuum with disabled engines preserves A/B linear and angular momentum', () => {
 const { createSpaceProfile, createSpaceBody, spaceEngineWrench }=api(),p=createSpaceProfile();p.enginesEnabled=false;
 const a=createSpaceBody(p,'A'),b=createSpaceBody(p,'B');b.position.x=500;
 a.velocity={x:31,y:-12};a.angularVelocity=1.2;b.velocity={x:-4,y:9};b.angularVelocity=-2.3;
 const {createCoupling}=require('../../.cache/tuglab-tests/client/src/tuglab/physics/coupling.js');
 const c=createCoupling(defaults);c.connected=false;
 const r=advancePair(a,b,c,1/60,defaults,[],undefined,(ta,tb,dt)=>kick(ta,spaceEngineWrench(ta,idle,true,p,dt),dt));
 assert.equal(r.stopReason,undefined);assert.deepEqual(r.A.velocity,a.velocity);assert.deepEqual(r.B.velocity,b.velocity);
 near(r.A.angularVelocity,1.2);near(r.B.angularVelocity,-2.3);
});
test('FA ON keeps longitudinal coast but damps lateral with available engines; OFF is raw', () => {
 const {createSpaceProfile,createSpaceBody,spaceEngineWrench}=api(),p=createSpaceProfile(),b=createSpaceBody(p,'A');
 b.velocity={x:100,y:20};const on=spaceEngineWrench(b,idle,true,p,1/60),off=spaceEngineWrench(b,idle,false,p,1/60);
 near(on.force.x,0);near(on.force.y,-4173120);near(off.force.x,0);near(off.force.y,0);
 b.velocity={x:1,y:0};assert.ok(spaceEngineWrench(b,idle,true,p,1/60).force.x<0);
 b.velocity={x:600,y:0};near(spaceEngineWrench(b,{...idle,forward:1},false,p,1/60).force.x,16228800);
});
test('FA governor controls diagonal magnitude by forces and softly brakes an external overspeed', () => {
 const {createSpaceProfile,createSpaceBody,spaceEngineWrench}=api(),p=createSpaceProfile(),b=createSpaceBody(p,'A');
 b.velocity={x:175,y:175};for(let i=0;i<600;i++) {kick(b,spaceEngineWrench(b,{...idle,forward:1,lateral:-1},true,p,1/60),1/60);assert.ok(Math.hypot(b.velocity.x,b.velocity.y)<=250+1e-9);}
 b.velocity={x:300,y:300};const before=structuredClone(b);const w=spaceEngineWrench(b,{...idle,forward:1},true,p,1/60);
 assert.deepEqual(b,before);kick(b,w,1/60);assert.ok(Math.hypot(b.velocity.x,b.velocity.y)<Math.hypot(300,300));assert.ok(Math.hypot(b.velocity.x,b.velocity.y)>400);
});
for(const fa of [false,true]) test(`yaw soft cap and manual brake use available torque/force with FA ${fa}`,()=>{
 const {createSpaceProfile,createSpaceBody,spaceEngineWrench}=api(),p=createSpaceProfile(),b=createSpaceBody(p,'A');b.angularVelocity=1;
 const w=spaceEngineWrench(b,{...idle,yaw:1},fa,p,1/60);assert.ok(w.torque<0);assert.ok(Math.abs(w.torque)<=p.yawTorque);kick(b,w,1/60);assert.ok(b.angularVelocity>p.yawLimit);
 b.velocity={x:100,y:20};const brake=spaceEngineWrench(b,{...idle,brake:true},fa,p,1/60);assert.ok(brake.force.x<0 && brake.force.y<0);
});
test('FA limits vector acceleration to crew budget while OFF and emergency braking use full engines',()=>{
 const {createSpaceProfile,createSpaceBody,spaceEngineWrench}=api(),p=createSpaceProfile(),b=createSpaceBody(p,'A');
 const command={...idle,forward:1,lateral:1};const on=spaceEngineWrench(b,command,true,p,1/60),off=spaceEngineWrench(b,command,false,p,1/60);
 near(Math.hypot(on.force.x,on.force.y)/b.mass,Math.min(44.145,Math.hypot(p.forwardForce,p.lateralForce)/b.mass),1e-9);near(off.force.x,16228800);near(off.lateral,4173120);
 b.velocity.x=-100;near(spaceEngineWrench(b,{...idle,brake:true},true,p,1/60).forward,16228800);
});
