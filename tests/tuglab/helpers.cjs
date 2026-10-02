const assert = require('node:assert/strict');
const base = '../../.cache/tuglab-tests/client/src/tuglab/';
const core = name => require(base + name);
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (±${tolerance})`);
function world(config) {
  const {createBody} = core('physics/body.js');
  const {createCoupling} = core('physics/coupling.js');
  return { A: createBody(config.massA,config.radiusA), B: createBody(config.massA*config.massRatio,config.radiusB,{x:-(config.radiusA+config.radiusB+config.length),y:0}), coupling:createCoupling(config), obstacles:[], bay:null,tick:0,time:0,fa:config.fa,diagnostics:{couplingImpulse:0,rodError:0,outsideSpeedRange:false} };
}
const input = {forward:0,lateral:0,yaw:0,brake:false,action:false,toggleFA:false};
const momentum = w => ({x:w.A.mass*w.A.velocity.x+w.B.mass*w.B.velocity.x,y:w.A.mass*w.A.velocity.y+w.B.mass*w.B.velocity.y,angular:[w.A,w.B].reduce((s,b)=>s+b.mass*(b.position.x*b.velocity.y-b.position.y*b.velocity.x)+b.inertia*b.angularVelocity,0)});
const energy = w => [w.A,w.B].reduce((s,b)=>s+0.5*b.mass*(b.velocity.x**2+b.velocity.y**2)+0.5*b.inertia*b.angularVelocity**2,0);
module.exports={assert,core,near,world,input,momentum,energy};
